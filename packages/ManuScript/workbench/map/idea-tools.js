// Bind the pointer tool to the real editable canvas; leaving the tool keeps the cards.
const ideaPointer='<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7V3h4m5 0h4v4M3 12v4h4"/><path d="m8 7 8.3 4.3-3.7 1.2-1.4 3.8z"/></svg>'
function setupIdeaToolbar(btn){
 btn.disabled=true;btn.removeAttribute('data-single');btn.dataset.ideaTool='';btn.setAttribute('aria-pressed','false');btn.title='指向节点或连线写批注 · Esc 退出';btn.innerHTML=ideaPointer+'批注'
 btn.onclick=()=>ideaSession?.toggleTool()
 const history=document.createElement('button');history.textContent='版本历史';history.disabled=true;history.dataset.ideaHistory='';history.onclick=()=>ideaSession?.history();btn.after(history)
}
function bindMapNotes(session){
 let active=false,editor=null,anchor,submitting=false
 const events=new AbortController(),opt={capture:true,signal:events.signal}
 // Mount the same form before measurement, so the surrounding tree makes space.
 window.lxMountNote=(v)=>{if(editor&&v.n.id===anchor?.id)v.el.append(editor)}
 function removeEditor(){if(!editor)return;editor.remove();editor=null;anchor=null;draw();vp.focus({preventScroll:true})}
 function mayDiscard(){return !submitting&&(!editor?.querySelector('textarea').value.trim()||window.confirm('放弃这条还没保存的批注？'))}
 function toggle(force){
  active=force??!active;document.body.classList.toggle('map-annotating',active)
  for(const el of document.querySelectorAll('[data-idea-tool],[data-pair-tool]'))el.setAttribute('aria-pressed',String(active))
  if(!active){removeEditor();session.clearFocus()}
  for(const el of document.querySelectorAll('.igTarget > button[data-kind]'))el.title=(active?'在此写批注：':'查看保存时的记录：')+el.getAttribute('aria-label')
  return active
 }
 function cards(id){
  return session.singleNotes(id).map(({note:c,number})=>'<span class="mapNoteCard"><small>#'+number+' · '+(c.kind==='edge'?'连线':'节点')+'批注 · '+(c.sent?'已发送':'待发送')+'</small>'+E(c.text)+'</span>').join('')
 }
 window.lxMapNoteHTML=cards
 function target(e){if(e.target.closest('form'))return null;const el=e.target.closest('[data-edge],.topic');if(!el||!W.contains(el))return null
  const id=el.dataset.edge||el.dataset.id,n=by(id);if(!n||n.ghost)return null
  return {el,n,kind:el.dataset.edge?'edge':'node'}
 }
 async function open(e){
  if(!active||!target(e))return
  e.preventDefault();e.stopImmediatePropagation()
  const hit=target(e);if(session.busy||!await session.readyForNote()||!active||events.signal.aborted)return
  if(editor?.querySelector('textarea').value.trim()){editor.querySelector('textarea').focus();return}
  removeEditor();const {n,kind}=hit,v=session.singleView(),name=kind==='node'?n.t:by(n.p)?.t+' → '+n.t
  const comment={id:n.id,parent:n.p||'',ref:v.ref,version:v.label,side:'left',kind,target:name}
  editor=document.createElement('form');editor.className='igEditor mapNoteEditor';editor.innerHTML='<strong>'+E(name)+'</strong><textarea aria-label="批注原话" maxlength="2000" rows="3" required placeholder="写下问题或修改意见…"></textarea><button type="submit">保存批注</button> <button type="button">取消</button><small role="status"></small>'
  editor.onpointerdown=editor.onclick=e=>e.stopPropagation();anchor={id:n.id,kind};sel=n.id;draw();reveal()
  editor.querySelector('textarea').focus();editor.querySelector('[type=button]').onclick=()=>{if(mayDiscard())removeEditor()}
  editor.onsubmit=async ev=>{ev.preventDefault();const form=ev.currentTarget,text=form.querySelector('textarea').value.trim();if(!text)return
   if(submitting)return;submitting=true;form.querySelector('[type=submit]').disabled=true
   try{await session.annotate(comment,text);removeEditor()}catch(err){form.querySelector('[role=status]').textContent=err.message;form.querySelector('[type=submit]').disabled=false}finally{submitting=false}}
 }
 for(const event of ['pointerdown','mousedown','dblclick','dragstart'])W.addEventListener(event,e=>{if(active&&target(e)&&e.button!==2){e.stopImmediatePropagation();if(event==='dragstart')e.preventDefault()}},opt)
 W.addEventListener('click',open,opt)
 window.addEventListener('keydown',e=>{if(!active||view!=='map'||e.isComposing)return
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(editor){if(mayDiscard())removeEditor()}else if(session.pairEditing){session.cancelPair()}else toggle(false)}
  else if(vp.contains(e.target)&&!editor?.contains(e.target)&&!['Tab','Shift','Control','Meta','Alt'].includes(e.key)){e.stopImmediatePropagation()}
 },opt)
 // Canvas shortcuts listen on ancestors; text entry must remain plain form input.
 vp.addEventListener('keydown',e=>{if(editor?.contains(e.target))e.stopPropagation()},opt)
 return {toggle,mayDiscard,get active(){return active},get editing(){return !!editor},destroy(){toggle(false);events.abort();delete window.lxMountNote;delete window.lxMapNoteHTML}}
}
