const tocOpenState=new Map();
// Floating TOC interaction reference: PKM-er/obsidian-floating-toc-plugin (MIT).
// Adapted independently for a single versioned manuscript, not the Obsidian host API.
function manuscriptTOC({root,text,revision,stage,editor,tex,source,proof,settings,saveSettings,figureStyle,format,title,capturePosition,restorePosition,focusText,onReadingJump}){
 const body=root.querySelector('.annotatedBody'),bar=document.createElement('div'),nav=document.createElement('nav');
 bar.className='tocNavigation';bar.hidden=true;
 bar.innerHTML='<button class="msControl tocToggle" type="button" aria-expanded="false"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 5h14M7 10h10M7 15h7"/></svg><span>目录</span></button>'+
  '<nav class="tocPath" aria-label="当前章节路径"></nav><button class="msControl tocReturn" type="button" aria-label="回到刚才" hidden>↶ <span>回到刚才</span></button>'+
  '<div class="tocPathMenu" role="group" aria-label="切换章节" hidden></div>';
 nav.className='floatingToc';nav.hidden=true;nav.setAttribute('aria-label','正文目录');
 nav.innerHTML='<div class="tocPanel"><div class="tocHead"><strong>正文目录</strong><details class="tocOptions"><summary aria-label="目录选项">•••</summary><div><button type="button" data-toc-settings>目录设置</button></div></details><button type="button" data-toc-close aria-label="收起目录">×</button></div><input type="search" aria-label="搜索标题" placeholder="搜索标题"><div class="tocList"></div></div>';
 root.querySelector('.studioCommands').before(bar);body.prepend(nav);
 const panel=nav.firstElementChild,list=panel.querySelector('.tocList'),search=panel.querySelector('input');
 const trigger=bar.querySelector('.tocToggle'),path=bar.querySelector('.tocPath'),menu=bar.querySelector('.tocPathMenu'),back=bar.querySelector('.tocReturn'),options=panel.querySelector('.tocOptions');
 let prefs={...ManuscriptTocSettings.defaults,...settings},headings=[],byOffset=new Map(),collapsed=new Set(),raw=null;
 let frame=0,parseTimer=0,disposed=false,sourceMirror=null,sourceKey='',sourcePositions=[],proofKey='',proofPositions=[];
 let compact,wideOpen=tocOpenState.get(proj)?.wide??true,narrowOpen=tocOpenState.get(proj)?.narrow??false,chosenFrom=null,links=new Map(),lastPath=null,menuTrigger=null,previous=null,follow=true;
 const label=title=>{const el=document.createElement('span');el.innerHTML=window.manuscriptRenderMarkdown(title,true);return el.textContent.trim()};
 const display=h=>[h.number,h.label].filter(Boolean).join(' ');
 const headingHTML=h=>(h.number?'<span class="tocNumber">'+E(h.number)+'</span> ':'')+E(h.label);
 const ancestors=h=>{const result=[];for(let p=h;p;p=p.parent)if(!p.hiddenTitle)result.unshift(p);return result};
 function position(){
  compact=body.clientWidth<800;
  const shown=!bar.hidden&&(compact?narrowOpen:wideOpen);
  if(shown&&nav.hidden)follow=true;
  nav.hidden=!shown;panel.hidden=!shown;nav.dataset.compact=String(compact);nav.dataset.side=prefs.side;
  trigger.setAttribute('aria-expanded',String(shown));trigger.setAttribute('aria-label',shown?'收起正文目录':'展开正文目录');
 }
 function open(focus=false){if(bar.hidden)return;if(compact)narrowOpen=true;else wideOpen=true;tocOpenState.set(proj,{wide:wideOpen,narrow:narrowOpen});layout();if(focus)search.focus({preventScroll:true})}
 function close(focus=false){if(compact)narrowOpen=false;else wideOpen=false;tocOpenState.set(proj,{wide:wideOpen,narrow:narrowOpen});options.open=false;layout();if(focus)trigger.focus({preventScroll:true})}
 function branchHidden(h){for(let p=h.parent;p;p=p.parent)if(collapsed.has(p.from)&&!p.hiddenTitle)return true;return false}
 function allowed(h){return h.level<=prefs.maxDepth&&!h.hiddenTitle}
 function closePath(focus=false){
  if(menu.hidden)return;
  menu.hidden=true;menuTrigger?.setAttribute('aria-expanded','false');
  if(focus)menuTrigger?.focus({preventScroll:true});
  menuTrigger=null;
 }
 function paintPath(chosen){
  const crumbs=ancestors(chosen),key=JSON.stringify(crumbs.map(h=>[h.from,display(h)]));
  if(key===lastPath)return;
  lastPath=key;closePath();
  if(!crumbs.length){path.innerHTML='<span class="tocStart">正文开头</span>';return}
  path.innerHTML=crumbs.map((h,i)=>{
   const last=i===crumbs.length-1,middle=i>0&&!last,slot=last?'current':middle?'middle':'first';
   return '<button type="button" class="msControl tocCrumb" data-toc-path="'+h.from+'" data-part="'+slot+'" aria-expanded="false" aria-label="'+E(display(h)+' · 切换同级章节')+'" title="'+E(display(h))+'"><span>'+headingHTML(h)+'</span>'+(last?'<span aria-hidden="true">⌄</span>':'')+'</button>';
  }).join('')+(crumbs.length>2?'<button type="button" class="msControl tocPathMore" data-toc-path-more aria-label="查看完整章节路径" aria-expanded="false">…</button>':'');
 }
 function placeMenu(){
  if(menu.hidden||!menuTrigger)return;
  const box=bar.getBoundingClientRect(),x=menuTrigger.getBoundingClientRect().left-box.left;
  menu.style.left=Math.max(0,Math.min(x,box.width-menu.offsetWidth))+'px';
 }
 function pathMenu(button,rows,group){
  if(menuTrigger!==button){closePath();menuTrigger=button;button.setAttribute('aria-expanded','true')}
  menu.innerHTML=group+rows;
  menu.hidden=false;menu.scrollTop=0;placeMenu();
  (menu.querySelector('[aria-current=location]')||menu.querySelector('[data-toc-path-jump]'))?.focus({preventScroll:true});
 }
 function menuRows(rows,active=-1,branches=true){
  return rows.map(h=>{
   const jump='<button class="msControl tocPathDestination" type="button" data-toc-path-jump="'+h.from+'"'+(h.from===active?' aria-current="location"':'')+'>'+headingHTML(h)+'</button>';
   const child=branches&&h.hasChildren?'<button class="msControl tocPathBranch" type="button" data-toc-path-branch="'+h.from+'" aria-label="'+E('浏览「'+display(h)+'」的子章节')+'">›</button>':'';
   return '<div class="tocPathRow">'+jump+child+'</div>';
  }).join('');
 }
 function browse(button,parent,active=-1){
  const group=parent?'<button class="msControl tocPathBranch" type="button" data-toc-path-branch="'+(parent.parent?.hiddenTitle?'':parent.parent?.from??'')+'" aria-label="返回上一级">‹</button>'+E(display(parent))+' · 子章节':'全文一级章节';
  pathMenu(button,menuRows(headings.filter(h=>!h.hiddenTitle&&(h.parent?.hiddenTitle?null:h.parent)===parent),active),'<div class="tocPathGroup">'+group+'</div>');
 }
 function refreshLinks(){
  links=new Map();
  const rev=revision();
  for(const [id,link] of Object.entries(state.headingLinks||{})){
   const node=by(id);if(!node)continue;
   const h=resolveManuscriptHeading(link,raw,rev,headings);if(!h)continue;
   if(!links.has(h.from))links.set(h.from,[]);
   links.get(h.from).push(node);
  }
 }
 function linkButton(h){
  return links.has(h.from)?'<button class="tocIdeaLink" data-toc-idea="'+h.from+'" aria-label="查看「'+E(h.label)+'」的构思卡">构思卡</button>':'';
 }
 function paint(){
  refreshLinks();
  const query=search.value.trim().toLocaleLowerCase();
  const matches=headings.filter(h=>allowed(h)&&(query?display(h).toLocaleLowerCase().includes(query):!branchHidden(h)));
  list.innerHTML=matches.map(h=>{
   const canFold=h.hasChildren&&!query;
   const fold=canFold?'<button type="button" class="tocFold" data-toc-fold="'+h.from+'" aria-label="'+E((collapsed.has(h.from)?'展开':'折叠')+display(h))+'" aria-expanded="'+!collapsed.has(h.from)+'">'+(collapsed.has(h.from)?'›':'⌄')+'</button>':'<span class="tocFoldSpacer"></span>';
   return '<div class="tocItem" data-from="'+h.from+'" style="--depth:'+Math.min(4,ancestors(h).length-1)+'">'+fold+
    '<button type="button" class="tocHeading" data-toc-from="'+h.from+'" '+(prefs.tooltip?'title="'+E(display(h))+'"':'')+'><span class="tocCaption">'+headingHTML(h)+'</span></button>'+linkButton(h)+'</div>';
  }).join('')||'<p class="tocEmpty" role="status">没有匹配的标题</p>';
  panel.classList.toggle('tocWrap',prefs.wrap);
  bar.hidden=!prefs.enabled||!headings.length;
  if(bar.hidden)closePath();
  layout();
 }
 function refresh(){
  clearTimeout(parseTimer);
  if(disposed)return;
  const next=text();if(next===raw){layout();return}
  raw=next;sourceKey=proofKey='';lastPath=null;chosenFrom=null;previous=null;back.hidden=true;
  const previousHeadings=headings;
  headings=manuscriptDirectoryHeadings(next,format).map(h=>({...h,label:label(h.title)}));
  byOffset=new Map(headings.map(h=>[h.from,h]));
  const folded=previousHeadings.map(h=>collapsed.has(h.from)),parents=[],counters=new Map();
  // Preserve author numbering as a whole. Automatic numbers are a navigation aid for unnumbered manuscripts.
  const authored=headings.some(h=>/^(?:\d{1,3}(?:[.．]\d+)*(?:[.．、)）：:](?!\d)|\s)|第\s*[\d０-９一二三四五六七八九十百零〇]+\s*[章节篇部]|[IVXLCDM]+[.．、)）]\s)/u.test(h.label));
  const appendixNumber=/^(?:[A-Z](?:[.．]\d+)+(?:[.．、)）：:]|\s|$)|[A-Z][.．、)）]?\s+(?:附录|Appendix\b)|附录\s*[A-Z](?:\b|[.．、：:])|Appendix\s+[A-Z]\b)/u;
  const unnumbered=/^(?:摘要(?:与亮点)?|亮点|关键词|致谢|参考文献|参考书目|附录(?:[\s　]*[A-Z0-9]+)?|abstract(?: and highlights)?|highlights|keywords|acknowledg(?:e)?ments?|references|bibliography|appendix(?: [A-Z0-9]+)?|appendices)$/iu;
  collapsed=new Set();
  headings.forEach((h,i)=>{
   while(parents.at(-1)?.level>=h.level)parents.pop();
   h.parent=parents.at(-1)||null;
   parents.push(h);
   h.hiddenTitle=prefs.hideFirst&&i===0&&h.level===1;
   h.hasChildren=(headings[i+1]?.level??0)>h.level;
   const isTitle=i===0&&h.level===1&&(h.hiddenTitle||h.label===title);
   h.titleWrapper=isTitle;
   const parent=h.parent?.titleWrapper?h.parent.parent:h.parent;
   if(!authored&&!isTitle&&!unnumbered.test(h.label)&&!appendixNumber.test(h.label)&&!/^\\(?:sub)*section\*/.test(next.slice(h.from,h.to))&&(!parent||parent.number)){
    const ordinal=(counters.get(parent)||0)+1;counters.set(parent,ordinal);
    h.number=parent?parent.number+'.'+ordinal:String(ordinal);
   }
   if(previousHeadings.length?folded[i]:h.level>=prefs.collapseDepth)collapsed.add(h.from);
  });
  follow=true;paint();
 }
 function sourceOffsets(){
  const s=getComputedStyle(source),key=[raw,source.clientWidth,s.font,s.lineHeight,s.letterSpacing,s.padding,s.tabSize].join('|');if(key===sourceKey)return sourcePositions;sourceKey=key;
  if(!sourceMirror){sourceMirror=document.createElement('div');sourceMirror.className='tocSourceMirror';sourceMirror.setAttribute('aria-hidden','true');document.body.append(sourceMirror)}
  for(const k of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','tabSize','wordSpacing','textIndent'])sourceMirror.style[k]=s[k];
  Object.assign(sourceMirror.style,{position:'fixed',left:'-100000px',top:'0',width:source.clientWidth+'px',boxSizing:'border-box',whiteSpace:'pre-wrap',overflowWrap:'break-word',visibility:'hidden'});sourceMirror.replaceChildren();let cursor=0;const spans=[];
  for(const h of headings){sourceMirror.append(document.createTextNode(raw.slice(cursor,h.from)));const marker=document.createElement('span');marker.textContent=raw.slice(h.from,h.from+1)||'\u200b';sourceMirror.append(marker);spans.push(marker);cursor=h.from+1}sourceMirror.append(document.createTextNode(raw.slice(cursor)));sourcePositions=spans.map((el,i)=>({from:headings[i].from,top:el.offsetTop}));return sourcePositions;
 }
 function readingOffsets(){
  const key=[raw,proof.clientWidth,proof.scrollHeight].join('|');if(key===proofKey)return proofPositions;proofKey=key;const nodes=[...proof.querySelectorAll('h1,h2,h3,h4,h5,h6')];let cursor=0;const top=proof.getBoundingClientRect().top;
  proofPositions=headings.flatMap(h=>{let i=nodes.findIndex((el,j)=>j>=cursor&&(format==='tex'||Number(el.tagName.slice(1))===h.level)&&el.textContent.trim()===h.label);if(i<0)return [];cursor=i+1;const el=nodes[i];return [{from:h.from,el,top:el.getBoundingClientRect().top-top+proof.scrollTop}]});return proofPositions;
 }
 function viewport(){
  if(stage()==='rich'&&editor()?.live)return editor().viewport();
  if(stage()==='rich'&&tex?.())return tex().viewport();
  const el=stage()==='source'?source:proof,offsets=stage()==='source'?sourceOffsets():readingOffsets();return {top:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight),from:offsets.filter(h=>h.top<=el.scrollTop+40).at(-1)?.from??-1};
 }
 function update(){
  frame=0;if(disposed||bar.hidden)return;
  const v=viewport(),at=v.max>0&&v.top>=v.max-2?headings.at(-1)?.from:v.from;
  const chosen=chosenFrom!=null?byOffset.get(chosenFrom):headings.findLast(h=>h.from<=at);
  const chain=ancestors(chosen);
  paintPath(chosen);
  let nearest;
  for(const el of list.querySelectorAll('[data-toc-from]')){
   const h=byOffset.get(Number(el.dataset.tocFrom)),current=h===chosen,parent=!current&&chain.includes(h);
   el.classList.toggle('tocCurrent',current);el.classList.toggle('tocParent',parent);
   if(current)el.setAttribute('aria-current','location');else el.removeAttribute('aria-current');
   if(current||parent)nearest=el;
  }
  if(!nav.hidden&&nearest&&(follow||Number(nearest.dataset.tocFrom)!==Number(list.dataset.followed))){
   const row=nearest.getBoundingClientRect(),bounds=list.getBoundingClientRect();
   if(row.bottom>bounds.bottom)list.scrollTop+=row.bottom-bounds.bottom;
   if(row.top<bounds.top)list.scrollTop+=row.top-bounds.top;
   list.dataset.followed=nearest.dataset.tocFrom;
  }
  follow=false;
 }
 function layout(){if(root.closest('[hidden]'))return;position();if(!frame&&!disposed)frame=requestAnimationFrame(update)}
 function schedule(){clearTimeout(parseTimer);parseTimer=setTimeout(refresh,120)}
 function toggle(from){
  collapsed.has(from)?collapsed.delete(from):collapsed.add(from);paint();
  list.querySelector('[data-toc-fold="'+from+'"]')?.focus({preventScroll:true});
 }
 function jump(from,remember=true){
  if(remember&&text()!==raw){refresh();return}
  if(remember){previous={...capturePosition(),heading:chosenFrom};back.hidden=false}
  closePath();
  if(compact)close();chosenFrom=from;
  if(ancestors(byOffset.get(from)).slice(0,-1).map(h=>collapsed.delete(h.from)).some(Boolean))paint();
  if(stage()==='rich'&&editor()?.live){editor().reveal(from);editor().focus()}
  else if(stage()==='rich'&&tex?.())tex().restore(from,true);
  else if(stage()==='source'){const row=sourceOffsets().find(h=>h.from===from);source.focus({preventScroll:true});source.setSelectionRange(from,from);source.scrollTop=Math.max(0,(row?.top||0)-24)}
  else{const row=readingOffsets().find(h=>h.from===from);if(row){proof.scrollTop=Math.max(0,row.top-24);onReadingJump?.(from)}focusText()}
  layout();
 }
 function returnToPrevious(){
  if(!previous||text()!==raw){refresh();return}
  const saved=previous;previous=null;back.hidden=true;
  closePath();if(compact)close();
  restorePosition(saved);
  chosenFrom=saved.heading;layout();
 }
 function showIdeas(from){
  const cards=links.get(from);if(!cards?.length)return;
  const d=modal('关联构思卡','<div class="tocIdeaChoices">'+cards.map(n=>'<button data-toc-card="'+E(n.id)+'">'+E(n.t)+'</button>').join('')+'</div>');
  d.setAttribute('aria-label','关联构思卡');
  actionOn(d,async b=>{
   if(!b.dataset.tocCard)return;
   b.disabled=true;
   try{if(await openIdeaCardFromHeading(b.dataset.tocCard))d.close();else d.querySelector('.schError').textContent='当前稿未能离开，请先检查保存状态。'}
   finally{b.disabled=false}
  });
 }
 nav.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  const {tocIdea,tocFold,tocFrom}=button.dataset;
  if(tocIdea!==undefined)showIdeas(Number(tocIdea));
  else if(tocFold!==undefined)toggle(Number(tocFold));
  else if(tocFrom!==undefined){
   if(e.ctrlKey||e.metaKey)toggle(Number(tocFrom));
   else jump(Number(tocFrom));
  }
 });
 bar.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  const {tocPath,tocPathMore,tocPathJump,tocPathBranch}=button.dataset;
  if(button===trigger){closePath();nav.hidden?open():close();return}
  if(button===back){returnToPrevious();return}
  if(tocPathJump!==undefined){jump(Number(tocPathJump));return}
  if(tocPathBranch!==undefined){browse(menuTrigger,tocPathBranch===''?null:byOffset.get(Number(tocPathBranch)));return}
  if(button===menuTrigger){closePath(true);return}
  if(compact&&!nav.hidden)close();
  if(tocPath!==undefined){
   const h=byOffset.get(Number(tocPath));if(h)browse(button,h.parent?.hiddenTitle?null:h.parent,h.from);
  }else if(tocPathMore!==undefined){
   const parts=[...path.querySelectorAll('[data-toc-path]')];
   const rows=parts.map(part=>byOffset.get(Number(part.dataset.tocPath))).filter(Boolean);
   pathMenu(button,menuRows(rows,rows.at(-1)?.from,false),'<div class="tocPathGroup">当前章节路径</div>');
  }
 });
 search.oninput=paint;
 search.onkeydown=e=>{
  if(e.isComposing)return;
  const hit=list.querySelector('[data-toc-from]');
  if(e.key==='Enter'&&hit){e.preventDefault();jump(Number(hit.dataset.tocFrom))}
  else if(e.key==='ArrowDown'&&hit){e.preventDefault();hit.focus()}
 };
 menu.addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  const buttons=[...menu.querySelectorAll('button')],next=buttons.indexOf(document.activeElement)+(e.key==='ArrowDown'?1:-1);
  e.preventDefault();buttons.at((next+buttons.length)%buttons.length)?.focus();
 });
 const manual=e=>{if(!nav.contains(e.target)&&chosenFrom!=null){chosenFrom=null;layout()}};
 for(const evt of ['wheel','pointerdown','keydown','touchstart'])body.addEventListener(evt,manual,{capture:true,passive:true});
 options.addEventListener('click',e=>{if(e.target.closest('button'))options.open=false});
 panel.querySelector('[data-toc-close]').onclick=()=>close(true);
 const outside=e=>{
  if(!bar.contains(e.target))closePath();
  if(compact&&narrowOpen&&!bar.contains(e.target)&&!nav.contains(e.target))close();
 };
 const key=e=>{
  if(view!=='read'||e.isComposing||bar.hidden||document.querySelector('dialog[open]'))return;
  if(e.altKey&&e.code==='KeyF'){e.preventDefault();e.stopImmediatePropagation();closePath();open(true)}
  else if(e.key==='Escape'&&(bar.contains(e.target)||nav.contains(e.target))){
   if(!menu.hidden)closePath(true);
   else if(options.open){options.open=false;options.querySelector('summary').focus()}
   else if(!nav.hidden)close(true);
   else return;
   e.preventDefault();e.stopImmediatePropagation();
  }
 };
 const resize=()=>{layout();placeMenu()};
 document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key,true);root.addEventListener('scroll',layout,true);window.addEventListener('resize',resize);
 const observer=new ResizeObserver(resize);observer.observe(body);
 async function preferences(){
  const fields=ManuscriptTocSettings.fields(prefs),d=modal('正文设置','<p>当前项目</p><div class="manuscriptFigureSetting"><label>图号样式<select name="figureLabelStyle">'+
   ManuscriptFigureSettings.options.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+
   '</select></label><small>用于编号图的图注、正文交叉引用和导出。</small></div><h3>正文目录</h3><div class="tocSettings">'+fields.map(([key,label,,,options])=>'<label>'+label+'<select name="'+key+'">'+options.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join('')+'</select></label>').join('')+'</div><p><small>目录也可在「项目工具 → 项目信息与设置」调整。</small></p>'+toolButton('保存设置','class="msControl" data-control="commit" data-toc-save'));
  for(const [key,,,value]of fields)d.querySelector('[name="'+key+'"]').value=value;
  const style=d.querySelector('[name="figureLabelStyle"]');style.value=ManuscriptFigureSettings.style(figureStyle());
  d.querySelector('[data-toc-save]').onclick=async()=>{const btn=d.querySelector('[data-toc-save]');btn.disabled=true;try{const values={...prefs,...ManuscriptTocSettings.read(Object.fromEntries([...d.querySelectorAll('.tocSettings select')].map(el=>[el.name,el.value])))};await saveSettings(values,style.value);configure(values);d.close()}catch(e){d.querySelector('.schError').textContent=e.message}finally{btn.disabled=false}};
 }
 panel.querySelector('[data-toc-settings]').onclick=preferences;
 function configure(values){
  const old=prefs;prefs={...ManuscriptTocSettings.defaults,...values};
  if(old.hideFirst!==prefs.hideFirst){const saved=previous;raw=null;refresh();previous=saved;back.hidden=!saved}
  if(old.collapseDepth!==prefs.collapseDepth)collapsed=new Set(headings.filter(h=>h.level>=prefs.collapseDepth).map(h=>h.from));
  paint();
 }
 function headingInk(from){
  const h=byOffset.get(from);if(!h)return;
  const cm=stage()==='rich'&&editor()?.view;
  let el,range,viewport;
  if(cm&&from>=cm.viewport.from&&from<cm.viewport.to){
   const row=cm.state.doc.lineAt(from),prefix=row.text.match(/^\s*#{1,6}\s+/)?.[0].length||0;
   const start=cm.domAtPos(row.from+prefix),end=cm.domAtPos(row.to);
   el=(start.node.nodeType===1?start.node:start.node.parentElement).closest('.cm-line');
   if(!el||!el.contains(end.node))return;
   range=document.createRange();range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
   viewport=cm.scrollDOM.getBoundingClientRect();
  }else if(stage()==='proof'){
   el=readingOffsets().find(item=>item.from===from)?.el;if(!el)return;
   range=document.createRange();range.selectNodeContents(el);viewport=proof.getBoundingClientRect();
  }else return;
  const ink=singleLineInk(el,range,viewport);
  if(!ink)return;
  const lines=[];
  if(motionLevel()==='full'){
   let sibling=el.nextElementSibling;
   for(let i=0;sibling&&i<4&&lines.length<2;i++,sibling=sibling.nextElementSibling){
    if(sibling.matches('.ms-heading,h1,h2,h3,h4,h5,h6'))break;
    const item=visibleInk(sibling);if(item?.text&&item.rect.bottom<=viewport.bottom)lines.push({...item,text:item.text.slice(0,160)});
   }
  }
  const entry=list.querySelector('[data-toc-from="'+from+'"]');
  return {label:ink,lines,entry:entry&&entry.getClientRects().length?entry:null};
 }
 refresh();
 return {markHeading(from){
  if(!byOffset.has(from))return;
  chosenFrom=from;follow=true;
  if(!nav.hidden&&ancestors(byOffset.get(from)).slice(0,-1).map(h=>collapsed.delete(h.from)).some(Boolean))paint();
  cancelAnimationFrame(frame);update();
 },headingInk,motionOrigin(caret){
  const h=headings.findLast(row=>row.from<=caret);
  if(!h||motionLevel()==='off')return {};
  const heading=headingInk(h.from);
  if(heading)return {from:h.from,label:heading.label};
  // The path can include generated numbering and an ellipsis. Transfer only the visible title.
  const caption=path.querySelector('[data-toc-path="'+h.from+'"] > span:first-child');
  const title=caption?.lastChild;
  if(title?.nodeType!==Node.TEXT_NODE||title.textContent.trim()!==h.label)return {};
  const range=document.createRange();
  range.setStart(title,title.textContent.length-title.textContent.trimStart().length);
  range.setEnd(title,title.length);
  return {from:h.from,label:singleLineInk(caption,range,caption.getBoundingClientRect())};
 },refresh,schedule,layout,preferences,configure,refreshLinks:paint,managementOffset(){
  const v=viewport();return chosenFrom??(v.max>0&&v.top>=v.max-2?headings.at(-1)?.from:v.from)??0;
 },managementHeadings(){
  if(text()!==raw)refresh();
  return headings.filter(h=>!h.titleWrapper&&!h.hiddenTitle).map(h=>({from:h.from,label:display(h),
   root:(ancestors(h).find(p=>!p.titleWrapper)||h).from}));
 },sectionAt(offset){
  if(text()!==raw)refresh();
  return ancestors(headings.findLast(h=>h.from<=offset)).map(display);
 },jumpToLink(link){
  refresh();const h=resolveManuscriptHeading(link,raw,revision(),headings);if(!h)return false;
  jump(h.from,false);return true;
 },destroy(){
  disposed=true;cancelAnimationFrame(frame);clearTimeout(parseTimer);observer.disconnect();
  for(const evt of ['wheel','pointerdown','keydown','touchstart'])body.removeEventListener(evt,manual,true);
  document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key,true);
  root.removeEventListener('scroll',layout,true);window.removeEventListener('resize',resize);
  sourceMirror?.remove();nav.remove();bar.remove();
 }};
}
