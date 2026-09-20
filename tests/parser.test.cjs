const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {parseSession,TEXT_LIMIT}=require('../src/parser.cjs');
const {VaultStore}=require('../src/store.cjs');
const line=(type,payload)=>({timestamp:'2026-09-16T12:00:00Z',type,payload});
const meta=line('session_meta',{id:'test-id',cwd:'C:\\project',thread_source:'user',parent_thread_id:'parent'});
const msg=(role,text,id)=>line('response_item',{type:'message',role,id,content:[{type:'input_text',text}]});
const item=(type,text,id)=>line('event_msg',{type:'item_completed',item:{type,id,content:[{type:'text',text}]}});
async function fixture(t,objects) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'session-vault-test-'));
  const cleanup=[]; t.after(()=>{ for(const close of cleanup)close(); const resolved=path.resolve(dir); if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'session-vault-test-')) throw new Error('Unsafe cleanup path'); fs.rmSync(resolved,{recursive:true,force:true}); });
  const file=path.join(dir,'sample.jsonl');fs.writeFileSync(file,objects.map(x=>typeof x==='string'?x:JSON.stringify(x)).join('\n')+'\n');return {dir,file,cleanup};
}
test('extracts metadata and canonical messages without modifying source',async t=>{
  const {file}=await fixture(t,[meta,msg('user','Привет','u'),msg('assistant','Ответ','a'),item('UserMessage','Привет','u'),item('AgentMessage','Ответ','a'),line('turn_context',{model:'model-x'})]);
  const before=fs.readFileSync(file);const result=await parseSession(file);
  assert.equal(result.meta.messages,2);assert.equal(result.meta.model,'model-x');assert.equal(result.meta.parent,'parent');assert.equal(result.meta.title,'Привет');assert.deepEqual(fs.readFileSync(file),before);
});
test('ignores unknown event schemas, reports malformed and incomplete JSON',async t=>{
  const {file}=await fixture(t,[meta,line('future_event',{arbitrary:true}),'{broken',msg('user','works'),'{"type":']);
  const r=await parseSession(file);assert.equal(r.meta.warnings,2);assert.equal(r.meta.unknown,1);assert.equal(r.meta.messages,1);
});
test('keeps legacy messages but removes their mirrored response events',async t=>{
  const {file}=await fixture(t,[meta,line('event_msg',{type:'user_message',message:'hello'}),msg('user','hello','1'),line('event_msg',{type:'agent_message',message:'world'})]);
  const r=await parseSession(file);assert.equal(r.meta.messages,2);
});
test('preserves repeated legitimate messages with different ids',async t=>{
  const {file}=await fixture(t,[meta,item('UserMessage','Continue','u1'),item('UserMessage','Continue','u2'),item('AgentMessage','OK','a1'),item('AgentMessage','OK','a2')]);
  assert.equal((await parseSession(file)).meta.messages,4);
});
test('does not index hidden reasoning or media blobs as conversation text',async t=>{
  const {file}=await fixture(t,[meta,line('response_item',{type:'reasoning',encrypted_content:'SECRET',summary:[]}),line('response_item',{type:'message',role:'user',content:[{type:'input_image',image_url:'data:image/png;base64,SECRET'},{type:'input_text',text:'look'}]})]);
  const r=await parseSession(file);assert.equal(r.records.length,1);assert.ok(!r.records[0].text.includes('SECRET'));assert.ok(r.records[0].text.includes('look'));
});
test('marks bounded text, extracts tools and cumulative usage once',async t=>{
  const {file}=await fixture(t,[meta,msg('assistant','x'.repeat(TEXT_LIMIT+10)),line('response_item',{type:'function_call',name:'exec',call_id:'c',arguments:'{"cmd":"echo"}'}),line('response_item',{type:'function_call_output',call_id:'c',output:[{type:'text',text:'ok'}]}),line('token_usage_record',{thread_token_usage:{total_tokens:50}}),line('token_usage_record',{thread_token_usage:{total_tokens:80}})]);
  const r=await parseSession(file);assert.equal(r.meta.truncated,1);assert.equal(r.records[0].text.length,TEXT_LIMIT);assert.equal(r.meta.tools,1);assert.equal(r.meta.tokens.total_tokens,80);assert.equal(r.records[2].text,'ok');
});
test('separates injected user context from real new-schema user turns',async t=>{
  const {file}=await fixture(t,[meta,msg('user','environment instructions','env'),item('UserMessage','Actual request','u')]);
  const r=await parseSession(file);assert.equal(r.meta.messages,1);assert.equal(r.records[0].role,'context');assert.equal(r.meta.title,'Actual request');
});
test('SQLite index refresh, FTS Cyrillic, pagination and exports',async t=>{
  const {dir,file,cleanup}=await fixture(t,[meta,...Array.from({length:73},(_,i)=>msg('user',`Проверка истории ${i}`,'u'+i))]);
  const db=new VaultStore(path.join(dir,'index.sqlite'));cleanup.push(()=>db.close());
  assert.equal((await db.scan([file])).updated,1);assert.equal((await db.scan([file])).updated,0);
  const s=db.list()[0];assert.equal(db.records({id:s.id}).rows.length,60);assert.equal(db.records({id:s.id,offset:60}).rows.length,13);
  assert.equal(db.search({query:'провер',limit:100}).length,73);
  assert.equal(db.chapters(s.id).length,73);assert.ok(db.exportData(s.id,'md').includes('Проверка истории 72'));assert.equal(JSON.parse(db.exportData(s.id,'json')).records.length,73);
  fs.appendFileSync(file,JSON.stringify(msg('assistant','new','a1'))+'\n');assert.equal((await db.scan([file])).updated,1);assert.equal(db.records({id:s.id}).total,74);
  assert.equal(db.search({query:'провер',limit:100}).length,73);
});
test('service sessions excluded from global search unless explicitly enabled',async t=>{
  const {dir,file,cleanup}=await fixture(t,[line('session_meta',{id:'service',thread_source:'guardian_review'}),msg('user','unique guardian test')]);
  const db=new VaultStore(path.join(dir,'index.sqlite'));cleanup.push(()=>db.close());await db.scan([file]);
  assert.equal(db.search({query:'guardian'}).length,0);assert.equal(db.search({query:'guardian',includeService:true}).length,1);
});
test('missing source and unavailable root are reported without deleting index',async t=>{
  const {dir,file,cleanup}=await fixture(t,[meta,msg('user','hi')]);const db=new VaultStore(path.join(dir,'index.sqlite'));cleanup.push(()=>db.close());await db.scan([file]);fs.unlinkSync(file);
  const r=await db.scan([file]);assert.equal(r.errors.length,1);assert.equal(db.list()[0].missing,true);
});
