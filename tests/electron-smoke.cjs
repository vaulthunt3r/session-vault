const path=require('node:path');
module.exports=async({win,data,fs,dialog,app,nativeTheme,scan,dispatch})=>{
const runtimeErrors=[];win.webContents.on('console-message',(_event,level,message)=>{if(level===3||_event.level==='error'||_event.level===3)runtimeErrors.push(_event.message||message);});win.webContents.on('render-process-gone',(_e,details)=>runtimeErrors.push(details.reason));
    try {
      if(process.env.SESSION_VAULT_RESUME==='1'){await win.webContents.executeJavaScript('window.__ready');const state=await win.webContents.executeJavaScript('({offset:state.offset,view:state.view,language:document.documentElement.lang,id:state.current?.sessionId})');if(state.offset!==60||state.view!=='conversation'||state.language!=='en'||state.id!=='daily')throw Error('Process restart restoration: '+JSON.stringify(state));if(Math.abs(win.getNormalBounds().width-1250)>4)throw Error('Window width was not restored: '+JSON.stringify({actual:win.getNormalBounds(),saved:JSON.parse(fs.readFileSync(path.join(data,'window.json'))),displays:require('electron').screen.getAllDisplays()}));await win.webContents.executeJavaScript("go('settings')");for(const lang of ['ru','en']){const loaded=new Promise(r=>win.webContents.once('did-finish-load',r));await win.webContents.executeJavaScript("document.querySelector('[data-language]').value='"+lang+"';document.querySelector('[data-language]').dispatchEvent(new Event('change',{bubbles:true}));void 0");await Promise.race([loaded,new Promise((_,reject)=>setTimeout(()=>reject(Error('Language reload timed out')),10000))]);await win.webContents.executeJavaScript('window.__ready');const actual=await win.webContents.executeJavaScript('({language:document.documentElement.lang,view:state.view})');if(actual.language!==lang||actual.view!=='settings')throw Error('Language selector failed');}fs.writeFileSync(path.join(data,'restart.json'),JSON.stringify({state,bounds:win.getNormalBounds(),passed:true,languageSelector:true},null,2));win.close();return;}
      // Renderer integration exercises the actual isolated IPC bridge and all views.
      await win.webContents.executeJavaScript('window.__ready');
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'renderer-smoke.js'),'utf8')+';void 0;');
      await new Promise(resolve=>setTimeout(resolve,200));
      fs.writeFileSync(path.join(data,'welcome.png'),(await win.webContents.capturePage()).toPNG());
      const fixtureDir=path.join(data,'source-fixtures');fs.mkdirSync(fixtureDir,{recursive:true});
      for(const n of [1,2])fs.writeFileSync(path.join(fixtureDir,`sample-${n}.jsonl`),[
        {type:'session_meta',payload:{id:`fixture-${n}`,thread_source:'user',cwd:'Fixture'}},
        {timestamp:'2026-09-17T12:00:00Z',type:'response_item',payload:{type:'message',role:'user',content:[{type:'text',text:`Codex fixture ${n}`}]}},
      ].map(JSON.stringify).join('\n')+'\n');
      const originalPicker=dialog.showOpenDialog;
      const choices=[{canceled:true,filePaths:[]},{canceled:false,filePaths:[fixtureDir]},{canceled:false,filePaths:[path.join(fixtureDir,'sample-1.jsonl')]}];
      dialog.showOpenDialog=async()=>{if(!choices.length)throw new Error('Unexpected picker request');return choices.shift();};
      const onboarding=await win.webContents.executeJavaScript('window.__testOnboarding()');
      dialog.showOpenDialog=originalPicker;
      await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});
      await win.webContents.executeJavaScript('window.__ready');
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'renderer-smoke.js'),'utf8')+';void 0;');
      await win.webContents.executeJavaScript('window.__testResume()');
      const result=await scan();
      const checks=await win.webContents.executeJavaScript('window.__smoke()');
      await require('./release-smoke.cjs')({win,fs,path,data,dispatch,dialog,checks});
      checks.errors.push(...runtimeErrors);
      await win.webContents.executeJavaScript("appearance.set('mode','system')");
      for(const mode of ['light','dark']){
        nativeTheme.themeSource=mode;await new Promise(resolve=>setTimeout(resolve,200));
        const actual=await win.webContents.executeJavaScript('document.documentElement.dataset.appearance');
        if(actual!==mode)checks.errors.push('System appearance did not follow '+mode);
      }
      nativeTheme.themeSource='system';
      await new Promise(resolve=>setTimeout(resolve,250));
      const screenshot=await win.webContents.capturePage();
      fs.writeFileSync(path.join(data,'smoke.png'),screenshot.toPNG());
      for(const view of ['dashboard','chapters','graph','export','search']) {
        await win.webContents.executeJavaScript(`window.__showView('${view}')`);
        await new Promise(resolve=>setTimeout(resolve,200));
        fs.writeFileSync(path.join(data,`smoke-${view}.png`),(await win.webContents.capturePage()).toPNG());
      }
      for(const [mode,palette]of [['light','catppuccin'],['dark','dracula']]){
        await win.webContents.executeJavaScript(`appearance.set('${mode}','${palette}');appearance.set('mode','${mode}');window.__showView('settings')`);
        await new Promise(resolve=>setTimeout(resolve,200));
        fs.writeFileSync(path.join(data,`appearance-${mode}.png`),(await win.webContents.capturePage()).toPNG());
      }
      fs.writeFileSync(path.join(data,'smoke.json'),JSON.stringify({result,onboarding,checks},null,2));
      await win.webContents.executeJavaScript("(async()=>{await go('conversation');state.offset=60;await render();persist()})()");
      win.setSize(1250,800);if(checks.errors.length)app.exit(1);else win.close();
    } catch(e) {fs.writeFileSync(path.join(data,'smoke-error.txt'),e.stack);app.exit(1);}
};
