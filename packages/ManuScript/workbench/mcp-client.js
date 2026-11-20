(()=>{
 const pending=new Map();let nextId=0,hostContext={}
 const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' 请求超时'))},15000)
  pending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')
 })
 const notify=(method,params)=>window.parent.postMessage({jsonrpc:'2.0',method,...(params?{params}:{})},'*')
 const applyContext=context=>{
  hostContext={...hostContext,...(context||{})}
  const root=document.documentElement,theme=hostContext.theme
  if(theme){root.dataset.theme=theme;root.style.colorScheme=theme}
  for(const [name,value] of Object.entries(hostContext.styles?.variables||{}))if(typeof value==='string')root.style.setProperty(name,value)
 }
 window.addEventListener('message',event=>{
  if(event.source!==window.parent)return
  const message=event.data
  if(!message||message.jsonrpc!=='2.0')return
  if(message.id!=null&&pending.has(message.id)){
   const entry=pending.get(message.id);pending.delete(message.id);clearTimeout(entry.timer)
   message.error?entry.reject(Error(message.error.message||'请求失败')):entry.resolve(message.result);return
  }
  if(message.method==='ui/notifications/host-context-changed')applyContext(message.params)
 })
 const ready=(async()=>{
  const initialized=await send('ui/initialize',{appInfo:{name:'ManuScript',version:'0.13.0'},appCapabilities:{},protocolVersion:'2026-01-26'})
  applyContext(initialized?.hostContext);notify('ui/notifications/initialized');return initialized
 })()
 window.manuscriptMcpApi=async(op,args={})=>{
  await ready
  const result=await send('tools/call',{name:'manuscript_app_request',arguments:{op,args}})
  if(result?.isError)throw Error(result.content?.find(block=>block?.type==='text')?.text||'ManuScript 操作失败')
  const text=result?.content?.find(block=>block?.type==='text')?.text
  if(!text)throw Error('ManuScript 没有返回结果')
  return JSON.parse(text)
 }
 window.manuscriptMcpReady=ready
})()
