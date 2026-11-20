// Bracket annotations live on the map root, outside the manuscript hierarchy.
// Members are stable topic/summary IDs; a new summary can reference an older one.
const batch=new Set();
function argumentExample(){
 const topic=(id,p,t)=>({id,p,t,origin:'sample'}),examples=(parent,nums)=>nums.map(i=>topic('e'+i,parent,'例子 '+i));
 return [Object.assign(topic('root',null,'主论点 = 论点 1 + 论点 2 − 论点 3'),{summaries:[
   {id:'s1',members:['e1','e2','e3'],title:'例子 1–3 支持论点 1'},
   {id:'s2',members:['e4','e5','e6'],title:'小总结：支持主论点，还需要补充论点 3'},
   {id:'s3',members:['e7','e8'],title:'补充论点 3 的不足'},
   {id:'s4',members:['s1','a2','s2','s3'],title:'本文观点'}
 ]}),topic('a1','root','论点 1'),...examples('a1',[1,2,3]),topic('a2','root','论点 2：观点、解释'),
 topic('extra','root','支持主论点的例子'),...examples('extra',[4,5,6]),topic('a3','root','论点 3：观点、解释'),...examples('a3',[7,8])];
}
let summaryEdit=null,summaryBoxes=new Map(),marquee=null,swallowClick=false;
const groups=()=>Array.isArray(by('root')?.summaries)?by('root').summaries:[];
const groupBy=id=>groups().find(g=>g.id===id);
const selection=()=>batch.size?[...batch]:sel==='root'?[]:[sel];
const targetId=el=>el?.dataset.summary||el?.dataset.id;
const boxFor=id=>summaryBoxes.get(id)||pos[id];

function placeSummaries(pts,right,span){
 summaryBoxes=new Map();let height=span/2;
 const obstacles=Object.values(pts).map(v=>({x:v.x+v.w,y1:v.y-v.h/2,y2:v.y+v.h/2}));
 const svg=W.querySelector('svg');
 for(const g of [...groups(),...(summaryEdit?.fresh?[summaryEdit.group]:[])]){
   if(!Array.isArray(g.members))continue;
   const members=g.members.map(id=>summaryBoxes.get(id)||pts[id]).filter(Boolean);
   if(!members.length)continue;
   const a=Math.min(...members.map(v=>v.y-v.h/2)),b=Math.max(...members.map(v=>v.y+v.h/2)),y=(a+b)/2;
   const el=document.createElement('div');el.className='mapSummary';el.dataset.summary=g.id;el.setAttribute('role','treeitem');
   el.innerHTML='<small>概要</small><span class="summaryText">'+E(g.title)+'</span>';
   el.title=g.members.map(id=>by(id)?.t||groupBy(id)?.title).filter(Boolean).join('、');W.append(el);
   const w=el.offsetWidth,h=el.offsetHeight,lo=Math.min(a,y-h/2),hi=Math.max(b,y+h/2);
   const x=obstacles.reduce((r,v)=>v.y2+7>=lo&&v.y1-7<=hi?Math.max(r,v.x):r,0)+14;
   const r=Math.min(9,(b-a)/4),path=document.createElementNS('http://www.w3.org/2000/svg','path');
   path.setAttribute('d',`M${x} ${a} q10 0 10 ${r} V${y-r} q0 ${r} 10 ${r} q-10 0 -10 ${r} V${b-r} q0 ${r} -10 ${r}`);
   path.setAttribute('stroke','var(--pick)');path.setAttribute('fill','none');path.setAttribute('stroke-width','1.6');svg.append(path);
   el.style.left=(x+25)+'px';el.style.top=y+'px';const v={x:x+25,y,w,h,el};summaryBoxes.set(g.id,v);
   obstacles.push({x:v.x+w,y1:lo,y2:hi});right=Math.max(right,v.x+w);height=Math.max(height,-lo,hi);
 }
 return {w:right,h:2*height};
}
function setBatch(ids){
 batch.clear();for(const id of ids)if(id!=='root'&&(by(id)||groupBy(id)))batch.add(id);
 sel=[...batch].find(id=>by(id))||'root';
 if(batch.size===1&&batch.has(sel))batch.clear();
 pane.hidden=true;draw();vp.focus({preventScroll:true});
}
function selectionUI(){
 for(const id of batch)if(!boxFor(id))batch.delete(id);
 const bulk=batch.size>0,ids=selection(),oneGroup=ids.length===1&&groupBy(ids[0]);
 W.classList.toggle('hasBatch',bulk);
 for(const el of W.querySelectorAll('[data-id],[data-summary]')){
   const id=targetId(el);el.setAttribute('aria-selected',bulk?batch.has(id):id===sel);
   el.classList.toggle('summaryMember',!!oneGroup&&oneGroup.members.includes(id));
 }
 $('#selectionCount').textContent=bulk?(oneGroup?'已选概要':'已选 '+ids.length+' 项'):'';
 const del=$('[data-a=del]');del.disabled=!ids.length;del.textContent=ids.length>1?'批量删除':'删除';
 del.title='删除所选地图主题及其子主题；删除概要会保留成员';
 $('[data-a=summary]').hidden=!ids.length;
 for(const el of document.querySelectorAll('#bar [data-a=child],#bar [data-a=sibling],#bar [data-single]'))el.disabled=bulk;
 $('#bar [data-a=sibling]').disabled=bulk||sel==='root';
 $('[data-a=edit]').disabled=bulk&&!oneGroup;
 if(bulk)$('[data-a=review]').hidden=true;
}
function deleteSelection(ids){
 const selected=new Set(ids.filter(id=>id!=='root'));if(!selected.size)return;
 const index=new Map(map.map(n=>[n.id,n])),removed=new Set();for(const n of map){for(let v=n;v;v=index.get(v.p))if(selected.has(v.id)){removed.add(n.id);break}}
 let fallback=by(sel);while(fallback&&removed.has(fallback.id))fallback=by(fallback.p);
 record();const keep=[];const live=new Set(map.filter(n=>!removed.has(n.id)).map(n=>n.id));
 for(const g of groups()){
   const members=g.members.filter(id=>live.has(id));
   if(!selected.has(g.id)&&members.length){keep.push({...g,members});live.add(g.id)}
 }
 if(groups().length)by('root').summaries=keep;
 map=map.filter(n=>!removed.has(n.id));sel=fallback?.id||'root';batch.clear();suggest=null;pane.hidden=true;save();draw();vp.focus({preventScroll:true});
}
function editSummary(existing=null){
 if(summaryEdit)return;
 const members=selection();if(!existing&&!members.length)return;
 window.lxClearInspection?.();
 const group=existing||{id:'summary-'+uid(),members,title:'小总结'};
 summaryEdit={group,fresh:!existing};draw();
 const box=summaryBoxes.get(group.id);if(!box){summaryEdit=null;return}
 const input=document.createElement('input');input.className='summaryInput';input.maxLength=120;input.setAttribute('aria-label','概要文字');input.value=group.title;box.el.querySelector('.summaryText').replaceWith(input);
 // Reveal the new label without changing zoom.
 const dx=vp.clientWidth-16-(tx+box.x*zoom+box.el.offsetWidth*zoom),dy=ty+box.y*zoom;
 if(dx<0)tx+=dx;if(dy<24)ty+=24-dy;else if(dy>vp.clientHeight-24)ty+=vp.clientHeight-24-dy;paint();
 input.focus({preventScroll:true});input.select();
 input.onkeydown=e=>{if(e.isComposing)return;e.stopPropagation();if(['Enter','Escape'].includes(e.key)){e.preventDefault();finishSummary(e.key==='Escape')}};
 input.onblur=()=>finishSummary(false,false);
}
function finishSummary(cancel=false,focus=true){
 if(!summaryEdit)return;const {group,fresh}=summaryEdit,input=W.querySelector('.summaryInput');const title=input?.value.trim()||group.title;
 summaryEdit=null;if(input)input.onblur=null;
 if(!cancel&&(fresh||group.title!==title)){record();group.title=title;if(fresh)(by('root').summaries??=[]).push(group);save()}
 if(!cancel||!fresh){batch.clear();batch.add(group.id);sel='root'}
 draw();if(focus)vp.focus({preventScroll:true});
}
function batchAction(k){
 if(summaryEdit)finishSummary();
 if(k==='summary'){editSummary();return true}
 if(!batch.size)return false;
 if(k==='del'){window.lxClearInspection?.();deleteSelection([...batch]);return true}
 if(k==='edit'&&batch.size===1){const g=groupBy([...batch][0]);if(g)editSummary(g);return true}
 return ['edit','child','sibling','discuss','review'].includes(k);
}
function canvasClick(e){
 if(!vp.contains(e.target)||e.target.closest('button,input,[contenteditable],.moveTopic'))return false;
 const item=e.target.closest('[data-summary],[data-id]'),id=targetId(item);
 if(id&&isGhost(id)){batch.clear();return false}
 if(e.shiftKey&&id&&id!=='root'){
   const ids=new Set(selection());if(ids.has(id))ids.delete(id);else ids.add(id);
   window.lxClearInspection?.();setBatch(ids);return true;
 }
 if(item?.dataset.summary){
   if(e.detail>=2)editSummary(groupBy(id));
   else if(!(batch.size===1&&batch.has(id))){window.lxClearInspection?.();batch.clear();batch.add(id);sel='root';pane.hidden=true;controls();vp.focus({preventScroll:true})}
   return true;
 }
 if(!id){if(batch.size||sel!=='root'){window.lxClearInspection?.();setBatch([])}return true}
 if(batch.size){batch.clear();if(id===sel){draw()}else{controls()}}
 return false;
}
function updateMarquee(e){
 const m=marquee;if(!m)return;
 if(!m.box){
   if(Math.hypot(e.clientX-m.x,e.clientY-m.y)<4)return;
   vp.setPointerCapture(m.id);m.box=document.createElement('div');m.box.id='marquee';vp.append(m.box);vp.classList.add('selecting');
   m.rect=vp.getBoundingClientRect();m.items=[...W.querySelectorAll('[data-id],[data-summary]')].map(el=>({id:targetId(el),el,r:el.getBoundingClientRect()})).filter(v=>v.id!=='root'&&!isGhost(v.id));
 }
 const l=Math.min(m.x,e.clientX),r=Math.max(m.x,e.clientX),t=Math.min(m.y,e.clientY),b=Math.max(m.y,e.clientY);
 Object.assign(m.box.style,{left:(l-m.rect.left)+'px',top:(t-m.rect.top)+'px',width:(r-l)+'px',height:(b-t)+'px'});
 m.ids=new Set(m.base);for(const v of m.items)if(v.r.right>=l&&v.r.left<=r&&v.r.bottom>=t&&v.r.top<=b)m.ids.add(v.id);
 W.classList.add('hasBatch');for(const v of m.items)v.el.setAttribute('aria-selected',m.ids.has(v.id));if(pos.root)pos.root.el.setAttribute('aria-selected','false');
 $('#selectionCount').textContent='已选 '+m.ids.size+' 项';
}
function stopPointer(e,cancel=false){
 if(pan&&(!e||e.pointerId===pan.id)){pan=null;vp.classList.remove('panning')}
 if(!marquee||(e&&e.pointerId!==marquee.id))return;
 const m=marquee;marquee=null;if(!m.box)return;
 m.box.remove();vp.classList.remove('selecting');swallowClick=true;
 if(!cancel){window.lxClearInspection?.();setBatch(m.ids)}else controls();
}
vp.addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation()}},true);
// A right press may become a menu or a pan. Decide on release, not on press.
vp.oncontextmenu=e=>{
 if(e.target.closest('input,textarea,[contenteditable]'))return
 e.preventDefault()
 if(!contextPress&&!pan&&liveCanvas()&&Date.now()-lastContextRelease>300){
  const id=e.target.closest('.topic')?.dataset.id;openCanvasMenu(e.clientX,e.clientY,id&&by(id)?id:null)
 }
}
let lastContextRelease=0
function finishCanvasGesture(e,cancel=false){
 const m=moveGesture
 if(m&&(!e||e.pointerId===m.pointer)){
  if(m.active&&!cancel&&e)updateDragFeedback(m,e)
  moveGesture=null;clearDragFeedback(m,!cancel&&m.over)
  if(m.active){swallowClick=true;if(!cancel&&m.over)moveTopic(m.node,m.over,m.where)}

 }
 const c=contextPress
 if(c&&(!e||e.pointerId===c.pointer)){contextPress=null;lastContextRelease=Date.now()
  if(!cancel&&!c.moved&&liveCanvas())openCanvasMenu(c.x,c.y,c.node)
 }
 stopPointer(e,cancel)
}
vp.onpointerdown=e=>{
 swallowClick=false;if(e.target.closest('input,textarea,[contenteditable],a,form'))return
 const topic=e.target.closest('.topic'),right=e.button===2||e.button===0&&e.ctrlKey
 if(right||e.button===1||(e.button===0&&document.body.classList.contains('inspecting')&&!e.target.closest('.topic,button,.mapSummary'))||(e.pointerType==='touch'&&!e.target.closest('.topic,.mapSummary'))){
   if(right)contextPress={pointer:e.pointerId,x:e.clientX,y:e.clientY,node:topic&&by(topic.dataset.id)?topic.dataset.id:null,moved:false}
   e.preventDefault();pan={id:e.pointerId,button:right?2:e.button,x:e.clientX,y:e.clientY};vp.setPointerCapture(e.pointerId);return
 }
 if(e.button!==0||e.pointerType==='touch'||e.target.closest('button'))return
 if(topic){if(topic.dataset.id!=='root'&&by(topic.dataset.id)&&liveCanvas())moveGesture={node:topic.dataset.id,pointer:e.pointerId,x:e.clientX,y:e.clientY};return}
 if(!e.target.closest('.mapSummary'))marquee={id:e.pointerId,x:e.clientX,y:e.clientY,base:e.shiftKey?selection():[]}
}
vp.onpointermove=e=>{
 if(pan?.id===e.pointerId){
  if(contextPress&&!contextPress.moved){if(Math.hypot(e.clientX-contextPress.x,e.clientY-contextPress.y)<5)return;contextPress.moved=true}
  if(pan.button===0&&(e.clientX!==pan.x||e.clientY!==pan.y))swallowClick=true;
  vp.classList.add('panning');tx+=e.clientX-pan.x;ty+=e.clientY-pan.y;pan.x=e.clientX;pan.y=e.clientY;requestPaint()
 }else if(moveGesture?.pointer===e.pointerId&&(e.buttons&1)){
  const m=moveGesture;if(!m.active){if(Math.hypot(e.clientX-m.x,e.clientY-m.y)<5)return;m.active=true;vp.setPointerCapture(e.pointerId);pos[m.node]?.el.classList.add('moving')}
  updateDragFeedback(m,e)
 }else if(marquee?.id===e.pointerId&&(e.buttons&1))updateMarquee(e)
}
window.addEventListener('pointerup',e=>finishCanvasGesture(e),true)
vp.onpointercancel=vp.onlostpointercapture=e=>finishCanvasGesture(e,true)
window.addEventListener('blur',()=>finishCanvasGesture(null,true))
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&(moveGesture||marquee||contextPress)){finishCanvasGesture(null,true);e.stopImmediatePropagation();e.preventDefault()}},true)
vp.onauxclick=e=>{if(e.button===1||e.button===2)e.preventDefault()};
