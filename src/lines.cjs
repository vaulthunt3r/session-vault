const fs=require('node:fs');
// Bound raw records before decoding: embedded media can be far larger than displayed text.
async function* boundedLines(file,maxBytes=8*1024*1024){
 let parts=[],size=0,oversized=false;
 for await(const chunk of fs.createReadStream(file,{highWaterMark:64*1024})){
  let start=0;
  for(let i=0;i<=chunk.length;i++)if(i===chunk.length||chunk[i]===10){
   const part=chunk.subarray(start,i);size+=part.length;
   if(size>maxBytes){oversized=true;parts=[];}else if(!oversized&&part.length)parts.push(part);
   if(i<chunk.length){yield oversized?null:Buffer.concat(parts).toString('utf8').replace(/\r$/,'');parts=[];size=0;oversized=false;}
   start=i+1;
  }
 }
 if(size||oversized)yield oversized?null:Buffer.concat(parts).toString('utf8').replace(/\r$/,'');
}
module.exports={boundedLines};
