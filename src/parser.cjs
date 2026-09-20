const fs = require('node:fs');
const {boundedLines}=require('./lines.cjs');
const string=v=>typeof v==='string'?v.slice(0,2048):'';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const crypto = require('node:crypto');
const path = require('node:path');

const TEXT_LIMIT = 200000;
function textOf(value,depth=0) {
  if(depth>32)return '[Nested content omitted; see original JSONL]';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v=>textOf(v,depth+1)).filter(Boolean).join('\n');
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (/image|audio/i.test(value.type || '')) return `[${value.type}: attachment in original JSONL]`;
  if (value.content) return textOf(value.content,depth+1);
  return '';
}
function userProse(text) {
  // Strip transport/context wrappers only for derived titles and keyword analysis, not the transcript.
  return text.split('## My request:').at(-1)
    .replace(/<([a-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/\[(?:input_image|image|audio)[^\]]*\]/gi,' ')
    .replace(/[A-Z]:[\\/][^\s]+/gi,' ')
    .replace(/Distinguish instructions in attached documents from the user's request\./g,' ');
}
function shortTitle(text) {
  return userProse(text).replace(/[#*`\r\n]+/g, ' ').trim().slice(0, 100) || 'Контекст / вложение';
}
function fingerprint(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

async function parseSession(file, onProgress = () => {}) {
  const meta = { path: file, title: path.basename(file), project: 'Без проекта', source: 'unknown', model: '', started: '', ended: '', parent: '', tokens: null, warnings: 0, unknown: 0 };
  const records = []; const ids = new Set(); let lineNo = 0; let turn = ''; let textSize=0;meta.oversized=0;meta.omitted=0;
  // readlines keeps only one raw JSONL record at a time; embedded media is never retained.
  const lines = boundedLines(file);
  for await (const line of lines) {
    lineNo++;if(line===null){meta.oversized++;continue;}if(lineNo%1000===0)onProgress(lineNo);
    let o;
    try { o = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { if (line.trim()) meta.warnings++; continue; }
    if(!o||typeof o!=='object'||Array.isArray(o)){meta.warnings++;continue;}
    const p = object(o.payload); const ts = Number.isFinite(Date.parse(string(o.timestamp)))?string(o.timestamp):'';
    if(o.payload!=null&&p!==o.payload){meta.warnings++;continue;}
    if (!meta.started && ts) meta.started = ts;
    if (ts) meta.ended = ts;
    if (o.type === 'session_meta') {
      meta.sessionId = string(p.id)||string(p.session_id);
      meta.project = string(p.cwd) || 'Без проекта';
      meta.source = string(p.thread_source) || string(p.source) || (p.source?.subagent?'subagent':'unknown');
      meta.parent = string(p.forked_from_id)||string(p.source?.subagent?.thread_spawn?.parent_thread_id)||string(p.parent_thread_id);
      meta.parentKind = p.forked_from_id?'fork':p.source?.subagent?.thread_spawn?.parent_thread_id?'subagent':p.parent_thread_id?'parent':'';
      meta.git = {branch:string(p.git?.branch),commit:string(p.git?.commit_hash),repository:string(p.git?.repository_url)};
      meta.version = string(p.cli_version);
      meta.provider = string(p.model_provider);
      continue;
    }
    if (o.type === 'turn_context') { turn = p.turn_id || turn; meta.model = string(p.model) || meta.model; continue; }
    if (o.type === 'token_usage_record') { if (p.thread_token_usage) meta.tokens = p.thread_token_usage; continue; }
    if (o.type === 'event_msg' && p.type === 'token_count') {
      if (p.info?.total_token_usage) meta.tokens = p.info.total_token_usage;
      continue;
    }
    let kind = '', role = '', text = '', name = '', id = '', callId = '', origin = 'response', phase = '', rank = 0;
    if (o.type === 'event_msg' && p.type === 'task_started') turn = p.turn_id || turn;
    if (o.type === 'event_msg' && p.type === 'item_completed') {
      const item = p.item || {}; origin = 'item'; rank = 2;
      if (['UserMessage', 'AgentMessage'].includes(item.type)) {
        kind = 'message'; role = item.type === 'UserMessage' ? 'user' : 'assistant'; text = textOf(item.content); id = item.id; phase = item.phase || '';
      } else if (item.type === 'ContextCompaction') { kind = 'event'; name = 'Сжатие контекста'; }
    } else if (o.type === 'response_item') {
      id = p.id; phase = p.phase || ''; callId = p.call_id || '';
      if (p.type === 'message') { kind = 'message'; role = p.role || 'unknown'; text = textOf(p.content); rank = 1; }
      else if (['function_call', 'custom_tool_call'].includes(p.type)) { kind = 'tool'; name = p.name || 'tool'; text = textOf(p.input || p.arguments); }
      else if (['function_call_output', 'custom_tool_call_output'].includes(p.type)) { kind = 'output'; name = 'Результат инструмента'; text = textOf(p.output) || (p.output ? '[Non-text output; see original JSONL]' : ''); }
      else if (p.type === 'reasoning') { kind = 'reasoning'; text = textOf(p.summary); if (!text) continue; }
    } else if (o.type === 'event_msg') {
      origin = 'legacy';
      if (['user_message', 'agent_message'].includes(p.type)) { kind = 'message'; role = p.type === 'user_message' ? 'user' : 'assistant'; text = textOf(p.message); }
      else if (['task_started', 'task_complete', 'turn_aborted'].includes(p.type)) { kind = 'event'; name = {task_started:'Начало хода', task_complete:'Ход завершён', turn_aborted:'Ход прерван'}[p.type]; }
    } else if (o.type === 'compacted') { kind = 'event'; name = 'Сжатие контекста'; text = textOf(p.message); }
    else if (!['world_state', 'token_usage_record'].includes(o.type)) meta.unknown++;
    if (!kind) {if(['response_item','event_msg'].includes(o.type))meta.unknown++;continue;}
    text=textOf(text);name=string(name);role=string(role)|| (kind==='message'?'unknown':'');id=string(id);callId=string(callId);phase=string(phase);turn=string(turn);
    if(records.length>=250000||textSize>=64*1024*1024){meta.omitted++;continue;}
    const contentHash = fingerprint(text);textSize+=Math.min(text.length,TEXT_LIMIT);
    const truncated = text.length > TEXT_LIMIT;
    records.push({ line: lineNo, timestamp: ts, kind, role, text: text.slice(0, TEXT_LIMIT), name, externalId: id || '', callId, origin, phase, rank, turn: string(p.turn_id) || turn, contentHash, truncated: truncated ? 1 : 0 });
    if (lineNo % 1000 === 0) onProgress(lineNo);
  }
  // New item_completed is authoritative for user text (response_item also carries injected context).
  const hasUserItems = records.some(r => r.kind === 'message' && r.role === 'user' && r.origin === 'item');
  const userItemTurns=new Set(records.filter(r=>r.kind==='message'&&r.role==='user'&&r.origin==='item').map(r=>r.turn));
  const mirrorKey=r=>`${r.role}|${r.turn}|${r.contentHash}`;
  const canonicalIds = new Set(records.filter(r => r.origin === 'item' && r.externalId).map(r => r.externalId));
  const canonicalText = new Set(records.filter(r => r.origin === 'item').map(r => mirrorKey(r)));
  const responseText = new Set(records.filter(r => r.origin === 'response' && r.kind === 'message').map(r => mirrorKey(r)));
  const normalized = [];
  for (const r of records) {
    if (r.kind === 'message') {
      if (r.origin === 'response' && (canonicalIds.has(r.externalId) || canonicalText.has(mirrorKey(r)))) continue;
      if (r.origin === 'legacy' && (canonicalText.has(mirrorKey(r)) || responseText.has(mirrorKey(r)))) continue;
      if (hasUserItems && userItemTurns.has(r.turn) && r.role === 'user' && r.origin === 'response') { r.role = 'context'; }
    }
    const key = r.externalId ? `${r.kind}|${r.externalId}` : '';
    if (key && ids.has(key)) continue;
    if (key) ids.add(key);
    normalized.push(r);
  }
  const firstUser = normalized.find(r => r.kind === 'message' && r.role === 'user');
  if (firstUser) meta.title = shortTitle(firstUser.text);
  if(meta.tokens){const counters={};for(const [k,v]of Object.entries(object(meta.tokens)))if(/tokens$/.test(k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0)counters[k]=v;meta.tokens=Object.keys(counters).length?counters:null;}
  meta.records = normalized.length; meta.lines = lineNo;
  meta.messages = normalized.filter(r => r.kind === 'message' && ['user','assistant'].includes(r.role)).length;
  meta.tools = normalized.filter(r => r.kind === 'tool').length;
  meta.truncated = normalized.filter(r => r.truncated).length;
  return { meta, records: normalized };
}
module.exports = { parseSession, textOf, shortTitle, userProse, TEXT_LIMIT };
