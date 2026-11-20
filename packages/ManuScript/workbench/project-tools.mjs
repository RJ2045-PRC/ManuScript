import http from 'node:http'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
const str={type:'string'},int={type:'integer'}
const declarations=[
 ['team_status','读取当前角色职责、权限、任务分工和唯一执笔人。',{ }],
 ['assign_task','仅主 Agent 分派或重新分派任务。作者可继续编辑，写作交付为待核对候选稿；重派填写 id 和 fromRole，新任务 id / fromRole 填空字符串、taskRev 填 0；重派用 team_status 中的 taskRev。',{id:str,taskRev:int,fromRole:str,assignee:str,kind:{type:'string',enum:['写作','搜证','审查','支持','内审']},block:str,instruction:str}],
 ['deliver_task','交付分派给当前真实角色的任务；不能自验收或代签。',{id:str,taskRev:int,result:{type:'object',additionalProperties:true}}],
 ['build_outline','直接把讨论出的多级结构搭在当前地图上，可编辑的 Agent 草稿节点，不是作者确认或正文完成。同一父节点下按标题去重。',{rows:{type:'array',items:{type:'object',properties:{path:{type:'array',items:str},detail:str},required:['path','detail'],additionalProperties:false}}}],
 ['map_arguments','从已写正文提取可编辑的论证节点。先读正文，提供原文中唯一的连续短引。保留现有节点。',{block:str,rev:int,points:{type:'array',items:{type:'object',properties:{kind:{type:'string',enum:['主张','依据','限制','下一步']},title:str,quote:str},required:['kind','title','quote'],additionalProperties:false}}}],
 ['read_file','读取当前项目的文本文件及修改所需的 sha。',{name:str}],
 ['write_file','在本项目实际创建或修订文本文件，创建 base=null，修订 base=读到的 sha。成功会生成可下载版本。',{name:str,base:{type:['string','null']},text:str}],
 ['find_evidence','检索本项目已附加原件的段落。结果含永久片段标识、页码、文件哈希和原文；检索相关性不等于证据支持。',{query:str}],
 ['read_source','按项目来源 ID、页码读取原始资料。',{source:str,page:int}],
 ['read_block','读取正文块当前文本、修订号、Draft 版本和作者批注（含原文位置与系统时间）。',{block:str}],
 ['write_block','按 read_block 的 rev 保存完整正文候选稿；基线变化也保留为待核对建议，不直接覆盖正文。',{block:str,rev:int,text:str}],
 ['propose_topic','为当前地图主题提出新增子主题或改名建议，交作者审核。',{kind:{type:'string',enum:['child','rename']},text:str}]
]
export const projectTools=declarations.map(([name,description,properties])=>({name,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}))
export async function scopedMcp(dir,invoke){
 const sock=join(dir,'t.sock'),server=http.createServer(async(req,res)=>{try{if(req.method!=='POST')throw Error('无效请求');let n=0,bs=[];for await(const b of req){if((n+=b.length)>900000)throw Error('调用参数过大');bs.push(b)}const c=JSON.parse(Buffer.concat(bs));const result=await invoke(c);res.end(JSON.stringify({result}))}catch(e){res.end(JSON.stringify({error:e.message}))}})
 await new Promise((ok,no)=>{server.once('error',no);server.listen(sock,ok)})
 const entry=fileURLToPath(new URL('project-tool-server.mjs',import.meta.url))
 return {args:['-c','mcp_servers.manuscript_project.default_tools_approval_mode="approve"','-c','mcp_servers.manuscript_project.command='+JSON.stringify(process.execPath),'-c','mcp_servers.manuscript_project.args='+JSON.stringify([entry,sock])],close:()=>new Promise(ok=>{server.close(ok);server.closeAllConnections()})}
}
