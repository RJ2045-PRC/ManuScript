// Only completed assistant text from the actual request's turn can supply a margin excerpt.
export function questionTurns(events){
 const turns=new Map();let turn
 for(const {type,data:d,seq} of events){
  if(type==='turn/start'){turn={requests:[],ended:false};turns.set(d.turn,turn)}
  const m=d?.message||d
  if(type==='user/message'&&m.source?.kind==='user'&&m.source.rpcId&&turn)turn.requests.push(m.source.rpcId)
  if(type==='assistant/message'){
   const t=turns.get(d.turn);if(t){const text=m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim()
    t.answer=text&&!m.content.some(b=>b.type==='tool-call')?{seq,text}:null}
  }
  if(type==='turn/end'&&turns.has(d.turn)){const t=turns.get(d.turn);t.ended=true;if(d.reason?.kind!=='completed')t.answer=null;turn=null}
 }
 return turns
}
export function excerpt(text,question){
 // Rank neighboring source sentences. Keep limitations with the sentence they qualify.
 const sentences=[...text.matchAll(/[^。！？!?\n]+?(?:[。！？!?]+|\.(?=\s|$)|(?=\n|$))/gu)].map(m=>({at:m.index,s:m[0].trim()})).filter(x=>x.s&&!/^#{1,6}\s/.test(x.s)&&!/^\*\*[^*]+\*\*$/.test(x.s)&&!/[：:]$/.test(x.s)&&x.s.replace(/[*_~`]/g,'').length>12)
 if(!sentences.length)return text.trim().slice(0,800)
 const terms=(/^(这是啥|这是什么|什么意思|解释一下|帮我理解一下|\?)[？?。！!]*$/.test(question.trim())?'':question).toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu)||[],tokens=terms.flatMap(t=>/\p{Script=Han}/u.test(t)?Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2)):[t])
 let best=0,score=-Infinity
 sentences.forEach(({s},i)=>{const value=tokens.filter(t=>s.toLowerCase().includes(t)).length-(/^(好的|当然|感谢|好问题|sure\b)/i.test(s.trim())?5:0);if(value>score){score=value;best=i}})
 if(best>0&&/^(但|不过|然而|仅|however|but\b)/i.test(sentences[best].s))best--
 const last=sentences[Math.min(best+2,sentences.length-1)]
 return text.slice(sentences[best].at,last.at+text.slice(last.at).indexOf(last.s)+last.s.length).trim().slice(0,1600)
}
export function questionService(ctx,db,python){
 const synced=new Map()
 const record=(b,sid,id,r,t)=>python('dsh','binding','question_record',{project:b.project,role:b.role,sid,request:id,refs:r.refs,question:r.question,ended:!!t?.ended,seq:t?.answer?.seq,excerpt:t?.answer?excerpt(t.answer.text,r.question):''})
 async function sync(sid,events,requests,binding){
  const pending=Object.entries(requests).filter(([id,r])=>r.question&&!r.done)
  if(!pending.length)return
  const turns=new Map([...questionTurns(events).values()].flatMap(t=>t.requests.map(id=>[id,t]))),b=binding||await db('lookup',{sid});if(!b)return
  for(const [id,r] of pending){
   const t=turns.get(id);if(!t||(!t.ended&&synced.get(sid)?.has(id)))continue
   await record(b,sid,id,r,t)
   if(t.ended){await db('request_save',{sid,requestId:id,body:{...r,done:true}});synced.get(sid)?.delete(id)}
   else {if(!synced.has(sid))synced.set(sid,new Set());synced.get(sid).add(id)}
  }
 }
 ctx.on('session/event',(session,e)=>{if(e.type!=='turn/end')return
  const sid=session.id,events=session.snapshotEvents()
  const start=events.findLastIndex(x=>x.type==='turn/start')
  for(const x of events.slice(start)){const m=x.data?.message||x.data
   if(x.type==='user/message'&&m.source?.kind==='user'&&m.source.rpcId){
    const id=m.source.rpcId;db('request_read',{sid,requestId:id}).then(r=>r?.question&&!r.done&&sync(sid,events.slice(start),{[id]:r})).catch(()=>console.warn('ManuScript: pending margin question will retry on history read'))
   }}
 },{global:true})
 return {sync,async sent(a){const r=await db('request_read',{sid:a.sid,requestId:a.requestId});if(r?.question&&!r.done)await record(a,a.sid,a.requestId,r,null)},async replace(a,events){
  const turn=[...questionTurns(events).values()].find(t=>t.ended&&t.answer?.seq===a.seq)
  const value=a.excerpt?.trim();if(!turn||!value||value.length>4000)throw Error('请在一条完整回复内选取 1 至 4000 字')
  const norm=s=>s.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*_`#~]/g,'').replace(/\s+/g,' ').trim()
  if(!turn.answer.text.includes(value)&&(!norm(value)||!norm(turn.answer.text).includes(norm(value))))throw Error('摘录与这条回复不符，请重新选择')
  return python('dsh','binding','question_excerpt',{...a,excerpt:value})
 }}
}
