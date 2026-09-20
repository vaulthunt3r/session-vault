'use strict';
const crypto=require('node:crypto');
const {userProse,shortTitle}=require('./parser.cjs');
const TYPES=['message','tool','output','event','decision','task','bug','research','milestone','file','version'];
const signature=text=>crypto.createHash('sha256').update(text).digest('hex');
const rules=[
 ['decision',/(?:\b(?:we (?:decided|agreed|chose)|decision:|decided to|use .{1,60} instead of)\b|решили|решено|принято решение|выбрали|вирішили|ухвалено)/iu],
 ['bug',/(?:\b(?:error|exception|failed|bug|regression|crash)\b|ошибк|сломал|не работает|баг|помилк|не працює)/iu],
 ['task',/(?:\b(?:todo|next steps?|need to|must implement|please add|implement|add tests)\b|нужно|необходимо|добавить|реализовать|следующий шаг|потрібно|додати|реалізувати)/iu],
 ['milestone',/(?:\b(?:released|shipped|completed|release v\d)\b|выпущен|релиз|завершено|випущено|завершено)/iu],
 ['research',/(?:\b(?:investigate|research|benchmark|experiment|compare)\b|исследова|сравнить|эксперимент|дослід|порівня)/iu],
];
function classify(r){
 if(r.kind!=='message'||!['user','assistant'].includes(r.role))return {type:r.kind==='reasoning'?'event':r.kind,basis:'record',reason:r.kind};
 const prose=userProse(r.text).replace(/```[\s\S]*?(?:```|$)/g,'').replace(/\b(?:regression tests?|no errors?|zero errors?|0 errors?|no regressions?)\b|без ошибок|ошибок нет|без помилок/giu,' ');
 for(const [type,re] of rules){const hit=prose.match(re);if(hit)return {type,basis:'inferred',reason:hit[0]};}
 return {type:'message',basis:'record',reason:r.role};
}
function validate(a){
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('Invalid analysis scope');
 for(const key of ['sessionId','project','from','to','kind','query'])if(a[key]!=null&&(typeof a[key]!=='string'||a[key].length>2048))throw Error('Invalid '+key);
 for(const key of ['from','to'])if(a[key]&&(!/^\d{4}-\d{2}-\d{2}$/.test(a[key])||!Number.isFinite(Date.parse(a[key]))))throw Error('Invalid date');
 if(a.from&&a.to&&a.from>a.to)throw Error('Start date must precede end date');
 return a;
}
module.exports={
 analyze(args={}){
  const a=validate(args),all=this.list();
  const sessions=all.filter(s=>(a.includeService||a.sessionId||!['guardian_review','subagent'].includes(s.source))&&(!a.sessionId||s.id===a.sessionId)&&(!a.project||s.project===a.project));
  const byId=new Map(all.map(s=>[s.sessionId,s]));
  const notes=new Map(this.notes.prepare('SELECT * FROM annotations').all().map(n=>[n.session+':'+n.line,n]));
  const flags=new Map(this.notes.prepare('SELECT * FROM session_flags').all().map(n=>[n.session,n]));
  const events=[],days=new Map(),types={},files=new Map(),tools=new Map(),chapters=new Map(),keywords=new Map();const matchedSessions=new Set();let total=0,scanned=0,omitted=0,limited=false,filesLimited=false;
  const query=this.db.prepare("SELECT line,timestamp,kind,role,name,callId,turn,signature,substr(text,1,4000) text FROM records WHERE session=? ORDER BY line");
  for(const s of sessions){
   for(const r of query.iterate(s.id)){
    if(++scanned>200000){limited=true;break;}
    const day=r.timestamp?new Date(r.timestamp).toISOString().slice(0,10):'';
    if((a.from&&(!day||day<a.from))||(a.to&&(!day||day>a.to)))continue;
    const inferred=classify(r),note=notes.get(s.id+':'+r.line),sig=r.signature||signature(r.text);
    const manual=note&&note.signature===sig;
    const kind=manual?note.type:inferred.type;
    if(a.kind&&kind!==a.kind)continue;
    if(a.query&&!r.text.toLowerCase().includes(a.query.toLowerCase())&&!r.name.toLowerCase().includes(a.query.toLowerCase()))continue;
    matchedSessions.add(s.id);total++;types[kind]=(types[kind]||0)+1;if(day)days.set(day,(days.get(day)||0)+1);
    if(r.kind==='tool')tools.set(r.name,(tools.get(r.name)||0)+1);
    if(r.kind==='message'&&r.role==='user'){const stop=new Set('this that with from have your what when then will would about could should please also into just some been them there their these which using need want make work codex source session project нужно чтобы когда есть были будет этого только также сделать можно после before error tests use using добавить проверить message сообщения история'.split(' '));for(const word of new Set(userProse(r.text).toLowerCase().match(/[\p{L}][\p{L}\p{N}_-]{3,24}/gu)||[])){if(stop.has(word)||(!keywords.has(word)&&keywords.size>=5000))continue;let k=keywords.get(word);if(!k)keywords.set(word,k={label:word,count:0,sessions:new Set()});k.count++;k.sessions.add(s.id);}}
    const mentioned=[...new Set(r.text.match(/(?:[\w.@-]+[\\/])+[\w.@-]+\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|jsonl?|md|ya?ml|toml|css|html|sql|sh|ps1|c(?:pp|s)?|h)/giu)||[])].slice(0,8);
    for(const f of mentioned){let file=files.get(f);if(!file&&files.size>=1000){filesLimited=true;continue;}if(!file)files.set(f,file={path:f,count:0,refs:[]});file.count++;if(file.refs.length<20)file.refs.push({session:s.id,line:r.line});}
    const event={id:s.id+':'+r.line,session:s.id,sessionTitle:s.title,line:r.line,timestamp:r.timestamp,day,type:kind,kind:r.kind,role:r.role,name:r.name,callId:r.callId,turn:r.turn,title:shortTitle(r.text)||r.name||kind,text:r.text.slice(0,900),basis:manual?'manual':inferred.basis,reason:manual?note.note:inferred.reason,files:mentioned,signature:sig};
    if(events.length<6000)events.push(event);else omitted++;
    const group=day||'undated';let chapter=chapters.get(group);if(!chapter)chapters.set(group,chapter={day:group,title:event.title,sessions:new Set(),count:0,highlights:[],types:{}});chapter.sessions.add(s.id);chapter.count++;chapter.types[kind]=(chapter.types[kind]||0)+1;if(chapter.highlights.length<8&&['decision','task','bug','milestone'].includes(kind))chapter.highlights.push(event);
   }
   if(limited)break;
  }
  events.sort((a,b)=>(a.timestamp||'').localeCompare(b.timestamp||'')||a.session.localeCompare(b.session)||a.line-b.line);
  const activeSessions=sessions.filter(s=>!(a.from||a.to||a.kind||a.query)||matchedSessions.has(s.id));
  const relations=activeSessions.filter(s=>s.parent).map(s=>{const parent=byId.get(s.parent);return {child:s.id,parent:parent?.id||'',parentExternal:s.parent,type:s.parentKind||'parent',outside:!!parent&&!activeSessions.some(t=>t.id===parent.id),missing:!parent};});
  const fileList=[...files.values()].sort((a,b)=>b.count-a.count).slice(0,80);
  const graphNodes=[],graphEdges=[];
  for(const s of activeSessions.slice(0,80))graphNodes.push({id:'s:'+s.id,type:'session',label:s.title,session:s.id});
  for(const e of events.filter(e=>['decision','task','bug','milestone','research'].includes(e.type)).slice(0,100)){graphNodes.push({id:e.id,type:e.type,label:e.title,event:e.id});graphEdges.push({from:'s:'+e.session,to:e.id,type:'contains'});}
  for(const f of fileList.slice(0,30)){const id='f:'+f.path;graphNodes.push({id,type:'file',label:f.path,refs:f.refs});for(const ref of f.refs){const eid=ref.session+':'+ref.line;graphEdges.push({from:graphNodes.some(n=>n.id===eid)?eid:'s:'+ref.session,to:id,type:'mentions'});}}
  for(const project of [...new Set(activeSessions.slice(0,80).map(s=>s.project))]){const id='p:'+project;graphNodes.push({id,type:'project',label:project});for(const session of activeSessions.slice(0,80).filter(s=>s.project===project))graphEdges.push({from:id,to:'s:'+session.id,type:'contains'});}
  for(const k of [...keywords.values()].sort((a,b)=>b.count-a.count).slice(0,18)){const id='k:'+k.label;graphNodes.push({id,type:'keyword',label:k.label,count:k.count});for(const session of k.sessions)graphEdges.push({from:'s:'+session,to:id,type:'mentions keyword'});}
  for(const rel of relations)graphEdges.push({from:'s:'+rel.parent,to:'s:'+rel.child,type:rel.type});
  const nodeIds=new Set(graphNodes.map(n=>n.id));
  return {sessions:activeSessions.map(s=>({...s,flag:flags.get(s.id)||null})),relations,events,total,omitted,limited,filesLimited,scanned,types,days:[...days].sort().map(([day,count])=>({day,count})),files:fileList,tools:[...tools].sort((a,b)=>b[1]-a[1]),chapters:[...chapters.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(c=>({...c,sessions:[...c.sessions]})),graph:{nodes:graphNodes,edges:graphEdges.filter(e=>nodeIds.has(e.from)&&nodeIds.has(e.to))}};
 },
 recordDetail({session,line}){
  if(typeof session!=='string'||!Number.isSafeInteger(line)||line<1)throw Error('Invalid record reference');
  const row=this.db.prepare('SELECT * FROM records WHERE session=? AND line=?').get(session,line);if(!row)throw Error('Source record is no longer indexed');
  const related=row.callId?this.db.prepare('SELECT line,kind,name,substr(text,1,12000) text,timestamp FROM records WHERE session=? AND callId=? ORDER BY line').all(session,row.callId):[];
  return {...row,signature:row.signature||signature(row.text.slice(0,4000)),related,annotation:this.notes.prepare('SELECT * FROM annotations WHERE session=? AND line=? AND signature=?').get(session,line,row.signature||signature(row.text.slice(0,4000)))||null};
 },
 annotate({session,line,type,note='',signature:expected}){
  const row=this.recordDetail({session,line});if(expected&&row.signature!==expected)throw Error('Record changed. Reopen it before annotating.');
  if(type===''){this.notes.prepare('DELETE FROM annotations WHERE session=? AND line=?').run(session,line);return true;}
  if(!TYPES.includes(type)||typeof note!=='string'||note.length>2000)throw Error('Invalid annotation');
  this.notes.prepare('INSERT OR REPLACE INTO annotations VALUES(?,?,?,?,?)').run(session,line,row.signature,type,note);return true;
 },
 sessionFlag({session,pinned=false,archived=false}){
  this.session(session);this.notes.prepare('INSERT OR REPLACE INTO session_flags VALUES(?,?,?)').run(session,pinned?1:0,archived?1:0);return true;
 },
 flags(){return this.notes.prepare('SELECT * FROM session_flags').all();}
};
