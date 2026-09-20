const path=require('node:path');
// Run as an external --smoke harness with a fresh SESSION_VAULT_DATA directory.
// All screenshots use fictional fixtures, never the default Codex session folder.
module.exports=async({win,data,fs,dialog,app})=>{
 try{
 const js=s=>win.webContents.executeJavaScript('(async()=>{'+s+'})()');await js('await window.__ready');
 const dir=path.join(data,'demo-fixtures'),out=path.resolve(__dirname,'../docs/screenshots');fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
 const message=(text,role,stamp)=>({type:'response_item',timestamp:stamp,payload:{type:'message',role,content:[{type:'text',text}]}});
 const sessions=[['demo-reader','Build a local reading workspace',[
 ['user','Let us build a local reading workspace for project notes. Keep the original files unchanged and make navigation simple.'],
 ['assistant','## Reading workspace\n\nWe decided to keep the source files read-only and store navigation data separately.\n\n- Index notes locally\n- Preserve their original order\n- Link every search result to its source\n\n```js\nconst workspace = { local: true, readOnly: true };\n```'],
 ['user','Need to add a clear empty state when no notes are available.'],
 ['assistant','Completed the first reading view. The empty state explains how to choose a folder, and the source remains unchanged.']]],
 ['demo-search','Search and source navigation',[
 ['user','Need to add search across project notes.'],['assistant','We decided to use SQLite FTS for local text search. src/search.js holds the query adapter.'],['user','Investigate how the reader behaves when a source file is moved.'],['assistant','The cached view stays readable; refresh reports that the source is unavailable.']]],
 ['demo-layout','Refine the timeline layout',[
 ['user','The timeline should stay readable when several events share a timestamp.'],['assistant','We decided to group nearby events into count cards. Every item remains accessible in a paginated list.'],['user','Need to add regression tests for dense intervals.'],['assistant','Completed the layout checks. Each card has a separate click target.']]]];
 for(let n=0;n<sessions.length;n++){const [id,title,pairs]=sessions[n];const rows=[{type:'session_meta',payload:{id,cwd:'Demo Workspace',thread_source:'user',...(n?{forked_from_id:'demo-reader'}:{}),git:{branch:n?'feature/'+(n===1?'search':'timeline'):'main'}}}];for(let i=0;i<pairs.length;i++)rows.push(message(pairs[i][1],pairs[i][0],`2026-09-${14+n}T${String(9+i).padStart(2,'0')}:00:00Z`));fs.writeFileSync(path.join(dir,id+'.jsonl'),rows.map(JSON.stringify).join('\n'));}
 dialog.showOpenDialog=async()=>({canceled:false,filePaths:[dir]});await js("$('#skipWelcome').checked=true;await setupSources('folder');await api('language','en');localStorage.setItem('language','en')");
 await new Promise(r=>{win.webContents.once('did-finish-load',r);win.webContents.reload();});await js('await window.__ready');win.setSize(1440,980);await new Promise(r=>setTimeout(r,350));
 await js("appearance.set('mode','dark');appearance.set('dark','codex');state.project='Demo Workspace';state.view='conversation';await selectSession(state.sessions.find(s=>s.sessionId==='demo-reader').id);historyUI.restore({scope:'project',from:'',to:'',kind:'',query:''});localStorage.setItem('hideRight','true');applyPanels();$('#toast').hidden=true;");
 await new Promise(r=>setTimeout(r,350));fs.writeFileSync(path.join(out,'conversation.png'),(await win.webContents.capturePage()).toPNG());
 await js("appearance.set('mode','light');appearance.set('light','codex');historyUI.restore({mode:'lanes',zoom:.8});await go('timeline');$('#view').scrollTop=0;$('#toast').hidden=true;");
 await new Promise(r=>setTimeout(r,350));fs.writeFileSync(path.join(out,'timeline.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(data,'screenshots-result.json'),JSON.stringify({syntheticOnly:true,files:['conversation.png','timeline.png']}));win.close();
 }catch(e){fs.writeFileSync(path.join(data,'screenshots-error.txt'),e.stack);app.exit(1);}
};
