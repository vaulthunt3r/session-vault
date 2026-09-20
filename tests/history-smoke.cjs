const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,data,fs,app,dialog,dispatch})=>{
 const errors=[];win.webContents.on('console-message',(e,level,message)=>{if(level===3||e.level==='error'||e.level===3)errors.push(e.message||message);});
 const js=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
 const wait=async code=>{for(let i=0;i<80;i++){if(await js('return '+code))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+code);};
 try{
  await js('await window.__ready');const dir=path.join(data,'history-sources');fs.mkdirSync(dir,{recursive:true});
  const row=(text,day,role='user')=>({timestamp:day+'T12:00:00Z',type:'response_item',payload:{type:'message',role,content:[{type:'text',text}]}});
  for(const [id,extra,rows] of [['root',{},[row('We decided to use SQLite in src/store.cjs','2026-09-01'),row('Need to add regression tests','2026-09-03'),row('Release v1.0 completed','2026-09-03','assistant')]],['fork',{forked_from_id:'root',git:{branch:'feature',commit_hash:'abc123'}},[row('Error in src/store.cjs','2026-09-05'),row('Investigate missing transactions','2026-09-06')]],['orphan',{parent_thread_id:'missing'},[row('A source without an indexed parent','2026-09-06')]]]){fs.writeFileSync(path.join(dir,id+'.jsonl'),[{type:'session_meta',payload:{id,cwd:'QA project',thread_source:'user',...extra}},...rows].map(JSON.stringify).join('\n'));}
  const original=fs.readFileSync(path.join(dir,'root.jsonl'));
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});
  await js("$('#skipWelcome').checked=true;await setupSources('folder');await go('dashboard')");
  assert.equal((await dispatch('analyze',{project:'QA project'})).sessions.length,3);
  assert.equal(await js("return document.querySelectorAll('.history-session').length"),3);
  const checked=[];
  for(const mode of ['branches','calendar','horizontal','lanes','events']){
   await js(`await go('timeline');historyUI.restore({...historyUI.options(),mode:'${mode}',from:'',to:'',kind:''});await render()`);
   assert.ok(!(await js("return $('#view').innerText")).includes('Unable to open'));
   if(mode==='branches')assert.equal(await js("return document.querySelectorAll('.branch-row').length"),3);
   if(mode==='calendar')assert.equal(await js("return document.querySelectorAll('.calendar-day').length"),6);
   await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(data,mode+'.png'),(await win.webContents.capturePage()).toPNG());checked.push(mode);
  }
  for(const view of ['chapters','graph','decisions']){await js(`await go('${view}')`);assert.ok(await js("return $('#view').querySelector('.history-content')!==null"));await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(data,view+'.png'),(await win.webContents.capturePage()).toPNG());checked.push(view);}
  await js("await go('settings');$('#manualAnnotations').checked=true;$('#manualAnnotations').dispatchEvent(new Event('change',{bubbles:true}))");
  await wait('state.config.manualAnnotations===true');assert.equal((await dispatch('init')).manualAnnotations,true);
  await js("await go('decisions');document.querySelector('[data-history-event]').click()");await wait("!!document.querySelector('#annotationForm')");
  await js("$('#annotationType').value='milestone';$('#annotationNote').value='Reviewed manually';$('#annotationForm').requestSubmit()");
  await wait("document.querySelector('.history-card')?.innerText.includes('Manual annotation')");
  assert.ok((await dispatch('analyze',{project:'QA project'})).events.some(e=>e.basis==='manual'));
  await js("document.querySelector('[data-history-event]').click()");await wait("!!document.querySelector('[data-history-open]')");
  await js("document.querySelector('[data-history-open]').click()");await wait("state.view==='conversation'");await js('await closeUtility()');assert.equal(await js('return state.view'),'decisions');
  await js("await go('dashboard');document.querySelector('[data-pin-session]').click()");await wait("document.querySelector('[data-pin-session]')?.textContent==='★'");
  assert.equal((await dispatch('flags')).filter(f=>f.pinned).length,1);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'p',ctrlKey:true}));");assert.equal(await js("return $('#commandPalette').open"),true);await js("$('#commandPalette').close();await go('conversation');document.querySelector('[data-record-inspect]').click()");await wait("!!document.querySelector('[data-compare-record]')");await js("document.querySelector('[data-compare-record]').click()");assert.ok(await js("return $('#toast').textContent.includes('Base selected')"));assert.equal(await js("return document.querySelectorAll('.splitter').length"),2);
  const dest=path.join(data+'-exports','report.md');fs.mkdirSync(path.dirname(dest),{recursive:true});dialog.showSaveDialog=async()=>({canceled:false,filePath:dest});await dispatch('exportAnalysis',{format:'md',scope:{project:'QA project'}});assert.ok(fs.readFileSync(dest,'utf8').includes('Reviewed')===true);assert.ok(fs.readFileSync(dest,'utf8').includes('manual'));
  await dispatch('rebuild');await dispatch('scan');assert.ok((await dispatch('analyze',{project:'QA project'})).events.some(e=>e.basis==='manual'));assert.equal((await dispatch('flags')).filter(f=>f.pinned).length,1);assert.deepEqual(fs.readFileSync(path.join(dir,'root.jsonl')),original);
  for(const language of ['ru','uk','en']){await js(`localStorage.setItem('language','${language}');await api('language','${language}')`);await new Promise(r=>{win.webContents.once('did-finish-load',r);win.webContents.reload();});await js('await window.__ready;await go("timeline")');assert.equal(await js('return document.documentElement.lang'),language);}
  win.setSize(980,640);await new Promise(r=>setTimeout(r,400));await js("await go('dashboard')");assert.equal(await js('return document.documentElement.scrollWidth<=innerWidth'),true);await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(data,'small.png'),(await win.webContents.capturePage()).toPNG());
  await js("await go('settings');$('#colorIndicators').value='semantic';$('#colorIndicators').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await js("return document.documentElement.dataset.indicators"),'semantic');
  for(const mode of ['light','dark']){await js(`appearance.set('mode','${mode}');await go('decisions')`);assert.ok(await js("return getComputedStyle($('.type-task')).getPropertyValue('--event-color')!==getComputedStyle($('.type-bug')).getPropertyValue('--event-color')"));await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(data,'indicators-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());}
  await new Promise(r=>{win.webContents.once('did-finish-load',r);win.webContents.reload();});await js('await window.__ready;await go("settings")');assert.equal(await js("return $('#colorIndicators').value"),'semantic');
  await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(data,'indicator-settings.png'),(await win.webContents.capturePage()).toPNG());
  await js("$('#colorIndicators').value='neutral';$('#colorIndicators').dispatchEvent(new Event('change',{bubbles:true}));await go('conversation')");assert.equal(await js("return getComputedStyle($('.message-body')).fontSize"),'15px');
  fs.writeFileSync(path.join(data,'history-smoke.json'),JSON.stringify({views:checked,manualAnnotations:true,rebuildPreservesAnnotations:true,sourceUnchanged:true,projectExport:true,pins:true,colorIndicators:true,indicatorPersistence:true,readableText:true,languages:['en','ru','uk'],errors},null,2));if(errors.length)app.exit(1);else win.close();
 }catch(e){fs.writeFileSync(path.join(data,'history-smoke-error.txt'),e.stack);app.exit(1);}
};
