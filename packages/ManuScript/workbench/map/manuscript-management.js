// Build an index from the current manuscript and its project-owned assets.
function manuscriptManagementIndex(text,format,headings,figures) {
 const before={key:'start',title:'正文开头',path:'正文开头'};
 const firstLevels=new Map(headings.map(heading=>[heading.from,heading]));
 const authored=new Map();
 const locations=headings.map(heading=>{
  const root=firstLevels.get(heading.root)||heading;
  const number=root.label.match(/^(\d+)(\.[\d.]+)?(?:\s|[、．：:]|$)/u);
  if(number&&!number[2])authored.set(number[1],root.label);
  // Older manuscripts may flatten 3.1, 3.2, etc. into Markdown root headings.
  const key=number?'chapter-'+number[1]:'heading-'+root.from;
  const title=number?.[2]?authored.get(number[1])||'第 '+number[1]+' 章':root.label;
  return {from:heading.from,key,title,path:root===heading?heading.label:root.label+' › '+heading.label};
 });
 const sectionAt=at=>locations.findLast(heading=>heading.from<=at)||before;
 const use=(from,to,caption='')=>({from,to,caption,section:sectionAt(from)});
 const literals=format==='md'?window.manuscriptLiteralRanges(text):[];
 const isProse=from=>!literals.some(range=>range.from<=from&&from<range.to);
 const formulas=ManuscriptEquations.entries(text,format).map(item=>({...item,section:sectionAt(item.from)}));
 const references=new Map(),files=new Map();
 const assets=new Map(paper.assets.map(asset=>[asset.id,asset]));
 const exhibits=new Map();
 for(const exhibit of Object.values(objects())){
  if(exhibit.kind==='figure'&&exhibit.asset)exhibits.set(exhibit.asset,exhibit);
 }
 const image=/\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
 const sourceAssets=new Set([...(paper.sources||[]).map(source=>source.asset),
  ...Object.values(lib()).flatMap(ref=>(ref.editions||[]).map(edition=>edition.asset))]);
 function addFile(file,place){
  if(!files.has(file.key))files.set(file.key,{...file,uses:[]});
  if(place&&!files.get(file.key).uses.some(entry=>entry.from===place.from))files.get(file.key).uses.push(place);
 }
 function assetFile(asset){
  return {key:'asset:'+asset.id,name:asset.name,asset:asset.id,kind:image.test(asset.name)?'image':/\.pdf$/i.test(asset.name)?'pdf':'other',
   exhibit:exhibits.get(asset.id),path:image.test(asset.name)?documentImagePath(asset):null};
 }
 for(const asset of assets.values()){
  if(exhibits.has(asset.id)||sourceAssets.has(asset.id)||asset.role==='固定 PDF 裁图')addFile(assetFile(asset));
 }
 function addFigure(row,place){
  const resource=figures.lookup(row.path),asset=assets.get(resource?.asset);
  if(asset)addFile(assetFile(asset),place);
  else{
   const path=resource?.path||row.path;
   addFile({key:'image:'+path,name:displayPath(path),path,kind:'image',caption:row.body||row.alt||resource?.caption},place);
  }
 }
 function displayPath(path){
  const name=path.replace(/[?#].*$/,'').split('/').at(-1)||path;
  try{return decodeURIComponent(name)}catch{return name}
 }
 if(figures){
  for(const row of figures.scan(text).entries)addFigure(row,use(row.from,row.imageEnd,row.body||row.alt));
  for(const hint of figures.hints(text))addFigure(hint,use(hint.start,hint.at,hint.label||hint.caption));
 }
 // Include inline Markdown attachments that aren't standalone numbered figures.
 const links=/(?<image>!)?\[(?<alt>(?:\\.|[^\]\\\n])*)\]\((?<path><[^<>\n]+>|[^()\s]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\)/g;
 for(const match of text.matchAll(links)){
  if(!isProse(match.index))continue;
  const path=match.groups.path.replace(/^<(.*)>$/,'$1');
  if(match.groups.image&&figures){
   const alt=match.groups.alt.replace(/\\([\\\[\]])/g,'$1');
   if(figures.lookup(path))addFigure({path,alt},use(match.index,match.index+match[0].length,alt));
   continue;
  }
  if(/^(?:[a-z]+:|\/|#)/i.test(path))continue;
  const name=displayPath(path);
  const matched=paper.assets.filter(asset=>asset.name===name);
  if(matched.length===1)addFile(assetFile(matched[0]),use(match.index,match.index+match[0].length));
 }
 const clusters=new RegExp('('+citationSource+')|'+String.raw`\\cite(?:p|t)?\{([^}]+)\}`,'g');
 for(const match of text.matchAll(clusters)){
  const from=match.index,to=from+match[0].length;
  if(!isProse(from)||from>0&&text[from-1]==='!'||match[1]&&text[to]==='(')continue;
  const members=match[1]?citationMembers(match[1]):parseKeys(match[2]);
  for(const key of new Set(members.map(([id])=>id))){
   const reference=lib()[key];
   const place=use(from,to,citedSentence(text,from));
   if(!references.has(key))references.set(key,{...reference,key,uses:[]});
   references.get(key).uses.push(place);
   for(const edition of reference.editions||[]){
    const asset=assets.get(edition.asset);
    if(asset)addFile(assetFile(asset),place);
   }
  }
 }
 for(const match of text.matchAll(/\{\{(?:ref:)?(F\d+)\}\}/g)){
  const asset=assets.get(objects()[match[1]]?.asset);
  if(asset&&isProse(match.index))addFile(assetFile(asset),use(match.index,match.index+match[0].length,objects()[match[1]].caption));
 }
 for(const file of files.values()){
  file.uses.sort((a,b)=>a.from-b.from);
  if(file.exhibit?.block&&!file.uses.length){
   const at=figures?.blockPosition(file.exhibit.block,text);
   if(at!=null)file.uses.push(use(at,at,file.exhibit.caption));
  }
 }
 return {sectionAt,formulas,references:[...references.values()],files:[...files.values()]};
}

function openManuscriptManagement({read,format,headings,figures,caret,locate,updateFormula,updateFile,restore}) {
 const button=(label,attr)=>toolButton(label,'class="msControl" '+attr);
 const kinds={files:'附件',formulas:'公式',references:'已引用文献'};
 const d=modal('稿件管理',
  '<div class="msManageSearch"><div class="msManageScope" role="group" aria-label="查找范围">'+
  button('当前章','data-ms-scope="chapter"')+button('全稿','data-ms-scope="all"')+'</div>'+
  '<input type="search" aria-label="搜索稿件管理" autofocus></div>'+
  '<div class="msManageColumns"><section class="msManageList" aria-label="结果列表"><div class="msManageFilters">'+
  '<span data-ms-count role="status"></span><select aria-label="附件视图" data-ms-view><option value="chapters">按章节</option><option value="files">按文件</option></select>'+
  '<select aria-label="附件类型" data-ms-type><option value="all">全部类型</option><option value="image">图片</option><option value="pdf">PDF</option><option value="other">其他文件</option></select>'+
  '<label data-ms-inline><input type="checkbox">包含行内公式</label></div>'+
  '<div class="msManageResults" data-ms-results></div></section><section class="msManageDetail" aria-label="条目详情">'+
  button('‹ 返回结果','data-ms-return hidden')+'<div data-ms-detail></div></section></div>');
 d.classList.add('msManageDialog');
 const header=d.querySelector('header'),tabs=document.createElement('nav');
 tabs.setAttribute('aria-label','稿件管理类别');
 tabs.innerHTML=Object.entries(kinds).map(([key,label])=>button(label,'data-ms-tab="'+key+'"')).join('');
 header.insertBefore(tabs,header.lastElementChild);
 const query=d.querySelector('[type=search]'),results=d.querySelector('[data-ms-results]'),body=d.querySelector('[data-ms-detail]'),
  status=d.querySelector('.schError'),viewControl=d.querySelector('[data-ms-view]'),typeControl=d.querySelector('[data-ms-type]'),
  inline=d.querySelector('[data-ms-inline]'),back=d.querySelector('[data-ms-return]');
 let source=read(),index=manuscriptManagementIndex(source,format,headings(),figures),tab='files',scope='chapter',viewMode='chapters',type='all';
 let showInline=false,selected=null,selectedRow=null,rows=[],compact=false,inDetail=false,listTop=0,busy=false,editing=null,navigating=false;
 const chapter=index.sectionAt(caret);
 const inScope=place=>scope==='all'||place.section.key===chapter.key;
 const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\\_{}]/g,'');
 const tokens=()=>query.value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
 function matches(parts,tex=''){
  const commands=new Set(Array.from(tex.matchAll(/\\([a-zA-Z]+)/g),match=>match[1].toLowerCase()));
  const text=normalize([...parts,tex.replace(/\\[a-zA-Z]+/g,' ')].join(' '));
  return tokens().every(token=>text.includes(normalize(token))||commands.has(normalize(token))||
   (token.startsWith('\\')&&normalize(tex).includes(normalize(token))));
 }
 function matchUses(parts,uses){
  return matches(parts)||uses.some(place=>matches([...parts,place.caption,place.section.path,place.section.title]));
 }
 const rowButton=(entry,sub='',label='')=>'<button type="button" data-ms-row="'+rows.push(entry)+'" aria-pressed="false">'+
  '<span><strong>'+E(entry.name||entry.title)+'</strong>'+(sub?'<small>'+E(sub)+'</small>':'')+'</span>'+
  (label?'<small>'+E(label)+'</small>':'')+'</button>';
 const formulaRow=item=>({...item,key:'equation:'+item.from,rowKey:'equation:'+item.from,title:item.name||item.content});
 function renderList({keep=false,formulaAt}={}){
  const folded=new Set([...results.querySelectorAll('details:not([open])')].map(node=>node.dataset.msGroup));
  figures?.release(results);
  rows=[];
  viewControl.hidden=typeControl.hidden=tab!=='files';inline.hidden=tab!=='formulas';
  for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.msTab===tab));
  for(const b of d.querySelectorAll('[data-ms-scope]'))b.setAttribute('aria-pressed',String(b.dataset.msScope===scope));
  d.querySelector('[data-ms-scope="chapter"]').textContent=chapter.title;
  query.placeholder={files:'搜索文件名、图注或章节',formulas:'搜索名称、编号或 LaTeX',references:'搜索题名、作者或章节'}[tab];
  let html='',count=0;
  if(tab==='files'){
   const candidates=index.files.filter(file=>type==='all'||file.kind===type);
   const groups=new Map(),matched=new Set();
   for(const file of candidates){
    const uses=file.uses.filter(inScope),common=[file.name,file.exhibit?.caption];
    if(viewMode==='files'){
     if((scope==='all'||uses.length)&&matchUses(common,uses)){
      if(!groups.has('files'))groups.set('files',{title:'',files:[]});
      groups.get('files').files.push({file,uses});matched.add(file.key);
     }
     continue;
    }
    for(const section of new Map(uses.map(place=>[place.section.key,place.section])).values()){
     const here=uses.filter(place=>place.section.key===section.key);
     if(!matchUses(common,here))continue;
     if(!groups.has(section.key))groups.set(section.key,{title:section.title,files:[]});
     groups.get(section.key).files.push({file,uses:here});matched.add(file.key);
    }
   }
   const bins=[...groups];
   for(const [,group] of bins){
    group.files.sort((a,b)=>viewMode==='files'?a.file.name.localeCompare(b.file.name,'zh',{numeric:true}):a.uses[0].from-b.uses[0].from);
   }
   if(viewMode==='chapters')bins.sort(([,a],[,b])=>a.files[0].uses[0].from-b.files[0].uses[0].from);
   html=bins.map(([key,group],i)=>{
    const items=group.files.map(({file,uses})=>{
     const row=rowButton({...file,rowKey:key+'|'+file.key},uses[0]?.section.path,uses.length?uses.length+' 处':'未用于正文');
     return figures&&file.kind==='image'&&file.path?'<div class="msManageFileRow"><span data-ms-thumbnail="'+rows.length+'"></span>'+row+'</div>':row;
    }).join('');
    if(viewMode==='files'||scope==='chapter')return items;
    const open=keep?!folded.has(key):i===0||tokens().length||group.files.some(({file})=>key+'|'+file.key===selectedRow);
    return '<details data-ms-group="'+E(key)+'"'+(open?' open':'')+'><summary>'+E(group.title)+' <small>'+group.files.length+' 个</small></summary>'+items+'</details>';
   }).join('');
   count=matched.size;
  }else if(tab==='formulas'){
   const list=index.formulas.filter(e=>(showInline||e.display)&&inScope(e)&&matches([e.name,e.label,e.section.path,e.section.title],e.content));
   count=list.length;html=list.map(e=>rowButton(formulaRow(e),e.section.path,e.label)).join('');
  }else{
   const list=index.references.map(ref=>({...ref,rowKey:ref.key,uses:ref.uses.filter(inScope)})).filter(ref=>
    ref.uses.length&&matchUses([ref.title,ref.author,ref.key,ref.year],ref.uses));
   count=list.length;html=list.map(ref=>rowButton(ref,[ref.author,ref.year].filter(Boolean).join(' · '),ref.uses.length+' 处')).join('');
  }
  const noun={files:'个附件',formulas:'个公式',references:'篇文献'}[tab];
  d.querySelector('[data-ms-count]').textContent=count+' '+noun;
  results.innerHTML=html||'<p class="msManageEmpty">'+(tokens().length?'没有匹配的'+kinds[tab]+'。':'此范围暂无'+kinds[tab]+'。')+
   (scope==='chapter'&&tokens().length?button('在全稿搜索','data-ms-scope="all"'):'')+'</p>';
  for(const thumbnail of results.querySelectorAll('[data-ms-thumbnail]')){
   const file=rows[Number(thumbnail.dataset.msThumbnail)-1];
   thumbnail.replaceWith(figures.render({path:file.path,label:file.name}));
  }
  if(!keep){listTop=0;results.scrollTop=0}
  const savedFormula=formulaAt==null?null:index.formulas.find(item=>item.from===formulaAt);
  selected=rows.find(row=>row.rowKey===selectedRow)||rows.find(row=>row.key===selected?.key)||
   (savedFormula&&formulaRow(savedFormula))||rows[0]||null;
  selectedRow=selected?.rowKey;
  selectRow();
 }
 function selectRow(){
  results.querySelectorAll('[data-ms-row]').forEach((button,i)=>button.setAttribute('aria-pressed',String(rows[i]===selected)));
  renderDetail();
 }
 function layout(){
  d.toggleAttribute('data-compact',compact);
  d.toggleAttribute('data-detail',!!selected&&inDetail);
  back.hidden=!compact||!inDetail||!selected;
 }
 const resize=new ResizeObserver(()=>{
  const next=d.clientWidth<=660;
  if(compact!==next){
   const focused=document.activeElement;
   if(!compact)listTop=results.scrollTop;
   compact=next;layout();
   if(compact&&inDetail&&results.contains(focused))back.focus({preventScroll:true});
   else if(!compact&&focused===back){selectedButton()?.focus({preventScroll:true});results.scrollTop=listTop}
  }
 });
 resize.observe(d);
 const selectedButton=()=>results.querySelector('[data-ms-row][aria-pressed="true"]');
 function renderDetail(){
  figures?.release(body);
  editing=null;status.textContent='';
  const entry=selected;
  if(!entry){body.innerHTML='';inDetail=false;layout();return}
  if(tab==='formulas'){
   let preview;try{preview=ManuscriptEquations.validateContent(entry.content,entry.display)}catch{preview='<code>'+E(entry.content)+'</code>'}
   body.innerHTML='<h3>'+E(entry.name||'公式 '+entry.label)+'</h3><small>'+E(entry.section.path)+'</small>'+
    '<div class="msManageMath" aria-label="公式预览"><span>'+preview+'</span><small>'+E(entry.label)+'</small></div>'+
    '<div class="msManageActions">'+button('定位正文','data-ms-locate="0" data-control="source"')+button('编辑','data-ms-edit')+'</div>';
  }else{
   const usage=entry.uses.map((place,i)=>'<li><div><strong>'+E(place.section.path)+'</strong>'+
    (place.caption?'<small>'+E(place.caption)+'</small>':'')+'</div>'+button('定位正文','data-ms-locate="'+i+'" data-control="source"')+'</li>').join('');
   body.innerHTML='<h3>'+E(entry.title||entry.name)+'</h3>'+
    (tab==='references'?'<small>'+E([entry.author,entry.year,entry.journal].filter(Boolean).join(' · '))+'</small>':'')+
    '<div data-ms-preview></div>'+
    (usage?'<h4>'+(tab==='files'?'全稿使用位置':'正文引用位置')+'</h4><ul>'+usage+'</ul>':'<p class="msManageEmpty">当前稿未使用。</p>')+
    (tab==='references'?'<div class="msManageActions">'+button('编辑书目','data-ms-ref-edit')+
     (entry.editions?.length?button('查看文献原件','data-ms-ref-source'):'')+'</div>':
     entry.exhibit?'<details class="msManageFileOps"><summary>文件操作</summary><div class="msManageActions">'+
      button('重命名','data-ms-rename')+button('从附件库移除','data-ms-remove')+'</div><div data-ms-file-action></div></details>':
     entry.asset&&entry.kind!=='image'?button('下载文件','data-ms-download'):'');
   if(tab==='files'&&entry.kind==='image'&&figures){
    const label=entry.uses[0]?.caption||entry.caption||entry.exhibit?.caption||entry.name;
    const figure=entry.uses[0]&&figures.scan(source).images.get(entry.uses[0].from);
    body.querySelector('[data-ms-preview]').append(figures.render({path:entry.path,label,figure}));
   }
  }
  layout();
 }
 function refresh(formulaAt){
  source=read();index=manuscriptManagementIndex(source,format,headings(),figures);
  listTop=results.scrollTop||listTop;renderList({keep:true,formulaAt});
  if(!compact||!inDetail)results.scrollTop=listTop;
 }
 function leaveDetail(){
  inDetail=false;editing=null;
  if(selectedButton())renderDetail();else renderList({keep:true});
  results.scrollTop=listTop;(selectedButton()||query).focus({preventScroll:true});
 }
 async function switchTo(change){
  if(busy)return;
  if(editing&&editing.value.trim()!==selected.content){
   status.textContent='公式有未提交的改动。请先保存修改或取消编辑。';
   editing.focus();return;
  }
  change();
 }
 function editFormula(){
  const entry=selected;
  body.querySelector('.msManageActions').innerHTML=button('取消','data-ms-cancel')+button('保存修改','data-ms-save data-control="commit"');
  body.querySelector('.msManageActions').insertAdjacentHTML('beforebegin',
   '<label>LaTeX 输入<textarea aria-label="LaTeX 输入" rows="4" spellcheck="false"></textarea></label>');
  editing=body.querySelector('textarea');editing.value=entry.content;
  const save=body.querySelector('[data-ms-save]'),preview=body.querySelector('.msManageMath span');
  editing.oninput=()=>{
   try{preview.innerHTML=ManuscriptEquations.validateContent(editing.value.trim(),entry.display);status.textContent='';save.disabled=false}
   catch(error){preview.textContent='等待有效公式';status.textContent=String(error.message).replace(/^KaTeX parse error: /,'公式语法有误。');save.disabled=true}
  };
  editing.onkeydown=e=>{if(!e.isComposing&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();save.click()}};
  editing.focus();editing.oninput();
 }
 function fileControls(remove){
  if(remove&&selected.uses.length)throw Error('当前稿仍使用此图片，请先处理正文中的链接或章节关联。');
  const form=body.querySelector('[data-ms-file-action]');
  form.innerHTML=remove?'<p>将图片移出当前附件库，历史稿件中的原件仍可打开。</p>'+button('确认移除','data-ms-file-commit="remove" data-control="commit"'):
   '<label>文件名<input type="text" data-ms-name maxlength="120" value="'+E(selected.name)+'"></label>'+
    button('保存名称','data-ms-file-commit="rename" data-control="commit"');
  form.querySelector('input,button')?.focus();
 }
 const reset=()=>{inDetail=false;selected=null;selectedRow=null;renderList()};
 function onFilter(control,change,restoreValue){
  control.addEventListener('change',()=>{const value=control.type==='checkbox'?control.checked:control.value;
   if(busy){restoreValue();return}
   if(editing&&editing.value.trim()!==selected.content){restoreValue();switchTo(()=>{});return}
   change(value);reset();
  });
 }
 onFilter(viewControl,value=>viewMode=value,()=>viewControl.value=viewMode);
 onFilter(typeControl,value=>type=value,()=>typeControl.value=type);
 onFilter(inline.querySelector('input'),value=>showInline=value,()=>inline.querySelector('input').checked=showInline);
 let acceptedQuery='';
 query.addEventListener('input',()=>{
  if(busy){query.value=acceptedQuery;return}
  if(editing&&editing.value.trim()!==selected.content){query.value=acceptedQuery;switchTo(()=>{});return}
  acceptedQuery=query.value;reset();
 });
 actionOn(d,async b=>{
  if(busy)return;
  const x=b.dataset;
  if(x.msScope||x.msTab)return switchTo(()=>{if(x.msScope)scope=x.msScope;else tab=x.msTab;reset();if(!b.isConnected)query.focus()});
  if(x.msRow)return switchTo(()=>{
   selected=rows[+x.msRow-1];selectedRow=selected.rowKey;listTop=results.scrollTop;inDetail=true;
   selectRow();
   if(compact)back.focus({preventScroll:true});
  });
  if(x.msReturn!=null)return switchTo(leaveDetail);
  if(x.msLocate!=null){
   const place=tab==='formulas'?selected:selected.uses[+x.msLocate];
   if(source!==read())throw Error('正文已变化，请重新打开稿件管理。');
   navigating=true;d.close();locate(place.from,place.to);return;
  }
  if(x.msEdit!=null){editFormula();return}
  if(x.msCancel!=null){renderDetail();body.querySelector('[data-ms-edit]').focus();return}
  if(x.msSave!=null&&editing){
   const value=editing.value.trim(),item=selected;
   busy=true;b.disabled=true;editing.readOnly=true;
   status.textContent='正在保存公式…';
   try{
    const saved=await updateFormula(item,value,source);
    if(!d.open)return;
    refresh(item.from);status.textContent=saved?'公式已保存。':'修改已保留在工作稿，请重试保存。';
    body.querySelector('[data-ms-edit]')?.focus({preventScroll:true});
   }finally{busy=false;b.disabled=false;if(editing)editing.readOnly=false}
   return;
  }
  if(x.msRename!=null||x.msRemove!=null){fileControls(x.msRemove!=null);return}
  if(x.msFileCommit){
   const name=body.querySelector('[data-ms-name]')?.value.trim(),entry=selected;
   if(x.msFileCommit==='rename'&&!name)throw Error('请输入文件名。');
   busy=true;b.disabled=true;
   status.textContent=x.msFileCommit==='rename'?'正在重命名…':'正在移除…';
   try{
    await updateFile(entry.exhibit,x.msFileCommit,name,source);
    if(!d.open)return;
    refresh();status.textContent=x.msFileCommit==='remove'?'已移出当前附件库。':'文件名已更新。';
   }finally{busy=false;b.disabled=false}
   return;
  }
  if(x.msRefEdit!=null){refForm(lib()[selected.key],()=>{if(d.open)refresh()});return}
  if(x.msRefSource!=null){refDetail(selected.key);return}
  if(x.msDownload!=null){
   const file=await callSch('file',{asset:selected.asset});
   if(d.open)downloadSch(blobFrom(file.data,'application/octet-stream'),file.name,'application/octet-stream');
  }
 });
 function close(){
  if(busy)return;
  switchTo(()=>d.close());
 }
 d.querySelector('[data-x]').onclick=close;
 d.addEventListener('cancel',event=>{
  event.preventDefault();
  if(compact&&inDetail){switchTo(leaveDetail);return}
  close();
 });
 d.addEventListener('close',()=>{resize.disconnect();figures?.release(results);figures?.release(body);if(!navigating)restore()},{once:true});
 renderList();query.focus();
 return d;
}
