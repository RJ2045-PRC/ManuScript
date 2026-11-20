// Capture only visible ink. The editor and the canvas are never copied.
const motionMedia=matchMedia('(prefers-reduced-motion: reduce)');
const motionKey='manuscript.workspaceMotion';
function motionLevel(){
 if(motionMedia.matches)return 'off';
 try{const v=localStorage.getItem(motionKey);return ['full','off'].includes(v)?v:'soft'}catch{return 'soft'}
}
let clearTitleMotion=()=>{},parkedDocument=null;
const readingEffects=new Set();
function clearViewMotion(){
 clearTitleMotion();
 for(const effect of readingEffects)effect.cancel();
 readingEffects.clear();
}
function animateReading(el,frames,duration,id){
 if(!el)return;
 const effect=el.animate(frames,{duration,easing:'cubic-bezier(.2,.65,.3,1)'});
 effect.id=id;readingEffects.add(effect);
 effect.finished.then(()=>readingEffects.delete(effect),()=>readingEffects.delete(effect));
 return effect;
}
function revealReadingSurface(el){
 const level=motionLevel();
 if(level==='off')return;
 const full=level==='full';
 animateReading(el,[{opacity:full ? .72 : .88},{opacity:1}],full?180:100,'reading-surface');
}
function releaseParkedDocument(){
 if(!parkedDocument)return;
 const old=parkedDocument;parkedDocument=null;clearTimeout(old.timer);old.studio.release();
}
function parkDocument(studio){
 releaseParkedDocument();studio.pause();inlineStudio=null;
 parkedDocument={studio,project:proj,timer:setTimeout(releaseParkedDocument,12000)};
}
function visibleInk(el,range){
 if(!el)return;
 const rect=(range||el).getBoundingClientRect();
 if(!rect.width||!rect.height||rect.bottom<=0||rect.right<=0||rect.top>=innerHeight||rect.left>=innerWidth)return;
 const css=getComputedStyle(el);
 return {el,rect,text:(range?range.toString():el.textContent).trim(),font:css.font,color:css.color};
}
function singleLineInk(el,range,viewport){
 const ink=visibleInk(el,range);
 if(!ink?.text)return;
 const r=ink.rect,fragments=[...range.getClientRects()].filter(part=>part.width&&part.height);
 if(!fragments.length||fragments.some(part=>part.top>=fragments[0].bottom||part.bottom<=fragments[0].top))return;
 if(r.left<viewport.left-1||r.right>viewport.right+1||r.top<viewport.top-1||r.bottom>viewport.bottom+1)return;
 return ink;
}
function mapInk(index){
 const topic=sectionTopicAt(index),el=topic?.querySelector('.label');
 if(!el)return;
 const range=document.createRange();range.selectNodeContents(el);
 return {label:singleLineInk(el,range,vp.getBoundingClientRect()),node:topic.getBoundingClientRect()};
}
function revealSectionMap(origin){
 const level=motionLevel();
 if(level==='off'||!origin)return;
 const index=sectionState?.location,arrival=mapInk(index);
 if(!arrival)return;
 const surface=$('#surface'),bounds=surface.getBoundingClientRect(),node=arrival.node;
 const pivot=(node.left+node.width/2-bounds.left)+'px '+(node.top+node.height/2-bounds.top)+'px';
 const full=level==='full';
 const matched=sectionState.draft.rows[index]?.from===origin.from&&
  arrival.label&&origin.label?.text===arrival.label.text;
 // Measure both titles in their resting layouts before animating the surrounding branches.
 if(matched)playWorkspaceMotion(origin,arrival,true);
 animateReading(surface,[
  {opacity:full ? .48 : .78,transform:full?'scale(1.045)':'none',transformOrigin:pivot},
  {opacity:1,transform:'none',transformOrigin:pivot}
 ],full?210:140,'section-arrival');
}
function playWorkspaceMotion(origin,destination,mapward,readingKey){
 clearTitleMotion();
 const level=motionLevel(),a=origin?.label,b=destination?.label;
 if(level==='off'||!a||!b)return;
 const full=level==='full',effects=[],layers=[];
 function animate(el,frames,duration,delay=0){
  effects.push(el.animate(frames,{duration,delay,easing:'cubic-bezier(.38,.03,.18,1)',fill:'both'}));
 }
 function layer(ink,name){
  const el=document.createElement('span');el.className='workspaceMotion '+name;
  el.setAttribute('aria-hidden','true');el.textContent=ink.text;
  Object.assign(el.style,{left:ink.rect.left+'px',top:ink.rect.top+'px',font:ink.font,color:ink.color});
  document.body.append(el);layers.push(el);return el;
 }
 const title=layer(b,'travelTitle');
 if(readingKey)title.dataset.readingKey=readingKey;
 // Range bounds include the glyphs' baseline offset. Align both ends even on a zoomed canvas.
 const range=document.createRange();range.selectNodeContents(title);
 const natural=range.getBoundingClientRect(),box=title.getBoundingClientRect();
 const pose=ink=>{
  const scale=ink.rect.height/(natural.height||1);
  const y=ink.rect.top-box.top-(natural.top-box.top)*scale;
  const scaleX=mapward?ink.rect.width/(natural.width||1):scale;
  const x=ink.rect.left-box.left-(natural.left-box.left)*scaleX;
  return {transform:'translate('+x+'px,'+y+'px) scale('+scaleX+','+scale+')',color:ink.color};
 };
 b.el.style.visibility='hidden';
 animate(title,[pose(a),pose(b)],full?250:235);
 if(full&&!mapward){
  const r=origin.node;
  if(r){
   const frame=document.createElement('i');frame.className='travelNodeFrame';title.prepend(frame);
   const scale=a.rect.height/(natural.height||1);
   Object.assign(frame.style,{left:((r.left-a.rect.left)/scale+natural.left-box.left)+'px',top:((r.top-a.rect.top)/scale+natural.top-box.top)+'px',width:r.width/scale+'px',height:r.height/scale+'px'});
   animate(frame,[{opacity:1},{opacity:0}],175);
  }
  for(const line of destination.lines||[])animate(line.el,[{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0)'}],135,200);
  const entry=destination.entry;
  if(entry){const normal=getComputedStyle(entry).backgroundColor;animate(entry,[{backgroundColor:normal},{backgroundColor:'color-mix(in srgb,var(--ms-focus) 6%, '+normal+')',offset:.35},{backgroundColor:normal}],180,270)}
 }
 const cleanup=()=>{
  if(clearTitleMotion!==cleanup)return;
  clearTitleMotion=()=>{};b.el.style.removeProperty('visibility');
  for(const effect of effects)effect.cancel();for(const el of layers)el.remove();
 };
 clearTitleMotion=cleanup;
 Promise.all(effects.map(effect=>effect.finished)).then(cleanup,()=>{});
}
for(const event of ['beforeinput','pointerdown','wheel','keydown'])document.addEventListener(event,e=>{
 if(!window.ManuscriptScales?.scaleNavigationInput(e))clearViewMotion();
},{capture:true,passive:true});
window.addEventListener('resize',()=>clearViewMotion());
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearViewMotion()});
motionMedia.addEventListener('change',()=>clearViewMotion());
// One project header for the map and manuscript; tools keep the active editor alive.
function setupWorkspaceChrome(){
 const header=document.querySelector('body>header');header.classList.add('workspaceHeader');
 picker.setAttribute('aria-label','切换项目');
 const brand=header.querySelector('b');if(brand)header.append(brand);
 const back=document.createElement('button');back.className='workspaceBack';back.textContent='‹ 项目库';back.onclick=async()=>{if(window.lxBeforeLeave&&!await window.lxBeforeLeave())return;if(nativeChat)parent.postMessage({type:'lx-project-nav',project:proj},'*');else{const url=new URL(location.href);url.search='';location.assign(url)}};header.prepend(back);
 const tabs=document.createElement('nav');tabs.className='workspaceViews';tabs.setAttribute('aria-label','工作视图');tabs.innerHTML='<button class="msControl" data-workspace-view="map">导图</button><button class="msControl" data-workspace-view="read">正文编辑</button><button class="msControl" data-workspace-view="scales">结构阅读</button>';picker.after(tabs);
 let navigating=null,queuedView=null,mapView=null;
 tabs.onclick=async e=>{
  const target=e.target.closest('[data-workspace-view]')?.dataset.workspaceView;
  if(!target||!connected||sectionBusy)return;
  if(navigating){queuedView=target;align(true);return}
  if(target===view)return;
  const project=proj,from=view,caret=inlineStudio?.document?inlineStudio.caret():null;
  navigating=target;align(true);
  try{
   if(from==='map'&&(!await flushSectionTitle()||!await flushSectionEditor()))return;
   if(ideaSession?.isOpen&&!ideaSession.exitPair())return;
   let doc,origin,departureCaret=caret;
   if(from==='read'&&target==='map'&&inlineStudio?.document){
    const studio=inlineStudio;
    if(!await studio.flush())return;
    doc=await api('document_read',{project});
    if(inlineStudio!==studio||proj!==project||view!==from||(queuedView&&queuedView!==target))return;
    if(!studio.clean()){window.msToast?.('刚才的输入已保留，再点一次导图即可切换。');return}
    if(studio.matches(doc)){
     clearTitleMotion();origin=studio.motionOrigin();departureCaret=origin.at;
     parkDocument(studio);
    }else departureCaret=null;
   }
   if(from==='scales'&&(target==='read'||target==='map')){
    // Keep the reader visible until its destination can be mounted in one turn.
    doc=await api('document_read',{project});
    if(proj!==project||view!==from||(queuedView&&queuedView!==target))return;
   }
   if(inlineStudio&&!await inlineStudio.close())return;
   if(proj!==project||view!==from)return;
   if(from==='map')mapView={project,selected:sel,tx,ty,zoom};
   const keepViewport=target==='map'&&mapView?.project===project;
   if(keepViewport)({tx,ty,zoom}=mapView);
   if(from==='map'&&target==='read'){await openWorkspaceDocument();return}
   await showPage(target,keepViewport&&by(mapView.selected)?mapView.selected:'root',null,{caret:departureCaret,resume:true,keepViewport,doc,origin});
   if(proj===project&&view===target&&(from==='scales'||target==='scales')){
    revealReadingSurface(target==='map'?vp:target==='scales'?reader.querySelector('.msReadingScroll'):inlineStudio?.el);
   }
  }catch(error){window.msToast?.(error.message)}finally{
   navigating=null;const next=queuedView;queuedView=null;
   if(next&&next!==view)tabs.querySelector('[data-workspace-view="'+next+'"]').click();
   else{align(true);if(next==='read')inlineStudio?.focusText()}
  }
 };
 const tools=document.createElement('details');tools.className='workspaceTools';tools.innerHTML='<summary class="msControl">项目工具 <span aria-hidden="true">⌄</span></summary><div class="workspaceToolMenu"><button data-tool-tab="版本时间轴">版本与对照</button><button data-tool-tab="返修对照">返修意见</button><button data-tool-tab="文献与经验">文献、图表与导出</button><button data-tool-tab="设置">项目信息与设置</button><hr><button data-shell-suggestions>Agent 待核对建议</button></div>';tabs.after(tools);
 for(const button of tools.querySelectorAll('button'))button.classList.add('msControl');
 tools.onclick=e=>{const b=e.target.closest('button');if(!b)return;tools.open=false;if(b.dataset.toolTab)openProjectTools(b.dataset.toolTab,tools.querySelector('summary'));else if(b.hasAttribute('data-shell-suggestions'))document.querySelector('[data-writing-suggestions]')?.click()};
 document.addEventListener('pointerdown',e=>{if(!tools.contains(e.target))tools.open=false});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&tools.open){e.preventDefault();e.stopImmediatePropagation();tools.open=false;tools.querySelector('summary').focus()}},true);
 const setting=document.createElement('label');setting.className='workspaceMotionSetting';setting.textContent='切换动效';
 const choose=document.createElement('select');choose.setAttribute('aria-label','切换动效');
 for(const [value,text] of [['full','详细'],['soft','减弱'],['off','关闭']])choose.add(new Option(text,value));
 try{choose.value=localStorage.getItem(motionKey)||'soft'}catch{choose.value='soft'}
 choose.onchange=()=>{clearViewMotion();inkAnimation?.cancel();try{localStorage.setItem(motionKey,choose.value)}catch{}};
 setting.append(choose);tools.querySelector('.workspaceToolMenu').append(setting);
 const indicator=document.createElement('span');indicator.className='workspaceInk';indicator.setAttribute('aria-hidden','true');tabs.append(indicator);
 let inkAnimation;
 const align=(slide=false)=>{
  const target=queuedView||navigating||document.body.dataset.view;
  const current=tabs.querySelector('[data-workspace-view="'+target+'"]');if(!current)return;
  const left=(current.offsetLeft+8)+'px',width=Math.max(0,current.offsetWidth-16)+'px';
  if(slide&&indicator.style.left===left&&indicator.style.width===width)return;
  const level=motionLevel(),old=slide&&level!=='off'?indicator.getBoundingClientRect():null;
  inkAnimation?.cancel();indicator.style.left=left;indicator.style.width=width;
  if(old?.width){const r=indicator.getBoundingClientRect();if(r.width&&Math.abs(old.x-r.x)>1)inkAnimation=indicator.animate([{transform:'translateX('+(old.x-r.x)+'px) scaleX('+old.width/r.width+')'},{transform:'none'}],{duration:level==='full'?185:105,easing:'ease-out'})}
 };
 motionMedia.addEventListener('change',()=>align());
 new ResizeObserver(()=>align()).observe(tabs);
 const paint=()=>{const current=document.body.dataset.view;tools.querySelector('[data-shell-suggestions]').hidden=current==='scales';for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-current',b.dataset.workspaceView===current?'page':'false');align(true);};new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-view']});paint();
 const status=document.createElement('span');status.className='workspaceStatus';status.append($('#save'));document.body.append(status);
 let toastTimer;const toast=document.createElement('div');toast.className='workspaceToast';toast.hidden=true;toast.setAttribute('role','status');document.body.append(toast);window.msToast=text=>{toast.textContent=text;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,1800)};
}
async function openProjectTools(tab,trigger){
 releaseParkedDocument();
 try{
  if(inlineStudio&&!await inlineStudio.flush())return;await writes;
  const project=proj,d=document.createElement('dialog');d.className='projectToolsDialog';d.setAttribute('aria-label',tab);d.innerHTML='<header><strong>'+E(tab)+'</strong><button class="msControl" data-tools-close>'+E({map:'返回导图',scales:'返回结构阅读'}[view]||'返回稿件')+'</button></header><div role="status">正在打开…</div><iframe title="项目工具"></iframe>';document.body.append(d);d.showModal();
  d.addEventListener('close',()=>trigger?.focus({preventScroll:true}),{once:true});
  const frame=d.querySelector('iframe'),url=new URL(document.baseURI);url.searchParams.delete('native');url.searchParams.set('view','desk');url.searchParams.set('project',project);url.searchParams.set('tab',tab);url.searchParams.set('embedded','1');
  let closing=false;async function close(){if(closing)return;closing=true;try{if(frame.contentWindow?.lxBeforeLeave&&!await frame.contentWindow.lxBeforeLeave())return;const before=paper?.blocks,p=await api('state',{project});if(proj===project){updateReader(p,project);if(inlineStudio?.document){const doc=await api('document_read',{project});if(JSON.stringify(before)!==JSON.stringify(p.blocks)){if(!await inlineStudio.close())return;await showPage('read','root')}else inlineStudio.el.dispatchEvent(new CustomEvent('manuscript-tools-closed'));}incoming(project,await api('team_state',{project}));if(view==='scales')showPage('scales','root');}d.close();d.remove()}catch(e){d.querySelector('[role=status]').textContent=e.message}finally{closing=false}}
  frame.addEventListener('manuscript-feedback-passage',async e=>{
   if(closing||e.detail?.project!==proj||project!==proj)return;
   const id=e.detail.id;await close();if(d.isConnected||proj!==project)return;
   try{const note=paper.feedback.find(n=>n.id===id),b=paperBlock(note?.block),q=note?.quote,at=q&&b?quoteHere(b,{quote:q}):-1;
    if(at>=0){if(!inlineStudio?.document)await showPage('read','root');const doc=await api('document_read',{project}),span=doc.spans.find(x=>x.block===b.id);
     if(span&&proj===project){const start=span.body+Array.from(b.text.slice(0,at)).length;
      if(await inlineStudio?.revealReference({project,version:paperVersion,documentStart:start,documentEnd:start+Array.from(q).length,quote:q}))return}}
    window.msToast?.('原句已变化，无法准确定位。')
   }catch(error){window.msToast?.(error.message)}
  });
  d.querySelector('[data-tools-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close()});
  try{const r=await fetch(url);if(!r.ok)throw Error('项目工具载入失败');const html=await r.text();frame.srcdoc=html.replace('<meta charset=','<base href="'+E(url.href)+'"><meta charset=');frame.onload=()=>d.querySelector('[role=status]').textContent=''}catch(e){d.querySelector('[role=status]').textContent=e.message}
 }catch(e){$('#save').textContent=e.message;window.msToast?.(e.message)}
}

async function openWorkspaceDocument(row){
 const state=sectionReady()?sectionState:null,doc=state?.doc;
 const index=row?state.draft.rows.indexOf(row):state?.location;
 const origin=row&&motionLevel()!=='off'?mapInk(index):null;
 const heading=row&&{rev:doc.rev,from:row.from,quote:row.raw,before:'',after:''};
 const cached=parkedDocument;
 const warm=cached?.project===proj&&doc&&cached.studio.matches(doc);
 if(warm){clearTimeout(cached.timer);parkedDocument=null}
 await showPage('read','root',null,{resume:true,heading,doc,warmStudio:warm?cached.studio:null});
 if(view!=='read'||!inlineStudio?.document)return;
 inlineStudio.focusText();
 const target=doc&&index>=0?state.draft.rows[index]:null;
 if(target)inlineStudio.markHeading(target.from);
 if(!row||!origin?.label)return;
 // CodeMirror lays out a newly revealed virtual line on its next measure.
 // Keep editing live while waiting and cancel the pending transfer on input or navigation.
 const studio=inlineStudio;
 let frame,attempts=0;
 const cancel=()=>{cancelAnimationFrame(frame);clearTitleMotion=()=>{}};
 clearTitleMotion=cancel;
 const measure=()=>{
  if(clearTitleMotion!==cancel||studio!==inlineStudio||view!=='read')return;
  const destination=studio.headingInk(row.from);
  if(destination?.label){playWorkspaceMotion(origin,destination,false);return}
  if(++attempts<3)frame=requestAnimationFrame(measure);else cancel();
 };
 frame=requestAnimationFrame(measure);
}
