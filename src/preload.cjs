const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('vault', {
  call: (method, args) => ipcRenderer.invoke('vault', method, args).then(r=>{if(!r.ok)throw new Error(r.error);return r.data;}),
  onProgress: callback => { const listener = (_e,p) => callback(p); ipcRenderer.on('index-progress',listener); return () => ipcRenderer.removeListener('index-progress',listener); }
});
