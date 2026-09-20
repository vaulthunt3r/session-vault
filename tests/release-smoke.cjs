const assert=require('node:assert/strict');
module.exports=async({win,fs,path,data,dispatch,dialog,checks})=>{
 const js=async source=>{const body=/\bawait\b/.test(source)?source:'return await ('+source+');';const r=await win.webContents.executeJavaScript('(async()=>{try{'+body+'}catch(e){return {__failure:e.stack};}})()');if(r?.__failure)throw Error(r.__failure);return r;};
 const root=path.join(data,'release-fixtures');fs.mkdirSync(root,{recursive:true});
 const exportRoot=data+'-exports';fs.mkdirSync(exportRoot,{recursive:true});
 const source=path.join(root,'daily.jsonl');const rows=[{type:'session_meta',payload:{id:'daily',cwd:'Fixture project',thread_source:'user'}}];
 for(let i=0;i<135;i++)rows.push({timestamp:'2026-09-19T12:00:00Z',type:'response_item',payload:{type:'message',role:i%2?'assistant':'user',id:'id'+i,content:[{type:'text',text:`Codex проверка історія ${i}\n\n${i===0?'Привет <script>throw Error("unsafe")</script>':i===1?'long '.repeat(50000):('Message '+i+' ').repeat(80)}`}]}});
 rows.push(null,{type:'future_event',payload:{}});fs.writeFileSync(source,rows.map(JSON.stringify).join('\n')+'\n{broken\n');
 const before=fs.readFileSync(source);const originalPicker=dialog.showOpenDialog,originalSave=dialog.showSaveDialog;
 try{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});
  await dispatch('setup',{kind:'files',skipWelcome:true});await js("state.config=await api('init');state.current=null;state.scanEnabled=true;await refresh(true);await go('conversation')");
  await js("state.offset=60;await render();$('#view').scrollTop=130;persist()");
  const prior=await js('snapshot()');
  await js("state.query='історія';await go('search')");
  assert.ok(await js("document.querySelectorAll('[data-result]').length>0"));
  await js("document.querySelector('[data-result]').click()");
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await js('state.view'),'conversation');
  await js('await closeUtility()');assert.equal(await js('state.view'),'search');
  await js('await closeUtility()');const after=await js('snapshot()');assert.equal(after.offset,prior.offset);assert.ok(Math.abs(after.scroll-prior.scroll)<3);
  await js('await refresh(true)');assert.equal(await js('state.offset'),60);
  const reload=async()=>{await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await js('window.__ready');await js(fs.readFileSync(path.join(__dirname,'renderer-smoke.js'),'utf8')+';void 0;');};
  await reload();assert.equal(await js('state.offset'),60);
  assert.ok(Math.abs((await js("$('#view').scrollTop"))-prior.scroll)<3);
  const id=(await dispatch('list'))[0].id;
  for(const format of ['json','md','jsonl']){const dest=path.join(exportRoot,'export.'+format);dialog.showSaveDialog=async()=>({canceled:false,filePath:dest});assert.equal(await dispatch('export',{id,format}),dest);assert.ok(fs.statSync(dest).size>0);if(format==='json')assert.equal(JSON.parse(fs.readFileSync(dest)).records.length,135);if(format==='jsonl')assert.deepEqual(fs.readFileSync(dest),before);}
  dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(exportRoot,'export.md')});await dispatch('export',{id,format:'md'});
  dialog.showSaveDialog=async()=>({canceled:true});assert.equal(await dispatch('export',{id,format:'md'}),null);
  dialog.showSaveDialog=async()=>({canceled:false,filePath:source});await assert.rejects(dispatch('export',{id,format:'md'}));assert.deepEqual(fs.readFileSync(source),before);
  dialog.showSaveDialog=async()=>({canceled:false,filePath:path.join(root,'protected.json')});
  // A connected directory protects every child, while a single-file source protects that file.
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});await dispatch('setup',{kind:'folder',skipWelcome:true});await assert.rejects(dispatch('export',{id,format:'json'}));
  const clipboard=require('electron').clipboard,originalCopy=clipboard.writeText;let copied;
  try{clipboard.writeText=value=>{copied=value;};await dispatch('copyPath',{id});assert.equal(copied,source);await dispatch('copyPath',{id,folder:true});assert.equal(copied,root);}finally{clipboard.writeText=originalCopy;}
  fs.renameSync(source,source+'.moved');await dispatch('scan');assert.equal((await dispatch('session',id)).missing,true);fs.renameSync(source+'.moved',source);await dispatch('scan');assert.equal((await dispatch('session',id)).missing,false);
  for(const language of ['en','ru','uk']){
   await js(`localStorage.setItem('language','${language}');await api('language','${language}')`);await reload();
   assert.equal(await js('document.documentElement.lang'),language);
   await js("await go('help')");assert.equal(await js("document.querySelectorAll('.help-content details').length"),9);
   await js("await go('settings')");assert.equal(await js("document.querySelector('[data-language]').value"),language);
   await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(data,'locale-'+language+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await js("localStorage.setItem('language','en');await api('language','en')");await reload();
  await js("await go('conversation');state.offset=0;await render()");
  assert.equal(await js("document.querySelectorAll('.message-body details').length"),1);
  assert.ok((await js("document.querySelector('.message-body').textContent")).includes('Привет <script>'));
  for(const [w,h]of [[980,640],[1920,1080]]){win.setSize(w,h);await new Promise(r=>setTimeout(r,150));assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'),true);fs.writeFileSync(path.join(data,`size-${w}.png`),(await win.webContents.capturePage()).toPNG());}
  win.maximize();await new Promise(r=>setTimeout(r,200));assert.equal(win.isMaximized(),true);win.unmaximize();win.setSize(1500,960);
  await dispatch('rebuild');await dispatch('scan');assert.equal((await dispatch('list')).length,1);assert.equal((await dispatch('records',{id,mode:'conversation'})).total,135);assert.ok(fs.readdirSync(data).some(f=>f.startsWith('vault-v1.sqlite.backup-')));
  checks.release=['search-result Back restores search and reading position','refresh and renderer restart preserve page and scroll','JSON/MD/raw exports and cancel','source overwrite blocked','clipboard paths verified without changing system clipboard','missing source recovered','EN/RU/UA help and settings','session text is untranslated and HTML inert','980px and 1920px layout','worker restart and index rebuild preserve original sources'];
 }finally{dialog.showOpenDialog=originalPicker;dialog.showSaveDialog=originalSave;}
};
