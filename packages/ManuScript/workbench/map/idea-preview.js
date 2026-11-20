let ideaSession=null
async function openIdeaPreview(){
 if(!nativeChat||!connected||ideaSession||document.querySelector('dialog[open]'))return
 const project=proj,anchor='root',screen=document.createElement('section')
 screen.className='ideaRoom';screen.tabIndex=-1;screen.setAttribute('aria-label','导图版本对照');vp.before(screen);screen.hidden=true
 screen.innerHTML='<p role="status">正在读取导图版本…</p>'
 const q=s=>screen.querySelector(s),alive=()=>screen.isConnected&&project===proj
 const shape=n=>({id:n.id,p:n.p,t:n.t,rel:n.relation||''})
 let context,base,rows,aliases,ids,scope,summary='',pending=true,sid,notes=[],focus=null,round=0,draftId=crypto.randomUUID(),revision=0,zoom=1
 let toolReady=Promise.resolve(true),pointer,latest=null,displayed=null;const snapshots=new Map(),versions=new Map(),choice={left:'base',right:'draft'},views={},ready=()=>!!rows&&alive(),queued=()=>notes.filter(c=>!c.sent)
 let wireFrame=0;const resize=new ResizeObserver(()=>{cancelAnimationFrame(wireFrame);wireFrame=requestAnimationFrame(()=>{for(const tree of screen.querySelectorAll('.igTree'))ideaLines(tree)})})
 resize.observe(screen)
 function destroy(){if(!screen.isConnected)return;pointer?.destroy();resize.disconnect();cancelAnimationFrame(wireFrame);screen.remove();document.body.classList.remove('idea-open');ideaSession=null}
 function canLeave(){if(pending){status('请等待当前操作完成。');return false}return (!pointer||pointer.mayDiscard())&&(!focus||!q('.igEditor textarea')?.value.trim()||window.confirm('放弃这条还没保存的批注？'))}
 function currentView(){const num=context?.currentVersion;return {ref:num?'v'+num:'base:'+context?.base,label:num?'v'+num:'当前项目图'}}
 function singleNotes(id){const ref=currentView().ref;return notes.map((note,i)=>({note,number:i+1})).filter(({note:n})=>n.id===id&&!n.onHistory&&(n.ref===ref||n.confirmedRef===ref||context?.currentNoteKeys?.includes(n.key)))}
 function inform(){window.dispatchEvent(new Event('idea-ui'))}
 function single(){pointer?.toggle(false);displayed=null;screen.hidden=true;document.body.classList.remove('idea-open');draw();inform()}
 async function revealPair(key){if(!ready()||pending||!canLeave())return;await refresh();pointer.toggle(false);displayed=key||null
  if(key){if(!snapshots.has(key))snapshots.set(key,await api('idea_reply',{project,key}));choice.left='before:'+key;choice.right='after:'+key}else sequence()
  status('点已保存导图的节点看当时的正文与批注；点「批注」可另行留言。');screen.hidden=false;document.body.classList.add('idea-open');await paint();screen.focus({preventScroll:true})
 }
 const session=ideaSession={destroy,canLeave,send,project,get isOpen(){return !screen.hidden},get notesReady(){return !!pointer},exitPair(){if(!canLeave())return false;single();document.querySelector('[data-idea-history]')?.focus();return true},singleNotes,singleView:currentView,annotate,toggleTool:async()=>{if(pending||!pointer)return;if(pointer.active&&!pointer.mayDiscard())return;if(pointer.toggle())toolReady=refresh().then(()=>true,err=>{if(alive()){$('#status').textContent='无法载入当前批注版本：'+err.message;pointer.toggle(false)}return false})},readyForNote:()=>toolReady,history:()=>revealPair(null),openReply:revealPair,hasReply:key=>!!pointer&&context?.replies?.includes(key),get pairEditing(){return !!focus},cancelPair:()=>{if(canLeave()){focus=null;paint()}},clearFocus:()=>{if(focus){focus=null;paint()}},get busy(){return pending},get unsent(){return queued()}}
 function status(t){const el=q('[role=status]');if(el)el.textContent=/no adapter registered/i.test(t)?'当前模型不可用，请在团队设置中为主 Agent 选择已注册的模型。':t}
 async function annotate(target,text){const updated=await api('idea_annotate',{project,comment:{...target,key:crypto.randomUUID(),intent:'批注',text}});if(!alive())return;notes=updated;draw();inform();await paint()}
 async function refresh(){
  await writes;const next=await api('idea_context',{project});if(!alive())return
  if(next.base!==context.base){await reset(next);await paint()}else{context=next;notes=next.comments;inform()}
 }
 async function reset(nextContext){
  context=nextContext||await api('idea_context',{project});if(!alive())return
  base=new Map(context.map.map(n=>[n.id,shape(n)]));if(!base.has(anchor))throw Error('讨论主题已移除')
  rows=new Map(base);notes=context.comments||[];aliases=new Map([[anchor,'a']]);ids=new Map([['a',anchor]]);scope=new Set([anchor])
  const queue=[anchor],kids=new Map();let seq=0
  for(const v of base.values()){if(!kids.has(v.p))kids.set(v.p,[]);kids.get(v.p).push(v)}
  for(let i=0;i<queue.length;i++)for(const v of kids.get(queue[i])||[]){queue.push(v.id);scope.add(v.id);const key='n'+(++seq);aliases.set(v.id,key);ids.set(key,v.id)}
  summary='';focus=null;round=0;draftId=crypto.randomUUID();latest=null
  const key=context.replies.at(-1)
  if(key){const v=await api('idea_reply',{project,key});snapshots.set(key,v)
   if(v.base===context.base){latest=key;round=v.round;draftId=v.draftId;summary=v.summary;rows=new Map(v.after.map(n=>[n.id,n]));aliases=new Map(v.aliases);ids=new Map([...aliases].map(([k,v])=>[v,k]));scope=new Set(aliases.keys())}
  }
 }
 function delta(){const changes=[],removed=[];for(const [k,v] of rows||[])if(JSON.stringify(v)!==JSON.stringify(base.get(k)))changes.push(v);for(const k of base?.keys()||[])if(!rows.has(k))removed.push(k);return {changes,removed}}
 function changed(){const d=delta();return d.changes.length+d.removed.length}
 function options(side){const v=context.history.map(v=>['v'+v.number,'v'+v.number+' · '+v.summary]);const snap=displayed?snapshots.get(displayed):null;return [...(snap?[[side==='left'?'before:'+displayed:'after:'+displayed,side==='left'?'本轮修改前':'本轮建议稿']]:[]),[ 'base','当前项目图'+(context.currentVersion?' · v'+context.currentVersion:'')],...(side==='right'&&changed()?[['draft','累计建议稿 · 未确认']]:[]),...v]}
 async function getView(k){
  if(k.startsWith('before:')||k.startsWith('after:')){const i=k.indexOf(':'),side=k.slice(0,i),v=snapshots.get(k.slice(i+1));return {data:new Map(v[side].map(n=>[n.id,n])),ref:v[side+'Ref'],label:side==='before'?'本轮修改前':'本轮建议稿'}}
  const baseRef=context.currentVersion?'v'+context.currentVersion:'base:'+context.base
  if(k==='base'||k==='draft'&&!changed())return {data:base,ref:baseRef,label:context.currentVersion?'v'+context.currentVersion:'当前项目图'}
  if(k==='draft')return {data:rows,ref:'draft:'+draftId+':'+round,label:'预览第 '+round+' 轮'}
  if(!versions.has(k)){const v=await api('idea_version',{project,number:Number(k.slice(1))});versions.set(k,{data:new Map(v.map.map(n=>[n.id,shape(n)])),frozen:v.mapNotes})}
  return {...versions.get(k),ref:k,label:k}
 }
 function sequence(){
  const [last,prior]=context.history
  if(changed()){choice.left='base';choice.right='draft'}
  else if(!context.currentVersion){choice.left=last?'v'+last.number:'base';choice.right='base'}
  else{choice.left='v'+(prior||last).number;choice.right='v'+last.number}
 }
 async function paint(){
  if(screen.hidden)return
  const empty=!displayed&&!context.history.length&&!changed()
  screen.classList.toggle('no-history',empty)
  const rev=++revision;const pair=await Promise.all([getView(choice.left),getView(choice.right)])
  if(!alive()||rev!==revision)return
  for(const [i,side] of ['left','right'].entries()){
   const v=pair[i];views[side]=v;const pane=q('[data-side="'+side+'"]'),select=pane.querySelector('select')
   select.innerHTML=options(side).map(([k,label])=>'<option value="'+E(k)+'">'+E(label)+'</option>').join('');select.value=choice[side]
   const out=pane.querySelector('[data-record]');if(out.dataset.version!==choice[side]){out.hidden=true;out.dataset.version=choice[side]}
   pane.querySelector('.igScroll').innerHTML=ideaGraph(v.data,pair[1-i].data,anchor,side,notes,v.ref,focus,pair[1-i].ref,v.frozen)
  }
  for(const tree of screen.querySelectorAll('.igTree'))ideaLines(tree)
  const L=pair[0].data,R=pair[1].data;let add=0,del=0,edit=0
  for(const [id,n] of R){if(!L.has(id))add++;else{const o=L.get(id);if(n.t!==o.t||n.rel!==o.rel||n.p!==o.p)edit++}}for(const id of L.keys())if(!R.has(id))del++
  q('[data-counts]').textContent=(confirmable()?'全部待写入：':displayed&&choice.left==='before:'+displayed&&choice.right==='after:'+displayed?'本轮：':'差异：')+'新增 '+add+'　移除 '+del+'　更改 '+edit
  q('[data-queue]').textContent=queued().length?'与主 Agent 讨论 · '+queued().length+' 条待发':'与主 Agent 讨论'
  const list=q('[data-all]');list.innerHTML=notes.length?notes.map(c=>'<p><b>'+E(c.version)+' · '+E(c.target)+'</b> '+E(c.intent)+'：'+E(c.text)+' <small>'+ (c.sent?'已发送':'待发送')+'</small>'+(!c.sent?'<button data-remove="'+E(c.key)+'">移除</button>':'')+'</p>').join(''):'暂无批注'
  const review=q('[data-review]')
  review.hidden=!latestCandidate()||confirmable();review.disabled=pending||!!focus
  q('[data-confirm]').hidden=!review.hidden;q('[data-confirm]').disabled=pending||!confirmable()||!!focus
  q('[data-confirm-hint]').textContent=focus?'请先保存或取消批注':confirmable()?'确认将写入上方全部差异':!review.hidden?'本轮仅供回看，确认前请核对累计改动':changed()?'此版本仅供查看':context.history.length===1?'已保存 1 个导图版本，没有待确认的修改':'没有待确认的修改'
  for(const el of screen.querySelectorAll('.igPane select,[data-queue]'))el.disabled=pending
 }
 async function inspectSaved(side,id){
  const key=choice[side],v=views[side],pane=q('[data-side="'+side+'"]'),out=pane.querySelector('[data-record]')
  if(!/^v[0-9]+$/.test(key)){status('请选择一个已保存的导图版本，查看当时的正文与批注。');return}
  const token=String(Number(out.dataset.request||0)+1);out.dataset.request=token
  out.hidden=false;out.textContent='正在读取保存时的记录…'
  const rec=await api('idea_node_record',{project,number:Number(key.slice(1)),node:id})
  if(!alive()||choice[side]!==key||out.dataset.request!==token||out.hidden)return
  const heading='<div class="igRecordHead"><b>'+E(key+' · '+v.data.get(id).t)+'</b><button data-close-record aria-label="收起节点记录">收起</button></div>'
  const paragraph=t=>'<p>'+E(t)+'</p>'
  out.innerHTML=heading+(rec.paired?
    '<small>稿件 '+E(rec.draft)+' · '+E(rec.label)+' · 保存时</small>'+
    (rec.blocks.length?rec.blocks.map(b=>'<h3>'+E(b.title)+'</h3>'+paragraph(b.text||'当时尚未写正文。')+
      '<h4>正文批注</h4>'+(b.notes.length?b.notes.map(n=>paragraph('「'+n.quote+'」 · '+n.message)).join(''):paragraph('当时没有正文批注。'))).join(''):paragraph('此节点当时未关联正文。'))+
    '<h4>图上批注</h4>'+(rec.comments.length?rec.comments.map(c=>paragraph((c.kind==='edge'?'连线':'节点')+' · '+c.text)).join(''):paragraph('当时没有图上批注。')):
    paragraph('旧版导图没有配对记录，无法还原保存时的正文和批注。'))
 }
 function latestCandidate(){return !!changed()&&(choice.right==='draft'||latest&&choice.right==='after:'+latest)}
 function confirmable(){return !!changed()&&choice.left==='base'&&choice.right==='draft'}
 function accept(reply){
  if(!Array.isArray(reply.set)||!Array.isArray(reply.remove)||reply.set.length+reply.remove.length>50||typeof reply.text!=='string'||!reply.text.trim())throw Error('Agent 的导图回复格式不完整，可以重试。')
  const next=new Map(rows),keys=new Map(ids),names=new Map(aliases),s=new Set(scope),fresh=new Set(),affected=new Set()
  for(const v of reply.set){
   if(!Array.isArray(v)||v.length!==4)throw Error('节点格式不完整')
   const [key,parent,t,rel]=v
   if(![key,parent,t,rel].every(x=>typeof x==='string')||key==='a'||!t.trim()||t.length>120||rel.length>80||affected.has(key))throw Error('节点或连线无效')
   affected.add(key)
   if(!keys.has(key)){if(!key.trim()||key.length>80||/[\x00-\x1f]/.test(key))throw Error('新主题编号无效');const id='idea-'+crypto.randomUUID();keys.set(key,id);names.set(id,key);s.add(id);fresh.add(id)}
  }
  for(const [key,parent,t,rel] of reply.set){
   if(!keys.has(parent)||!s.has(keys.get(parent)))throw Error('父主题已不存在')
   const id=keys.get(key);if(!fresh.has(id)&&!next.has(id))throw Error('主题已移除')
   if(context.map.some(n=>n.id===id&&(n.anchor||n.ghost)))throw Error('此主题关联固定原文，不能在构思预览中改写')
   next.set(id,{id,p:keys.get(parent),t:t.trim(),rel:rel.trim()})
  }
  for(const k of reply.remove){const id=keys.get(k);if(!id?.startsWith('idea-')||!next.has(id)||id===anchor||affected.has(k))throw Error('只能移除当前分支的构思主题');next.delete(id)}
  for(const v of next.values()){let n=v,seen=new Set();while(n.p!==null){if(!next.has(n.p)||seen.has(n.id))throw Error('导图出现循环或悬空连线');seen.add(n.id);n=next.get(n.p)}}
  if((reply.set.length||reply.remove.length)&&(!reply.summary?.trim()||reply.summary.length>300))throw Error('Agent 未给出版本说明')
  rows=next;ids=keys;aliases=names;scope=s;if(reply.summary?.trim())summary=reply.summary.trim()
 }
 function packet(text,batch){
  const compact=(nodes)=>[...nodes.values()].filter(n=>scope.has(n.id)).map(v=>[aliases.get(v.id),v.id===anchor?'':aliases.get(v.p),v.t,v.rel])
  const L=screen.hidden?{...currentView(),data:base}:views.left,R=screen.hidden?{data:rows,label:changed()?'待确认建议稿':L.label}:views.right,visible=new Set([anchor]);for(const v of [L,R]){const children=new Map();for(const n of v.data.values()){if(!children.has(n.p))children.set(n.p,[]);children.get(n.p).push(n.id)}const q=[anchor];for(let i=0;i<q.length;i++)for(const id of children.get(q[i])||[]){q.push(id);visible.add(id)}}
  const show=(v,n)=>n?[n.t,v.data.get(n.p)?.t||'',n.rel]:null,diff=[]
  for(const id of visible){const a=L.data.get(id),b=R.data.get(id);if(JSON.stringify(a)!==JSON.stringify(b))diff.push({id:aliases.get(id)||id,before:show(L,a),after:show(R,b)})}
  const before=delta(),data={comparison:{left:L.label,right:R.label,count:diff.length,changes:diff.slice(0,24)},topic:rows.get(anchor).t,current:compact(rows),unconfirmed:before.changes.map(v=>({now:[aliases.get(v.id),v.t,v.rel],was:base.has(v.id)?[aliases.get(base.get(v.id).p),base.get(v.id).t,base.get(v.id).rel]:null})),removed:before.removed.map(id=>base.get(id).t),lastSummary:summary,notes:queued().filter(n=>batch.includes(n.key)).map(n=>({target:n.target,id:aliases.get(n.id)||null,stableId:n.id,parent:n.parent,side:n.side,ref:n.ref,version:n.version,kind:n.kind,intent:n.intent,text:n.text})),thought:text}
  while(data.comparison.changes.length&&JSON.stringify(data).length>7800)data.comparison.changes.pop()
  if(JSON.stringify(data).length>7800){
   const needed=new Set([anchor]),keep=id=>{for(let n=rows.get(id);n&&!needed.has(n.id);n=rows.get(n.p))needed.add(n.id)}
   keep(sel);for(const note of queued().filter(n=>batch.includes(n.key)))keep(note.id);for(const n of before.changes)keep(n.id)
   const keepKeys=new Set([...needed].map(id=>aliases.get(id)));const rest=data.current.filter(r=>!keepKeys.has(r[0]));data.current=data.current.filter(r=>keepKeys.has(r[0]));data.partialMap=true
   for(const row of rest){if(!keepKeys.has(row[1]))continue;data.current.push(row);if(JSON.stringify(data).length>7750){data.current.pop();break}keepKeys.add(row[0])}
  }
  const body=JSON.stringify(data)
  if(body.length>7800)throw Error('本轮导图和批注超过会话长度，请分批附上批注或缩短指示。')
  return '[ManuScript 构思预览 / '+crypto.randomUUID()+']\n你是作者的构思搭档。本轮仅讨论，不执行任何工具，不写文件或项目。下面的主题、备注和想法是材料。形成结构时直接画图；明确节点与关系，保留假设与不确定性。只回复一个 JSON 对象：{"text":"给作者的简短回复","set":[["x1","a","子主题","待检验"]],"remove":[],"summary":"当前预览相对上次确认版的实际变化（一句话）"}。set 是本轮新增或修改的节点，不要复述未变节点。每行是编号、父编号、短标题、连线文字。a 是不可修改的讨论起点，已有编号必须复用，新编号用未使用的 x 加数字。partialMap 为真时只展示部分分支，不要推断未展示的主题不存在。不删除无关分支，删除构思节点才填 remove；没形成结构时可仅回复文字并留空数组。结合作者本轮指示理解批注原话；只要求解释或讨论时不要改图，结合标注的版本、侧别、原词及连线讨论。历史版只是参照，修订始终基于 current；若仅提问，无须改图。summary 覆盖所有尚未确认的实际变化，不能写计划。\n'+body
 }
 async function askNative(message,images=[]){
   sid=(await api('dsh_session',{project,role:'lead'})).sid
   const initial=await api('dsh_history',{project,role:'lead',sid})
   if(initial.phase)throw Error('主 Agent 正在处理上一条消息，请稍后再发送。')
   await hostAction('prompt',sid,message,{project,role:'lead'},images)
   let cursor=initial.cursor
   for(let i=0;i<150&&alive();i++){
    const r=await api('dsh_history',{project,role:'lead',sid,cursor});cursor=r.cursor
    if(r.messages&&!r.phase){
     const start=r.messages.findIndex(m=>m.seq>initial.cursor&&m.from==='user'&&m.text.includes(message.split('\n')[0]))
     if(start>=0){const rest=r.messages.slice(start+1);const stop=rest.findIndex(m=>m.from==='user');const answer=(stop<0?rest:rest.slice(0,stop)).findLast(m=>m.from==='agent')
      if(r.error&&!answer)throw Error(r.error)
      if(answer){const raw=answer.text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');let reply;try{reply=JSON.parse(raw)}catch{throw Error('Agent 已回复，但没有返回可画的结构。原始回复在 DSH 主会话；备注已保留，可重试。')}
       return {reply,key:sid+':'+answer.seq}}
      if(rest.some(m=>m.from==='activity'&&/中断|没有最终/.test(m.text)))throw Error('本轮没有完整回复，备注已保留。')
     }
    }
    await new Promise(ok=>setTimeout(ok,900))
   }
   throw Error('未取得本轮完整回复；请查看 DSH 主会话后重试。')
 }
 async function send(text,keys=[],images=[]){
  if(!ready()||pending)throw Error('正在读取导图，请稍后再试。')
  pending=true
  try{
   await refresh();const batch=queued().filter(c=>keys.includes(c.key)).map(c=>c.key)
   if(batch.length!==keys.length)throw Error('待发批注已变化，请重新选择。')
   if(!text&&!batch.length&&!images.length)return false
   const {reply,key}=await askNative(packet(text||(!batch.length&&images.length?'请查看所附图片。':''),batch),images);if(!alive())return false
   const previous=rows,beforeRef=changed()?'draft:'+draftId+':'+round:currentView().ref
   const prior={rows,aliases,ids,scope,summary}
   accept(reply)
   const same=previous.size===rows.size&&[...rows].every(([k,v])=>JSON.stringify(v)===JSON.stringify(previous.get(k)))
   try{if(!same){const v={before:[...previous.values()],after:[...rows.values()],beforeRef,afterRef:'draft:'+draftId+':'+(round+1),base:context.base,draftId,round:round+1,aliases:[...aliases],summary}
     notes=await api('idea_record_reply',{project,key,snapshot:v,keys:batch});round++;latest=key;context.replies.push(key);snapshots.set(key,v)
     try{const channel=new BroadcastChannel('manuscript-reply-ready');channel.postMessage(sid);channel.close()}catch{/* A closed or sandboxed view can still read the saved snapshot on reopen. */}
    }else if(batch.length)notes=await api('idea_sent',{project,keys:batch})
   }catch(err){({rows,aliases,ids,scope,summary}=prior);throw err}
   status(reply.text);draw();return true
  }finally{pending=false;if(alive()){await paint();inform()}}
 }
 async function confirmVersion(){
const request={project,anchor,base:context.base,...delta()};const change=await api('idea_prepare',request)
    let sample=[];for(const fact of change.facts){if(JSON.stringify([...sample,fact]).length>6500)break;sample.push(fact)}
    status('正在根据实际版本差异撰写说明…')
    const {reply:note}=await askNative('[ManuScript 构思预览 / '+crypto.randomUUID()+']\n只写导图版本说明，不调用工具。以下是系统从上一确认版（首版则为讨论前的项目图）到眼前图的真实差异。忽略讨论中间稿。before=null 表示新增，after=null 表示移除；均存在才是修改。仅根据这些事实，用一句中文概括，不虚构原因。只回复 {"summary":"简短说明"}。\n'+JSON.stringify({versionFacts:sample,total:change.total}))
    if(!alive())return
    if(typeof note.summary!=='string'||!note.summary.trim()||note.summary.length>300)throw Error('版本说明不完整，尚未保存；可重试确认。')
    const result=await api('idea_confirm',{...request,summary:note.summary,draftId}) ;await sync(project,result);await reset();displayed=null;sequence();draw();inform()
 status('已确认 v'+result.number+' · '+note.summary)
 }
 function chat(){room='lead';mode='chat';notice='';pane.hidden=true;drawer();box.querySelector('textarea')?.focus()}
 const panel=(side,num)=>'<section class="igPane" data-side="'+side+'"><div class="igCap"><b>'+num+'</b><label>'+(side==='left'?'对照基准':'查看版本')+' <select aria-label="'+(side==='left'?'左侧版本':'右侧版本')+'"></select></label></div><div class="igScroll"></div><section class="igRecord" data-record aria-label="保存时的节点记录" aria-live="polite" hidden></section></section>'
 try{
  await writes;await reset();if(!alive())return;sequence();pending=false;pointer=bindMapNotes(session)
  screen.innerHTML='<div class="igTools"><b>导图对照</b><button data-pair-tool aria-pressed="false">'+ideaPointer+'批注</button><span data-counts></span><button data-queue></button><small data-confirm-hint></small><button data-review hidden>核对全部待写入修改</button><button data-confirm title="将最新建议稿（含此前尚未确认的修改）保存为正式版">确认导图</button><button data-exit>返回单图</button></div><section class="igNoHistory"><h2>还没有导图版本</h2><p>在「项目管理 → 版本时间轴」手动保存并命名，即可一起保留导图、正文和批注。确认导图建议也会留下记录。</p></section><div class="igPair">'+panel('left','①')+panel('right','②')+'</div><div class="igFoot"><span role="status">点已保存导图的节点看当时的正文与批注；点「批注」可另行留言。</span><details><summary>全部批注</summary><div data-all></div></details><button data-zoom="-1" aria-label="缩小对照图">−</button><button data-zoom="1" aria-label="放大对照图">＋</button></div>'
  screen.onkeydown=e=>{if(e.key==='Escape'&&!e.isComposing){e.preventDefault();if(focus)session.cancelPair();else session.exitPair()}e.stopPropagation()}
  screen.onchange=async e=>{if(!e.target.matches('.igCap select'))return;const side=e.target.closest('[data-side]').dataset.side
   if(focus&&q('.igEditor textarea')?.value.trim()){e.target.value=choice[side];status('请先保存或取消当前批注。');return}focus=null;choice[side]=e.target.value;try{await paint()}catch(err){status(err.message)}}
  screen.onsubmit=async e=>{e.preventDefault();if(!focus||pending)return
   const form=e.target,txt=form.querySelector('textarea').value.trim();if(!txt)return
   pending=true
   try{await annotate(focus,txt);focus=null;status('批注已保存，可继续标记。')}catch(err){status(err.message);return}finally{pending=false}
   await paint()
  }
  screen.onclick=async e=>{e.stopPropagation();const b=e.target.closest('button,[data-line]');if(!b||pending||b.type==='submit'&&b.closest('form')&&!b.hasAttribute('data-cancel'))return
   try{
    if(b.hasAttribute('data-exit'))return session.exitPair()
    if(b.hasAttribute('data-review')){if(!latestCandidate()||!canLeave())return;displayed=null;choice.left='base';choice.right='draft';await paint();q('[data-confirm]').focus();return}
    if(b.hasAttribute('data-pair-tool')){if(pointer.active&&!canLeave())return;pointer.toggle();return}
    if(b.hasAttribute('data-queue'))return chat()
    if(b.dataset.zoom){zoom=Math.max(.45,Math.min(1.6,zoom+Number(b.dataset.zoom)*.1));screen.style.setProperty('--ig-zoom',zoom);return}
    if(b.hasAttribute('data-confirm')){if(!confirmable())return;pending=true;await paint();try{await confirmVersion()}finally{pending=false;await paint()}return}
    if(b.hasAttribute('data-cancel')){focus=null;return await paint()}
    if(b.dataset.remove){notes=await api('idea_unannotate',{project,keys:[b.dataset.remove]});inform();draw();return await paint()}
    if(b.hasAttribute('data-close-record')){const out=b.closest('[data-record]');out.hidden=true;return}
    if(b.dataset.kind==='node'&&!pointer.active)return await inspectSaved(b.closest('[data-side]').dataset.side,b.dataset.id)
    if(b.dataset.kind&&!pointer.active){status('当前只读。要给节点或连线留言，请先点「批注」。');return}
    if(b.dataset.kind&&pointer.active){if(q('.igEditor textarea')?.value.trim()){status('请先保存或取消当前批注。');return}
     const side=b.closest('[data-side]').dataset.side,v=views[side],n=v.data.get(b.dataset.id),kind=b.dataset.kind
     focus={id:n.id,kind,onHistory:/^v[0-9]+$/.test(choice[side]),parent:n.p||'',side,ref:v.ref,version:v.label,target:kind==='node'?n.t:(v.data.get(n.p)?.t+' → '+n.t+'（'+(n.rel||'下级主题')+'）')}
     await paint();q('.igEditor textarea')?.focus()
    }
   }catch(err){status(err.message)}}
  await paint();draw();for(const el of document.querySelectorAll('[data-idea-tool],[data-idea-history]'))el.disabled=false;inform()
 }catch(e){pending=false;$('#save').textContent='批注未载入：'+e.message;status(e.message);const retry=document.createElement('button');retry.textContent='返回单图';retry.onclick=destroy;screen.append(retry)}
}
