// DSH owns the session transcript, agent lifecycle and tool permissions.
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {realpath} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {python} from './bridge.mjs'
import {publicAuthorText} from './native-context.mjs'
import {roleFor} from './team.mjs'
import {questionService,questionTurns} from './draft-questions.mjs'
import {receiptIndex,previewRows} from './reply-changes.mjs'
import {projectTools} from './project-tools.mjs'
import {options,policySnapshot,requireProjectWrite} from './dsh-policy.mjs'
const db=(op,args)=>python('dsh','binding','native_'+op,args)
export function nativeHost(ctx,recall){
 const questions=questionService(ctx,db,python)
 const busy=new Map(),bound=new Map()
 const single=(key,fn)=>{if(!busy.has(key))busy.set(key,fn().finally(()=>busy.delete(key)));return busy.get(key)}
 const workspace=async path=>await ctx.workspaceRegistry.resolveByPath(path)||await ctx.workspaceRegistry.create(path)
 async function applyRoute(sid,team,role){
  const route=team.routes[team.followLead?'lead':role]||team.routes.lead;if(!route)return
  const ag=ctx.agents.get(sid)||(await ctx.sessionController.resolveAgent(sid))?.agent;if(!ag)throw Error('会话模型暂未同步，请重新打开该成员')
  ag.model.select({provider:route.provider,model:route.model})
 }
 const modalityCache=new Map()
 async function imageCapability(sid,fresh=false){
  try{
   const ag=ctx.agents.get(sid)||(await ctx.sessionController.resolveAgent(sid))?.agent,route=ag?.model.current()
   if(!route?.model)return {state:'unknown',model:''}
   const key=JSON.stringify([route.provider,route.model]),cached=modalityCache.get(key)
   if(!fresh&&cached&&cached.until>Date.now())return cached.value
   const meta=await ctx.llm.resolveModelInfo(route.provider,route.model),value={model:route.model,state:Array.isArray(meta?.inputModalities)?(meta.inputModalities.includes('image')?'supported':'unsupported'):'unknown'}
   modalityCache.set(key,{until:Date.now()+60000,value});return value
  }catch{return {state:'unknown',model:''}}
 }
 const streams=new Map()
 ctx.on('agent/assistant-stream',({agent,frame:f})=>{const id=agent.session.id;if(!bound.has(id))return
  if(f.type==='end'){streams.delete(id);return}if(f.type==='start'){streams.set(id,{id:f.attemptId,parts:new Map(),rev:f.revision});return}
  const s=streams.get(id),c=f.chunk;if(s?.id!==f.attemptId||!c)return
  if(c.type==='text-delta')s.parts.set(c.index,((s.parts.get(c.index)||'')+c.text).slice(-64000));else if(c.type==='block-end'&&c.block?.type==='text')s.parts.set(c.index,c.block.text.slice(-64000));s.rev=f.revision
 })
 ctx.on('session/disposed',s=>{streams.delete(s?.session?.id||s?.id)})
 async function session(a){
  roleFor(await python('dsh','author','team_state',{project:a.project}),a.role)
  const key=JSON.stringify([a.project,a.role])
  return single(key,async()=>{
   const path=await db('folder',a);if(await realpath(path)!==path)throw Error('绑定路径已经变化，请检查文件夹')
   const ws=await workspace(path),args={project:a.project,role:a.role,workspace:ws.id},r=await db('reserve',args),id=r.sid
   if(ctx.workspaceRegistry.archivedSessionIds.includes(id))throw Error('此会话已归档，请在 DSH 恢复后再打开')
   if(!ws.sessionIds.includes(id)){
    if(r.ready)throw Error('原会话已移出工作区；请先在 DSH 恢复其归属')
    const created=await ctx.sessionController.create({workspaceId:ws.id,sessionId:id})
    if(created.sessionId!==id)throw Error('DSH 未返回原绑定会话；未切换历史')
   }
   const team=await python('dsh','author','team_state',{project:a.project});if(!r.ready||team.followLead)await applyRoute(id,team,a.role);
   if(!r.ready){
    await ctx.sessionController.rename({sessionId:id,title:'ManuScript · '+roleFor(team,a.role).name})
    await db('ready',{...args,sid:id})
   }
   bound.set(id,{...args,path});return {sid:id,workspace:ws.id,path}
  })
 }
 async function verify(a){
  const b=bound.get(a.sid)
  if(!b||b.project!==a.project||b.role!==a.role)throw Error('会话连接已过期，请重新点击头像')
  roleFor(await python('dsh','author','team_state',{project:a.project}),a.role)
  const ws=ctx.workspaceRegistry.get(b.workspace)
  if(!ws?.sessionIds.includes(a.sid)||ctx.workspaceRegistry.archivedSessionIds.includes(a.sid))throw Error('该会话已离开工作区或已归档')
 }
 async function history(a){
  await verify(a);const requestContexts=await db('request_list',{sid:a.sid});let observation
  try{
   const live=ctx.sessions.get(a.sid),events=live?.snapshotEvents()||(observation=await ctx.sessionQuery.observeSession(a.sid,{projectionMode:'none',signal:AbortSignal.timeout(5000)})).events
   await questions.sync(a.sid,events,requestContexts,a)
   const cursor=events.at(-1)?.seq??-1;const policy=policySnapshot(ctx,live,events,live?.header||observation?.header,a.sid);policy.images=await imageCapability(a.sid);const liveStream=streams.get(a.sid),partial=liveStream?[...liveStream.parts.values()].join(''):'';if(cursor===a.cursor)return {cursor,policy,partial}
   let phase='',error='',answered=false;const messages=[],calls=new Map();const log=(seq,text)=>messages.push({seq,from:'activity',text})
   for(const e of events){const d=e.data||{},m=d.message||d
    if(e.type==='turn/start'){phase='DSH 正在处理';error='';answered=false}
    if(e.type==='turn/end'){phase='';const why=d.reason?.kind;if(why==='error')error=String(d.reason?.error?.message||'DSH 执行失败');else if(!answered||['interrupted','aborted','cancelled','stopped','blocked','max-tokens'].includes(why))log(e.seq,'本轮'+(['interrupted','aborted','cancelled','stopped','blocked','max-tokens'].includes(why)?'已中断':'已结束')+(answered?'':'，没有最终文字答复')+'。可在此会话继续。')}
    if(e.type==='tool/call'){answered=false;calls.set(d.callId,d.name);phase=d.name==='ask_user_question'?'等待你的回答 · 请在 DSH 中继续':/read_block|project/.test(d.name)?'正在查阅正文':/evidence|source|search/.test(d.name)?'正在核对资料':'正在处理你的问题'}
    if(e.type==='tool/result'){const label=calls.get(m.source?.callId)||m.toolName||m.name||d.name||'工具';phase='DSH 正在处理';if(m.isError||m.error||d.error||m.source?.isError)log(e.seq,'本轮有一步未能完成，Agent 正在处理')}
    if(e.type==='approval/asked'){phase='等待授权：'+(d.toolName||'工具')+' · 请在 DSH 中继续';log(e.seq,phase+(typeof d.reason==='string'?' · '+d.reason:''))}
    if(e.type==='approval/decided'){phase='DSH 审批：'+(d.outcome||'已处理');log(e.seq,phase)}
    if(e.type==='agent/error'||e.type==='step/error'){error=String(d.message?.message||d.error?.message||d.message||'DSH 执行失败');phase=''}
    if(e.type==='user/message'||e.type==='assistant/message'){
     if(e.type==='user/message'&&m.source?.kind!=='user')continue
     const text=(m.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n')
     if(text&&e.type==='assistant/message')answered=true;const images=(m.content||[]).filter(x=>x.type==='image').map(x=>x.attachment?.name||x.name||'图片');if(text||images.length)messages.push({seq:e.seq,from:e.type==='user/message'?'user':'agent',text:e.type==='user/message'?publicAuthorText(text):text,images,refs:requestContexts[m.source?.rpcId]?.refs||[]})
    }
   }
   const receipts=receiptIndex(events)
   for(const m of messages)if(m.from==='agent'&&receipts.has(m.seq))m.changeKinds=[...new Set(receipts.get(m.seq).map(v=>v.kind))]
   return {cursor,messages,phase,error,policy,partial}
  }finally{observation?.[Symbol.dispose]()}
 }
 return async(op,a)=>{
  if(['dsh_metadata','dsh_remove','dsh_removed','dsh_restore_card'].includes(op))return db(op.slice(4),a)
  if(op==='dsh_reveal'){const path=await realpath(await db('folder',{project:a.project}));await promisify(execFile)(process.platform==='darwin'?'/usr/bin/open':process.platform==='win32'?'explorer.exe':'xdg-open',[path]);return true}
  if(op==='apply_routes'){const team=await python('dsh','author','team_state',a);for(const r of await db('bindings',a)){if(!team.roles[r.role]?.enabled)continue;if(a.changedRole&&!team.followLead&&r.role!==a.changedRole)continue;if(ctx.workspaceRegistry.get(r.workspace)?.sessionIds.includes(r.sid)&&!ctx.workspaceRegistry.archivedSessionIds.includes(r.sid))await applyRoute(r.sid,team,r.role)}return true}
  if(op==='dsh_reply_index'||op==='dsh_reply_detail'){
   if(typeof a.sid!=='string'||!/^session-[a-zA-Z0-9-]+$/.test(a.sid))return op==='dsh_reply_index'?{}:[]
   const binding=await db('reply_previews',{sid:a.sid})
   if(!binding)return op==='dsh_reply_index'?{}:[]
   let observation
   try{
    const events=ctx.sessions.get(a.sid)?.snapshotEvents()||(observation=await ctx.sessionQuery.observeSession(a.sid,{projectionMode:'none',signal:AbortSignal.timeout(5000)})).events
    const index=receiptIndex(events)
    for(const seq of binding.keys){if(!index.has(seq))index.set(seq,[]);index.get(seq).push({kind:'map',preview:true})}
    if(op==='dsh_reply_index'&&binding.questions.length){
     const turns=questionTurns(events)
     for(const turn of turns.values()){const seq=turn?.answer?.seq;if(!turn?.ended||seq==null)continue
      if(!index.has(seq))index.set(seq,[]);index.get(seq).push({kind:'question'})}
    }
    if(op==='dsh_reply_index')return Object.fromEntries([...index].map(([seq,entries])=>[seq,[...new Set(entries.map(v=>v.kind))]]))
    const project=binding.project,entries=(index.get(a.seq)||[]).filter(v=>v.kind===a.kind)
    return await Promise.all(entries.map(async v=>{
     if(v.preview){const r=await python('dsh','author','idea_reply',{project,key:a.sid+':'+a.seq});return {kind:'map',status:'第 '+r.round+' 轮建议稿',rows:previewRows(r.before,r.after)}}
     if(v.kind==='draft'){return python('dsh','author','writing_suggestions',{project,id:v.id,diff:true})}
     return v
    }))
   }finally{observation?.[Symbol.dispose]()}
  }
  if(op==='dsh_library')return db('library',{})
  if(op==='dsh_bind'){const b=await db('bind',a),ws=await workspace(b.path);return {...b,workspace:ws.id}}
  if(op==='dsh_session')return session(a)
  if(op==='dsh_image_capability'){await verify(a);return imageCapability(a.sid,true)}
  if(op==='dsh_controls'){await verify(a);return {access:options(ctx),presets:(await ctx.agentPresets.list()).filter(x=>!x.broken).map(({id,name})=>({id,name:typeof name==='string'?name:id}))}}
  if(op==='dsh_question_targets'){
   const b=await db('lookup',{sid:a.sid});if(!b)return []
   const c=await python('dsh','author','draft_context',{project:b.project})
   return c.notes.filter(n=>n.qa?.sid===a.sid).map(n=>({project:b.project,key:n.qa.key,quote:n.quote,linked:n.qa.turns.some(t=>t.seq===a.seq)}))
  }
  if(op==='dsh_question_recover'){
   const b=await db('lookup',{sid:a.sid});if(b?.project!==a.project)return false
   const req=await db('request_list',{sid:a.sid});if(!Object.values(req).some(r=>r.question&&!r.done))return false
   let obs;try{const events=ctx.sessions.get(a.sid)?.snapshotEvents()||(obs=await ctx.sessionQuery.observeSession(a.sid,{projectionMode:'none',signal:AbortSignal.timeout(5000)})).events
    await questions.sync(a.sid,events,req,b);return true
   }finally{obs?.[Symbol.dispose]()}
  }
  if(op==='dsh_question_sent'){await verify(a);await questions.sent(a);return true}
  if(op==='dsh_question_excerpt'){
   const b=await db('lookup',{sid:a.sid});if(!b||b.project!==a.project)throw Error('旁注不属于此会话')
   let obs;try{const events=ctx.sessions.get(a.sid)?.snapshotEvents()||(obs=await ctx.sessionQuery.observeSession(a.sid,{projectionMode:'none',signal:AbortSignal.timeout(5000)})).events
    return await questions.replace({...a,project:b.project},events)
   }finally{obs?.[Symbol.dispose]()}
  }
  if(op==='dsh_prepare'){
   await verify(a);if(!Array.isArray(a.refs)||a.refs.length>20||typeof a.requestId!=='string')throw Error('正文引用格式不正确')
   const refs=[];for(const ref of a.refs){if(ref.project!==a.project)throw Error('正文引用属于另一项目');const ctx=await python('dsh','author','draft_context',{...ref,project:a.project}),r=ctx.selection
    if(ref.thread){const head=await python('dsh','author','draft_context',{project:a.project}),note=head.notes.find(n=>n.qa?.key===ref.thread&&n.qa.sid===a.sid);if(!note)throw Error('这条追问已移除或不属于当前会话');r.thread=ref.thread}
    refs.push(r)}
   await db('request_save',{sid:a.sid,requestId:a.requestId,body:{refs,...(refs.length&&typeof a.question==='string'&&a.question.trim()?{question:a.question.trim().slice(0,8000)}:{})}});return true
  }
  if(op==='dsh_recall_state')return recall.state(a.sid?{project:a.project,role:a.role,sid:a.sid}:{project:a.project})
  if(op==='dsh_recall_search')return recall.search({project:a.project},a.query)
  if(op==='dsh_recall_correct')return recall.correct({project:a.project,role:a.role,sid:a.sid},a.seq,a.text)
  if(op==='dsh_recall_toggle'){
   if(a.sid||a.role)throw Error('请从项目设置调整思路回看')
   const address={project:a.project},cursors={}
   if(a.enabled&&!(await recall.state(address)).enabled){
    for(const {sid} of await db('bindings',address)){
     if(ctx.workspaceRegistry.archivedSessionIds.includes(sid)){cursors[sid]=Number.MAX_SAFE_INTEGER;continue}
     let observation;try{const events=ctx.sessions.get(sid)?.snapshotEvents()||(observation=await ctx.sessionQuery.observeSession(sid,{projectionMode:'none',signal:AbortSignal.timeout(5000)})).events
      cursors[sid]=events.at(-1)?.seq??-1
     }finally{observation?.[Symbol.dispose]()}
    }
   }
   return recall.toggle(address,a.enabled,cursors)
  }
  if(op==='dsh_history')return history(a)
  throw Error('未知的 DSH 操作')
 }
}
export function registerBoundTools(ctx){
 for(const spec of projectTools){
  const scoped=['build_outline','propose_topic'].includes(spec.name)
  const parameters=scoped?{...spec.parameters,properties:{...spec.parameters.properties,node:{type:'string',description:'目标节点 ID；项目根为 root'}}}:spec.parameters
  ctx.tools.register({...spec,name:'manuscript_'+spec.name,parameters,execute:async(a,exec)=>{
   const b=await db('lookup',{sid:exec.agent?.session?.header.id||''});if(!b)throw Error('请从 ManuScript 项目头像开启绑定会话')
   const member=await python('dsh','agent','role_check',{...a,project:b.project,actorRole:b.role,tool:spec.name})
   const run=(op,args)=>{if(!['state','draft_context','source_read','evidence_search','artifact_read'].includes(op))requireProjectWrite(ctx,exec);return python('dsh','agent',op,{...args,project:b.project,actorRole:b.role})},actor=member.name
   switch(spec.name){
    case 'team_status':return python('dsh','agent','role_status',{project:b.project,actorRole:b.role})
    case 'assign_task':return run('role_assign',a)
    case 'deliver_task':{const p=await run('deliver',a);return p.delivery||{status:'已交付',task:a.id}}
    case 'read_block':return run('draft_context',a)
    case 'find_evidence':return {hits:(await run('evidence_search',a)).slice(0,6)}
    case 'read_source':return run('source_read',a)
    case 'read_file':return run('artifact_read',a)
    case 'write_file':return run('artifact_write',{...a,actor})
    case 'write_block':return run('chat_write_block',{...a,actor})
    case 'map_arguments':return run('team_arguments',a)
    case 'build_outline':return run('team_outline',{rows:a.rows,parent:a.node||'root',turn:randomUUID()})
    case 'propose_topic':{const t=await python('dsh','author','team_state',{project:b.project}),n=t.map?.find(n=>n.id===(a.node||'root'));if(!n)throw Error('请选择现有节点');return run('team_proposal',{proposal:{kind:a.kind,text:a.text,node:n.id,base:n.t,actor}})}
   }
  },output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]}})
 }
}
