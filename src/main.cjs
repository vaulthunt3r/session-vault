const { app, BrowserWindow, ipcMain, dialog, shell, session, nativeTheme, clipboard, screen } = require('electron');
const { Worker } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const smoke = process.argv.includes('--smoke');
if(smoke) app.disableHardwareAcceleration();
if (process.env.SESSION_VAULT_DATA) app.setPath('userData', path.resolve(process.env.SESSION_VAULT_DATA));
const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance) app.quit();
let win, worker, roots, configPath, scanPromise, workerError, dialogBusy=false, skipWelcome=false, language='en', manualAnnotations=false;
const {checkDestination}=require('./export.cjs');
const translate=text=>language==='ru'?text:(require('./locales.json')[text]?.[language==='uk'?1:0]||text);
const defaultRoot=path.join(os.homedir(),'.codex','sessions');
function saveConfig(){const temp=configPath+'.tmp';fs.writeFileSync(temp,JSON.stringify({roots,skipWelcome,language,manualAnnotations},null,2));fs.renameSync(temp,configPath);}
let seq = 0; const pending = new Map();
function request(method,args) { return new Promise((resolve,reject) => { if(workerError||!worker){reject(workerError||new Error('Index worker is unavailable. Restart Session Vault.'));return;}const id=++seq;pending.set(id,{resolve,reject});try{worker.postMessage({id,method,args});}catch(e){pending.delete(id);reject(e);} }); }
function scan(force=false) { return scanPromise ||= request('scan',{roots:[...roots],force}).finally(() => { scanPromise=null; }); }
async function dispatch(method,args) {
  if(typeof method!=='string')throw Error('Invalid operation');
  if(['records','search','export','exportAnalysis','setup','welcomePrefs','analyze','recordDetail','annotate','sessionFlag'].includes(method)&&(!args||typeof args!=='object'||Array.isArray(args)))throw Error('Invalid arguments');
  if(['session','chapters','timeline','graph','reveal'].includes(method)&&typeof args!=='string')throw Error('Invalid session');
  if(['records','export'].includes(method)&&typeof args.id!=='string')throw Error('Invalid session');
  if(method==='manualAnnotations'){if(typeof args!=='boolean')throw Error('Invalid setting');manualAnnotations=args;saveConfig();return true;}
  if(method==='annotate'&&!manualAnnotations)throw Error('Enable manual annotations in Settings first.');
  if(method==='language'){if(!['en','ru','uk'].includes(args))throw Error('Invalid language');language=args;saveConfig();return true;}
  if(method==='copyText'){if(typeof args!=='string'||args.length>300000)throw Error('Invalid clipboard text');clipboard.writeText(args);return true;}
  if(method==='copyPath'){const s=args?.id?await request('session',args.id):null;const value=s?(args.folder?path.dirname(s.path):s.path):roots[args?.index];if(!value)throw Error('Path is unavailable');clipboard.writeText(value);return true;}
  if(method==='rebuild'){if(scanPromise)await scanPromise.catch(()=>{});await worker?.terminate();const data=app.getPath('userData');const suffix='.backup-'+Date.now();for(const name of ['vault-v1.sqlite','vault-v1.sqlite-wal','vault-v1.sqlite-shm']){const file=path.join(data,name);if(fs.existsSync(file))fs.renameSync(file,file+suffix);}startWorker(data);return true;}
  if(method==='removeSource'){if(!Number.isSafeInteger(args)||args<0||args>=roots.length)throw Error('Invalid source');if(scanPromise)await scanPromise;roots=roots.filter((_,i)=>i!==args);saveConfig();return {roots};}
  if(method==='nativeTheme'){if(!['system','light','dark'].includes(args))throw new Error('Invalid appearance');nativeTheme.themeSource=args;return true;}
  if (method === 'init') return { roots, skipWelcome, language, manualAnnotations, defaultRoot, dataPath:app.getPath('userData'), version:app.getVersion() };
  if (method === 'welcomePrefs') {skipWelcome=!!args.skipWelcome;saveConfig();return true;}
  if (method === 'setup') {
    let selected;
    if(args.kind==='default') selected=[defaultRoot];
    else if(args.kind==='current') selected=roots;
    else if(['folder','files'].includes(args.kind)) {
      const result=await dialog.showOpenDialog(win,{title:translate('Выберите источник сессий'),properties:args.kind==='folder'?['openDirectory']:['openFile','multiSelections'],filters:[{name:'Codex session',extensions:['jsonl']}]});
      if(result.canceled || !result.filePaths.length)return null;
      selected=result.filePaths;
    } else throw new Error('Неизвестный источник');
    if(scanPromise)await scanPromise;
    roots=[...new Set(selected)];skipWelcome=!!args.skipWelcome;saveConfig();
    return {roots,skipWelcome};
  }
  if (method === 'scan') {if(scanPromise){if(!args?.force)return scanPromise;await scanPromise;return scan(true);}return scan(args?.force===true);}
  if (method === 'import') {
    const result = await dialog.showOpenDialog(win,{ title:translate('Добавить локальные JSONL'), properties: args === 'folder' ? ['openDirectory'] : ['openFile','multiSelections'], filters:[{name:'Codex session',extensions:['jsonl']}] });
    if (result.canceled) return null;
    if(scanPromise)await scanPromise;roots=[...new Set([...roots,...result.filePaths])]; saveConfig();return {roots};
  }
  if (method === 'reveal') { const s=await request('session',args); await fs.promises.access(s.path);shell.showItemInFolder(s.path); return true; }
  if (method === 'export' || method==='exportAnalysis') {
    if (!['md','json','jsonl'].includes(args.format)) throw new Error('Неизвестный формат');
    const report=method==='exportAnalysis'?await request('analyze',args.scope):null;
    if(report&&!['md','json'].includes(args.format))throw Error('Invalid report format');
    const s=report?{sessionId:'project-history',path:''}:await request('session',args.id);
    const result=await dialog.showSaveDialog(win,{ title:translate('Экспорт сессии'), defaultPath:`session-${String(s.sessionId||args.id).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100)}.${args.format}`, filters:[{name:args.format.toUpperCase(),extensions:[args.format]}] });
    if (result.canceled) return null;
    const protectedPaths=[...(s.path?[s.path]:[]),app.getPath('userData'),path.resolve(__dirname,'..')];
    const {dest,exists}=await checkDestination(result.filePath,roots,protectedPaths);
    const temp=path.join(path.dirname(dest),'.session-vault-'+require('node:crypto').randomUUID()+'.tmp');
    try{
      if(report){const text=args.format==='json'?JSON.stringify({schemaVersion:1,scope:args.scope,note:'Automatic labels are candidates. Bounded derived index; source JSONL is authoritative.',...report},null,2):'# Session Vault — project history\n\nAutomatic labels are candidates. Bounded derived index; source JSONL is authoritative.\n\n'+report.events.map(e=>'## '+e.type+' · '+e.basis+' · '+e.timestamp+'\n\n'+e.text+'\n\nBasis / note: '+e.reason+'\n\nSource: '+(report.sessions.find(s=>s.id===e.session)?.path||e.session)+' · line '+e.line+'\n').join('\n---\n');await fs.promises.writeFile(temp,text,{flag:'wx'});}
      else if(args.format==='jsonl')await fs.promises.copyFile(s.path,temp,fs.constants.COPYFILE_EXCL);
      else await request('writeExport',{id:args.id,format:args.format,dest:temp});
      await checkDestination(dest,roots,protectedPaths);
      if(exists)await fs.promises.rename(temp,dest);
      else{await fs.promises.link(temp,dest);await fs.promises.unlink(temp);}
    }finally{await fs.promises.unlink(temp).catch(()=>{});}
    return dest;
  }
  if (['list','session','records','chapters','timeline','search','graph','analyze','recordDetail','annotate','sessionFlag','flags'].includes(method)) return request(method,args);
  throw new Error('Недоступная операция');
}
function startWorker(data){workerError=null;
  worker=new Worker(path.join(__dirname,'worker.cjs'),{workerData:{dbPath:path.join(data,'vault-v1.sqlite')}});
  worker.on('message',m=>{ if(m.progress) { if(!win?.isDestroyed()) win?.webContents.send('index-progress',m.progress); return; } const p=pending.get(m.id); if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);} });
  const failWorker=e=>{workerError=e;for(const p of pending.values())p.reject(e);pending.clear();};worker.on('error',failWorker);worker.on('exit',code=>failWorker(new Error('Index worker stopped ('+code+'). Restart Session Vault.')));
}
app.whenReady().then(async () => {
  if(!singleInstance)return;
  const data=app.getPath('userData'); fs.mkdirSync(data,{recursive:true}); configPath=path.join(data,'sources.json');
  roots=[];
  try { const c=JSON.parse(fs.readFileSync(configPath,'utf8')); if(Array.isArray(c.roots)&&c.roots.every(x=>typeof x==='string')) roots=c.roots; skipWelcome=c.skipWelcome===true;manualAnnotations=c.manualAnnotations===true;if(['en','ru','uk'].includes(c.language))language=c.language; } catch {}
  startWorker(data);
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:/^https?:|^wss?:/i.test(details.url)}));
  session.defaultSession.setPermissionRequestHandler((_w,_p,callback)=>callback(false));
  ipcMain.handle('vault',(event,method,args)=>{
    if(event.sender!==win.webContents || event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==require('node:url').pathToFileURL(path.join(__dirname,'../ui/index.html')).href) throw new Error('Invalid sender');
    const exclusive=['setup','import','export','exportAnalysis','removeSource','rebuild'].includes(method);
    if(exclusive&&dialogBusy)throw Error('Finish the current dialog first.');if(exclusive)dialogBusy=true;
    return dispatch(method,args).then(data=>({ok:true,data}),e=>({ok:false,error:translate(e.message)})).finally(()=>{if(exclusive)dialogBusy=false;});
  });
  app.setAppUserModelId('local.session-vault');
  const windowFile=path.join(data,'window.json');let savedWindow={};
  try{savedWindow=JSON.parse(fs.readFileSync(windowFile,'utf8'));}catch{}
  const bounds=savedWindow.bounds;const validBounds=bounds&&['x','y','width','height'].every(k=>Number.isFinite(bounds[k]))&&bounds.width>=980&&bounds.height>=640&&screen.getAllDisplays().some(d=>{const a=d.workArea;return bounds.x>=a.x&&bounds.y>=a.y&&bounds.x+100<a.x+a.width&&bounds.y+100<a.y+a.height;});
  win=new BrowserWindow({width:1500,height:960,...(validBounds?bounds:{}),icon:path.join(__dirname,'../ui/icon.ico'),minWidth:980,minHeight:640,show:!smoke,title:'Session Vault',backgroundColor:'#121316',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:smoke}});
  if(validBounds)win.setBounds(bounds);
  if(savedWindow.maximized)win.maximize();
  const saveWindow=()=>{try{const temp=windowFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({bounds:win.getNormalBounds(),maximized:win.isMaximized()}));fs.renameSync(temp,windowFile);}catch(e){console.error('Window state:',e.message);}};
  win.on('close',saveWindow);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(e,url)=>{if((url||e.url)!==require('node:url').pathToFileURL(path.join(__dirname,'../ui/index.html')).href)e.preventDefault();});
  win.webContents.on('will-attach-webview',e=>e.preventDefault());
  await win.loadFile(path.join(__dirname,'../ui/index.html'));
  if(smoke)await require(path.resolve(process.env.SESSION_VAULT_SMOKE||path.join(__dirname,'../tests/electron-smoke.cjs')))({win,data,fs,dialog,app,nativeTheme,scan,dispatch});
}).catch(e=>{dialog.showErrorBox('Session Vault',e.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.on('before-quit',()=>worker?.terminate());
