// The held card follows the grab point. The dashed slot uses the same tree as the drop.
function dropAt(x,y,source){
 const hit=document.elementFromPoint(x,y);if(!hit||!vp.contains(hit))return {}
 const topic=hit.closest('#world .topic');if(topic)return {el:topic,id:topic.dataset.id,where:zone(topic,y)}
 // Gaps belong to adjacent siblings in the same column; never guess across branches.
 const r=vp.getBoundingClientRect(),px=(x-r.left-tx)/zoom,py=(y-r.top-ty)/zoom
 let best=null
 for(const v of Object.values(pos)){
  if(v.n.ghost||descendant(v.n.id,source))continue
  const next=v.cs.map(c=>pos[c.id]).filter(k=>!k.n.ghost)
  for(let i=1;i<next.length;i++){
   const a=next[i-1],b=next[i],end=a.y+a.h/2,start=b.y-b.h/2
   if(py<end||py>start||px<a.x-6||px>a.x+Math.max(a.w,b.w)+6)continue
   const score=Math.abs(py-(start+end)/2);if(!best||score<best.score)best={id:b.n.id,el:b.el,where:'before',score}
  }
  for(const [k,where] of [[next[0],'before'],[next.at(-1),'after']]){
   if(!k)continue;const dist=where==='before'?k.y-k.h/2-py:py-k.y-k.h/2
   if(dist>=0&&dist<=22&&px>=k.x&&px<=k.x+k.w&&(!best||dist<best.score))best={el:k.el,id:k.n.id,where,score:dist}
  }
  if(px>=v.x+v.w&&px<v.x+v.w+36&&Math.abs(py-v.y)<=v.h/2&&!best)best={id:v.n.id,el:v.el,where:'inside',score:Infinity}
 }
 return best||{}
}
function updateDragFeedback(m,e){
 const src=pos[m.node]?.el,surface=$('#surface');if(!src)return
 if(!m.layer){
  const r=src.getBoundingClientRect();m.dx=m.x-r.left;m.dy=m.y-r.top
  m.layer=document.createElement('div');m.layer.className='dragLayer';m.layer.inert=true;m.layer.setAttribute('aria-hidden','true');surface.append(m.layer)
  m.held=src.cloneNode(true);m.held.removeAttribute('data-id');m.held.classList.remove('moving','selected');m.held.classList.add('heldTopic');m.held.querySelectorAll('button').forEach(el=>el.remove());m.layer.append(m.held)
  m.projection=document.createElement('div');m.projection.className='dragProjection';m.layer.prepend(m.projection)
  m.slot=document.createElement('div');m.slot.className='dropSlot';m.projection.append(m.slot);m.slot.hidden=true;m.previous=$('#status').textContent
 }
 const r=surface.getBoundingClientRect();Object.assign(m.held.style,{left:e.clientX-r.left-m.dx+'px',top:e.clientY-r.top-m.dy+'px',transform:'scale('+zoom+')',width:src.offsetWidth+'px'})
 m.pointerAt={x:e.clientX,y:e.clientY}
 // Keep the chosen target through the reveal and a stationary release.
 if(m.revealPoint&&Math.hypot(e.clientX-m.revealPoint.x,e.clientY-m.revealPoint.y)<5)return
 m.revealPoint=null
 const {el,id,where}=dropAt(e.clientX,e.clientY,m.node),key=JSON.stringify([id,where])
 if(m.key===key)return;clearTimeout(m.revealTimer);m.key=key;m.preview?.remove();m.preview=null;W.classList.remove('dropPreviewing');m.target?.classList.remove('dragto','before','after');m.target=null;m.over=null;m.slot.hidden=true
 let next=id&&(m.project||projectMove)(m.node,id,where)
 if(next&&!m.project)next=window.manuscriptMapNodes?.(next)||next
 if(!next||!next.some(n=>n.id===m.node)){canvasNotice('移到其他主题的上缘、下缘或中部；Esc 取消。');return}
 const preview=document.createElement('div');preview.className='projectedTree';preview.style.transform=W.style.transform;m.projection.prepend(preview);m.preview=preview
 const tree=renderTree(next,preview,m.node),v=tree.pts[m.node];if(!v){preview.remove();return}v.el.style.visibility='hidden';preview.querySelectorAll('button.more,button.fold').forEach(b=>b.remove());W.classList.add('dropPreviewing')
 for(const k of Object.values(tree.pts)){const img=k.el.querySelector('.topicImage'),shown=pos[k.n.id]?.el.querySelector('.topicImage');if(img&&shown?.src)img.src=shown.src}
 const motion=getComputedStyle(document.documentElement),duration=parseFloat(motion.getPropertyValue('--ms-motion-layout'));
 if(duration>0){
  for(const item of Object.values(tree.pts)){
   const old=m.positions?.[item.n.id]||pos[item.n.id];
   if(old&&item!==v&&(old.x!==item.x||old.y!==item.y)){
    item.el.animate([{translate:(old.x-item.x)+'px '+(old.y-item.y)+'px'},{translate:'0 0'}],{duration,easing:motion.getPropertyValue('--ms-ease-out').trim()});
   }
  }
 }
 m.positions=tree.pts;
 const target=tree.pts[id];if(target)target.el.classList.add(where==='inside'?'dragto':where)
 Object.assign(m.slot.style,{left:tx+v.x*zoom+'px',top:ty+(v.y-v.h/2)*zoom+'px',width:v.w*zoom+'px',height:v.h*zoom+'px'});m.slot.textContent=v.n.t;m.slot.dataset.where=where
 m.target=el;m.over=id;m.where=where;m.slot.hidden=false;el.classList.add(where==='inside'?'dragto':where)
 // Skimmed child targets should not move the view on the way to another drop.
 if(where==='inside'&&tx+(v.x+v.w)*zoom>r.width){
  m.revealTimer=setTimeout(()=>revealDragSlot(m,v,surface.getBoundingClientRect(),duration,motion),120)
 }
 canvasNotice('松开：'+({before:'排在「',after:'排在「',inside:'成为「'}[where])+pos[id].n.t+({before:'」之前',after:'」之后',inside:'」的子主题'}[where])+' · Esc 取消')
}
function revealDragSlot(m,v,r,duration,motion){
 const left=tx+v.x*zoom,right=left+v.w*zoom,margin=12
 if(right<=r.width)return
 const shift=Math.min(0,Math.max(margin-left,r.width-margin-right))
 if(!shift)return
 const oldOffset=m.projection.getBoundingClientRect().left-r.left
 tx+=shift;m.revealX=(m.revealX||0)+shift;m.revealPoint=m.pointerAt
 paint();m.preview.style.transform=W.style.transform;m.slot.style.left=tx+v.x*zoom+'px'
 m.revealMotion?.cancel()
 if(duration>0)m.revealMotion=m.projection.animate(
  [{translate:(oldOffset-shift)+'px 0'},{translate:'0 0'}],
  {duration,easing:motion.getPropertyValue('--ms-ease-out').trim()}
 )
}
function clearDragFeedback(m,keepCamera=false){
 clearTimeout(m.revealTimer)
 m.layer?.remove();W.classList.remove('dropPreviewing');pos[m.node]?.el.classList.remove('moving');m.target?.classList.remove('dragto','before','after');if(m.previous!==undefined)canvasNotice(m.previous)
 if(m.revealX&&!keepCamera){tx-=m.revealX;paint()}
}
