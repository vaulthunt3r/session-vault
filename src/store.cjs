const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { parseSession, shortTitle, userProse } = require('./parser.cjs');

class VaultStore {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.notes = new DatabaseSync(dbPath===':memory:'?':memory:':path.join(path.dirname(dbPath),'annotations.sqlite'));
    this.notes.exec('CREATE TABLE IF NOT EXISTS annotations(session TEXT,line INTEGER,signature TEXT,type TEXT,note TEXT,PRIMARY KEY(session,line)); CREATE TABLE IF NOT EXISTS session_flags(session TEXT PRIMARY KEY,pinned INTEGER,archived INTEGER)');
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, path TEXT UNIQUE, size INTEGER, mtime REAL, meta TEXT);
      CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY, session TEXT REFERENCES sessions(id) ON DELETE CASCADE,
        line INTEGER, timestamp TEXT, kind TEXT, role TEXT, text TEXT, name TEXT, externalId TEXT, callId TEXT, origin TEXT, phase TEXT, turn TEXT, truncated INTEGER, signature TEXT);
      CREATE INDEX IF NOT EXISTS records_session ON records(session, line);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(text, content='records', content_rowid='id', tokenize='unicode61');
      CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN INSERT INTO search(rowid,text) VALUES(new.id,new.text); END;
      CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN INSERT INTO search(search,rowid,text) VALUES('delete',old.id,old.text); END;`);
    if(!this.db.prepare('PRAGMA table_info(records)').all().some(c=>c.name==='signature'))this.db.exec('ALTER TABLE records ADD COLUMN signature TEXT');
    if(this.db.prepare('PRAGMA user_version').get().user_version<3){this.db.exec('UPDATE sessions SET mtime=-1; PRAGMA user_version=3');}
  }
  close() { this.db.close(); this.notes.close(); }
  async filesIn(root,errors=[]) {
    const out = [];
    const stat = await fsp.stat(root);
    if (stat.isFile()) return /\.jsonl$/i.test(root) ? [path.resolve(root)] : [];
    async function walk(dir) {
      for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {try{await walk(path.join(dir,e.name));}catch(err){errors.push({path:path.join(dir,e.name),error:err.message});}}
        else if (e.isFile() && /\.jsonl$/i.test(e.name)) out.push(path.join(dir, e.name));
      }
    }
    await walk(path.resolve(root)); return out;
  }
  async scan(roots, progress = () => {}, force=false) {
    // Remove only derived cache entries from sources the user has explicitly replaced.
    for(const s of this.db.prepare('SELECT id,path FROM sessions').all()) {
      if(!roots.some(root=>{const rel=path.relative(path.resolve(root),path.resolve(s.path));return !rel || (!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));})) this.db.prepare('DELETE FROM sessions WHERE id=?').run(s.id);
    }
    const files = new Set(); const errors = []; let updated = 0;
    for (const root of roots) {
      try { for (const p of await this.filesIn(root,errors)) files.add(p); }
      catch (e) { errors.push({ path: root, error: e.message }); }
    }
    let n = 0;
    const insert = this.db.prepare('INSERT INTO records(session,line,timestamp,kind,role,text,name,externalId,callId,origin,phase,turn,truncated,signature) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const file of files) {
      progress({ current: ++n, total: files.size, file: path.basename(file) });
      try {
        const stat = await fsp.stat(file);
        const old = this.db.prepare('SELECT * FROM sessions WHERE path=?').get(file);
        if (!force && old && old.size === stat.size && old.mtime === stat.mtimeMs) continue;
        const parsed = await parseSession(file,line=>progress({current:n,total:files.size,file:path.basename(file),line}));
        const after=await fsp.stat(file);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs){errors.push({path:file,error:'Source changed during indexing; refresh to retry.'});continue;}
        const id = crypto.createHash('sha256').update(file).digest('hex').slice(0, 24);
        this.db.exec('BEGIN');
        try {
          this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
          this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(id, file, stat.size, stat.mtimeMs, JSON.stringify(parsed.meta));
          for (const r of parsed.records) insert.run(id, r.line, r.timestamp, r.kind, r.role, r.text, r.name, r.externalId, r.callId, r.origin, r.phase, r.turn, r.truncated, r.contentHash);
          this.db.exec('COMMIT'); updated++;
        } catch (e) { this.db.exec('ROLLBACK'); throw e; }
      } catch (e) { errors.push({ path: file, error: e.message }); }
    }
    // Missing files remain visibly marked, never silently discard the user's index.
    return { updated, total: files.size, errors };
  }
  list() {
    return this.db.prepare('SELECT * FROM sessions').all().map(s => ({ ...JSON.parse(s.meta), id: s.id, size: s.size, missing: !fs.existsSync(s.path) })).sort((a,b) => b.ended.localeCompare(a.ended));
  }
  session(id) {
    const s = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
    if (!s) throw new Error('Сессия не найдена');
    return { ...JSON.parse(s.meta), id: s.id, size: s.size, missing: !fs.existsSync(s.path) };
  }
  records({ id, offset = 0, limit = 60, mode = 'conversation', query = '', anchor = null }) {
    limit=Number.isSafeInteger(limit)?Math.max(1,Math.min(100,limit)):60;offset=Number.isSafeInteger(offset)?Math.max(0,offset):0;
    const params = [id]; let where = 'session=?';
    if (mode === 'conversation') where += " AND kind='message' AND role IN ('user','assistant')";
    else if (mode === 'tools') where += " AND kind IN ('tool','output')";
    if (query) { where += ' AND instr(lower(text),lower(?))>0'; params.push(query); }
    if (anchor != null) {
      const count = this.db.prepare(`SELECT count(*) n FROM records WHERE ${where} AND line<?`).get(...params, Number(anchor));
      offset = Math.floor(count.n / limit) * limit;
    }
    const total = this.db.prepare(`SELECT count(*) n FROM records WHERE ${where}`).get(...params).n;
    offset=total?Math.min(offset,Math.floor((total-1)/limit)*limit):0;
    const rows = this.db.prepare(`SELECT * FROM records WHERE ${where} ORDER BY line LIMIT ? OFFSET ?`).all(...params, Math.min(100, Math.max(1, limit)), Math.max(0, offset));
    return { rows, total, offset };
  }
  chapters(id) {
    const rows = this.db.prepare("SELECT id,line,timestamp,substr(text,1,300) text FROM records WHERE session=? AND kind='message' AND role='user' ORDER BY line").all(id);
    return rows.map((r,i) => ({ ...r, title: shortTitle(r.text), number: i+1 }));
  }
  timeline(id) {
    return this.db.prepare("SELECT id,line,timestamp,kind,role,name,substr(text,1,220) text FROM records WHERE session=? AND (kind IN ('event','tool') OR (kind='message' AND role='user')) ORDER BY line").all(id);
  }
  search({ query = '', includeService = false, limit = 100, sessionId = '' }) {
    const terms = String(query).slice(0,1000).trim().split(/\s+/).filter(Boolean).slice(0, 12);
    if (!terms.length) return [];
    const fts = terms.map(t => '"'+t.replaceAll('"','""')+'"*').join(' AND ');
    let rows;
    try {
      rows = this.db.prepare(`SELECT r.id,r.session,r.line,r.timestamp,r.kind,r.role,snippet(search,0,'','',' … ',48) text,s.meta FROM search
        JOIN records r ON r.id=search.rowid JOIN sessions s ON s.id=r.session
        WHERE search MATCH ? ${includeService || sessionId ? '' : "AND json_extract(s.meta,'$.source') NOT IN ('guardian_review','subagent')"}
        AND (?='' OR r.session=?) ORDER BY rank LIMIT ?`).all(fts, sessionId, sessionId, Number.isSafeInteger(limit)?Math.max(1,Math.min(200,limit)):100);
    } catch (e) { throw new Error('Ошибка полнотекстового поиска: '+e.message); }
    return rows.map(r => ({ ...r, title: JSON.parse(r.meta).title, meta: undefined }));
  }
  graph(id) {
    const rows = this.db.prepare("SELECT line,text FROM records WHERE session=? AND kind='message' AND role='user'").all(id);
    const stop = new Set('this that with from have your what when then will would about could should please also into just some been them there their these which using need want make work как что это для или при мне меня тебе тебя уже ещё все так вот чтобы если когда есть был быть надо нужно можно только также сделать давай пока then project file files codex user users documents output outputs'.split(' '));
    for(const w of 'дальше идём идем было будет будут окей хорошо этого такой такие может очень более теперь сейчас ещё еще почему потому просто нужно чтобы который которые которую который после перед какой какие тоже всего только здесь давайте продолжай продолжаем request attached distinguish instructions mentioned local_image appdata temp http https source ambient context text jsonl исходном вложение'.split(' '))stop.add(w);
    for(const w of 'наверное возможно вообще даже далее делай неплохо ничего понял что-то возможность добавить должны сразу должен должна нужно необходимо пожалуйста отлично спасибо полностью давайте любой любая любые каким каких какой какую своих этого этому этой этими этим этого этим моего моей всего всех всем всегда никогда сегодня завтра тогда потом иногда часто точно совсем немного много мало лучше самый самая самое самые сначала последний первая первое второй третье например либо поэтому однако иначе таким таким образом словно будто почти опять пусть ведь лишь пока хотя если более менее между около через только наконец действительно кажется хотите хочешь хочу можем можешь смог делать сделали сделаем делать сделать получить нужно скажи давайте работает работать пускай also really much more most very here such each other again still next only any even than same well okay thanks thank think thing things seems perhaps probably actually already rather another something nothing everything anything'.split(' '))stop.add(w);
    const words = new Map();
    for (const r of rows) {
      const unique = new Set(userProse(r.text).toLowerCase().match(/[\p{L}][\p{L}\p{N}_-]{3,25}/gu) || []);
      for (const w of unique) if (!stop.has(w)) {
        const a = words.get(w) || { label:w, count:0, lines:[] }; a.count++; a.lines.push(r.line); words.set(w,a);
      }
    }
    return [...words.values()].sort((a,b) => b.count-a.count || a.label.localeCompare(b.label)).slice(0,18);
  }
  async writeExport({id,format,dest}) {
    const session=this.session(id),out=fs.createWriteStream(dest,{flags:'wx'});
    const finished=require('node:stream/promises').finished(out);finished.catch(()=>{});
    const write=async text=>{if(!out.write(text))await require('node:events').once(out,'drain');};
    try{
      if(format==='json')await write(JSON.stringify({schemaVersion:1,session,note:'Derived index; original JSONL is authoritative.'}).slice(0,-1)+',"records":[');
      else await write(`# ${session.title}\n\nSource: ${session.path}\n\n`);
      let first=true;
      for(const r of this.db.prepare('SELECT * FROM records WHERE session=? ORDER BY line').iterate(id)){
        if(format==='json'){await write((first?'':',')+JSON.stringify(r));first=false;}
        else if(r.kind==='message'&&['user','assistant'].includes(r.role))await write(`\n## ${r.role} · ${r.timestamp} · line ${r.line}\n\n${r.text}${r.truncated?'\n[Truncated; see original JSONL]':''}\n\n---\n`);
      }
      if(format==='json')await write(']}');out.end();await finished;
    }catch(e){out.destroy();await finished.catch(()=>{});throw e;}return true;
  }
  exportData(id, format) {
    const session = this.session(id);
    const records = this.db.prepare('SELECT * FROM records WHERE session=? ORDER BY line').all(id);
    if (format === 'json') return JSON.stringify({ schemaVersion:1, session, note:'Derived read-only index. Text limited to 200000 characters per record; truncated rows are marked. Original JSONL is authoritative.', records },null,2);
    return `# ${session.title}\n\nSource: ${session.path}\n\nModel: ${session.model || 'unknown'}\n\n` + records.filter(r => r.kind === 'message' && ['user','assistant'].includes(r.role)).map(r => `## ${r.role === 'user' ? 'User' : 'Assistant'} · ${r.timestamp} · line ${r.line}\n\n${r.text}${r.truncated ? '\n\n[Text truncated in derived index; see original JSONL.]' : ''}`).join('\n\n---\n\n');
  }
}
Object.assign(VaultStore.prototype,require('./analysis.cjs'));
module.exports = { VaultStore };
