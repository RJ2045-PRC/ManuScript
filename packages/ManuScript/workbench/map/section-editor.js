// Keep the live Markdown editor mounted while autosave returns a new revision.
let sectionEditor=null;
function mountSectionEditor(row){
 const scope=argumentPane.querySelector('[data-section-fields]');
 const host=scope.querySelector('[data-section-body]'),status=scope.querySelector('[data-section-status]');
 const project=proj,{eol}=sectionState.draft;
 let doc=sectionState.doc,rangeEnd=row.to+row.body.length;
 const tex=doc.format==='tex',normalize=s=>s.replace(/\r\n/g,'\n');
 const raw=row.body;
 let legacyNote=row.writingNote;
 function edges(body){
  const leading=body.match(/^(?:\r?\n)*/)[0];
  return [leading,body.slice(leading.length).match(/(?:\r?\n)*$/)[0]];
 }
 let [leading,trailing]=edges(raw);
 const storedBody=normalize(raw.slice(leading.length,raw.length-trailing.length));
 const legacy=legacyNote&&(tex
  ?'\\begin{quote}\n'+normalize(legacyNote)+'\n\\end{quote}'
  :normalize(legacyNote).split('\n').map(line=>'> '+line).join('\n'));
 let saved=legacy?[legacy,storedBody].filter(Boolean).join('\n\n'):storedBody;
 const figures=tex?null:documentFigureTools(project,doc);
 let editor,preferences,source;
 if(tex){
  source=document.createElement('textarea');source.setAttribute('aria-label','本节正文');
  source.value=saved;host.append(source);
 }else{
  host.classList.add('studioRich');scope.dataset.stage='rich';
  editor=new window.ManuScriptLiveEditor({el:host,initialValue:saved,onChange:schedule,
   label:'本节正文',emptyHint:'开始写作，行首用 > 写备注',
   equationContext:()=>({before:doc.text.slice(0,row.to)+(leading||eol+eol),after:trailing+doc.text.slice(rangeEnd)}),
   renderToken:renderManuscriptToken,figures:{lookup:figures.lookup,render:figures.render,scan:figures.scan,hints:()=>[],jump:id=>{
    const target=figures.scan(editor.getMarkdown()).ids.get(id);
    if(target){editor.reveal(target.from,false);editor.focus()}
   }}});
  preferences=window.manuscriptMarkdownWriting(scope,null,{editor:()=>editor});
  citationClicks(scope);styleReader(scope);
 }
 const read=()=>editor?editor.getMarkdown():source.value;
 let pending=null,timer,composing=false;
 const dirty=()=>read()!==saved;
 function flush(){
  clearTimeout(timer);
  if(pending)return pending;
  if(sectionTitleSave)return sectionTitleSave.then(ok=>ok&&flush());
  if(sectionTitleEdit)return Promise.resolve(!dirty());
  if(composing||editor?.view.composing)return Promise.resolve(false);
  if(!dirty())return Promise.resolve(true);
  pending=(async()=>{
   try{
    let backupPending=false;
    while(dirty()){
     if(composing||editor?.view.composing)return false;
     const value=read();
     // An untouched legacy note keeps its existing storage and export behavior.
     const keepLegacy=legacyNote&&(value===legacy||value.startsWith(legacy+'\n\n'));
     const body=keepLegacy?value.slice(legacy.length+2):value;
     const nextBody=(leading||eol+eol)+body.replace(/\n/g,eol)+(trailing||(rangeEnd<doc.text.length?eol+eol:''));
     const text=doc.text.slice(0,row.to)+nextBody+doc.text.slice(rangeEnd);
     status.textContent='正在保存…';
     const payload={project,text,rev:doc.rev,returnDocument:true};
     if(legacyNote&&!keepLegacy)payload.writingNote={at:row.point,heading:row.raw,before:legacyNote,text:''};
     const result=await api('document_edit',payload);
     backupPending=result.manuscriptBackup?.state==='pending';
     if(payload.writingNote)legacyNote='';
     saved=value;rangeEnd=row.to+nextBody.length;
     if(project!==proj||sectionEditor!==session)return true;
     const folded=sectionState.folded;
     doc=result.document;adoptSections(doc);sectionState.folded=folded;
     updateReader(result,project);draw();
     if(editor)styleReader(scope);
    }
    status.textContent=backupPending?'本节已保存，正文备份待补':'';return true;
   }catch(error){status.textContent='未保存 · '+error.message;return false}
   finally{pending=null}
  })();
  return pending;
 }
 function schedule(){
  clearTimeout(timer);
  status.textContent=dirty()?'待保存':'';
  if(!composing)timer=setTimeout(flush,550);
 }
 function finish(){
  clearTimeout(timer);preferences?.destroy();editor?.destroy();figures?.destroy();
  if(sectionEditor===session)sectionEditor=null;
 }
 function follow(nextDoc,nextRow){
  doc=nextDoc;row=nextRow;rangeEnd=row.to+row.body.length;
  [leading,trailing]=edges(row.body);
 }
 const session={flush,follow,resume:()=>{if(dirty())schedule()},dirty:()=>dirty()||!!pending,finish,focus:()=>editor?editor.focus():source.focus()};
 sectionEditor=session;
 if(source)source.oninput=schedule;
 host.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer)});
 host.addEventListener('compositionend',()=>{composing=false;schedule()});
 scope.addEventListener('keydown',e=>{
  if(e.isComposing||composing||editor?.view.composing)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();flush()}
 });
}
async function flushSectionEditor(){return !sectionEditor||await sectionEditor.flush()}
document.addEventListener('click',async e=>{
 if(sectionTitleEdit||!sectionEditor?.dirty()||e.target.closest('[data-section-fields]'))return;
 const topic=e.target.closest('#world .topic'),target=e.target.closest('button,summary,select,[role=button]')||e.target;
 const original=sectionState.doc;
 const index=topic?.dataset.section, row=index==null?null:sectionState.draft.rows[Number(index)];
 const editing=sectionState.draft.rows[sectionIndex];
 e.preventDefault();e.stopImmediatePropagation();
 if(await flushSectionEditor()){
  if(target.isConnected)target.click();
  else if(row){
   const delta=sectionState.doc.text.length-original.text.length;
   const at=row.from+(row.from>editing.from?delta:0);
   const next=sectionState.draft.rows.findIndex(r=>r.from===at&&r.raw===row.raw);
   if(next!==-1)selectSection(next);
  }else if(topic)W.querySelector('[data-id="'+CSS.escape(topic.dataset.id)+'"]')?.click();
 }
},true);
window.addEventListener('beforeunload',e=>{if(sectionEditor?.dirty()){e.preventDefault();e.returnValue=''}});
