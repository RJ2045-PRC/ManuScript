// Section nodes exist only in the canvas projection. Saving an idea card never
// serializes manuscript offsets into the project map.
let sectionState=null,sectionRequest=0,sectionBusy=false,sectionIndex=null;
let sectionTitleEdit=null,sectionTitleSave=null,sectionClick=null;
const sectionHistory=new Map();
let sectionActions=null;
function closeSectionActions(){sectionActions?.remove();sectionActions=null}
function openSectionActions(trigger){
 closeSectionActions();
 const row=sectionState?.draft.rows[sectionIndex];if(!row)return;
 const r=trigger.getBoundingClientRect(),menu=document.createElement('div');
 menu.className='sectionActionMenu';menu.style.left=Math.max(4,Math.min(innerWidth-108,r.left))+'px';menu.style.top=Math.min(innerHeight-44,r.bottom+3)+'px';
 const locate=document.createElement('button');locate.type='button';locate.textContent='定位正文';locate.dataset.sectionRead='';
 locate.onclick=()=>{closeSectionActions();if(sectionState?.draft.rows[sectionIndex]===row)openWorkspaceDocument(row).catch(e=>window.msToast?.(e.message))};
 menu.append(locate);document.body.append(menu);sectionActions=menu;locate.focus({preventScroll:true});
}
document.addEventListener('pointerdown',e=>{if(sectionActions&&!e.target.closest('.sectionActionMenu,.sectionAction'))closeSectionActions()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&sectionActions){e.preventDefault();e.stopImmediatePropagation();closeSectionActions();sectionTopicAt(sectionIndex)?.querySelector('.sectionAction')?.focus()}},true);
const sectionReady=()=>view==='map'&&sectionState?.project===proj&&!ideaSession?.isOpen;
function outlineHeadings(doc){
 return manuscriptDirectoryHeadings(doc.text,doc.format,true);
}
function adoptSections(doc){
 const draft=sectionDraft(doc,outlineHeadings(doc));
 const notes=new Map((doc.sectionNotes||[]).map(n=>[n.at,n]));
 for(const r of draft.rows){
  const note=notes.get(r.point);
  if(note?.heading===r.raw){
   r.writingNote=note.text;
   r.quotes=[{text:note.text}];
  }
 }
 // Keep Markdown writing notes attached to their owning heading.
 // Text before the first heading belongs to the document root.
 let owner=draft.intro,index=0;
 for(const quote of doc.format==='tex'?[]:window.manuscriptQuotes(doc.text)){
  while(index<draft.rows.length&&draft.rows[index].from<=quote.from)owner=draft.rows[index++];
  (owner.quotes??=[]).push(quote);
 }
 sectionState={project:proj,doc,draft,folded:new Set()};
 const history=sectionHistory.get(proj);
 if(history&&history.rev!==doc.rev)sectionHistory.delete(proj);
}
async function loadSectionMap(caret,keepViewport=false,prepared=null){
 const project=proj,request=++sectionRequest;
 cancelSectionClick();
 sectionTitleEdit=null;
 clearSectionFocus();sectionState=null;
 try{
  const doc=prepared||await api('document_read',{project});
  if(request!==sectionRequest||project!==proj||view!=='map')return;
  adoptSections(doc);
  const current=Number.isInteger(caret)?sectionState.draft.rows.findLastIndex(r=>r.from<=caret):-1;
  sectionState.location=current;
  if(nativeChat&&current>=0)sectionIndex=current;
  draw();
  if(current>=0){
   const key=Object.keys(pos).find(id=>pos[id].n.section===current);
   if(key)reveal(key);
  }else if(!keepViewport)reveal();
 }catch(e){if(project===proj&&view==='map')window.msToast?.(e.message)}
}
window.manuscriptMapNodes=(nodes,rows=sectionState?.draft.rows)=>{
 if(!sectionReady())return nodes;
 const stack=[],sections=[],used=new Set();
 const indexed=new Map(nodes.map(n=>[n.id,n])),headingIds=new Map();
 for(const [index,row] of rows.entries()){
  while(stack.length&&stack.at(-1).level>=row.level)stack.pop();
  const old=indexed.get(row.block),id=old?.id||'manuscript-section:'+row.from;
  const node={...old,id,p:stack.at(-1)?.id||'root',t:row.title,sectionQuotes:row.quotes,section:index,level:row.level,outlineDepth:stack.length+1,closed:sectionState.folded.has(index)};
  stack.push(node);sections.push(node);used.add(id);headingIds.set(row.from,id);
 }
 const blockIds=new Set(sectionState.doc.spans.map(s=>s.block));
 const omitted=n=>n&&blockIds.has(n.id)&&!used.has(n.id)&&!n.ideaOnly&&!n.anchor&&!n.kind;
 const ideas=nodes.filter(n=>!used.has(n.id)&&!omitted(n)).map(n=>{
  if(n.id==='root')return {...n,closed:sectionTitleEdit?.add?false:n.closed,sectionQuotes:sectionState.draft.intro.quotes};
  const link=state.headingLinks?.[n.id];
  if(n.p&&link){
   const {doc}=sectionState,heading=resolveManuscriptHeading(link,doc.text,doc.rev,sectionState.draft.rows);
   if(heading)return {...n,p:headingIds.get(heading.from)};
  }
  let parent=indexed.get(n.p);
  while(omitted(parent))parent=indexed.get(parent.p);
  return parent?.id!==n.p&&n.p?{...n,p:parent?.id||'root'}:n;
 });
 const edit=sectionTitleEdit;
 if(edit?.base===sectionState&&edit.add){
  const owner=sections[edit.index],parent=edit.child?owner:sections.find(n=>n.id===owner?.p);
  if(parent)parent.closed=false;
  sections.splice(edit.at,0,{id:edit.id,p:parent?.id||'root',t:'新小标题',origin:'user',sectionPending:true,
   outlineDepth:(parent?.outlineDepth||0)+1});
 }
 return [...sections,...ideas];
};
const sectionNew=$('#bar [data-section-new]'),ideaNew=$('#bar [data-idea-new]'),sectionUndo=$('#bar [data-a=undo]');
const sectionMenu=$('#mapSectionCommands'),sectionRemoval=$('#mapSectionRemoval'),topicRemoval=$('#bar [data-a=del]');
function runSectionMenu(e){
 const button=e.target.closest('button'),i=sectionIndex,h=sectionState?.draft.rows[i];
 if(!button||!h)return;
 if(button.hasAttribute('data-close-section'))closeSectionEditor();
 if(button.hasAttribute('data-section-move'))sectionMoveForm(i);
 if(button.hasAttribute('data-section-remove'))runSectionChange({kind:'remove',index:i});
 if(button.hasAttribute('data-section-card')){clearSectionFocus();inspectNode(h.block)}
 if(button.hasAttribute('data-section-erase')){
  const base=sectionState,d=modal('删除整节？','<p>将删除「'+E(h.title)+'」的标题、正文和全部子节。</p><button data-confirm-section>删除整节</button>');
  d.querySelector('[data-confirm-section]').onclick=async()=>{if(await runSectionChange({kind:'remove',index:i,whole:true},base))d.close()};
 }
}
sectionMenu.addEventListener('click',runSectionMenu);
sectionRemoval.addEventListener('click',runSectionMenu);
function showSectionCommands(show){
 sectionMenu.querySelector('[data-close-section]').hidden=nativeChat;sectionMenu.hidden=sectionRemoval.hidden=!show;topicRemoval.hidden=show;
}
function hasSectionUndo(){
 const latest=sectionHistory.get(proj)?.items.at(-1);
 return sectionReady()&&latest&&latest.map===JSON.stringify(map);
}
window.manuscriptSectionDepth=limit=>{
 if(!sectionReady())return;
 sectionState.folded.clear();
 for(const n of window.manuscriptMapNodes(map)){
  if(n.section!=null&&n.outlineDepth>=limit)sectionState.folded.add(n.section);
 }
};
window.manuscriptMapControls=()=>{
 const ready=sectionReady();
 showSectionCommands(ready&&sectionIndex!=null);
 $('#mapNewKinds').hidden=!ready;sectionNew.disabled=ideaNew.disabled=sectionBusy;
 updateMapMoveControls();
 const undo=hasSectionUndo();
 sectionUndo.toggleAttribute('data-section-undo',!!undo);
 sectionUndo.textContent=undo?'撤销章节操作':'撤销';
 sectionUndo.disabled=sectionBusy||(!undo&&!hist().u.length);
 if(!ready)return;
 const adding=sectionTitleEdit?.add;
 const active=adding?null:sectionTitleEdit?.index??sectionClick?.index??sectionIndex;
 if(adding)W.querySelector('.sectionPending')?.setAttribute('aria-selected','true');
 for(const node of W.querySelectorAll('.sectionTopic')){
  const index=pos[node.dataset.id].n.section;
  node.dataset.section=index;node.tabIndex=0;node.setAttribute('aria-label',sectionState.draft.rows[index].title);
  node.setAttribute('aria-keyshortcuts','Tab Enter F2 Space');
  node.title=(nativeChat?'单击选中':'单击写作')+' · 双击或空格改标题 · Tab 子级 · Enter 同级';
  if(index===sectionState.location)node.setAttribute('aria-current','location');
  node.classList.remove('selected');
  node.classList.toggle('currentSection',active===index);
  node.setAttribute('aria-selected',active===index);
 }
 if(adding||sectionIndex!=null){
  for(const other of W.querySelectorAll('.topic:not(.sectionTopic,.sectionPending):is(.selected,[aria-selected=true])')){
   other.classList.remove('selected');other.setAttribute('aria-selected','false');
  }
 }
 if(sectionIndex!=null&&!sectionTitleEdit){
  if(nativeChat){
  const topic=sectionTopicAt(sectionIndex);
  let trigger=W.querySelector('.sectionAction');
  if(!trigger){trigger=document.createElement('button');trigger.type='button';trigger.className='sectionAction';trigger.textContent='⋯';trigger.setAttribute('aria-label','章节操作');}
  if(topic&&trigger.parentElement!==topic)topic.append(trigger);
  }
  document.body.style.setProperty('--arg-top',vp.offsetTop+'px');
  for(const cmd of ['sibling','del'])$('#bar [data-a='+cmd+']').disabled=false;
 }
 mountSectionTitle();
};
function clearSectionFocus(){
 cancelSectionClick();
 W.querySelector('.sectionAction')?.remove();closeSectionActions();
 sectionIndex=null;showSectionCommands(false);
 if(argumentPane.dataset.section!==undefined){delete argumentPane.dataset.section;hideArgument()}
 W.querySelector('.currentSection')?.classList.remove('currentSection');
}
async function closeSectionEditor(){
 const session=sectionEditor;
 if(!await flushSectionEditor()||sectionEditor!==session)return;
 clearSectionFocus();sel='root';draw();vp.focus({preventScroll:true});
}
function selectSection(i,revealMargin){
 if(!sectionReady()||!sectionState.draft.rows[i])return;
 if(sectionIndex===i&&sectionEditor){focusSection(i,revealMargin);return}
 if(inlineStudio){inlineStudio.close().then(ok=>{if(ok)selectSection(i,revealMargin)});return}
 clearSectionFocus();hideArgument();sectionIndex=i;
 const h=sectionState.draft.rows[i];
 batch.clear();sel=by(h.block)?h.block:'root';pane.hidden=true;
 if(!nativeChat){
 argumentPane.hidden=false;argumentPane.dataset.section=i;
 document.body.classList.add('inspecting');
 argumentPane.innerHTML='<header class="sectionHeading"><h2>'+E(h.title)+'</h2><button class="msControl" data-control="source" data-section-read>定位正文</button></header>'+
  '<div class="sectionWriting" data-section-fields><div data-section-body></div><small role="status" data-section-status></small></div>';
 argumentPane.querySelector('[data-section-read]').onclick=async e=>{
  const button=e.currentTarget;button.disabled=true;
  try{
   if(!await flushSectionEditor()||!button.isConnected)return;
   const row=sectionState.draft.rows[sectionIndex];
   await returnToManuscript({rev:sectionState.doc.rev,from:row.from,quote:row.raw,before:'',after:''});
  }catch(error){if(button.isConnected)argumentPane.querySelector('[data-section-status]').textContent=error.message}
  finally{button.disabled=false}
 };
 mountSectionEditor(h);
 }
 sectionMenu.querySelector('[data-section-card]').hidden=!by(h.block);
 controls();window.manuscriptMapControls();
 focusSection(i,revealMargin);
}
function sectionTopicAt(index){
 return W.querySelector('.sectionTopic[data-section="'+index+'"]');
}
window.manuscriptSectionNeighbors=()=>{
 if(!sectionReady()||sectionIndex==null)return;
 const topic=sectionTopicAt(sectionIndex),node=topic&&pos[topic.dataset.id]?.n;
 const peers=pos[node?.p]?.cs.filter(peer=>peer.section!=null&&peer.level===node.level)||[];
 const index=peers.indexOf(node);
 return index<0?{}:{up:peers[index-1]?.section,down:peers[index+1]?.section};
};
function focusSection(index,margin){
 const topic=sectionTopicAt(index);
 if(topic){reveal(topic.dataset.id,margin);topic.focus({preventScroll:true})}
}
function drawSectionAt(id,nextId=()=>id){
 const before=pos[id];
 draw();
 const after=pos[nextId()];
 if(before&&after){
  tx+=(before.x-after.x)*zoom;
  ty+=((before.y-before.h/2)-(after.y-after.h/2))*zoom;
  paint();
 }
}
function cancelSectionClick(){
 clearTimeout(sectionClick?.timer);sectionClick=null;
}
window.manuscriptFlushSectionClick=()=>{
 if(!sectionClick)return;
 const {index}=sectionClick;
 cancelSectionClick();
 selectSection(index);
};
function sectionMoveForm(index){
 const base=sectionState,rows=base.draft.rows,end=sectionEnd(rows,index);
 const d=modal('移动「'+rows[index].title+'」','<div class="sectionFields"><label>目标位置<select data-target></select></label><label>放置方式<select data-place><option value="before">排在前面</option><option value="after">排在后面</option><option value="inside">成为子节</option></select></label></div><button data-move>移动整节</button>');
 const target=d.querySelector('[data-target]'),place=d.querySelector('[data-place]'),parents=[];
 target.add(new Option('文章末尾','-1'));
 rows.forEach((row,i)=>{
  while(parents.length&&parents.at(-1).level>=row.level)parents.pop();
  parents.push(row);
  if(i<index||i>=end)target.add(new Option(parents.map(h=>h.title).join(' › ')+' · '+(i+1),i));
 });
 target.onchange=()=>{place.disabled=target.value==='-1';if(place.disabled)place.value='inside'};
 target.onchange();
 actionOn(d,async b=>{
  if(b.hasAttribute('data-move')&&await runSectionChange({kind:'move',index,target:Number(target.value),where:place.value},base,d.querySelector('.schError')))d.close();
 });
}
async function editSectionTitle(index,add=false,child=false){
 if(!sectionReady()||sectionBusy||sectionTitleEdit)return;
 cancelSectionClick();
 const original=sectionState.draft.rows[index],project=proj;
 if(sectionEditor?.dirty()&&!await flushSectionEditor())return;
 if(!sectionReady()||proj!==project||sectionBusy||sectionTitleEdit)return;
 const base=sectionState,rows=base.draft.rows,row=rows[index];
 if(index>=0&&(!row||row.from!==original?.from||row.raw!==original.raw))return;
 if(child&&row.level===(base.doc.format==='tex'?3:6)){
  window.msToast?.('已达到稿件支持的标题层级。');return;
 }
 const topic=sectionTopicAt(index);
 sectionTitleEdit={base,index,add,child,id:add?'manuscript-section-pending':topic?.dataset.id,
  at:add&&row?sectionEnd(rows,index):rows.length,value:add?'':row.title};
 drawSectionAt(topic?.dataset.id);
 reveal(sectionTitleEdit.id,8);
}
function mountSectionTitle(){
 const edit=sectionTitleEdit,node=edit&&pos[edit.id]?.el;
 if(!node||edit.field?.isConnected||edit.base!==sectionState)return;
 const field=document.createElement('input');
 field.type='text';field.className='sectionTitleInput';field.value=edit.value;
 field.placeholder='输入小标题';field.setAttribute('aria-label','小标题');
 field.title='点击外侧或按 Enter / Tab 保存，Esc 取消';field.spellcheck=false;
 if(!edit.add)node.style.width=node.offsetWidth+'px';
 node.classList.add('editing');node.querySelector('.label').replaceWith(field);
 edit.field=field;
 field.oninput=()=>{edit.value=field.value;field.removeAttribute('aria-invalid')};
 field.onkeydown=e=>{
  e.stopPropagation();
  if(e.isComposing||e.keyCode===229||!['Enter','Tab','Escape'].includes(e.key)||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;
  e.preventDefault();
  if(e.repeat||sectionTitleSave)return;
  if(e.key==='Escape'){cancelSectionTitle(edit);return}
  saveSectionTitle();
 };
 field.addEventListener('keydown',e=>{
  if(e.key==='Tab'&&e.shiftKey&&!e.isComposing&&e.keyCode!==229)field.addEventListener('blur',()=>{if(sectionTitleEdit===edit)saveSectionTitle(true)},{once:true});
 });
 field.focus({preventScroll:true});
 if(!edit.add)field.select();
}
function cancelSectionTitle(edit,restoreFocus=true){
 const anchor=sectionTopicAt(edit.index)?.dataset.id;
 sectionTitleEdit=null;drawSectionAt(anchor);
 sectionEditor?.resume();
 if(restoreFocus){if(edit.index>=0)focusSection(edit.index,8);else vp.focus({preventScroll:true})}
 if(edit.stale&&!sectionEditor?.dirty())loadSectionMap(undefined,true);
}
function flushSectionTitle(){
 return saveSectionTitle(true);
}
function sectionIndexAfterTitle(edit,index){
 return edit.add&&index>=edit.at?index+1:index;
}
function finishSectionTitle(edit,doc){
 sectionTitleEdit=null;
 if(doc){
  const {folded,location}=sectionState;
  adoptSections(doc);
  sectionState.location=sectionIndexAfterTitle(edit,location);
  sectionState.folded=new Set([...folded].map(i=>sectionIndexAfterTitle(edit,i)));
  if(edit.child)sectionState.folded.delete(edit.index);
  if(sectionIndex!=null)sectionIndex=sectionIndexAfterTitle(edit,sectionIndex);
  if(sectionIndex!=null&&sectionEditor){
   const row=sectionState.draft.rows[sectionIndex];
   argumentPane.dataset.section=sectionIndex;
   argumentPane.querySelector('.sectionHeading h2').textContent=row.title;
   if(by(row.block))sel=row.block;
   sectionEditor?.follow(doc,row);
  }
  if(edit.add&&by('root').closed){by('root').closed=false;save()}
 }
 drawSectionAt(edit.id,()=>sectionTopicAt(edit.add?edit.at:edit.index)?.dataset.id);
 sectionEditor?.resume();
}
function saveSectionTitle(outside=false){
 if(sectionTitleSave)return sectionTitleSave;
 const edit=sectionTitleEdit;
 if(!edit)return true;
 if(sectionBusy)return false;
 const title=edit.value.trim();
 if(outside&&!title){cancelSectionTitle(edit,false);return true}
 const invalid=!title||edit.base.doc.format==='tex'&&/[{}]/.test(title);
 if(invalid){
  edit.field?.setAttribute('aria-invalid','true');edit.field?.focus({preventScroll:true});
  window.msToast?.('请输入有效的单行小标题。');return false;
 }
 sectionTitleSave=runSectionChange({kind:edit.add?'add':'edit',index:edit.index,title,child:edit.child},edit.base,null,edit)
  .then(ok=>{
   if(ok&&edit.base.project===proj&&view==='map'){
    if(sectionTitleEdit===edit)finishSectionTitle(edit);
    if(!outside){if(edit.add)selectSection(edit.at,8);else focusSection(edit.index,8)}
   }else if(!ok)edit.field?.focus({preventScroll:true});
   return ok;
  }).finally(()=>{sectionTitleSave=null});
 return sectionTitleSave;
}
async function runSectionChange(op,base=sectionState,errorBox=null,titleEdit=null){
 if(sectionBusy)return false;
 if(!titleEdit&&sectionEditor?.dirty()){
  const original=base?.draft.rows[op.index];
  if(!await flushSectionEditor())return false;
  if(original&&sectionState.draft.rows[op.index]?.from!==original.from)return false;
  base=sectionState;
 }
 const project=proj;
 const surfaces=titleEdit?[vp,$('#bar')]:[vp,argumentPane,$('#bar')];
 try{
  if(!sectionReady()||base!==sectionState)throw Error('稿件已变化，请重新选择小标题。');
  if(inlineStudio&&!await inlineStudio.close())return false;
  sectionBusy=true;
  for(const surface of surfaces)surface.inert=true;
  vp.setAttribute('aria-busy','true');
  const {doc}=base,history=sectionHistory.get(project)||{items:[],rev:doc.rev};
  const undo=op.kind==='undo',previous=history.items.at(-1);
  if(undo&&(!previous||history.rev!==doc.rev))throw Error('正文已变化，无法撤销此前的章节操作。');
  const next=undo?previous:changeSection(sectionDraft(doc,outlineHeadings(doc)),op);
  if(!undo&&next.text===doc.text&&!next.positions?.some(p=>p.at!==p.from))return true;
  const result=await api('document_edit',{project,rev:doc.rev,text:next.text,returnDocument:true,sectionPositions:next.positions,expectedSectionNotes:undo?previous.afterNotes:undefined,undoSectionVersion:undo?previous.version:undefined,sectionLayout:next.layout.length?next.layout:doc.spans.map(s=>({block:s.block,start:0}))});
  if(undo)history.items.pop();
  else{
   history.items.push({afterNotes:result.sectionNotes||[],version:paper.versions.at(-1).id,text:doc.text,map:JSON.stringify(map),layout:doc.spans.map(({block,start,body})=>({block,start,body,title:paperBlock(block)?.title}))});
   if(history.items.length>40)history.items.shift();
  }
  history.rev=result.documentRev;sectionHistory.set(project,history);
  if(proj!==project)return true;
  updateReader(result,project);
  if(view==='map'){
   if(titleEdit)finishSectionTitle(titleEdit,result.document);
   else{clearSectionFocus();sel='root';adoptSections(result.document);draw()}
   window.msToast?.(undo?'已撤销章节操作':'已更新正文');
  }
  return true;
 }catch(e){
  if(errorBox)errorBox.textContent=e.message;else window.msToast?.(e.message);
  if(base===sectionState&&e.message.includes('其他位置变化')){
   if(sectionTitleEdit)sectionTitleEdit.stale=true;
   else{clearSectionFocus();await loadSectionMap()}
  }
  return false;
 }finally{
  sectionBusy=false;vp.removeAttribute('aria-busy');
  for(const surface of surfaces)surface.inert=!connected;
  window.manuscriptMapControls?.();
 }
}
sectionNew.onclick=()=>editSectionTitle(-1,true,false);
ideaNew.onclick=()=>{
 if(!sectionReady()||sectionBusy||sectionTitleEdit)return;
 const parent=by(sel)?sel:'root';
 clearSectionFocus();hideArgument();batch.clear();addTopic(parent);edit();
};
window.manuscriptSectionAction=k=>{
 if(sectionTitleEdit&&['undo','redo','edit','child','sibling','del'].includes(k))return true;
 if(k==='undo'&&hasSectionUndo()){runSectionChange({kind:'undo'});return true}
 if(!sectionReady())return false;
 if(k==='child'&&sectionIndex==null&&sel==='root'&&!batch.size){editSectionTitle(-1,true,false);return true}
 if(sectionIndex==null)return false;
 if(k==='up'||k==='down'){
  const index=sectionIndex,target=window.manuscriptSectionNeighbors()?.[k];
  if(target!=null){
   const rows=sectionState.draft.rows;
   const next=k==='up'?target:sectionEnd(rows,target)-(sectionEnd(rows,index)-index);
   runSectionChange({kind:'move',index,target,where:k==='up'?'before':'after'}).then(ok=>{if(ok)selectSection(next)});
  }
  return true;
 }
 if(k==='del')runSectionChange({kind:'remove',index:sectionIndex});
 else if(k==='edit')editSectionTitle(sectionIndex);
 else if(k==='child'||k==='sibling')editSectionTitle(sectionIndex,true,k==='child');
 else return false;
 return true;
};
function sectionNode(e){return e.target.closest('#world .sectionTopic')}
document.addEventListener('click',async e=>{
 const edit=sectionTitleEdit;
 if(!edit||!sectionReady()||e.button!==0||e.target.closest('.sectionTitleInput')||swallowClick&&vp.contains(e.target))return;
 const body=e.target.closest('[data-section-body] .cm-content,[data-section-body] textarea');
 if(sectionTitleSave){
  if(!body){e.preventDefault();e.stopImmediatePropagation()}
  return;
 }
 const topic=e.target.closest('#world .topic');
 const section=sectionNode(e);
 const command=e.target.closest('button,summary,a,select,input,[role=button],[data-edge],[data-summary]');
 const blank=vp.contains(e.target)&&!topic&&!command;
 const savedIndex=sectionIndex;
 const project=proj,doc=sectionState.doc;
 const fold=section&&e.target.closest('.fold');
 const key=command&&['data-edge','data-summary'].find(k=>command.hasAttribute(k));
 const saved=saveSectionTitle(true);
 // Preserve the real pointer event in the body so it can place the caret or select text.
 if(body&&saved!==false)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(!await saved||proj!==project||view!=='map')return;
 const index=sectionState.doc!==doc&&edit.value.trim()?i=>sectionIndexAfterTitle(edit,i):i=>i;
 if(blank){
  const active=savedIndex??edit.index;
  W.querySelector('.sectionTopic[data-section="'+index(active)+'"]')?.focus({preventScroll:true});
  return;
 }
 // The projection is rebuilt after a write. Reacquire the original target.
 let target=command||e.target;
 if(!target.isConnected){
  if(section){
   const node=W.querySelector('.sectionTopic[data-section="'+index(Number(section.dataset.section))+'"]');
   target=fold?node?.querySelector('.fold'):node;
  }else if(key)target=W.querySelector('['+key+'="'+CSS.escape(command.getAttribute(key))+'"]');
  else if(topic){
   const node=pos[topic.dataset.id]?.el;
   const action=command?.dataset.a;
   target=action?node?.querySelector('[data-a="'+CSS.escape(action)+'"]'):node;
  }
 }
 if(target?.isConnected)target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey}));
},true);
W.addEventListener('click',e=>{
 if(!sectionReady()||e.target.closest('.mapNoteEditor,.mapNote'))return;
 if(e.target.closest('.sectionAction')){e.stopImmediatePropagation();openSectionActions(e.target.closest('.sectionAction'));return}
 if(e.target.closest('.sectionTitleInput')){e.stopImmediatePropagation();return}
 if(sectionTitleEdit){e.stopImmediatePropagation();sectionTitleEdit.field?.focus();return}
 if(e.target.closest('.root .sectionQuote')){
  e.stopImmediatePropagation();
  modal('写作备注',sectionState.draft.intro.quotes.map(q=>'<blockquote class="sectionQuoteFull">'+E(q.text)+'</blockquote>').join(''));
  return;
 }
 if(document.body.classList.contains('map-annotating')){const n=sectionNode(e);if(n&&!by(n.dataset.id)){e.stopImmediatePropagation();window.msToast?.('点击章节可直接写作备注。')}return}
 const n=sectionNode(e);
 if(n){
  e.stopImmediatePropagation();
  const index=Number(n.dataset.section);
  if(e.target.closest('.fold')){
   const folded=sectionState.folded;
   if(folded.has(index))folded.delete(index);else folded.add(index);
   draw();return;
  }
  if(e.detail===0){selectSection(index);return}
  cancelSectionClick();
  if(e.detail>1)return;
  n.focus({preventScroll:true});
  const base=sectionState;
  sectionClick={index,timer:setTimeout(()=>{
   sectionClick=null;
   if(sectionReady()&&sectionState===base&&!sectionTitleEdit)selectSection(index);
   else window.manuscriptMapControls();
  },245)};
  window.manuscriptMapControls();
 }
 else if(sectionIndex!=null)clearSectionFocus();
},true);
W.addEventListener('dblclick',e=>{const n=sectionNode(e);if(n&&sectionReady()&&!e.target.closest('button,input')){e.stopImmediatePropagation();cancelSectionClick();editSectionTitle(Number(n.dataset.section))}},true);
W.addEventListener('contextmenu',e=>{const n=sectionNode(e);if(n&&sectionReady()&&!e.target.closest('input')){e.preventDefault();e.stopImmediatePropagation();if(!sectionTitleEdit){selectSection(Number(n.dataset.section));if(nativeChat)openSectionActions(n.querySelector('.sectionAction')||n)}}},true);
window.addEventListener('keydown',e=>{
 // The canvas becomes inert during the request. Focus can temporarily be
 // on the document body, where the regular map shortcuts would still run.
 if(!sectionTitleSave||view!=='map'||e.isComposing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||
    !['Tab','Enter'].includes(e.key)||e.target.closest('#argument input,#argument textarea,#argument [contenteditable],dialog'))return;
 e.preventDefault();e.stopImmediatePropagation();
},true);
document.addEventListener('keydown',e=>{
 if(!sectionReady()||sectionBusy||e.defaultPrevented||e.isComposing||e.keyCode===229||e.target.closest('dialog,.sectionTitleInput'))return;
 if(e.key==='Escape'&&sectionClick){
  e.preventDefault();e.stopImmediatePropagation();cancelSectionClick();window.manuscriptMapControls();return;
 }
 if(e.key==='Escape'&&sectionIndex!=null&&!menu){
  e.preventDefault();e.stopImmediatePropagation();closeSectionEditor();return;
 }
 if(e.target.closest('input,textarea,[contenteditable]'))return;
 const n=sectionNode(e);
 if(n&&!e.target.closest('button')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&['Tab','Enter','F2',' '].includes(e.key)){
  e.preventDefault();e.stopImmediatePropagation();
  if(e.repeat)return;
  const index=Number(n.dataset.section);
  if(sectionClick?.index===index)selectSection(index);
  editSectionTitle(index,e.key==='Tab'||e.key==='Enter',e.key==='Tab');
  return;
 }
 if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&hasSectionUndo()&&(vp.contains(e.target)||argumentPane.contains(e.target)||e.target===sectionUndo)){
  e.preventDefault();e.stopImmediatePropagation();runSectionChange({kind:'undo'});
 }
},true);
let sectionDrag=null;
vp.addEventListener('pointerdown',e=>{
 const n=sectionNode(e);
 if(!n||!sectionReady()||sectionTitleEdit||e.button!==0||e.ctrlKey||e.target.closest('button,form,input')||document.body.classList.contains('map-annotating'))return;
 e.stopImmediatePropagation();swallowClick=false;
 sectionDrag={id:e.pointerId,node:n.dataset.id,index:Number(n.dataset.section),x:e.clientX,y:e.clientY,base:sectionState,project:previewSectionMove};
},true);
function previewSectionMove(source,target,where){
 const drag=sectionDrag,base=drag.base,owner=pos[target]?.n;
 if(!owner||base!==sectionState||target!=='root'&&owner.section==null)return;
 const rows=base.draft.rows.map(row=>({...row})),at=owner.section??-1;
 if(at>=drag.index&&at<sectionEnd(rows,drag.index))return;
 const max=base.doc.format==='tex'?3:6;
 try{
  moveSectionRows(rows,drag.index,at,where,(row,level)=>{
   if(level>max||level<1)throw RangeError();
   row.level=level;
  });
 }catch{return}
 if(rows.every((r,i)=>r.from===base.draft.rows[i].from&&r.level===base.draft.rows[i].level))return;
 const next=window.manuscriptMapNodes(map,rows);
 // Committing a manuscript move reloads the expanded outline.
 return next.map(n=>n.section!=null?{...n,closed:false}:n);
}
function finishSectionDrag(e,cancel=false){
 const drag=sectionDrag;if(!drag||e?.pointerId!=null&&drag.id!==e.pointerId)return;
 if(drag.active&&!cancel&&e)updateDragFeedback(drag,e);
 sectionDrag=null;
 if(!drag.active)return;
 clearDragFeedback(drag,!cancel&&drag.over);swallowClick=true;
 if(!cancel&&drag.over)runSectionChange({kind:'move',index:drag.index,target:pos[drag.over]?.n.section??-1,where:drag.where},drag.base);
}
vp.addEventListener('pointermove',e=>{
 const drag=sectionDrag;if(!drag||e.pointerId!==drag.id)return;
 if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<5)return;
 if(!drag.active){drag.active=true;vp.setPointerCapture(e.pointerId);pos[drag.node]?.el.classList.add('moving')}
 updateDragFeedback(drag,e);
},true);
window.addEventListener('pointerup',e=>finishSectionDrag(e),true);
for(const event of ['pointercancel','lostpointercapture'])vp.addEventListener(event,e=>finishSectionDrag(e,true));
window.addEventListener('blur',()=>finishSectionDrag(null,true));
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&sectionDrag){finishSectionDrag(null,true);e.preventDefault();e.stopImmediatePropagation()}},true);
