// No independent permission setting is persisted by ManuScript. Use the actual execution's agent.
function actualPlan(ctx,agent){
 const offered=!!ctx.commands.find(agent,'plan')
 if(!offered)return {offered,active:agent.session.snapshotEvents().findLast(e=>e.type==='plan/mode')?.data.active===true,pending:null}
 const s=ctx.sessionProjections.stateOf(agent.session,'plan')
 if(!s||typeof s.active!=='boolean')throw Error('无法确认 DSH 规划状态')
 return {offered,active:s.active,pending:s.running?.wanted??s.wanted??null}
}
export function requireProjectWrite(ctx,exec){
 const agent=exec?.agent
 if(!agent?.session)throw Error('缺少 DSH 会话，不能写入项目')
 const lastUser=agent.session.snapshotEvents().findLast(e=>e.type==='user/message'&&(e.data?.message||e.data)?.source?.kind==='user');
 if((lastUser?.data?.message||lastUser?.data)?.content?.some(c=>c.type==='text'&&c.text?.startsWith('[ManuScript 构思预览 / ')))throw Error('本轮仅预览；只能由作者在图旁确认')
 const plan=actualPlan(ctx,agent)
 if(plan.active||plan.pending===true)throw Error('当前是 Plan 模式：可讨论和读取，不能更改项目')
 const mode=ctx.sandboxPolicy.resolve({session:agent.session}).mode
 if(!['workspace-write','danger-full-access'].includes(mode))throw Error('DSH 会话未获写入权限，项目没有修改')
}
export function options(ctx){
 return ctx.permissionPresets.catalog().options.map(o=>{
  const spec=ctx.permissionPresets.resolve(o.value)
  return {id:o.value,name:o.name,wide:spec.sandbox==='danger-full-access',approval:spec.approval}
 })
}
export function policySnapshot(ctx,session,events,header,id){
 const last=(type,key)=>events.findLast(e=>e.type===type)?.data[key]
 const service=ctx.permissionPresets,agent=ctx.agents.get(id)
 const knobs=session?service.permissionState(session):{sandbox:last('sandbox/mode','mode'),approval:last('approval/policy','policy'),preset:last('permission/preset','preset')}
 const plan=agent?actualPlan(ctx,agent):{active:last('plan/mode','active')===true}
 return {canPlan:agent?plan.offered:true,permission:session?service.current(session):service.derive(knobs),sandbox:knobs.sandbox,approval:knobs.approval,plan:plan.active,pending:plan.pending??null,
 preset:last('agent-preset/selected','agentPreset')||header?.agentPreset||'',started:events.some(e=>e.type==='turn/start')}
}
