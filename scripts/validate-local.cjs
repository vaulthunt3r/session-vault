const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {VaultStore}=require('../src/store.cjs');
const {parseSession}=require('../src/parser.cjs');
const root=process.argv[2]||path.join(os.homedir(),'.codex','sessions');
const sample=process.argv[3];
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
(async()=>{
  const store=new VaultStore(':memory:');
  const start=performance.now();const result=await store.scan([root]);const sessions=store.list();
  const summary={testedAt:new Date().toISOString(),files:result.total,errors:result.errors,seconds:+((performance.now()-start)/1000).toFixed(2),largestBytes:Math.max(...sessions.map(s=>s.size)),messages:sessions.reduce((n,s)=>n+s.messages,0),tools:sessions.reduce((n,s)=>n+s.tools,0),sources:Object.fromEntries([...new Set(sessions.map(s=>s.source))].map(source=>[source,sessions.filter(s=>s.source===source).length])),warnings:sessions.reduce((n,s)=>n+s.warnings,0),searchHits:store.search({query:'codex'}).length};
  if(sample){const before=await hash(sample);const parsed=await parseSession(sample);const after=await hash(sample);summary.sample={filename:path.basename(sample),sha256:before,unchanged:before===after,source:parsed.meta.source,records:parsed.records.length,messages:parsed.meta.messages,hasParent:!!parsed.meta.parent,hasModel:!!parsed.meta.model};if(before!==after)throw new Error('Sample hash changed');}
  store.close();console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
