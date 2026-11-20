// This view saves into the same block and version history as the chapter editor.
function openWritingFold(id,onChangedClose){
 const project=proj
 let block=paperBlock(id), rows=[], editing=-1, busy=false
 if(!block)return
 const d=modal('折叠写作 · '+block.title,'<p>正在读取本章…</p>')
 d.classList.add('writingFold')
 let changed=false,savedOffset=null,retryLanding=null
 if(onChangedClose)d.addEventListener('close',()=>{if(changed&&proj===project)onChangedClose(savedOffset)},{once:true})
 const main=d.querySelector('main'), status=d.querySelector('.schError')
 const cites=raw=>{
   const slots=[]
   const value=raw.replace(/\[([^\[\]\n]{1,250})\]|\\cite[pt]?\{([^}]+)\}/g,(token,a,b)=>{
     const keys=parseKeys(a||b);if(!keys.length)return token
     let mark='〔出处 '+(slots.length+1)+'〕';while(raw.includes(mark))mark='〔'+mark+'〕'
     slots.push({mark,token,keys});return mark
   });return {slots,value}
 }
 function sourceList(raw){
   const pairs=new Map()
   for(const {keys} of cites(raw).slots)for(const [k,p=''] of keys)pairs.set(k+'#'+p,[k,p])
   return [...pairs.values()].map(([k,p])=>{const r=lib()[k],family=r.csl?.author?.[0]?.family||r.author?.split(/[;,]/)[0]||k
     return '<button class="wfRef" data-wf-ref="'+E(k)+'" data-pid="'+E(p)+'" title="'+E(r.title)+'">↗ '+E(family+(r.year?' '+r.year:''))+(p?' · 固定原文':' · 书目')+'</button>'}).join(' ')
 }
 const dirty=()=>editing>=0&&d.querySelector('textarea')?.value!==cites(rows[editing].raw).value
 const canLeave=()=>!busy&&(!dirty()||window.confirm('放弃这个段落尚未保存的修改？'))
 d.querySelector('[data-x]').onclick=()=>{if(canLeave())d.close()}
 d.addEventListener('cancel',e=>{if(!canLeave())e.preventDefault()})
 function diffHTML(parts,withDeletes=false){return parts.map(([tag,old,next])=>
   (withDeletes&&old&&tag!=='equal'?'<del>'+E(old)+'</del>':'')+
   (tag==='equal'?E(next):next?'<ins>'+E(next)+'</ins>':'')).join('')}
 function marked(r,s){const item=r.revision?.changes.find(c=>c.line===s);return item?diffHTML(item.parts):E(s)}
 function changes(r){const v=r.revision;if(!v)return ''
   return '<aside class="wfRecent"><small>本章改动 · '+E(v.from)+' → '+E(v.to)+' · 下划线为新增，删除线为删去</small>'+v.changes.map(c=>'<p>'+diffHTML(c.parts,true)+'</p>').join('')+'</aside>'}
 function paint(){
   main.innerHTML='<p class="wfIntro">每段折成一句原稿摘句。展开改写，保存后按新稿重选；点出处可核对原文。</p>'+rows.map((r,i)=>{
     const open=i===editing, sources=sourceList(r.raw)
     return '<section class="wfRow"><small>第 '+(i+1)+' 段 · '+(open?'原稿':'主线摘句')+'</small>'+
       (open?'<label>段落原稿<textarea aria-label="段落原稿" rows="7" '+''+'></textarea></label>'+
       (cites(r.raw).slots.length?'<small>〔出处〕标记跟随句子，可随句移动。</small>':'')+
       '<div class="wfActions">'+'<button data-wf-save>保存并折回</button>'+'<button data-wf-cancel>收起</button></div>':
       '<button class="wfLine" data-wf-open="'+i+'" aria-expanded="false"><span>▸</span> '+'<span class="wfBrief">'+marked(r,r.brief||'展开查看原文')+'</span>'+'</button>')+
       (!open&&r.cited.some(s=>s!==r.brief)?'<details class="wfEvidence"><summary>查看带引用的原句</summary>'+r.cited.filter(s=>s!==r.brief).map(s=>'<p>'+marked(r,s)+'</p>').join('')+'</details>':'')+
       (sources?'<div class="wfSources"><small>本段引用</small> '+sources+'</div>':'<small class="wfNoSource">本段未挂引用</small>')+
       (!open?changes(r):'')+
       '</section>'
   }).join('')
   if(editing>=0){const t=main.querySelector('textarea');t.value=cites(rows[editing].raw).value;t.focus()}
 }
 async function load(landing){
   const data=await api('writing_fold',{project,block:id,rev:block.rev})
   if(!d.open||proj!==project)return
   rows=data
   paint()
   if(landing){
    const i=rows.findIndex(row=>row.offset>=landing.offset),button=main.querySelector('[data-wf-open="'+(i<0?rows.length-1:i)+'"]');
    if(!button)return;
    const el=button.closest('.wfRow'),bounds=main.getBoundingClientRect(),r=el.getBoundingClientRect();
    const y=Math.min(Math.max(0,landing.y),Math.max(0,bounds.height-button.offsetHeight-30));
    main.scrollTop+=r.top-bounds.top-y;button.focus({preventScroll:true});
    if(motionLevel()!=='off'&&landing.height>r.height+2){
     animateReading(el,[{height:landing.height+'px',overflow:'hidden',boxSizing:'border-box'},{height:r.height+'px',overflow:'hidden',boxSizing:'border-box'}],motionLevel()==='full'?240:140,'writing-fold');
    }
   }
 }
 actionOn(d,async btn=>{
   if(busy)return
   if(btn.hasAttribute('data-wf-retry')){
    busy=true;
    try{await load(retryLanding);status.textContent='提要已按新稿重算。'}finally{busy=false}
    return
   }
   if(btn.dataset.wfRef){refDetail(btn.dataset.wfRef,btn.dataset.pid);return}
   if(btn.hasAttribute('data-wf-open')){if(!canLeave())return;editing=Number(btn.dataset.wfOpen);status.textContent='';paint();return}
   if(btn.hasAttribute('data-wf-cancel')){if(canLeave()){editing=-1;paint()}return}
   if(!btn.hasAttribute('data-wf-save')||editing<0)return
   const current=rows[editing], c=cites(current.raw)
   let next=main.querySelector('textarea').value
   for(const {mark,token} of c.slots){if(next.split(mark).length!==2)throw Error('原有出处标记需要保留一次，可将它移动到对应句子。');next=next.replace(mark,()=>token)}
   if(!next.trim())throw Error('段落为空；请写入内容再保存。')
   if(next===current.raw){editing=-1;paint();return}
   const rect=btn.closest('.wfRow').getBoundingClientRect(),landing={offset:current.offset,y:rect.top-main.getBoundingClientRect().top,height:rect.height};
   const field=main.querySelector('textarea');busy=true;field.readOnly=true;btn.disabled=true;status.textContent='正在保存…'
   try{
     const chars=Array.from(block.text),end=current.offset+Array.from(current.raw).length
     const result=await api('edit',{project,block:id,rev:block.rev,text:chars.slice(0,current.offset).join('')+next+chars.slice(end).join(''),passage:{old:current.raw,text:next,offset:current.offset},label:'折叠写作：'+block.title})
     if(proj!==project)return
     updateReader(result,project);changed=true;savedOffset=current.offset;block=paperBlock(id);editing=-1;status.textContent='正在按新稿折叠…';if(!onChangedClose)showPage('read',id)
     try{await load(landing)}catch(e){retryLanding=landing;main.replaceChildren();const retry=document.createElement('button');retry.dataset.wfRetry='';retry.textContent='重新读取提要';main.append(retry);status.textContent='段落已保存，提要读取失败。'+e.message;return}
     status.textContent='已保存 · 提要已按新稿重算。'+(c.slots.length?'出处已保留，改写后的表述可点开核对。':'')
   }finally{busy=false;field.readOnly=false;btn.disabled=false}
 })
 load().catch(e=>{main.textContent='本章未能折叠。';status.textContent=e.message})
}
