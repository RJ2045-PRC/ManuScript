import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createInterface} from 'node:readline'
import {test} from 'node:test'
import {fileURLToPath} from 'node:url'
import vm from 'node:vm'

const pluginRoot=process.env.MANUSCRIPT_PLUGIN_ROOT||fileURLToPath(new URL('..',import.meta.url))

function serverClient(){
  const child=spawn(process.execPath,['server.mjs'],{cwd:pluginRoot,stdio:['pipe','pipe','pipe']})
  const pending=new Map();let next=0,stderr=''
  child.stderr.setEncoding('utf8');child.stderr.on('data',x=>{stderr+=x})
  createInterface({input:child.stdout}).on('line',line=>{
    const message=JSON.parse(line),entry=pending.get(message.id)
    if(!entry)return
    pending.delete(message.id);clearTimeout(entry.timer)
    message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result)
  })
  const request=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error(`MCP request timed out: ${method}\n${stderr}`))},10000)
    pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')
  })
  const close=async()=>{child.stdin.end();await Promise.race([once(child,'exit'),new Promise((_,reject)=>setTimeout(()=>reject(Error('MCP server did not exit')),3000))])}
  return {request,close}
}

test('advertises a global ManuScript MCP App entrypoint',async()=>{
  const client=serverClient()
  try{
    const initialized=await client.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'sidebar-test',version:'1'}})
    assert.equal(initialized.serverInfo.title,'ManuScript')
    assert.ok(initialized.capabilities.resources)
    assert.equal(initialized.serverInfo.icons?.[0]?.mimeType,'image/svg+xml')

    const {tools}=await client.request('tools/list')
    const opener=tools.find(tool=>tool.name==='manuscript_workbench')
    assert.equal(opener.title,'ManuScript')
    assert.deepEqual(opener.inputSchema,{type:'object',properties:{},required:[],additionalProperties:false})
    assert.deepEqual(opener._meta?.['openai/ui']?.entrypoints,[{type:'global'},{type:'thread'}])
    assert.match(opener._meta?.ui?.resourceUri??'',/^ui:\/\/manuscript\//)
    const privateTool=tools.find(tool=>tool.name==='manuscript_app_request')
    assert.deepEqual(privateTool?._meta?.ui?.visibility,['app'])

    const listed=await client.request('resources/list')
    assert.ok(listed.resources.some(resource=>resource.uri===opener._meta.ui.resourceUri))
    const read=await client.request('resources/read',{uri:opener._meta.ui.resourceUri})
    const resource=read.contents.find(content=>content.uri===opener._meta.ui.resourceUri)
    assert.equal(resource.mimeType,'text/html;profile=mcp-app')
    assert.doesNotMatch(resource.text,/<iframe\b/)
    assert.deepEqual(resource._meta?.['openai/ui']?.availableDisplayModes,['fullscreen','inline'])
    assert.deepEqual(resource._meta?.ui?.csp?.frameDomains??[],[])
    for(const uri of ['ui://manuscript/workbench-v1.html','ui://manuscript/workbench-v2.html']){
      const legacy=await client.request('resources/read',{uri})
      assert.equal(legacy.contents[0].uri,uri)
      assert.match(legacy.contents[0].text,/manuscript-mcp-bridge/)
    }

    assert.match(resource.text,/const env=\{"host":"codex-mcp"\}/)
    assert.match(resource.text,/data-act="create"/)
    const source=resource.text.match(/<script id="manuscript-mcp-bridge">([\s\S]*?)<\/script>/)?.[1]
    assert.ok(source,'MCP App resource must include the host bridge')
    assert.doesNotMatch(source,/ui\/open-link|openExternal/)
    const sent=[],listeners=new Map(),parent={postMessage:message=>sent.push(message)}
    const styleValues=new Map(),rootStyle={setProperty:(name,value)=>styleValues.set(name,value),colorScheme:''}
    const window={parent,addEventListener:(name,handler)=>listeners.set(name,handler)}
    const documentElement={lang:'zh-CN',style:rootStyle,dataset:{}}
    vm.runInNewContext(source,{window,document:{documentElement},console,setTimeout,clearTimeout,URL,Promise,Object,JSON,Error})
    await new Promise(resolve=>setImmediate(resolve))
    const init=sent.find(message=>message.method==='ui/initialize')
    assert.ok(init,'MCP App must initiate ui/initialize')
    listeners.get('message')({source:parent,data:{jsonrpc:'2.0',id:init.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{serverTools:{}},hostInfo:{name:'test-host',version:'1'},hostContext:{theme:'dark',styles:{variables:{'--color-background-primary':'#101513'}}}}}})
    await new Promise(resolve=>setImmediate(resolve))
    assert.ok(sent.some(message=>message.method==='ui/notifications/initialized'),'MCP App must complete initialization')
    assert.equal(documentElement.dataset.theme,'dark')
    assert.equal(rootStyle.colorScheme,'dark')
    assert.equal(styleValues.get('--color-background-primary'),'#101513')

    const listPromise=window.manuscriptMcpApi('list',{})
    await new Promise(resolve=>setImmediate(resolve))
    const request=sent.find(message=>message.method==='tools/call'&&message.params?.name==='manuscript_app_request')
    assert.equal(request?.params?.arguments?.op,'list')
    listeners.get('message')({source:parent,data:{jsonrpc:'2.0',id:request.id,result:{content:[{type:'text',text:'[]'}]}}})
    assert.deepEqual(await listPromise,[])
    listeners.get('message')({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:'light'}}})
    assert.equal(documentElement.dataset.theme,'light')

    const appRequest=await client.request('tools/call',{name:'manuscript_app_request',arguments:{op:'list',args:{}}})
    assert.ok(Array.isArray(JSON.parse(appRequest.content[0].text)))
  }finally{await client.close()}
})
