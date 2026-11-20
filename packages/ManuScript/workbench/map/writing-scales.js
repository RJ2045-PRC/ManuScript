// The two styles consume the same model; visual marks are predefined, not generated.
window.ManuscriptScales=(()=>{
 const names=['全文结构','段落卡片','段内逻辑'],views=new Map();
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const marks={plate:'<path d="M10 34V12H90V34M10 18H90"/>',beads:'<path d="M10 34V12M90 12V34"/><circle cx="32" cy="24" r="8"/><circle cx="57" cy="26" r="12"/>',bent:'<path d="M10 34V12M90 34V12M10 12Q50 39 90 12M10 18Q50 45 90 18"/>',span:'<path d="M10 30V12H90V30M10 38H90M15 34L10 38L15 42M85 34L90 38L85 42"/>',material:'<circle cx="20" cy="17" r="5"/><circle cx="37" cy="29" r="5"/><circle cx="51" cy="14" r="5"/><circle cx="66" cy="29" r="5"/><circle cx="82" cy="16" r="5"/>',bead:'<path d="M10 34V12H28M72 12H90V34"/><ellipse cx="50" cy="25" rx="20" ry="13"/>'};
 function diagram(d,style){if(!d)return '';return '<div class="msScaleDiagram" data-kind="'+escape(d.type)+'">'+d.items.map((label,i)=>(i?'<span class="msScaleRelation">'+escape(d.links?.[i-1]?.symbol||d.relation)+'<small>'+escape(d.links?.[i-1]?.label||d.label)+'</small></span>':'')+'<span class="msScaleMark">'+(style==='visual'&&marks[d.marks?.[i]]?'<svg viewBox="0 0 100 48" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7">'+marks[d.marks[i]]+'</g></svg>':'')+'<span>'+escape(label)+'</span></span>').join('')+'</div>'}
 function shortcutLevel(e,current){
  if(!e.ctrlKey||e.altKey||e.metaKey||e.shiftKey||e.repeat||e.isComposing||e.defaultPrevented||
     e.target.closest?.('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
  const delta={ArrowUp:-1,ArrowLeft:-1,ArrowDown:1,ArrowRight:1}[e.key];
  if(delta)return Math.max(1,Math.min(3,current+delta));
 }
 function scaleNavigationInput(e){
  const root=e.target.closest?.('.msScales');if(!root)return false;
  const current=Number(root.dataset.scale);
  const target=e.type==='keydown'&&shortcutLevel(e,current);
  if(target)return target!==current;
  if(!(e.type==='pointerdown'&&e.button===0||e.type==='keydown'&&['Enter',' '].includes(e.key)))return false;
  const button=e.target.closest('button[data-scale-level],button[data-scale-jump]');
  return !!button&&!button.disabled&&(!!button.dataset.scaleJump||Number(button.dataset.scaleLevel)!==current);
 }
 function mount(root,project,options){
  let saved={};try{saved=JSON.parse(localStorage.getItem('ms-reading:'+project.id)||'{}')}catch{}
  let state=views.get(project.id)||{level:1,preview:true,...saved};state.level=Math.max(1,Math.min(3,state.level||1));state.compare=state.compare===true;state.sync=state.sync!==false;state.ratio=Math.max(35,Math.min(70,Number(state.ratio)||55));views.set(project.id,state);
  const paragraphHistory=new Map(Array.isArray(saved.paragraphHistory)?saved.paragraphHistory.filter(row=>Array.isArray(row)&&row.length===2):[]);
  const persist=()=>{try{localStorage.setItem('ms-reading:'+project.id,JSON.stringify({level:state.level,compare:state.compare,sync:state.sync,ratio:state.ratio,paragraphHistory:[...paragraphHistory],block:state.block,paragraph:state.paragraph,fraction:state.fraction,mainScroll:state.mainScroll,compareScroll:state.compareScroll}))}catch{}};
  const usingPreview=()=>state.preview!==false&&!!project.logicWork?.preview;const publication=()=>usingPreview()?project.logicWork.preview:project.logicWork?.published;
  let pairCache=null,scrollFrame=0,scrollSource=null,expected=new WeakMap(),holdLocation=false;
 let sections=ManuscriptScaleData.build(project,options.nodes||[],usingPreview());
  let style=project.settings?.logicStyle==='visual'?'visual':'symbols',disposed=false,imageViewer=null,unitTrigger=null,unitPanel=null,sourceSelection=null;
  const controller=new AbortController(),cache=new Map(),images=new Map();let serial=0;let workUI,imageObserver,comparison;
  const translation=ManuscriptScaleTranslation.mount({api:options.api,project:project.id});
  function translate(block,selection,trigger){
   const current=project.blocks?.find(b=>b.id===block);
   if(!current||!current.text?.trim())throw Error('请先定位到有正文的章节');
   return translation.open({block,selection,title:current.title,rev:current.rev,version:project.versions.at(-1).id},trigger);
  }
  const figureRatios=new WeakMap();
  let landing=null;
  const figureLayout=new ResizeObserver(()=>settleParagraph());
  const stopHolding=()=>{
   figureLayout.disconnect();
   if(landing)delete landing.pane.dataset.paragraphAnchor;
   landing=null;
  };
  for(const event of ['pointerdown','keydown','wheel','touchstart'])root.addEventListener(event,stopHolding,{capture:true,passive:true,signal:controller.signal});
  // The host sidebar may still be changing the iframe width while an image loads.
  window.addEventListener('resize',settleParagraph,{signal:controller.signal});
  function settleParagraph(){
   if(!landing)return;
   const {title,pane,y}=landing;
   setTop(pane,pane.scrollTop+title.getBoundingClientRect().top-y);
   state.mainScroll=landing.scrollTop=pane.scrollTop;
  }
  const graphObserver=new ResizeObserver(()=>{pairCache=null;positionUnit()});graphObserver.observe(root);
  root.classList.add('msScales');root.tabIndex=0;root.dataset.project=project.id;
  const btn=(text,attr)=>'<button type="button" '+attr+'>'+escape(text)+'</button>';
  function source(u,p){return btn(u.source||'原句','class="msControl" data-control="source" data-scale-source="'+escape(p.id)+'" title="在正文中查看对应段落"')}
  function plan(s){return (!s.plan.length&&!s.brief)?'':'<aside class="msScalePlan"><small>作者写作计划 · 不等于正文已经表达</small>'+s.plan.map(x=>'<p>'+escape(x.text)+(x.reason?'<small> → '+escape(x.reason)+'</small>':'')+'</p>').join('')+(s.brief?'<p>'+escape(s.brief)+'</p>':'')+'</aside>'}
  function clearMarks(){for(const mark of root.querySelectorAll('[data-unit-highlight]')){const parent=mark.parentNode;mark.replaceWith(...mark.childNodes);parent.normalize()}}
  function closeUnit(restore=false){
   if(!unitPanel)return;
   const trigger=unitTrigger;unitPanel.remove();unitPanel=null;unitTrigger=null;trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');
   if(restore&&trigger.isConnected)trigger.focus({preventScroll:true});
  }
  function positionUnit(){
   if(!unitPanel)return;
   const a=unitTrigger.getBoundingClientRect(),pane=readingPane().getBoundingClientRect(),gap=8;
   if(a.bottom<=Math.max(0,pane.top)||a.top>=Math.min(innerHeight,pane.bottom)){closeUnit();return}
   const r=unitPanel.getBoundingClientRect(),below=innerHeight-a.bottom,above=a.top;
   unitPanel.style.left=Math.max(gap,Math.min(a.left,innerWidth-gap-r.width))+'px';
   unitPanel.style.top=Math.max(gap,Math.min(below>=r.height+gap||below>=above?a.bottom+gap:a.top-gap-r.height,innerHeight-gap-r.height))+'px';
  }
  function openUnit(trigger,p,u){
   if(unitTrigger===trigger){closeUnit(true);return}
   closeUnit();rememberParagraph(p.id);clearMarks();
   sourceSelection={paragraph:p.id,quotes:u.quotes||[{quote:u.quote,start:u.start}]};markSource();
   if(comparison){comparison.focus(p.id,state.block);expected.set(comparison.scroll,comparison.scroll.scrollTop)}
   unitTrigger=trigger;unitPanel=document.createElement('div');unitPanel.className='msScaleSourceDetails';unitPanel.id='ms-unit-detail';
   unitPanel.setAttribute('popover','manual');unitPanel.setAttribute('role','dialog');unitPanel.setAttribute('aria-labelledby','ms-unit-title');
   unitPanel.innerHTML='<div class="msScaleSourceHead"><div><small>'+escape(u.role)+'</small><strong id="ms-unit-title">'+escape(u.label||u.role)+'</strong></div>'+btn('关闭','class="msControl" data-scale-unit-close')+'</div><p>'+escape(u.text)+'</p><small>'+sourceSelection.quotes.length+' 处原句'+(u.figures?.length?' · '+escape((u.figureLabels||u.figures).join('、')):'')+'</small>'+sourceSelection.quotes.map(q=>'<blockquote>'+escape(q.quote)+'</blockquote>').join('')+btn('在完整正文中定位','class="msControl" data-control="source" data-scale-source="'+escape(p.id)+'" data-scale-quote="'+escape(u.id)+'"');
   trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls',unitPanel.id);
   root.append(unitPanel);unitPanel.showPopover();positionUnit();unitPanel?.querySelector('[data-scale-unit-close]').focus({preventScroll:true});
  }
  document.addEventListener('pointerdown',e=>{if(unitPanel&&!unitPanel.contains(e.target)&&!unitTrigger.contains(e.target))closeUnit()}, {capture:true,signal:controller.signal});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&unitPanel){e.preventDefault();e.stopImmediatePropagation();closeUnit(true)}},{capture:true,signal:controller.signal});
  document.addEventListener('scroll',e=>{if(unitPanel&&!unitPanel.contains(e.target))positionUnit()},{capture:true,signal:controller.signal});
  window.addEventListener('resize',positionUnit,{signal:controller.signal});
  function paragraphs(s){if(!s.paragraphs.length)return '<p class="msScaleEmpty">尚未写正文'+(s.purpose?' · '+escape(s.purpose):'')+'。可进入正文开始写作。</p>';
   return s.paragraphs.map((p,i)=>{if(p.marker)return '';let content='';
    if(p.support)content='<div class="msScaleProse">'+options.prose(p.text,s.format,s,s.text.indexOf(p.text))+'</div>';
    else if(p.structured){
     if(state.level===1)content='<button class="msScaleBranchLink" data-scale-level="2"><strong>'+escape(p.task)+'</strong><small>'+escape(p.purpose)+'</small></button>';
     else content='<h4>'+escape(p.task)+'</h4><p class="msScalePurpose">'+escape(p.purpose)+'</p>'+(state.level===2?'<div class="msScaleRoles">'+[...new Set(p.units.map(u=>u.role))].map(r=>'<span>'+escape(r)+'</span>').join('')+'</div><p class="msScaleConnection">'+escape(p.connection)+'</p>'+btn('展开段内逻辑','data-scale-level="3" data-scale-paragraph="'+escape(p.id)+'"'):ManuscriptScaleGraph.html(p));
    }else content='<h4>'+escape(p.task)+'</h4>'+diagram(p.diagram,style)+(p.legacyTask?'<details class="msScaleLegacy"><summary>查看上次解读</summary><p>'+escape(p.legacyTask)+'</p></details>':'')+(state.level===3?(p.units.length?p.units.map(u=>'<div class="msScaleUnit"><div><span>'+escape(u.role)+'</span>'+source(u,p)+'</div><div><p>'+escape(u.text)+'</p>'+diagram(u.diagram,style)+'</div></div>').join(''):'<p class="msScaleEmpty">尚无已关联逻辑单元；保留原段落，等待整理。</p><blockquote>'+escape(p.text)+'</blockquote>'):'');
    return '<div class="msScaleParagraph" data-paragraph="'+escape(p.id)+'"><small>P'+(i+1)+' · '+escape(p.kind)+'</small>'+content+(state.level===3&&p.issues?.length?'<details class="msScaleIssues"><summary>待核对 · '+p.issues.length+' 项</summary>'+p.issues.map(x=>'<p>'+escape(x)+'</p>').join('')+'</details>':'')+inlineFigures(s,p,false)+'</div>';
   }).join('');
  }
  function figureLink(f){const key=String(++serial);images.set(key,f);return f.rows?'':'<button class="msOutlineFigure" data-scale-zoom="'+key+'" title="'+escape(f.caption)+'">'+escape(f.label)+'</button>'}
  function previewNotice(){const p=project.logicWork?.preview;return p?'<div class="msScalePreview" role="status"><span>'+(usingPreview()?'本轮预览 · '+p.completed+'/'+p.total+' 章已完成，尚未完整发布':'正在查看上次完整结果')+'</span>'+btn(usingPreview()?'查看上次完整结果':'查看本轮预览','data-scale-preview')+'</div>':''}
  function inlineFigures(section,paragraph,companion){
   const field=companion?'sourceParagraph':'structureParagraph';
   const items=section.figures.filter(f=>f[field]===paragraph?.id && !(companion&&f.embedded) && (companion||state.level!==3||f.rows));
   return items.length?'<div class="msInlineFigures">'+items.map(f=>figure(f,companion)).join('')+'</div>':'';
  }
  function sectionImages(s){
   if(state.level!==3)return '';
   const items=s.figures.filter(f=>!f.rows);
   return items.length?'<div class="msSectionImages">'+items.map(f=>{
    const i=s.paragraphs.findIndex(p=>p.id===f.structureParagraph);
    return figure(f,false,i>=0?'P'+(i+1):'');
   }).join('')+'</div>':'';
  }
  function figure(f,companion,location=''){const key=String(++serial);images.set(key,f);return '<figure class="msScaleFigure" data-figure="'+key+'"><figcaption><b>'+escape(f.label)+'</b> '+(location?'<small class="msFigureLocation">'+location+'</small> ':'')+escape(f.caption)+(companion&&f.id.startsWith('guide:')?'<small>固定来源图表</small>':'')+'</figcaption>'+(f.rows?'<div class="msScaleTable"><table>'+f.rows.map(r=>'<tr>'+r.map(c=>'<td>'+escape(c)+'</td>').join('')+'</tr>').join('')+'</table></div>':'<button type="button" class="msScaleImage" '+(figureRatios.has(f)?'style="aspect-ratio:'+figureRatios.get(f)+'" ':'')+'data-scale-zoom="'+key+'" aria-label="打开'+escape(f.label)+'原图" disabled><span data-image-status role="status">正在读取原图…</span></button>')+'</figure>'}

  function readingPane(){return root.querySelector(root.dataset.compare==='true'?'.msScaleMain':'.msReadingScroll')}
  function visibleAnchor(){const pane=readingPane();if(!pane)return null;const top=pane.getBoundingClientRect().top;return [...root.querySelectorAll('[data-scale-section]')].find(s=>s.getBoundingClientRect().bottom>top)}
  function render(hold=true,scaleOnly=false){stopHolding();clearViewMotion();closeUnit();pairCache=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;scrollSource=null;const compareTop=comparison?.scroll.scrollTop;const old=hold?visibleAnchor():null,id=old?.dataset.scaleSection,y=old?.getBoundingClientRect().top;
   const structureSections=sections.filter(s=>!s.structureExcluded);
   const main=scaleOnly&&root.dataset.compare===String(state.compare)&&root.querySelector('.msScaleMain');
   if(main){
    for(const el of main.querySelectorAll('[data-figure],[data-scale-zoom]')){
     images.delete(el.dataset.figure||el.dataset.scaleZoom);
     if(el.hasAttribute('data-figure'))imageObserver.unobserve(el);
    }
   }else{images.clear();serial=0}
   root.dataset.style=style;root.dataset.scale=state.level;
   const legend=state.level===3?'<p class="msReadingLegend">→ 推进 · ⇢ 假设 · ≠ 不一致'+(style==='visual'?' · 简图不按比例':'')+'</p>':'';
   const content=legend+(state.level===1?overview(structureSections)+ManuscriptScaleOverview.html(structureSections,publication(),{figureLink}):(structureSections.length?structureSections.map(s=>'<section class="msScaleSection" data-block="'+escape(s.id)+'" data-scale-section="'+escape(s.id)+'">'+sectionImages(s)+'<div class="msScaleSectionHead"><h3>'+escape(s.title)+'</h3><small>'+escape(s.basis)+'</small></div>'+(s.workStale?'<p class="msScaleWarning">本章材料已变化，旧结构解读未套用到当前稿，请更新整理。</p>':s.stale?'<p class="msScaleWarning">正文已修改，旧论文解读未套用到当前稿；固定来源图表仍可查看。</p>':'')+(s.imageNote?'<p class="msScaleEvidence">'+escape(s.imageNote)+'</p>':'')+'<div class="msScaleLayout"><div class="msScaleBody">'+plan(s)+paragraphs(s)+'</div>'+inlineFigures(s,null,false)+'</div></section>').join(''):'<p class="msScaleEmpty">尚无章节。先在导图建立框架或进入正文写作。</p>'));
   if(main){
    main.innerHTML=content;
    const group=root.querySelector('.msScaleLevels'),marker=group.querySelector('.msScaleSelection');
    for(const button of group.querySelectorAll('button')){
     const selected=Number(button.dataset.scaleLevel)===state.level;
     button.setAttribute('aria-pressed',String(selected));
     if(selected)button.prepend(marker);
    }
    options.enhance?.(main);
    for(const el of main.querySelectorAll('[data-figure]'))imageObserver.observe(el);
    return;
   }
   const keyboard=['Ctrl + ↓ / → 切换到段落卡片','Ctrl + ↑ / ← 切换到全文结构，Ctrl + ↓ / → 切换到段内逻辑','Ctrl + ↑ / ← 切换到段落卡片'];
   const levels=names.map((name,i)=>{
    const active=state.level===i+1;
    return '<button type="button" class="msControl" data-scale-level="'+(i+1)+'" title="'+keyboard[i]+'" aria-pressed="'+active+'">'+(active?'<span class="msScaleSelection" aria-hidden="true"></span>':'')+escape(name)+'</button>';
   }).join('');
   const actions=btn('正文对照','class="msControl" data-scale-compare aria-pressed="'+state.compare+'"')+
    btn('翻译','class="msControl" data-scale-translate aria-haspopup="dialog"')+
    '<span class="msWork" data-work-panel></span>'+btn('呈现设置','class="msControl" data-scale-settings aria-haspopup="dialog"');
   root.innerHTML='<nav class="msScaleNav" aria-label="结构阅读工具"><div class="msScaleLevels" role="group" aria-label="阅读尺度">'+levels+'</div><div class="msScaleCommands" role="group" aria-label="阅读操作">'+actions+'</div></nav><div class="msReadingScroll">'+
    previewNotice()+'<div class="msReadingLayout"><main class="msScaleMain">'+content+'</main><button class="msReadingSplitter" role="separator" aria-label="调整正文对照宽度，左右键微调" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="70" aria-valuenow="'+state.ratio+'"></button><aside class="msCompare" aria-label="只读正文对照"></aside></div></div><p class="msScaleLive" role="status"></p>';
   comparison?.destroy();root.dataset.compare=String(state.compare);root.style.setProperty('--ms-reading-left',state.ratio+'%');
   if(state.compare)comparison=ManuscriptScaleCompare.mount(root.querySelector('.msCompare'),project,sections,{translate:(ref,trigger)=>translate(ref.block,{start:ref.start,end:ref.end,quote:ref.quote},trigger),figures:(s,p)=>inlineFigures(s,p,true),prose:options.prose,note:options.note,ask:options.ask,focus:rememberParagraph,sync:state.sync,setSync(value){
    state.sync=value;if(value){const from=scrollSource?.isConnected?scrollSource:readingPane();align(from);rememberLocation(readLocation(from));state.mainScroll=readingPane().scrollTop;state.compareScroll=comparison.scroll.scrollTop}persist()
   }});else comparison=null;
   graphObserver.disconnect();graphObserver.observe(root);graphObserver.observe(root.querySelector('.msScaleMain'));setupSplitter();persist();if(comparison&&compareTop!=null)setTop(comparison.scroll,compareTop);
   // Only original prose gets citation/exhibit enhancement. Extracts never acquire fake anchors.
   options.enhance?.(root);loadImages();workUI?.render();markSource();
   if(id){const next=[...root.querySelectorAll('[data-scale-section]')].find(s=>s.dataset.scaleSection===id);if(next)readingPane().scrollTop+=next.getBoundingClientRect().top-y;}
  }
  async function imageData(f){const key=f.asset?'asset:'+f.asset:'page:'+f.sha+':'+f.page+':'+JSON.stringify(f.rect);if(!cache.has(key)){const promise=(async()=>{
   if(f.asset){const v=await options.api('file',{project:project.id,asset:f.asset});return 'data:image/'+(/\.png$/i.test(v.name)?'png':/\.webp$/i.test(v.name)?'webp':'jpeg')+';base64,'+v.data;}
   if(!f.key||!f.sha||!f.page)throw Error('没有可读取的图片原件');
   const v=await options.api('source_page',{project:project.id,key:f.key,sha:f.sha,page:f.page}),src='data:image/png;base64,'+v;if(!f.rect)return src;
   const im=new Image();im.src=src;await im.decode();const [x,y,w,h]=f.rect,canvas=document.createElement('canvas');canvas.width=Math.round(im.width*w);canvas.height=Math.round(im.height*h);canvas.getContext('2d').drawImage(im,im.width*x,im.height*y,im.width*w,im.height*h,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
  })();cache.set(key,promise);promise.catch(()=>cache.delete(key));}return cache.get(key);}
  function loadImages(){imageObserver?.disconnect();const generation=root.querySelector('.msScaleNav');
   async function load(el){const f=images.get(el.dataset.figure);if(!f||f.rows)return;const status=el.querySelector('[data-image-status]');try{const src=await imageData(f);if(disposed||!el.isConnected||generation!==root.querySelector('.msScaleNav'))return;const im=new Image();im.alt=f.caption||f.label;im.src=src;await im.decode();if(disposed||!el.isConnected)return;figureRatios.set(f,im.naturalWidth/im.naturalHeight);status.replaceChildren(im);if(landing&&el.closest('.msScaleMain'))figureLayout.observe(im);el.querySelector('[data-scale-zoom]').disabled=false;settleParagraph();}catch(e){if(disposed||!el.isConnected)return;status.textContent='原图未能读取：'+e.message;const retry=document.createElement('button');retry.textContent='重试原图';retry.onclick=()=>{retry.remove();load(el)};el.append(retry);settleParagraph();}}
   imageObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){imageObserver.unobserve(e.target);load(e.target)}},{rootMargin:'300px'});for(const el of root.querySelectorAll('[data-figure]'))imageObserver.observe(el);
  }
  function locateSection(id){
   state.block=id;state.paragraph=null;state.focusQuote=null;state.focusAt=null;state.fraction=0;
   const last=paragraphHistory.get(id);
   if(paragraphById.get(last)?.block===id){rememberParagraph(last);projectLocation(state,readingPane());if(comparison&&state.sync)projectLocation(state,comparison.scroll,true);return}
   comparison?.focus(null,id);
   if(comparison)expected.set(comparison.scroll,comparison.scroll.scrollTop);
   const target=root.querySelector('[data-scale-section="'+CSS.escape(id)+'"]');
   const pane=readingPane();
   if(target)setTop(pane,pane.scrollTop+target.getBoundingClientRect().top-pane.getBoundingClientRect().top-12);
  }
  const paragraphById=new Map();
  function indexParagraphs(){paragraphById.clear();for(const section of sections){let from=0;for(const p of section.paragraphs){const at=section.text.indexOf(p.text,from);if(at>=0)from=at+p.text.length;paragraphById.set(p.id,{block:section.id,quote:p.text,at})}}}
  indexParagraphs();
  function rememberParagraph(id){const p=paragraphById.get(id);if(!p)return;paragraphHistory.set(p.block,id);holdLocation=true;state.fraction=0;state.paragraph=id;state.block=p.block;state.focusQuote=p.quote;state.focusAt=p.at;}
  // Use common positions in the manuscript, not equal pixels. Between two shared
  // paragraphs (or chapter cards in overview), interpolate by local reading progress.
  const maxTop=pane=>Math.max(0,pane.scrollHeight-pane.clientHeight);
  function setTop(pane,y){const top=Math.max(0,Math.min(maxTop(pane),y));if(Math.abs(pane.scrollTop-top)>.6){pane.scrollTop=top;expected.set(pane,pane.scrollTop)}}
  function entries(pane,right=false){
   const scope=right?pane:root.querySelector('.msScaleMain'),top=pane.getBoundingClientRect().top;
   return [...scope.querySelectorAll(right?'[data-compare-section],[data-paragraph]':'[data-scale-section],[data-paragraph]')].map(el=>({
    key:el.dataset.paragraph?'p:'+el.dataset.paragraph:'s:'+(el.dataset.scaleSection||el.dataset.compareSection),
    block:el.closest(right?'[data-compare-section]':'[data-scale-section]')?.getAttribute(right?'data-compare-section':'data-scale-section'),
    paragraph:el.dataset.paragraph, y:el.getBoundingClientRect().top-top+pane.scrollTop-12
   }))
  }
  function pairs(){
   const l=readingPane(),r=comparison.scroll,lmax=maxTop(l),rmax=maxTop(r);
   if(pairCache&&pairCache.lmax===lmax&&pairCache.rmax===rmax)return pairCache;
   const left=entries(l),right=entries(r,true),byKey=new Map(right.map(a=>[a.key,a.y])),points=[[0,0]];
   for(const a of left){const b=byKey.get(a.key),prev=points.at(-1);if(a.y>prev[0]+1&&b>prev[1]+1&&a.y<lmax&&b<rmax)points.push([a.y,b])}
   points.push([lmax,rmax]);return pairCache={left,right,lmax,rmax,points}
  }
  function align(pane){
   if(!comparison||!state.sync)return;const right=pane===comparison.scroll,c=pairs(),axis=right?1:0,other=1-axis,x=pane.scrollTop;
   if(!maxTop(pane))return;
   const i=c.points.findIndex(p=>p[axis]>=x),b=c.points[i<0?c.points.length-1:i],a=c.points[Math.max(0,(i<0?c.points.length-1:i)-1)];
   const t=b[axis]===a[axis]?0:(x-a[axis])/(b[axis]-a[axis]);setTop(right?readingPane():comparison.scroll,a[other]+t*(b[other]-a[other]));
  }
  function readLocation(pane){
   const right=comparison&&pane===comparison.scroll,rows=comparison?(right?pairs().right:pairs().left):entries(pane);
   if(!rows.length)return null;
   const y=pane.scrollTop,last=rows.findLast(a=>a.y<=y+1)||rows[0],hit=rows.find(a=>Math.abs(a.y-last.y)<.5)||last,next=rows.find(a=>a.y>hit.y+1);
   return {block:hit.block,paragraph:hit.paragraph,fraction:Math.max(0,Math.min(.99,(y-hit.y)/Math.max(1,(next?.y??pane.scrollHeight)-hit.y)))}
  }
  function rememberLocation(loc){if(!loc?.block)return;
   if(loc.paragraph)rememberParagraph(loc.paragraph);
   else if(state.block!==loc.block){state.block=loc.block;state.paragraph=null;state.focusQuote=null}
   state.fraction=loc.fraction||0;
  }
  function projectLocation(loc,pane,right=false){if(!loc?.block)return;
   const rows=entries(pane,right),a=rows.find(x=>loc.paragraph&&x.paragraph===loc.paragraph)||rows.find(x=>x.key==='s:'+loc.block);
   if(a){const end=rows.find(x=>x.y>a.y+1)?.y??pane.scrollHeight;setTop(pane,a.y+(loc.fraction||0)*(end-a.y))}
  }
  function captureScroll(e){
   const pane=e.target,main=readingPane();if(pane!==main&&pane!==comparison?.scroll)return;
   if(expected.has(pane)){const prior=expected.get(pane);expected.delete(pane);if(Math.abs(prior-pane.scrollTop)<1)return}
   // Layout and scroll anchoring may dispatch a delayed scroll event at the position we just set.
   if(landing&&pane===landing.pane&&Math.abs(pane.scrollTop-landing.scrollTop)<1)return;
   stopHolding();scrollSource=pane;holdLocation=false;
   if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;const src=scrollSource;if(disposed||!src?.isConnected)return;
    if(state.sync||src===readingPane())rememberLocation(readLocation(src));align(src);state.mainScroll=readingPane().scrollTop;if(comparison)state.compareScroll=comparison.scroll.scrollTop;persist()});
  }
  root.addEventListener('scroll',captureScroll,{capture:true,signal:controller.signal});
  function setupSplitter(){const handle=root.querySelector('.msReadingSplitter');let dragging=false;const set=x=>{state.ratio=Math.max(35,Math.min(70,x));root.style.setProperty('--ms-reading-left',state.ratio+'%');handle.setAttribute('aria-valuenow',Math.round(state.ratio));persist()};handle.onpointerdown=e=>{dragging=true;handle.setPointerCapture(e.pointerId)};handle.onpointermove=e=>{if(dragging){const r=handle.parentElement.getBoundingClientRect();set((e.clientX-r.left)/r.width*100)}};handle.onpointerup=handle.onpointercancel=()=>dragging=false;handle.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();set(state.ratio+(e.key==='ArrowLeft'?-2:2))}}}
  async function preferences(){await options.settings(style,async value=>{style=value;render();root.querySelector('[data-scale-settings]').focus({preventScroll:true})});}
  root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
   if(b.hasAttribute('data-scale-preview')){state.preview=!usingPreview();sections=ManuscriptScaleData.build(project,options.nodes||[],usingPreview());indexParagraphs();render();}
   else if(b.hasAttribute('data-scale-compare')){const loc=holdLocation?state:readLocation(state.sync&&scrollSource?.isConnected?scrollSource:readingPane());rememberLocation(loc);if(comparison)state.compareScroll=comparison.scroll.scrollTop;state.compare=!state.compare;render(false);projectLocation(state,readingPane());if(comparison){if(state.sync)projectLocation(state,comparison.scroll,true);else setTop(comparison.scroll,state.compareScroll||0)}holdLocation=true;persist();root.querySelector('[data-scale-compare]').focus({preventScroll:true})}
   else if(b.dataset.scaleJump)changeLevel(2,null,b.dataset.scaleJump,b.dataset.scaleTarget==='4');
   else if(b.dataset.scaleLevel)changeLevel(+b.dataset.scaleLevel,b.dataset.scaleParagraph);
   else if(b.dataset.scaleSource){const para=sections.flatMap(s=>s.paragraphs).find(p=>p.id===b.dataset.scaleSource),unit=para?.units.find(u=>u.id===b.dataset.scaleQuote);rememberParagraph(para?.id);sourceSelection=unit?{paragraph:para.id,quotes:unit.quotes||[{quote:unit.quote,start:unit.start}]}:null;closeUnit(true);if(!state.compare){state.compare=true;render();projectLocation(state,readingPane())}else{clearMarks();markSource()}comparison?.focus(para?.id,state.block);if(comparison)expected.set(comparison.scroll,comparison.scroll.scrollTop);}
   else if(b.hasAttribute('data-scale-translate')){
    const pane=state.sync&&scrollSource?.isConnected?scrollSource:readingPane();
    const loc=holdLocation&&state.block?state:readLocation(pane);
    await translate(loc?.block||sections.find(s=>!s.structureExcluded)?.id,null,b);
   }
   else if(b.hasAttribute('data-scale-settings'))await preferences();
   else if(b.dataset.scaleUnit){const p=sections.flatMap(s=>s.paragraphs).find(p=>p.id===b.dataset.scaleParagraph),u=p?.units.find(u=>u.id===b.dataset.scaleUnit);if(u)openUnit(b,p,u)}
   else if(b.hasAttribute('data-scale-unit-close'))closeUnit(true);
   else if(b.dataset.scaleZoom){const f=images.get(b.dataset.scaleZoom),src=await imageData(f);if(!disposed)imageViewer=ManuscriptImageViewer.open({src,caption:f.original||f.label+' · '+f.caption,trigger:b});}

  }catch(error){root.querySelector('.msScaleLive').textContent=error.message}}, {signal:controller.signal});
  root.addEventListener('keydown',e=>{const next=shortcutLevel(e,state.level);if(!next)return;e.preventDefault();e.stopPropagation();if(next!==state.level){changeLevel(next);root.querySelector('.msScaleLive').textContent=names[next-1]}}, {signal:controller.signal});
  function scaleTitle(block,paragraph){
   if(!block)return;
   const section=root.querySelector('[data-scale-section="'+CSS.escape(block)+'"]');
   const el=paragraph?section?.querySelector('[data-paragraph="'+CSS.escape(paragraph)+'"] > h4'):
    section?.querySelector('.msOutlineLocation,.msScaleSectionHead h3');
   if(!el)return;
   const range=document.createRange();range.selectNodeContents(el);
   // A single-line transfer can land exactly. Wrapped or clipped titles stay in place.
   if(range.getClientRects().length!==1)return;
   const ink=visibleInk(el,range),pane=readingPane().getBoundingClientRect();
   if(ink&&ink.rect.top>=pane.top&&ink.rect.bottom<=pane.bottom&&ink.rect.left>=pane.left&&ink.rect.right<=pane.right)return ink;
  }
  function changeLevel(level,explicitParagraph,jumpBlock,openCompare=false){
   if(level===state.level&&!jumpBlock)return;
   const previous=state.level,motion=motionLevel();
   if(explicitParagraph)rememberParagraph(explicitParagraph);
   else if(!jumpBlock&&(!holdLocation||!state.block))rememberLocation(readLocation(state.sync&&scrollSource?.isConnected?scrollSource:readingPane()));
   const block=jumpBlock||state.block,pane=readingPane(),bounds=pane.getBoundingClientRect();
   let paragraph=null,anchorY;
   if(previous>1&&level>1&&block){
    const section=root.querySelector('[data-scale-section="'+CSS.escape(block)+'"]');
    const preferred=state.paragraph&&section?.querySelector('[data-paragraph="'+CSS.escape(state.paragraph)+'"] > h4');
    const visible=el=>{const r=el.getBoundingClientRect();return r.top>=bounds.top&&r.bottom<=bounds.bottom};
    const title=preferred&&visible(preferred)?preferred:!explicitParagraph&&
     Array.from(section?.querySelectorAll('[data-paragraph] > h4')||[]).find(visible);
    paragraph=title?.parentElement?.dataset.paragraph||state.paragraph;
    if(title){anchorY=title.getBoundingClientRect().top;rememberParagraph(paragraph)}
   }
   const activeCard=(scope,id)=>id&&scope?.querySelector('[data-paragraph="'+CSS.escape(id)+'"]');
   const sectionCard=()=>block&&root.querySelector('[data-scale-section="'+CSS.escape(block)+'"]');
   const outgoing=motion==='full'&&level<previous&&(activeCard(sectionCard(),state.paragraph)||sectionCard());
   const oldHeight=outgoing?.offsetHeight;
   const indicator=motion!=='off'&&root.querySelector('.msScaleSelection').getBoundingClientRect();
   let origin=indicator&&scaleTitle(block,paragraph);
   const key=JSON.stringify([block,paragraph]),travel=document.querySelector('.travelTitle[data-reading-key]');
   if(origin&&travel?.dataset.readingKey===key){
    const range=document.createRange();range.selectNodeContents(travel);
    origin=visibleInk(travel,range)||origin;
   }
   state.level=level;if(openCompare)state.compare=true;
   render(false,true);
   if(jumpBlock||previous===1&&level>1&&block&&!state.paragraph)locateSection(block);
   else{
    projectLocation(state,readingPane());
    if(comparison&&state.sync)projectLocation(state,comparison.scroll,true);
   }
   if(anchorY!=null){
    const title=root.querySelector('.msScaleMain [data-paragraph="'+CSS.escape(paragraph)+'"] > h4');
    if(title){landing={title,pane:readingPane(),y:anchorY};landing.pane.dataset.paragraphAnchor='';settleParagraph()}
   }
   holdLocation=true;state.mainScroll=readingPane().scrollTop;
   if(comparison)state.compareScroll=comparison.scroll.scrollTop;
   persist();
   const selected=root.querySelector('.msScaleLevels [aria-pressed=true]');
   selected.focus({preventScroll:true});
   if(!indicator)return;
   const marker=selected.querySelector('.msScaleSelection'),next=marker.getBoundingClientRect();
   if(next.width&&indicator.width){
    const dx=indicator.left-next.left,dy=indicator.top-next.top;
    animateReading(marker,[{transform:'translate('+dx+'px,'+dy+'px) scaleX('+indicator.width/next.width+')'},{transform:'none'}],motion==='full'?180:110,'reading-selection');
   }
   if(oldHeight){
    const card=level===1?sectionCard():activeCard(sectionCard(),state.paragraph);
    const height=card?.offsetHeight,r=card?.getBoundingClientRect();
    if(height&&r.bottom>bounds.top&&r.top<bounds.bottom&&oldHeight>height+3){
     const taller=Math.min(oldHeight,height+Math.min(112,bounds.height*.18));
     animateReading(card,[{height:taller+'px',overflow:'clip',boxSizing:'border-box'},{height:height+'px',overflow:'clip',boxSizing:'border-box'}],180,'structure-card-fold');
    }
   }
   const destination=origin&&scaleTitle(block,paragraph);
   if(destination&&destination.text===origin.text&&
     Math.hypot(origin.rect.left-destination.rect.left,origin.rect.top-destination.rect.top)>4){
    playWorkspaceMotion({label:origin},{label:destination},false,key);
   }
   const main=root.querySelector('.msScaleMain');
   const visible=el=>{const r=el.getBoundingClientRect();return r.height&&r.bottom>bounds.top&&r.top<bounds.bottom};
   for(const group of main.querySelectorAll('.msScaleSection,.msOutlineCard,.msScaleOverview')){
    if(!visible(group))continue;
    for(const el of group.querySelectorAll('.msScaleParagraph > :not(h4):not(small),.msOutlineOpen > :not(.msOutlineLocation),.msScaleOverview > :not(h3),.msOutlineFoot,.msSectionImages'))
     if(visible(el))revealReadingSurface(el);
   }
  }
  function markSource(){if(!state.compare||!sourceSelection)return;const el=[...root.querySelectorAll('.msCompare [data-paragraph]')].find(x=>x.dataset.paragraph===sourceSelection.paragraph)?.querySelector('.msScaleProse');if(!el)return;
   const para=sections.flatMap(s=>s.paragraphs).find(p=>p.id===sourceSelection.paragraph),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let n,all='';while(n=walker.nextNode()){nodes.push({node:n,start:all.length});all+=n.textContent;}
   const spans=[];
   for(const q of sourceSelection.quotes){const quote=String(q.quote||'').trim();if(!quote)continue;let occurrence=0;
    // Repeated wording must resolve to its recorded occurrence, including Unicode offsets.
    if(Number.isInteger(q.start)){const prefix=Array.from(para.text).slice(0,q.start).join('');let from=0,at;while((at=prefix.indexOf(quote,from))>=0){occurrence++;from=at+quote.length}}
    let at=-1,from=0;for(let i=0;i<=occurrence;i++){at=all.indexOf(quote,from);if(at<0)break;from=at+quote.length}if(at>=0)spans.push([at,at+quote.length]);
   }
   // Highlight each text fragment separately so Markdown emphasis and links remain intact.
   for(const entry of nodes){const ranges=spans.map(([a,b])=>[Math.max(a,entry.start)-entry.start,Math.min(b,entry.start+entry.node.length)-entry.start]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]),merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push(r)}
    for(const [a,b] of merged.reverse()){const range=document.createRange();range.setStart(entry.node,a);range.setEnd(entry.node,b);const mark=document.createElement('mark');mark.dataset.unitHighlight='';range.surroundContents(mark)}
   }
  }
  function overview(structureSections){const p=publication();if(!p)return '<div class="msScaleOverview msOutlineIntro"><small>全文结构 · 按原稿顺序</small><p>从章节看全篇，点小节展开段落。整理完成后显示核心问题与主张。</p></div>';if(p.preview)return '<div class="msScaleOverview msOutlineIntro"><small>本轮章节主线 · 模型解读待核对</small><p>已完成的小节先呈现；全文问题与跨章关系在汇总后补齐。</p></div>';if(p.stale)return '<p class="msScaleWarning">全文材料已变化；上次全文框架保留在记录中，等待更新。</p>';const o=p.overview;return '<div class="msScaleOverview"><small>全文框架 · 模型解读，待作者核对 · '+escape(p.route.name||p.route.model)+'</small>'+(p.schema===2?'<h3>'+escape(o.question)+'</h3><p>'+escape(o.summary)+'</p>':'<p class="msScaleWarning">上次结果使用旧版结构。点击 work → 重来，可生成短标签和明确关系。</p><details><summary>查看上次全文摘要</summary><p>'+escape(o.summary)+'</p></details>')+ManuscriptScaleOverview.route(structureSections,p)+'</div>'}

  workUI=ManuscriptWork.mount(root,{project:project.id,api:options.api,onResult:async()=>{const next=await options.api('state',{project:project.id});if(disposed)return;
   // The first work-status poll can return after a reader opens a node.
   // Refresh the document only when the displayed material actually changed.
   const signature=()=>JSON.stringify([project.versions?.at(-1)?.id,publication()?.id,publication()?.overview,publication()?.stale,project.logicWork?.preview?.completed,!!project.logicWork?.preview,sections]);
   const before=signature();project=next;sections=ManuscriptScaleData.build(next,options.nodes||[],usingPreview());options.updated?.(next);
   if(before!==signature()){indexParagraphs();render()}else comparison?.notes(next.notes)}});
  render(false);
  if(state.mainScroll!=null)readingPane().scrollTop=state.mainScroll;if(comparison&&state.compareScroll!=null)comparison.scroll.scrollTop=state.compareScroll;root.focus({preventScroll:true});return {anchor(){return {block:state.block,paragraph:state.paragraph}},notes(next){project=next;comparison?.notes(next.notes)},refresh(next){if(next.settings?.logicStyle!==style){style=next.settings?.logicStyle==='visual'?'visual':'symbols';render()}},destroy(){stopHolding();closeUnit();state.mainScroll=readingPane().scrollTop;if(comparison)state.compareScroll=comparison.scroll.scrollTop;persist();cancelAnimationFrame(scrollFrame);comparison?.destroy();disposed=true;workUI?.destroy();translation.destroy();imageViewer?.close();imageObserver?.disconnect();graphObserver.disconnect();controller.abort();cache.clear()}};
 }
 return {mount,scaleNavigationInput,anchor:project=>views.get(project)};
})();

let manuscriptScalesView=null;
function openManuscriptScales(){
 delete reader.dataset.document;const project=proj;reader.innerHTML='<article></article>';
 manuscriptScalesView=ManuscriptScales.mount(reader.firstElementChild,paper,{nodes:map,api,
  updated:p=>{if(proj===project)updateReader(p,project)},
  prose:(text,format,section,from)=>{
   const block=section&&paperBlock(section.id);
   const context=block&&from>=0?()=>ManuscriptEquations.blockContext(block,paper.blocks,from,from+text.length):null;
   return format==='tex'?renderTex(text,context):ChatUI.md(ManuscriptEquations.materialize(text,format,context));
  },
  enhance:root=>{for(const p of root.querySelectorAll('.msScaleProse')){enhanceProse(p);citationClicks(p)}},
  ask:askAboutBlock,
  note:ref=>{const d=dialog('给原文留批注','<blockquote>'+E(ref.quote)+'</blockquote><label>批注<textarea rows="4"></textarea></label>');d.querySelector('[data-ok]').onclick=async()=>{const button=d.querySelector('[data-ok]'),message=d.querySelector('textarea').value.trim();if(!message)return;button.disabled=true;try{const next=await api('note',{project,...ref,message});if(proj===project){updateReader(next,project);manuscriptScalesView?.notes(next)}d.close()}catch(e){d.querySelector('[role=status]').textContent=e.message;button.disabled=false}}},
  settings:async(style,apply)=>{const d=modal('结构阅读呈现设置','<label>呈现样式<select data-logic-style>'+ManuscriptScaleSettings.options.map(([k,v])=>'<option value="'+k+'">'+E(v)+'</option>').join('')+'</select></label><label>适用范围<select data-logic-default><option value="false">当前项目</option><option value="true">当前项目及此宿主的新项目</option></select></label><p>两种样式使用相同的正文与逻辑内容；切换不调用模型、不改稿。</p>'+toolButton('保存设置','data-logic-save'));d.querySelector('[data-logic-style]').value=style;actionOn(d,async b=>{if(!b.hasAttribute('data-logic-save'))return;b.disabled=true;try{const value=d.querySelector('[data-logic-style]').value,p=await api('settings',{project,asDefault:d.querySelector('[data-logic-default]').value==='true',values:{logicStyle:value}});if(proj===project){updateReader(p,project);if(d.open)await apply(value)}d.close()}finally{b.disabled=false}})}
 });
}
document.addEventListener('click',async e=>{if(!e.target.closest('[data-writing-scales]'))return;try{if(inlineStudio&&!await inlineStudio.close())return;showPage('scales','root')}catch(error){$('#save').textContent=error.message}});

