import {openSample} from '../core.mjs'
import {authorAPI,agentTool,dshModel,page,toolDefs,python} from './bridge.mjs'
import {createRecall} from './flash-jev.mjs'
import {nativeHost,registerBoundTools} from './native.mjs'
import {requireProjectWrite} from './dsh-policy.mjs'
import {registerManuscriptContext} from './native-context.mjs'
export const name='manuscript'
export const inject=['tools','connection','llm','attachments','workspaceRegistry','sessionController','sessions','sessionQuery','agents','agentPresets','permissionPresets','sandboxPolicy','sessionProjections','commands','systemPrompt']
export function apply(ctx){
 const recall=createRecall(ctx,{call:dshModel(ctx),db:(op,a)=>python('dsh','binding',op,a),lookup:sid=>python('dsh','binding','native_lookup',{sid})})
 const native=nativeHost(ctx,recall);registerBoundTools(ctx);registerManuscriptContext(ctx,recall)
 const register=(name,description,props,execute,required=Object.keys(props))=>ctx.tools.register({name,description,parameters:{type:'object',properties:props,required,additionalProperties:false},execute,output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]}})
 register('manuscript_open_sample','读取早期兼容样稿',{version:{type:'string'}},({version})=>openSample(version),[])
 for(const [n,d,props] of toolDefs)register('manuscript_'+n,d,Object.fromEntries(Object.entries(props).map(([k,type])=>[k,{type}])),async(a,exec)=>{if(n==='deliver')requireProjectWrite(ctx,exec);
  const b=await python('dsh','binding','native_lookup',{sid:exec.agent?.session?.header.id||''});
  if(b&&n!=='workbench'){
   await python('dsh','agent','role_check',{project:b.project,actorRole:b.role,tool:n==='source'?'read_source':'team_status'});
   if(a.project&&a.project!==b.project)throw Error('绑定角色只能读取自己的项目');
   a={...a,project:b.project,actorRole:b.role};
   if(n==='projects'){const p=await python('dsh','agent','state',a);return {result:[{id:p.id,title:p.title}]}}
  }
  return {result:await agentTool('dsh',n,a)}})
 for(const [path,method,handler] of [
 ['/api/manuscript.workspace','GET',async req=>new Response(await page('manuscript.action','','dsh',new URL(req.url).searchParams.get('view')),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})],
 ['/api/manuscript.action','POST',async req=>{
  try{if(!req.headers.get('content-type')?.startsWith('application/json'))throw Error('只接受 JSON')
  const {op,args}=await req.json();if(op.startsWith('dsh_')){if(req.headers.get('sec-fetch-site')==='cross-site')throw Error('请从本机 DSH 打开');return Response.json({result:await native(op,args||{})})}const result=await authorAPI('dsh',dshModel(ctx),op,args||{},ctx);if(op==='team_route'||op==='team_follow')await native('apply_routes',{...args,changedRole:op==='team_route'?args.role:null});return Response.json({result})
  }catch(e){return Response.json({error:e.message},{status:400})}
 }]])ctx.effect(()=>ctx.connection.fetch.register({path,methods:[method],requestBody:'buffered',fetch:handler}))
}
