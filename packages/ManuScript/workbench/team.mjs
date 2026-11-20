import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {existsSync,readFileSync} from 'node:fs'
const bundled='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
export const codexExe=()=>process.env.MANUSCRIPT_CODEX||process.env.LUNXU_CODEX||(existsSync(bundled)?bundled:'codex')
export const roles=JSON.parse(readFileSync(new URL('./roles.json',import.meta.url),'utf8'))
export function roleFor(team,key){const r=team.roles?.[key];if(!r||!r.enabled)throw Error('角色不存在或已停用');return r}
export const rolePrompt=r=>r.name+'：'+r.instruction+'\n可用项目工具：'+r.tools.join('、')+'。候选正文范围：'+(r.blocks.join('、')||'项目内的候选稿')+'；文件写入范围：'+(r.files.join('、')||'无')+'。交付给主 Agent；工具回执才是已写入的依据。角色权限只约束 ManuScript 项目工具，外部 MCP 和宿主工具另受宿主授权。'
export const jobRole={'框架':'lead','拆解':'lead','统筹':'lead','摘要':'lead','写作':'writer','搜证':'research','审查':'review','解释':'helper','支持':'support','内审':'audit'}
async function codexCatalog(){
 const p=spawn(codexExe(),['app-server','--listen','stdio://'],{stdio:['pipe','pipe','ignore']})
 const lines=createInterface({input:p.stdout}), pending=new Map();let seq=0,dead
 function stop(e){dead=e;for(const [,j] of pending)j.fail(e);pending.clear()}
 p.on('error',stop);p.stdin.on('error',stop);p.on('close',()=>stop(Error('Codex 模型目录连接已关闭')))
 lines.on('line',line=>{let m;try{m=JSON.parse(line)}catch{return}const j=pending.get(m.id);if(!j)return;pending.delete(m.id);m.error?j.fail(Error(m.error.message)):j.ok(m.result)})
 const ask=(method,params)=>new Promise((ok,fail)=>{if(dead)return fail(dead);const id=++seq;pending.set(id,{ok,fail});p.stdin.write(JSON.stringify({id,method,params})+'\n')})
 const timer=setTimeout(()=>{stop(Error('读取 Codex 模型目录超时'));p.kill()},15000)
 try{await ask('initialize',{clientInfo:{name:'manuscript',title:'ManuScript',version:'1'}});p.stdin.write('{"method":"initialized"}\n')
 let rows=[],cursor=null;do{const r=await ask('model/list',{cursor,limit:100,includeHidden:false});rows.push(...r.data.filter(x=>!x.hidden).map(x=>({provider:'codex',model:x.model||x.id,name:x.displayName||x.model||x.id})));cursor=r.nextCursor}while(cursor);return {rows,errors:[]}
 }finally{clearTimeout(timer);lines.close();p.stdin.end();p.kill()}
}
let codexCache
const caches=new WeakMap()
export async function catalog(host,ctx,refresh=false){
 let hit=host==='codex'?codexCache:caches.get(ctx)
 if(!refresh&&hit?.expires>Date.now())return hit.value
 const value=host==='codex'?codexCatalog():(async()=>{const providers=await ctx.llm.listProviders(),rows=[],errors=[]
 await Promise.all(providers.map(async p=>{try{for(const m of await ctx.llm.listModels(p.id))rows.push({provider:p.id,model:m.id,name:(p.name||p.id)+' / '+(m.name||m.id)})}catch{errors.push((p.name||p.id)+'：目录未能读取')}}));return {rows:rows.sort((a,b)=>a.name.localeCompare(b.name)),errors}})()
 hit={expires:Date.now()+60000,value};if(host==='codex')codexCache=hit;else caches.set(ctx,hit)
 try{return await value}catch(e){hit.expires=0;throw e}
}
export async function routeFor(host,ctx,r){
 if(!r?.model){if(host==='codex')return null;throw Error('请先为此角色选择 DSH 模型')}
 const {rows}=await catalog(host,ctx)
 const choice=rows.find(x=>x.model===r.model&&x.provider===r.provider)
 if(!choice)throw Error('所选模型当前不在宿主目录中；请刷新并重新选择。')
 return choice
}
