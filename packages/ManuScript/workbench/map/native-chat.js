const nparams=new URL(document.baseURI).searchParams,nativeChat=host?.host==='dsh'&&nparams.get('native')==='1'
const nativeStates=new Map();let nativeTimer,requestNumber=0
// Only composer data crosses a workspace iframe's lifetime; never retain callbacks or session history.
function composerDrafts(){return parent.manuscriptComposerDrafts??=new parent.Map()}
function saveComposers(){
 for(const [key,n] of nativeStates){
  if(n.busy||n.switching)return false
  const files=(n.images||[]).map(i=>i.file),attached=[...(n.attached||[])]
  if(n.draft||files.length||attached.length||n.draftRefs?.length)composerDrafts().set(key,parent.structuredClone({text:n.draft||'',files,attached,draftRefs:n.draftRefs||[]}))
  else composerDrafts().delete(key)
 }
 return true
}
function newComposer(key){
 const d=composerDrafts().get(key)
 return {cursor:null,messages:[],draft:d?.text||'',draftRefs:d?.draftRefs||[],attached:new Set(d?.attached),images:(d?.files||[]).map(file=>({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)}))}
}
function nativeKey(){return JSON.stringify([proj,room,role()])}
function hostAction(action,sid,text,address,images=[],refs=[],question){
 const requestId=crypto.randomUUID(),project=address?.project||proj,k=address?.role||role()
 return new Promise((resolve,reject)=>{let timer;const done=(err)=>{clearTimeout(timer);window.removeEventListener('message',listener);err?reject(Error(err)):resolve()}
 const listener=e=>{if(e.source===parent&&e.data?.type==='manuscript-native-result'&&e.data.id===requestId)done(e.data.error)}
 window.addEventListener('message',listener);if(!['plan','permission','preset'].includes(action))timer=setTimeout(()=>done('未收到宿主回执，请先核对原生会话记录。'),18000)
 parent.postMessage({type:'manuscript-native',project,role:k,sid,text,requestId,action,images,refs,question},'*')})
}
function nativeDrawer(){
 clearTimeout(nativeTimer);const key=nativeKey(),p=proj,k=role(),arch=(state.rooms[room]||[]),n=nativeStates.get(key)||newComposer(key);nativeStates.set(key,n)
 box.insertAdjacentHTML('beforeend','<p class="teammeta"><span data-native-anchor>DSH 原生会话 · '+E(by(sel)?.t||'整个项目')+'</span></p>'+(room==='team'?'<label>团队成员 <select id="speaker">'+Object.keys(descriptions).map(v=>'<option value="'+v+'" '+(k===v?'selected':'')+'>'+E(labels[v])+'</option>').join('')+'</select></label>':'')+'<button data-native-jump>在 DSH 中继续 ↗</button><div class="teamfeed" role="log"></div><div class="partial" aria-live="polite"></div><div class="working" role="status"></div><div class="composer"><div class="draftReferences"></div><div class="noteAttachment"></div><div class="chatImages"><input type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp"><span data-images></span></div><textarea rows="1" maxlength="8000" aria-label="讨论内容" placeholder="给'+E(labels[k])+'发消息…"></textarea><div class="sendrow"><div data-session-policy aria-label="DSH 会话设置"></div><button class="lxSend msControl" data-control="commit" data-send title="Enter 发送 · Shift+Enter 换行" aria-label="发送给'+E(labels[k])+'">↑</button></div></div>')
 const feed=box.querySelector('.teamfeed'),input=box.querySelector('textarea'),status=box.querySelector('.working'),sendBtn=box.querySelector('[data-send]'),jump=box.querySelector('[data-native-jump]')
 const alive=()=>feed.isConnected&&mode==='chat'&&key===nativeKey()
 input.value=n.draft||drafts.get(nativeKey())||'';sizeInput();input.oninput=()=>{n.draft=input.value;drafts.set(nativeKey(),input.value);sizeInput();controls()}
 function paint(){const near=feed.scrollHeight-feed.scrollTop-feed.clientHeight<65
 const archive=arch.length?'<details><summary>绑定前讨论（存档 · '+arch.length+' 条）</summary>'+arch.map(m=>'<p><b>'+E(m.from==='user'?'你':labels[m.role]||'记录')+'</b> '+E(m.text)+'</p>').join('')+'</details>':''
 let previewTurn=false;feed.innerHTML=archive+n.messages.filter(m=>m.from!=='activity'||/未能|中断|没有最终|授权/.test(m.text)).map(m=>{if(m.from==='user')previewTurn=m.text.startsWith('[ManuScript 构思预览 / ');return '<div class="bubble" data-seq="'+m.seq+'" data-from="'+m.from+'"><small>'+E(m.from==='user'?'你':m.from==='activity'?'执行记录':labels[k])+'</small><div class="rich">'+(draftMessageHTML(m)||ChatUI.md(ideaPublicMessage(m,previewTurn)))+(m.images||[]).map(name=>'<small>▧ '+E(name)+'</small>').join(' ')+'</div>'+(m.changeKinds||[]).map(kind=>'<button class="diffReceipt" data-receipt="'+kind+'">'+(kind==='map'?'查看导图变化':'对照原段落')+'</button>').join('')+(k==='lead'&&m.from==='agent'&&ideaSession?.hasReply(n.sid+':'+m.seq)?'<button class="diffReceipt" data-diff="'+E(n.sid+':'+m.seq)+'">查看导图差异</button>':'')+'</div>'}).join('')
 if(near)feed.scrollTop=feed.scrollHeight}
 const panel=box.querySelector('[data-session-policy]');let policyRender=''
 const names={'workspace-write':'工作区内修改','read-only':'只读','danger-full-access':'完全访问','auto':'自动审查','custom':'自定义'}
 function paintPolicy(){const v=n.policy,c=n.catalog;if(!v||!c)return;const sig=JSON.stringify([v,c,!!n.switching,!!n.busy]);if(sig===policyRender)return;policyRender=sig
  const opts=(rows,selected)=>{const all=rows.some(x=>x.id===selected)?rows:[{id:selected,name:selected||'未指定'},...rows];return all.map(x=>'<option value="'+E(x.id)+'" '+(x.id===selected?'selected':'')+'>'+E(x.name||x.id)+'</option>').join('')}
  const select=(name,action,rows,current,locked=false)=>'<label>'+name+' <select aria-label="'+name+'" data-policy="'+action+'" '+(locked||n.switching||n.busy?'disabled':'')+'>'+opts(rows,current)+'</select></label> '
  const expanded=panel.querySelector('details')?.open;panel.innerHTML=select('工作模式','plan',[{id:'off',name:'执行'},{id:'on',name:'Plan · 规划'}],(v.pending??v.plan)?'on':'off',!v.canPlan)+select('访问权限','permission',c.access.map(x=>({id:x.id,name:names[x.id]||x.name})),v.permission)+
   '<details '+(expanded?'open':'')+'><summary aria-label="更多会话设置" title="预设与审批">···</summary><div>'+(c.presets.length?select('Agent 预设','preset',c.presets,v.preset,v.started):'')+'<small style="display:block">'+E((v.pending!==null?'模式将在下一步生效 · ':'')+'沙箱：'+(names[v.sandbox]||v.sandbox||'未报告')+' · 审批：'+({ask:'按需询问',never:'不询问'}[v.approval]||v.approval||'未报告'))+'</small></div></details>'
 }
 panel.onchange=async e=>{const action=e.target.dataset.policy;if(!action||n.switching)return;e.stopPropagation();const target=e.target.value;n.switching=true;controls()
  try{await hostAction(action,n.sid,target);const r=await api('dsh_history',{project:p,role:k,sid:n.sid,cursor:n.cursor});n.policy=r.policy;n.error=''}
  catch(err){n.error=err.message}finally{n.switching=false;if(alive())controls()}}
 const referenceTray=box.querySelector('.draftReferences');let refSignature='';n.draftRefs??=[];
 function referencesUI(){const sig=JSON.stringify([n.draftRefs,n.busy]);if(sig===refSignature)return;refSignature=sig;referenceTray.innerHTML=n.draftRefs.map((r,i)=>'<span class="draftRef"><button data-draft-ref="'+i+'" title="'+E(r.version+' · '+r.quote)+'">'+E(draftReferenceLabel(r))+' <small>'+E(r.version)+'</small></button><button data-remove-ref="'+i+'" aria-label="移除正文引用" '+(n.busy?'disabled':'')+'>×</button></span>').join('');input.placeholder=n.draftRefs.length?'针对这段原文，你想了解什么？':'给'+labels[k]+'发消息…'}
 referenceTray.onclick=async e=>{const target=e.target.closest('button');if(!target)return;const i=target.dataset.draftRef,remove=target.dataset.removeRef;if(remove!==undefined&&!n.busy){n.draftRefs.splice(Number(remove),1);controls();return}if(i!==undefined)try{await revealDraftReference(n.draftRefs[Number(i)])}catch(err){n.error=err.message;controls()}};
 const attachment=box.querySelector('.noteAttachment');let signature=''
 n.attached??=new Set()
 function notesUI(){
  const notes=k==='lead'&&view==='map'?ideaSession?.unsent||[]:[]
  if(view==='map'&&ideaSession?.notesReady)for(const key of n.attached)if(!notes.some(c=>c.key===key))n.attached.delete(key)
  const sig=JSON.stringify([notes.map(c=>c.key),[...n.attached],n.busy]);if(sig===signature)return;signature=sig
  const open=attachment.querySelector('details')?.open,disabled=n.busy?' disabled':''
  if(!notes.length){attachment.replaceChildren();return}
  attachment.innerHTML=n.attached.size?'<details '+(open?'open':'')+'><summary>批注 · '+n.attached.size+' 条</summary>'+notes.map(c=>'<label><input type="checkbox" value="'+E(c.key)+'" '+(n.attached.has(c.key)?'checked':'')+disabled+'> '+E(c.target)+'：'+E(c.text)+'</label>').join('')+'</details> <button type="button" data-detach aria-label="从消息移除批注"'+disabled+'>×</button>':'<button type="button" data-attach'+disabled+'>添加图上批注（'+notes.length+'）</button>'
 }
 attachment.onclick=e=>{if(n.busy)return;if(e.target.closest('[data-attach]'))n.attached=new Set(ideaSession.unsent.map(c=>c.key));else if(e.target.closest('[data-detach]'))n.attached.clear();else return;controls();input.focus()}
 attachment.onchange=e=>{const cb=e.target;if(cb.checked)n.attached.add(cb.value);else n.attached.delete(cb.value);controls()}
 feed.onclick=async e=>{const receipt=e.target.closest('[data-receipt]');if(receipt){
  const bubble=receipt.closest('[data-seq]');let panel=bubble.querySelector('[data-receipt-panel]')
  if(panel){const same=panel.dataset.receiptPanel===receipt.dataset.receipt;panel.remove();if(same)return}
  panel=document.createElement('section');panel.dataset.receiptPanel=receipt.dataset.receipt;bubble.append(panel);panel.textContent='正在读取本轮变化…'
  try{const v=await api('dsh_reply_detail',{sid:n.sid,seq:Number(bubble.dataset.seq),kind:receipt.dataset.receipt});if(panel.isConnected)renderReplyChanges(panel,v)}catch(err){panel.textContent=err.message}
  return}const ref=e.target.closest('[data-sent-draft]');if(ref){try{await revealDraftReference(JSON.parse(ref.dataset.sentDraft))}catch(err){n.error=err.message;controls()}return}const b=e.target.closest('[data-diff]');if(!b)return;try{if(view!=='map')showPage('map',sel);await ideaSession?.openReply(b.dataset.diff)}catch(err){n.error=err.message;controls()}}
 const tray=box.querySelector('.chatImages'),picker=tray.querySelector('input');n.images??=[];let imageSignature=''
 function imagesUI(){
  const sig=JSON.stringify([n.images.map(i=>i.id),!!n.busy]);if(sig===imageSignature)return;imageSignature=sig
  tray.querySelector('[data-images]').innerHTML=n.images.map(i=>'<button type="button" data-remove-image="'+i.id+'" aria-label="移除图片 '+E(i.file.name)+'" '+(n.busy?'disabled':'')+'><img src="'+E(i.url)+'" alt="'+E(i.file.name)+'"> ×</button>').join('')
 }
 function addFiles(files){if(n.busy)return;if(n.policy?.images?.state!=='supported'){n.error='当前会话未启用图片输入。';controls();return}
  const all=[...files];if(!all.length)return
  if(all.some(f=>!['image/png','image/jpeg','image/gif','image/webp'].includes(f.type)||!f.size||f.size>4*1024*1024)||all.length+n.images.length>4||[...n.images.map(i=>i.file),...all].reduce((s,f)=>s+f.size,0)>8*1024*1024){n.error='可添加最多 4 张 PNG、JPEG、GIF 或 WebP；单张上限 4 MiB，合计 8 MiB。';controls();return}
  for(const file of all)n.images.push({id:crypto.randomUUID(),file,url:URL.createObjectURL(file)});n.error='';controls();input.focus()
 }
 picker.onchange=()=>{addFiles(picker.files);picker.value=''}
 input.onpaste=e=>{const files=[...e.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();addFiles(files)}}
 tray.onclick=e=>{const id=e.target.closest('[data-remove-image]')?.dataset.removeImage;if(!id||n.busy)return;const item=n.images.find(i=>i.id===id);if(item)URL.revokeObjectURL(item.url);n.images=n.images.filter(i=>i.id!==id);controls()}
 function imageParts(){return Promise.all(n.images.map(({file})=>new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('无法读取图片，请重新选择。'));r.onload=()=>resolve({name:(file.name||'截图').slice(0,256),mediaType:file.type,data:String(r.result).split(',')[1]});r.readAsDataURL(file)})))}
 function controls(){referencesUI();paintPolicy();notesUI();imagesUI();status.textContent=n.error||n.phase||(n.busy?'正在发送…':n.sid?'已连接 · 两个入口共享此记录':'正在连接原生会话…');jump.disabled=!n.sid;sendBtn.disabled=(!input.value.trim()&&!(view==='map'&&n.attached.size)&&!n.images.length)||(n.images.length&&n.policy?.images?.state!=='supported')||!n.sid||!n.policy||!!n.switching||!!n.busy}
 async function read(){if(!alive())return
 try{if(!n.sid){const s=await api('dsh_session',{project:p,role:k});n.sid=s.sid}
 if(!n.catalog)n.catalog=await api('dsh_controls',{project:p,role:k,sid:n.sid});
 const r=await api('dsh_history',{project:p,role:k,sid:n.sid,cursor:n.cursor});if(!alive())return
 n.policy=r.policy;box.querySelector('.partial').textContent=r.partial||'';if(r.messages){const changed=r.messages.length!==n.messages.length;n.messages=r.messages;n.cursor=r.cursor;n.phase=r.phase;n.error=r.error;if(!r.phase&&r.messages.some(m=>m.refs?.length))questionNotesChanged(p);if(changed){paint();if(!n.phase&&['agent','activity'].includes(n.messages.at(-1)?.from)){const t=await api('team_state',{project:p});if(alive())await sync(p,t)}}}
  n.locateReply?.()
 }catch(e){if(!alive())return;n.error=e.message;if(/过期/.test(e.message))n.sid=null}
 finally{if(alive()){controls();nativeTimer=setTimeout(read,document.hidden?3500:1100)}}}
 n.send=async()=>{const text=input.value.trim();const comparison=k==='lead'&&view==='map'&&ideaSession?.project===p?ideaSession:null;if((!text&&!(comparison&&n.attached.size)&&!n.images.length)||(n.images.length&&n.policy?.images?.state!=='supported')||!n.sid||!n.policy||n.switching||n.busy||comparison?.busy)return;n.busy=true;n.error='';controls()
 try{const images=await imageParts();if(comparison&&n.draftRefs.length)throw Error('正文引用请在正文讨论中发送，输入与引用已保留');if(comparison){if(!await comparison.send(text,[...n.attached],images))return;n.attached.clear()}else await hostAction('prompt',n.sid,(n.draftRefs.length?n.draftRefs.map(r=>draftReferenceLabel(r)+' · '+r.version).join('\n')+'\n\n':'')+text,undefined,images,n.draftRefs,text);if(n.draftRefs.length)questionNotesChanged(p);n.draftRefs=[];for(const i of n.images)URL.revokeObjectURL(i.url);n.images=[];if(input.value.trim()===text){input.value='';n.draft='';drafts.delete(key);sizeInput()};n.phase='消息已交给 DSH'}
 catch(e){n.error=e.message}finally{n.busy=false;if(alive())controls()}}
 jump.onclick=async()=>{try{await hostAction('jump',n.sid)}catch(e){if(alive()){n.error=e.message;controls()}}}
 n.locateReply=()=>{if(!alive()||n.seek==null||!n.sid)return
  if(n.seek.sid!==n.sid){n.error='原对话不在这个工作区，已保留摘录。';n.seek=null;controls();return}
  const el=feed.querySelector('[data-from="agent"][data-seq="'+Number(n.seek.seq)+'"]')
  if(el){el.scrollIntoView({block:'center'});el.classList.add('qaReplyFocus');el.tabIndex=-1;el.focus({preventScroll:true});if(n.seek.continue)input.focus({preventScroll:true});n.seek=null}
  else if(n.cursor!=null){n.error='未找到当时的回复，旁注仍保留原摘录。';n.seek=null;controls()}
 }
 installExcerptPicker(feed,n,p,k)
 n.refreshUI=()=>{if(alive()){paint();controls()}};paint();controls();read()
}

window.addEventListener('idea-ui',()=>{if(mode==='chat')nativeStates.get(nativeKey())?.refreshUI?.()})
