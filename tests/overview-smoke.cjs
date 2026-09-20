const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,data,fs,dialog,dispatch,app})=>{
 const errors=[];win.webContents.on('console-message',(e,l,m)=>{if(l===3||e.level==='error'||e.level===3)errors.push(e.message||m);});
 const js=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()');
 const wait=async s=>{for(let i=0;i<100;i++){if(await js('return '+s))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+s);};
 try{
 await js('await window.__ready');const dir=path.join(data,'fixtures');fs.mkdirSync(dir,{recursive:true});
 for(let i=0;i<86;i++)fs.writeFileSync(path.join(dir,i+'.jsonl'),[{type:'session_meta',payload:{id:'overview-'+i,cwd:i===85?'Other':'Many',thread_source:i===84?'subagent':'user'}},{timestamp:'2026-09-20T12:00:00Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'text',text:'Overview session '+i}]}}].map(JSON.stringify).join('\n'));
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});await js("await setupSources('folder');state.project='Many';state.service=false;historyUI.restore({scope:'project',sessionPage:0,from:'',to:'',kind:'',query:''});await go('dashboard')");
 assert.equal(await js("return document.querySelectorAll('.history-session').length"),40);
 await js("document.querySelector('[data-overview-page=\"1\"]').click()");await wait("historyUI.options().sessionPage===1&&$('#view[aria-busy=true]')===null");
 await js("document.querySelector('[data-overview-page=\"1\"]').click()");await wait("document.querySelectorAll('.history-session').length===4");
 const id=await js("return document.querySelector('.history-session [data-history-session]').dataset.historySession");
 await js("document.querySelector('.history-session [data-history-session]').click()");await wait("state.view==='conversation'&&!!document.querySelector('.message-body')");assert.equal(await js('return state.current.id'),id);
 await js('await closeUtility()');assert.equal(await js("return document.querySelectorAll('.history-session').length"),4);
 await js("$('#service').click()");await wait("document.querySelectorAll('.history-session').length===5");
 await js("$('#allProjects').click()");await wait("historyUI.options().scope==='vault'&&document.querySelectorAll('.history-session').length===40");
 assert.ok(await js("return $('#view .metrics .value').textContent==='86'"));
 await js("document.querySelector('[data-project=\"Other\"]').click()");await wait("document.querySelectorAll('.history-session').length===1");
 assert.ok(await js("return !!$('#import').closest('.sidebar-title')&&!document.querySelector('.sidebar-bottom')&&document.querySelectorAll('#import').length===1"));
 let picker=0;dialog.showOpenDialog=async()=>{picker++;return {canceled:true,filePaths:[]};};await js("$('#import').click()");for(let i=0;i<50&&!picker;i++)await new Promise(r=>setTimeout(r,50));assert.equal(picker,1);
 win.setSize(980,640);await new Promise(r=>setTimeout(r,300));assert.equal(await js('return document.documentElement.scrollWidth<=innerWidth'),true);
 fs.writeFileSync(path.join(data,'overview.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(data,'overview-smoke.json'),JSON.stringify({paginationBeyond80:true,openAndBack:true,serviceRefresh:true,vaultAndProjectRefresh:true,importRelocated:true,errors},null,2));if(errors.length)app.exit(1);else win.close();
 }catch(e){fs.writeFileSync(path.join(data,'overview-error.txt'),e.stack);app.exit(1);}
};
