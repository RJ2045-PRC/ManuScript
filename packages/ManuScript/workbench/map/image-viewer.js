// Original pixels + original caption. Navigation never changes the manuscript scroll position.
window.ManuscriptImageViewer=(()=>{
 let active=null;
 function open({src,image=new Image(),caption='',captionHTML,alt=caption,trigger}){
  active?.close();const dialog=document.createElement('dialog');dialog.className='msImageViewer';dialog.setAttribute('aria-label','原图；双击或按 Esc 关闭');
  const figure=document.createElement('figure'),stage=document.createElement('div'),label=document.createElement('figcaption'),captionText=document.createElement('div');
  stage.className='msImageStage';captionText.className='msImageCaptionText';image.alt=alt;image.draggable=false;if(src)image.src=src;
  if(captionHTML)captionText.innerHTML=captionHTML;else captionText.textContent=caption;
  label.hidden=!captionText.textContent.trim();label.append(captionText);stage.append(image);figure.append(stage,label);dialog.append(figure);document.body.append(dialog);
  let zoom=1,pan={x:0,y:0},gesture=null,closed=false,press=null,moved=false;const pointers=new Map(),controller=new AbortController();
  function close(){if(closed)return;closed=true;controller.abort();observer.disconnect();dialog.close();dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});if(active?.dialog===dialog)active=null;}
  const on=(el,name,fn,opts={})=>el.addEventListener(name,fn,{...opts,signal:controller.signal});
  let imageWidth=1,imageHeight=1;
  function layout(){
   const expanded=zoom>1;
   dialog.toggleAttribute('data-expanded',expanded);
   const inset=Number.parseFloat(getComputedStyle(dialog).getPropertyValue('--ms-image-inset'));
   const usableWidth=Math.max(1,document.documentElement.clientWidth-4*inset);
   const usableHeight=Math.max(1,document.documentElement.clientHeight-4*inset);
   const width=image.naturalWidth||1,height=image.naturalHeight||1;
   const measure=availableHeight=>Math.min(1,usableWidth/width,Math.max(1,availableHeight)/height);
   // An expanded caption uses the same measure as at fit, so zoom does not change its line wraps.
   function captionWidth(fit){label.style.width=Math.min(usableWidth,Math.max(width*fit,320),740)+'px'}
   captionWidth(measure(usableHeight));
   let captionHeight=label.offsetHeight;
   captionWidth(measure(usableHeight-captionHeight));
   captionHeight=label.offsetHeight;
   const fit=measure(usableHeight-captionHeight);
   imageWidth=width*fit;imageHeight=height*fit;
   stage.style.width=(expanded?usableWidth:imageWidth)+'px';
   stage.style.height=(expanded?Math.max(1,usableHeight-captionHeight):imageHeight)+'px';
   image.style.width=imageWidth+'px';image.style.height=imageHeight+'px';
   label.tabIndex=label.scrollHeight>label.clientHeight?0:-1;
  }
  function paint(){
   const {width,height}=stage.getBoundingClientRect();
   const x=zoom>1?Math.max(0,(imageWidth*zoom+width)/2-Math.min(70,width/3)):0;
   const y=zoom>1?Math.max(0,(imageHeight*zoom+height)/2-Math.min(70,height/3)):0;
   pan.x=Math.max(-x,Math.min(x,pan.x));pan.y=Math.max(-y,Math.min(y,pan.y));
   image.style.transform=`translate(-50%, -50%) translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
   label.style.top=zoom>1?Math.min(height,Math.max(0,height/2+pan.y+imageHeight*zoom/2))+'px':'';
  }
  function zoomAt(next,cx,cy){
   const before=stage.getBoundingClientRect(),previous=zoom;
   next=Math.max(1,Math.min(8,next));
   const x=Number.isFinite(cx)?cx:before.left+before.width/2,y=Number.isFinite(cy)?cy:before.top+before.height/2;
   zoom=next;
   if((previous===1)!==(zoom===1))layout();
   const after=stage.getBoundingClientRect(),ratio=next/previous;
   pan.x=x-after.left-after.width/2-(x-before.left-before.width/2-pan.x)*ratio;
   pan.y=y-after.top-after.height/2-(y-before.top-before.height/2-pan.y)*ratio;
   paint();
  }
  on(dialog,'cancel',e=>{e.preventDefault();close()});on(dialog,'close',close);
  on(dialog,'click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();});
  on(stage,'dblclick',e=>{e.preventDefault();close()});
  on(stage,'click',e=>{
   if(zoom===1||moved)return;
   const r=image.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();
  });
  on(stage,'wheel',e=>{e.preventDefault();e.stopPropagation();if(gesture)return;const unit=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;if(e.ctrlKey)zoomAt(zoom*Math.exp(-e.deltaY*unit*.005),e.clientX,e.clientY);else{pan.x-=e.deltaX*unit;pan.y-=e.deltaY*unit;paint()}},{passive:false});
  on(stage,'gesturestart',e=>{e.preventDefault();gesture={scale:1}},{passive:false});
  on(stage,'gesturechange',e=>{e.preventDefault();if(!gesture||!Number.isFinite(e.scale)||e.scale<=0)return;zoomAt(zoom*e.scale/gesture.scale,e.clientX,e.clientY);gesture.scale=e.scale},{passive:false});
  on(stage,'gestureend',e=>{e.preventDefault();gesture=null},{passive:false});
  const geometry=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)}};
  on(stage,'pointerdown',e=>{
   if(e.pointerType==='mouse'&&e.button!==0)return;
   e.preventDefault();stage.setPointerCapture(e.pointerId);
   const point={x:e.clientX,y:e.clientY};
   if(!pointers.size){press=point;moved=false}
   pointers.set(e.pointerId,point);stage.classList.add('dragging');
  });
  on(stage,'pointermove',e=>{
   const previous=pointers.get(e.pointerId);if(!previous)return;
   if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>3)moved=true;
   const before=pointers.size===2?geometry():null;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(before){const after=geometry();if(before.d>0)zoomAt(zoom*after.d/before.d,before.x,before.y);pan.x+=after.x-before.x;pan.y+=after.y-before.y}
   else{pan.x+=e.clientX-previous.x;pan.y+=e.clientY-previous.y}
   paint();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])on(stage,name,e=>{pointers.delete(e.pointerId);if(!pointers.size)stage.classList.remove('dragging')});
  on(dialog,'keydown',e=>{if(e.target===label&&e.key.startsWith('Arrow'))return;if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','0'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='+'||e.key==='=')zoomAt(zoom*1.2);else if(e.key==='-')zoomAt(zoom/1.2);else if(e.key==='0')zoomAt(1);else{pan.x+=({ArrowLeft:40,ArrowRight:-40}[e.key]||0);pan.y+=({ArrowUp:40,ArrowDown:-40}[e.key]||0);paint()}}});
  const fit=()=>{layout();paint()};
  on(image,'load',fit);on(window,'resize',fit);
  const observer=new ResizeObserver(paint);observer.observe(stage);
  dialog.showModal();fit();dialog.focus({preventScroll:true});active={dialog,close};return active;
 }
 return {open};
})();
