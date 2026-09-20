const fs=require('node:fs/promises'),path=require('node:path');
function inside(file,root){const rel=path.relative(path.resolve(root),path.resolve(file));return !rel||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));}
async function checkDestination(dest,roots,protectedPaths=[]){
 dest=path.resolve(dest);const parent=await fs.realpath(path.dirname(dest));let real=path.join(parent,path.basename(dest)),exists=false;
 try{const stat=await fs.lstat(dest);exists=true;if(!stat.isFile()||stat.nlink>1)throw Error('Choose a regular destination file without links.');real=await fs.realpath(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const root of [...roots,...protectedPaths]){let actual=path.resolve(root);try{actual=await fs.realpath(actual);}catch{}if(inside(real,actual))throw Error('Export cannot overwrite source sessions or application data. Choose another folder.');}
 return {dest,exists};
}
module.exports={checkDestination,inside};
