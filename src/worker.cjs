const { parentPort, workerData } = require('node:worker_threads');
const { VaultStore } = require('./store.cjs');
const store = new VaultStore(workerData.dbPath);
let queue = Promise.resolve();
parentPort.on('message', m => {
  queue = queue.then(async () => {
    try {
      let result;
      if (m.method === 'scan') result = await store.scan(m.args.roots, p => parentPort.postMessage({ progress:p }),m.args.force);
      else if(m.method==='writeExport')result=await store.writeExport(m.args);
      else if (['list','session','records','chapters','timeline','search','graph','analyze','recordDetail','annotate','sessionFlag','flags'].includes(m.method)) result = store[m.method](m.args);
      else throw new Error('Unknown operation');
      parentPort.postMessage({ id:m.id, result });
    } catch (e) { parentPort.postMessage({ id:m.id, error:e.message }); }
  });
});
