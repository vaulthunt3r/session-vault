/* Fixed, non-overlapping time buckets. Every dated event belongs to one bucket. */
(function(root){
 function layout(events,width){
  width=Math.max(420,Math.round(width)||1100);
  const sorted=events.filter(e=>Number.isFinite(Date.parse(e.timestamp))).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
  if(!sorted.length)return {width,columns:1,start:0,end:0,groups:[]};
  const start=Date.parse(sorted[0].timestamp),end=Date.parse(sorted.at(-1).timestamp),columns=Math.max(1,Math.floor((width-24)/216)),span=Math.max(1,end-start+1),groups=[];
  const buckets=new Map();
  for(const e of sorted){const column=Math.min(columns-1,Math.floor((Date.parse(e.timestamp)-start)/span*columns));let g=buckets.get(column);if(!g){g={column,events:[]};buckets.set(column,g);groups.push(g);}g.events.push(e);}
  return {width,columns,start,end,groups};
 }
 if(typeof module==='object'&&module.exports)module.exports=layout;else root.timelineLayout=layout;
})(globalThis);
