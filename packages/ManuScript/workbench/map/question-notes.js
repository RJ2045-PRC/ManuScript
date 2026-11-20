// Question cards keep the durable session and sequence, never a chat row index.
function questionNotesChanged(project){document.dispatchEvent(new CustomEvent('ms-questions-changed',{detail:project}))}
function openQuestionNote(note,follow=false){
 const q=note.qa;if(!nativeChat||!q)throw Error('请在原 DSH 项目中打开这条回复')
 talk(q.role,'root');const n=nativeStates.get(nativeKey())
 if(n.sid&&q.sid!==n.sid)throw Error('原会话不在当前项目中，摘录仍可阅读')
 const seq=follow?(q.turns.findLast(t=>t.seq!=null)?.seq??q.source):q.source
 if(seq!=null)n.seek={sid:q.sid,seq,continue:follow}
 if(follow){
  const ref={...(note.originReference||note),thread:q.key};delete ref.qa
  n.draftRefs??=[];if(!n.draftRefs.some(r=>r.thread===q.key))n.draftRefs.push(ref)
  n.refreshUI?.();box.querySelector('textarea')?.focus()
 }
 n.locateReply?.()
}
function questionCard(card,n,expanded,onExpand){
 const q=n.qa;card.dataset.question=q.key;card.classList.remove('highlightOnly')
 const toggle=card.querySelector('[data-note-edit]');toggle.textContent='问题 · '+q.question;toggle.title='查看对应回复';toggle.removeAttribute('aria-expanded');toggle.onclick=()=>{try{openQuestionNote(n)}catch(e){card.querySelector('[role=status]').textContent=e.message}}
 const body=document.createElement('div');body.className='questionAnswer';body.hidden=false
 const replyLabel=document.createElement('span');replyLabel.className='draftReplyLabel';replyLabel.textContent='回复';body.append(replyLabel)
 const quote=document.createElement('p');quote.textContent=(q.excerpt||q.turns.at(-1)?.status||'等待回复').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/^#{1,6}\s+/gm,'');body.append(quote)
 // Read the exact linked reply for older automatic snippets; preserve author-selected excerpts.
 if(!q.manual&&q.source!=null&&nativeChat){
  api('dsh_history',{project:proj,role:q.role,sid:q.sid}).then(history=>{
   if(!card.isConnected)return;
   const reply=history.messages?.find(m=>m.from==='agent'&&m.seq===q.source);
   if(!reply)return;
   const paragraphs=reply.text.split(/\n\s*\n/).map(s=>s.trim()).filter(s=>s&&!/^#{1,6}\s/.test(s)&&!/[：:]$/.test(s)&&!/^你框|^读的是|^只读理解/.test(s));
   const content=paragraphs.find(s=>s.replace(/[*_`]/g,'').length>30)||paragraphs[0];
   if(content)quote.textContent=content.replace(/\*\*([^*]+)\*\*/g,'$1');
  }).catch(()=>{});
 }
 const actions=document.createElement('div');actions.className='draftNoteActions';body.append(actions)
 for(const [label,follow] of [['查看对应回复',false],['继续追问',true]]){
  if(!follow&&q.source==null)continue;const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>{try{openQuestionNote(n,follow)}catch(e){card.querySelector('[role=status]').textContent=e.message}};actions.append(b)
 }
 card.insertBefore(body,toggle);card.querySelector('.draftNoteMeta span').textContent=q.excerpt?'解释 · Agent':'追问中'
}
function installExcerptPicker(feed,n,project,role){
 const toolbar=document.createElement('div');toolbar.className='draftNoteActions qaExcerptTools';toolbar.hidden=true;feed.after(toolbar)
 const btn=document.createElement('button');btn.type='button';btn.textContent='用作旁注摘录';toolbar.append(btn)
 const status=document.createElement('small');status.setAttribute('role','status');toolbar.append(status)
 let pick=null
 function capture(){
  if(!feed.isConnected)return
  const s=getSelection();if(!s.rangeCount||s.isCollapsed){if(!toolbar.contains(document.activeElement))toolbar.hidden=true;return}
  const r=s.getRangeAt(0),el=x=>(x.nodeType===1?x:x.parentElement)?.closest('.bubble[data-from="agent"] .rich')
  const a=el(r.startContainer),z=el(r.endContainer),v=s.toString().trim()
  if(!a||a!==z||!feed.contains(a)||!v||v.length>4000){toolbar.hidden=true;return}
  pick={seq:Number(a.closest('[data-seq]').dataset.seq),excerpt:v};toolbar.hidden=false;status.textContent='';toolbar.querySelector('select')?.remove()
 }
 feed.addEventListener('pointerup',capture);feed.addEventListener('keyup',capture)
 btn.onpointerdown=e=>e.preventDefault()
 btn.onclick=async()=>{if(!pick||!n.sid)return;const selected={...pick};try{
  const ctx=await api('draft_context',{project});const all=ctx.notes.filter(note=>note.qa?.sid===n.sid),linked=all.filter(note=>note.qa.turns.some(t=>t.seq===selected.seq)),choices=linked.length?linked:all
  if(!choices.length)throw Error('这条回复没有关联正文追问。请从正文选区发问，或从旁注继续追问。')
  let select=toolbar.querySelector('select')
  if((choices.length>1||!linked.length)&&!select){select=document.createElement('select');select.setAttribute('aria-label','选择要替换摘录的旁注');for(const note of choices){const opt=document.createElement('option');opt.value=note.qa.key;opt.textContent=note.quote;select.append(opt)}toolbar.prepend(select);status.textContent='选好旁注后再点一次替换';return}
  await api('dsh_question_excerpt',{project,role,sid:n.sid,key:select?.value||choices[0].qa.key,selectedTarget:!linked.length,...selected})
  questionNotesChanged(project);status.textContent='已替换旁注摘录';toolbar.querySelector('select')?.remove()
 }catch(e){status.textContent=e.message}}
}
