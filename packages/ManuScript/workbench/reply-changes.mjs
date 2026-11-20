// Project only successful ManuScript tool receipts onto the final text reply of their own DSH turn.
export function receiptIndex(events){
 const calls=new Map(),turns=new Map(),answers=new Map()
 for(const {type,data:d={},seq} of events){
  if(type==='assistant/message'&&d.message?.content?.some(b=>b.type==='text'&&b.text?.trim()))answers.set(d.turn,seq)
  if(type==='tool/call')calls.set(d.callId,{turn:d.turn,name:d.name})
  if(type!=='tool/result'||d.error||d.message?.isError)continue
  const c=calls.get(d.message?.source?.callId)
  if(!c||c.turn!==d.turn||!['manuscript_write_block','manuscript_deliver_task','manuscript_build_outline','manuscript_map_arguments','manuscript_propose_topic'].includes(c.name))continue
  let r;try{r=JSON.parse(d.message.content.find(b=>b.type==='text').text)}catch{continue}
  let entry
  if(['manuscript_write_block','manuscript_deliver_task'].includes(c.name)&&r?.changed!==false&&typeof r?.suggestion==='string')entry={kind:'draft',id:r.suggestion}
  if(['manuscript_build_outline','manuscript_map_arguments'].includes(c.name)&&r?.count>0&&r.added?.length)entry={kind:'map',status:'已加入工作图',rows:r.added.map(after=>({before:null,after}))}
  if(c.name==='manuscript_propose_topic'&&r?.text&&['rename','child'].includes(r.kind))entry={kind:'map',status:'本轮建议',rows:[{before:r.kind==='rename'?r.base:null,after:r.kind==='rename'?r.text:r.base+' → '+r.text}]}
  if(entry){if(!turns.has(d.turn))turns.set(d.turn,[]);turns.get(d.turn).push(entry)}
 }
 return new Map([...turns].filter(([turn])=>answers.has(turn)).map(([turn,v])=>[answers.get(turn),v]))
}
export function previewRows(before,after){
 const old=new Map(before.map(n=>[n.id,n])),fresh=new Map(after.map(n=>[n.id,n]))
 const label=(map,n)=>n&&[map.get(n.p)?.t,n.rel&&'〔'+n.rel+'〕',n.t].filter(Boolean).join(' → ')
 return [...new Set([...old.keys(),...fresh.keys()])].flatMap(id=>{
  const a=old.get(id),b=fresh.get(id)
  return a&&b&&a.t===b.t&&a.p===b.p&&a.rel===b.rel?[]:[{before:label(old,a)??null,after:label(fresh,b)??null}]
 })
}
