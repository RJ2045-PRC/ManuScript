// Batch adjacent small tasks without losing their identities or source boundaries.
export function planWorkGroups(tasks,{bundle=true}={}){
 const groups=[];let group=[],chars=0,parts=0,figures=new Set();
 const flush=()=>{if(group.length)groups.push(group);group=[];chars=0;parts=0;figures=new Set()};
 for(const task of tasks){if(task.status==='done')continue;const pp=task.packet.parts,n=pp.reduce((s,p)=>s+p.text.length,0),ff=task.packet.chapter.figures.filter(f=>!f.rows).map(f=>f.sha||f.asset||f.id),next=new Set([...figures,...ff]);
  if(group.length&&(!bundle||group.length>=3||chars+n>6500||parts+pp.length>8||next.size>4))flush();
  group.push(task);chars+=n;parts+=pp.length;ff.forEach(f=>figures.add(f));
 }flush();return groups;
}
// At most two independent requests. On throttle, drain the other lane then continue serially.
export async function runWorkGroups(groups,run,{concurrency=2,signal,shouldPause=()=>false,isThrottled=()=>false}={}){
 let cursor=0;const limit=Math.max(1,Math.min(2,concurrency)),pending=new Set();let failure;
 while(cursor<groups.length||pending.size){
  if(signal?.aborted)failure=signal.reason||Error('cancelled');
  while(!failure&&!shouldPause()&&cursor<groups.length&&pending.size<(isThrottled()?1:limit)){
   const group=groups[cursor++];let job;job=Promise.resolve().then(()=>run(group)).catch(e=>{failure=e}).finally(()=>pending.delete(job));pending.add(job);
  }
  if(!pending.size)break;await Promise.race(pending);
 }
 if(failure)throw failure;
}
