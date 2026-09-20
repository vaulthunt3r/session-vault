const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,data,fs,dialog,app})=>{
 const errors=[];win.webContents.on('console-message',(e,l,m)=>{if(l===3||e.level==='error'||e.level===3)errors.push(e.message||m);});
 const js=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()');
 const wait=async s=>{for(let i=0;i<100;i++){if(await js('return '+s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+s);};
 try{
 await js('await window.__ready');const dir=path.join(data,'fixtures');fs.mkdirSync(dir,{recursive:true});
 const rows=[{type:'session_meta',payload:{id:'dense',cwd:'Dense timeline',thread_source:'user'}}];for(let i=0;i<600;i++)rows.push({timestamp:i<550?'2026-09-20T05:47:00Z':'2026-09-20T20:12:00Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'text',text:(i%2?'Need to implement task ':'Conversation message ')+i}]}});fs.writeFileSync(path.join(dir,'dense.jsonl'),rows.map(JSON.stringify).join('\n'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});await js("await setupSources('folder');state.project='Dense timeline';await go('timeline')");
 for(const mode of ['horizontal','lanes'])for(const zoom of [.2,.8,1.75,3]){
 await js(`historyUI.restore({mode:'${mode}',zoom:${zoom},from:'',to:'',kind:'',query:''});await render()`);
 assert.ok(await js(`const nodes=[...document.querySelectorAll('.time-bucket')];return nodes.length>0&&nodes.every((a,i)=>nodes.slice(i+1).every(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top;}))`));
 assert.equal(await js("return document.querySelectorAll('.lane-event').length"),0);
 }
 await js("historyUI.restore({mode:'horizontal',zoom:1});await render();document.querySelector('[data-lane-group]').click()");assert.equal(await js("return document.querySelectorAll('#laneGroup .history-card').length"),40);
 await js("document.querySelector('[data-lane-page=\"1\"]').click()");assert.ok(await js("return $('#laneGroup .pager span').textContent.startsWith('2 /')"));
 const id=await js("return $('#laneGroup .history-card').dataset.historyEvent");await js("$('#laneGroup .history-card').click()");await wait("!!document.querySelector('[data-history-open]')");assert.equal(await js("return document.querySelector('[data-history-open]').dataset.historyOpen"),id);
 await js("document.querySelector('[data-history-open]').click()");await wait("state.view==='conversation'&&!!document.querySelector('.message-body')");await js('await closeUtility()');assert.equal(await js('return state.view'),'timeline');
 win.setSize(1100,800);await new Promise(r=>setTimeout(r,300));for(const mode of ['horizontal','lanes']){await js(`historyUI.restore({mode:'${mode}',zoom:.8});await render();document.querySelector('.lane-scroll').scrollIntoView({block:'center'});`);await new Promise(r=>setTimeout(r,250));assert.ok(await js("const b=document.querySelector('.time-bucket');const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))"));fs.writeFileSync(path.join(data,mode+'.png'),(await win.webContents.capturePage()).toPNG());}
 fs.writeFileSync(path.join(data,'timeline-smoke.json'),JSON.stringify({events:600,modes:2,zoomLevels:4,noOverlaps:true,groupPaging:true,sourceJumpAndBack:true,hitTargets:true,errors},null,2));if(errors.length)app.exit(1);else win.close();
 }catch(e){fs.writeFileSync(path.join(data,'timeline-error.txt'),e.stack);app.exit(1);}
};
