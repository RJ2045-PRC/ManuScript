#!/usr/bin/env node
import {createInterface} from 'node:readline'
import {readFileSync} from 'node:fs'
import meta from './package.json' with {type:'json'}
import {openSample} from './core.mjs'
import {agentTool,authorAPI,codexModel,page,toolDefs,stopDesk} from './workbench/bridge.mjs'
const appUri='ui://manuscript/workbench-v3.html'
const appUris=new Set([appUri,'ui://manuscript/workbench-v2.html','ui://manuscript/workbench-v1.html'])
const icon='data:image/svg+xml;base64,'+readFileSync(new URL('./assets/logo.svg',import.meta.url)).toString('base64')
const defs=toolDefs.map(([name,description,props])=>{
  const tool={name:'manuscript_'+name,description,inputSchema:{type:'object',properties:Object.fromEntries(Object.entries(props).map(([k,type])=>[k,{type}])),required:Object.keys(props),additionalProperties:false}}
  if(name==='workbench')Object.assign(tool,{title:'ManuScript',icons:[{src:icon,mimeType:'image/svg+xml',sizes:['any']}],_meta:{ui:{resourceUri:appUri,visibility:['model','app']},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]},'openai/outputTemplate':appUri}})
  return tool
})
const spec={name:'open_sample',description:'Open the bundled synthetic LaTeX review chapter in ManuScript.',inputSchema:{type:'object',properties:{version:{type:'string',enum:['v3','v5']}},additionalProperties:false}}
const appSpec={name:'manuscript_app_request',title:'ManuScript app request',description:'Private transport for the ManuScript MCP App.',inputSchema:{type:'object',properties:{op:{type:'string'},args:{type:'object'}},required:['op','args'],additionalProperties:false},_meta:{ui:{visibility:['app']}}}
const respond=(id,value)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...value})+'\n')
async function appResource(uri=appUri){
  return {uri,mimeType:'text/html;profile=mcp-app',text:await page('','','codex-mcp'),_meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[],frameDomains:[]}},'openai/ui':{preferredDisplayMode:'fullscreen',availableDisplayModes:['fullscreen','inline']}}}
}
for await (const line of createInterface({input:process.stdin})) {
  let m
  try {m=JSON.parse(line)} catch {respond(null,{error:{code:-32700,message:'Invalid JSON'}});continue}
  if(m.id==null) continue
  try {
    let result
    if(m.method==='initialize') result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{},resources:{}},serverInfo:{name:'manuscript',title:'ManuScript',version:meta.version,icons:[{src:icon,mimeType:'image/svg+xml',sizes:['any']}]}}
    else if(m.method==='tools/list') result={tools:[spec,...defs,appSpec]}
    else if(m.method==='resources/list') result={resources:[...appUris].map((uri,index)=>({uri,name:index?'manuscript-workbench-compat':'manuscript-workbench',title:'ManuScript',description:'论文协作、证据与版本工作台',mimeType:'text/html;profile=mcp-app'}))}
    else if(m.method==='resources/read'&&appUris.has(m.params?.uri)) result={contents:[await appResource(m.params.uri)]}
    else if(m.method==='ping') result={}
    else if(m.method==='tools/call'&&m.params?.name===spec.name) result={content:[{type:'text',text:JSON.stringify(await openSample(m.params.arguments?.version))}]}
    else if(m.method==='tools/call'&&m.params?.name===appSpec.name){const {op,args}=m.params.arguments||{};const value=await authorAPI('codex',codexModel,op,args||{});result={content:[{type:'text',text:JSON.stringify(value)}]}}
    else if(m.method==='tools/call'&&defs.some(d=>d.name===m.params?.name)){const value=await agentTool('codex',m.params.name.slice('manuscript_'.length),m.params.arguments||{});result={content:[{type:'text',text:JSON.stringify(value)}],...(m.params.name==='manuscript_workbench'?{structuredContent:value}:{})}}
    else {respond(m.id,{error:{code:-32601,message:'Unknown request'}});continue}
    respond(m.id,{result})
  } catch(e){respond(m.id,{error:{code:-32602,message:e.message}})}
}

stopDesk()
