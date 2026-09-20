const assert=require('node:assert/strict');
module.exports=async({win,data,fs,dispatch,app,dialog})=>{
 const path=require('node:path');
 try{
  await win.webContents.executeJavaScript('window.__ready');
  await assert.rejects(dispatch('list'));
  await win.webContents.executeJavaScript("go('settings')");
  assert.equal(await win.webContents.executeJavaScript("!!document.querySelector('#rebuildIndex')"),true);
  await dispatch('rebuild');await dispatch('scan');assert.equal((await dispatch('list')).length,1);
  const empty=path.join(data,'empty');fs.mkdirSync(empty,{recursive:true});
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[empty]});
  await dispatch('setup',{kind:'folder',skipWelcome:true});assert.equal((await dispatch('scan')).total,0);assert.equal((await dispatch('list')).length,0);
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(data,'does-not-exist')]});
  await dispatch('setup',{kind:'folder',skipWelcome:true});assert.equal((await dispatch('scan')).errors.length,1);
  const first=path.join(data,'sample.jsonl'),second=path.join(data,'second.jsonl');fs.copyFileSync(first,second);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[first,second]});await dispatch('setup',{kind:'files',skipWelcome:true});await dispatch('scan');assert.equal((await dispatch('list')).length,2);await dispatch('removeSource',0);await dispatch('scan');assert.equal((await dispatch('list')).length,1);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[first]});await dispatch('import','files');await dispatch('scan');assert.equal((await dispatch('list')).length,2);
  fs.writeFileSync(path.join(data,'recovery.json'),JSON.stringify({corruptCacheRebuilt:true,emptySource:true,missingSource:true,multipleFilesAddRemove:true}));win.close();
 }catch(e){fs.writeFileSync(path.join(data,'recovery-error.txt'),e.stack);app.exit(1);}
};
