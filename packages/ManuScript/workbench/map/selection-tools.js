// Selection actions live beside the selection, without changing the document layout.
function attachSelectionTools({root,panel,source,surface,onSelection}){
 let dragging=false,frame=0,disposed=false,dismissed=false,signature='',lastPoint=null;
 const events=[];
 const listen=(el,type,fn,options)=>{el.addEventListener(type,fn,options);events.push(()=>el.removeEventListener(type,fn,options))};
 const hide=()=>{panel.hidden=true};
 const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});
 const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 function occupiedText(el,clip){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),out=[];let node;while(node=walker.nextNode()){if(!node.textContent.trim())continue;const r=new Range();r.selectNodeContents(node);for(const box of r.getClientRects())if(box.width&&box.height&&intersects(box,clip))out.push(rect(box))}return out}
 function measure(){
  const el=surface();if(!el||el.hidden)return null;
  if(el===source){
   const a=source.selectionStart,z=source.selectionEnd;if(a===z)return null;
   const box=source.getBoundingClientRect(),css=getComputedStyle(source),mirror=document.createElement('div');
   for(const k of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','textTransform','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft'])mirror.style[k]=css[k];
   Object.assign(mirror.style,{position:'fixed',visibility:'hidden',pointerEvents:'none',boxSizing:'border-box',whiteSpace:'pre-wrap',overflowWrap:'break-word',width:source.clientWidth+'px',left:(box.left+source.clientLeft-source.scrollLeft)+'px',top:(box.top+source.clientTop-source.scrollTop)+'px'});
   const text=document.createTextNode(source.value+'\u200b');mirror.append(text);document.body.append(mirror);
   try{const range=new Range();range.setStart(text,a);range.setEnd(text,z);const focus=source.selectionDirection==='backward'?a:z,caret=new Range();caret.setStart(text,focus);caret.setEnd(text,focus);let end=caret.getBoundingClientRect();if(!end.height){caret.setStart(text,Math.max(0,focus-1));caret.setEnd(text,Math.max(1,focus));end=caret.getBoundingClientRect()}
    return {quote:source.value.slice(a,z),key:a+':'+z+':'+source.selectionDirection,rects:[...range.getClientRects()].map(rect),end:rect(end),clip:rect(box),occupied:occupiedText(mirror,box)};
   }finally{mirror.remove()}
  }
  const sel=getSelection();if(!sel.rangeCount||sel.isCollapsed||!el.contains(sel.anchorNode)||!el.contains(sel.focusNode))return null;
  const range=sel.getRangeAt(0),caret=new Range();caret.setStart(sel.focusNode,sel.focusOffset);caret.collapse(true);let end=caret.getBoundingClientRect();
  const rects=[...range.getClientRects()].filter(r=>r.height>0&&r.width>0).map(rect);if(!rects.length)return null;
  if(!end.height)end=rects.at(-1);
  const scroller=el.querySelector('.toastui-editor-ww-container .ProseMirror')||el;
  const clip=rect(scroller.getBoundingClientRect());
  return {quote:sel.toString().trim(),key:sel.toString()+':'+sel.focusOffset,rects,end:rect(end),clip,occupied:occupiedText(el,clip)};
 }
 function refresh(){
  if(disposed||!root.isConnected)return;
  if(dragging){hide();return}
  if(document.querySelector('dialog[open]')){hide();return}
  const active=document.activeElement;
  if(panel.contains(active))return;
  if(!root.contains(active)&&active!==document.body&&surface()===source){hide();return}
  const state=measure();if(!state?.quote){onSelection('');signature='';hide();return}
  onSelection(state.quote);if(state.key!==signature){dismissed=false;signature=state.key}
  if(dragging||dismissed){hide();return}
  const clip=state.clip,point=state.end;
  // A scrolled-out focus endpoint must not leave an orphan toolbar on screen.
  if(point.bottom<clip.top||point.top>clip.bottom||point.bottom<0||point.top>innerHeight){hide();return}
  panel.hidden=false;panel.style.visibility='hidden';
  const w=panel.offsetWidth,h=panel.offsetHeight,gap=9,margin=8;
  const clampX=x=>Math.max(margin,Math.min(innerWidth-w-margin,x));
  const x=clampX(lastPoint?lastPoint.x:point.left);
  const obstacles=state.rects.map(r=>({left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)})).filter(r=>r.right>r.left&&r.bottom>r.top);
  const top=Math.min(...obstacles.map(r=>r.top)),bottom=Math.max(...obstacles.map(r=>r.bottom));
  const proposals=[{left:x,top:point.bottom+gap},{left:x,top:point.top-h-gap},
   {left:point.right+gap,top:point.top},{left:point.left-w-gap,top:point.top},
   {left:x,top:bottom+gap},{left:x,top:top-h-gap},
   {left:clip.right+gap,top:point.top},{left:clip.left-w-gap,top:point.top}];
  const valid=proposals.map(p=>({...p,right:p.left+w,bottom:p.top+h})).filter(p=>p.left>=margin&&p.right<=innerWidth-margin&&p.top>=margin&&p.bottom<=innerHeight-margin&&!obstacles.some(o=>intersects(p,o)));
  const distance=p=>Math.hypot(Math.max(p.left-point.left,point.right-p.right,0),Math.max(p.top-point.bottom,point.top-p.bottom,0));
  const coversText=p=>(state.occupied||[]).some(r=>intersects(p,r));
  valid.sort((a,b)=>Number(coversText(a))-Number(coversText(b))||distance(a)-distance(b));
  if(!valid.length){hide();return}
  const at=valid[0];panel.style.left=Math.round(at.left)+'px';panel.style.top=Math.round(at.top)+'px';panel.style.visibility='';
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(refresh)}
 listen(document,'selectionchange',schedule);
 listen(source,'select',schedule);
 listen(root,'pointerdown',e=>{
  if(panel.contains(e.target)){e.preventDefault();return}
  if(surface()?.contains(e.target)){dragging=true;dismissed=false;lastPoint=null;hide()}
  else{dismissed=true;lastPoint=null;hide()}
 });
 listen(document,'pointerup',e=>{if(!dragging)return;dragging=false;dismissed=false;lastPoint={x:e.clientX,y:e.clientY};schedule()});
 listen(document,'pointercancel',()=>{dragging=false;hide()});
 listen(document,'pointerdown',e=>{if(!root.contains(e.target)){dismissed=true;hide()}});
 listen(root,'keyup',e=>{if(panel.contains(e.target))return;if(e.key.startsWith('Arrow')||e.shiftKey||e.key==='Home'||e.key==='End'){lastPoint=null;dismissed=false;schedule()}});
 listen(root,'input',()=>{dismissed=true;hide()});
 listen(root,'keydown',e=>{if(e.altKey&&e.code==='Slash'&&!panel.hidden){e.preventDefault();e.stopPropagation();panel.querySelector('button').focus()}});
 listen(document,'scroll',()=>{lastPoint=null;schedule()},true);listen(window,'resize',()=>{lastPoint=null;schedule()});listen(window,'blur',hide);
 listen(root,'focusout',()=>queueMicrotask(()=>{if(!root.contains(document.activeElement)){dismissed=true;hide()}}));
 panel.setAttribute('aria-keyshortcuts','Alt+/');
 return {refresh:schedule,dismiss(){dismissed=true;hide()},destroy(){disposed=true;cancelAnimationFrame(frame);events.forEach(off=>off());hide()}};
}
