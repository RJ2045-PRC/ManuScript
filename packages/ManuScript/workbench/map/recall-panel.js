// Search the author's selection locally. No manuscript mutation or model call.
function openParagraphRecall(project,quote){
 const d=modal('这段正文的思路来路','<p>按所选正文查找本项目讨论过的相近原话。文字相似不代表来源已经确认。</p><blockquote data-selected></blockquote><section></section>')
 d.setAttribute('aria-label','这段正文的思路来路')
 d.querySelector('[data-selected]').textContent=quote.slice(0,240)
 const list=d.querySelector('section'),status=d.querySelector('[role=status]'),el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x}
 async function load(){
  status.textContent='正在查找…'
  try{const s=await api('dsh_recall_search',{project,query:quote.slice(0,2400)});if(!d.isConnected)return
   status.textContent=s.entries.length?'找到可能相关的讨论，请核对原话。':s.enabled?'没有找到与这段正文匹配的讨论线索。':'本项目当前未开启回看，也没有匹配记录。可在「项目工具 → 项目信息与设置」开启。'
   list.replaceChildren()
   for(const r of s.entries){const item=document.createElement('details');item.append(el('summary',r.topic||r.claim),el('p',(r.stage==='未定'?'待核对':r.stage)+' · '+r.movement+' · '+r.claim))
    for(const e of [{role:'作者',id:r.source.id,quote:r.source.text},...r.evidence])item.append(el('small',(labels[r.role]||r.role)+'会话 · '+e.role+' '+e.id),el('blockquote',e.quote))
    if(r.change)item.append(el('p',r.revision+'：'+r.change.oldQuote+' → '+r.change.newQuote));if(r.boundary)item.append(el('p',r.boundary))
    const jump=el('button','打开原会话 ↗');item.append(jump);jump.onclick=async()=>{try{await hostAction('jump',r.sid,'',{project,role:r.role})}catch(e){status.textContent=e.message}}
    const note=el('p',r.correction?'作者补充：'+r.correction:''),label=el('label','我的补充 '),input=document.createElement('textarea'),save=el('button','保存补充');input.maxLength=1000;input.rows=2;input.value=r.correction;label.append(input);item.append(note,label,save)
    save.onclick=async()=>{save.disabled=true;try{await api('dsh_recall_correct',{project,sid:r.sid,role:r.role,seq:r.seq,text:input.value});note.textContent=input.value.trim()?'作者补充：'+input.value.trim():'';status.textContent='补充已保存。'}catch(e){status.textContent=e.message}finally{save.disabled=false}}
    list.append(item)}
  }catch(e){status.textContent=e.message}
 }
 load()
}
