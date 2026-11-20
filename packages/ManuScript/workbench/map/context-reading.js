// The cache is private to the reader. Never append model prose to manuscript text.
const contextRows=new Map(),contextMemory=new Map(),contextJobs=new Map(),contextErrors=new Map()
function contextChapter(b){
 const key=JSON.stringify(['lunxu:context:v2',host.host,proj,b.id,b.rev,paper.title,b.title]);let results=contextMemory.get(key)
 if(!results){try{results=JSON.parse(localStorage.getItem(key)||'[]')}catch{}if(!Array.isArray(results))results=[];contextMemory.set(key,results)}
 return {key,block:b.id,rev:b.rev,texts:[],results}
}
function contextSpans(result,text){return result.marks.filter(m=>readingKinds[m.kind]&&text.slice(m.start,m.end)===m.quote).map(m=>roleView({...m,i:m.start})).filter(Boolean)}
function readingReason(role,x,y){
 aidTip.textContent=[role.dataset.lxRole,role.dataset.lxSource?'来源：'+role.dataset.lxSource:'',role.dataset.lxReason].filter(Boolean).join(' · ');aidTip.hidden=false;aidTip.style.left=Math.max(4,Math.min(innerWidth-aidTip.offsetWidth-4,x+6))+'px';aidTip.style.top=(y>aidTip.offsetHeight+16?y-aidTip.offsetHeight-12:Math.min(innerHeight-aidTip.offsetHeight-4,y+16))+'px'
}
function contextStatus(section,c){
 const btn=section.querySelector('[data-context-run]'),status=section.querySelector('[data-context-status]');if(!btn)return
 btn.hidden=status.hidden=!readModes.model;const job=contextJobs.get(c.key),count=c.texts.filter((t,i)=>c.results[i]?.text===t).length
 btn.textContent=job?(job.stop?'正在结束':'停止后续段落'):count===c.texts.length&&count?'重新分析本章':count?'继续分析本章':'分析本章'
 btn.disabled=!c.texts.length||!!job?.stop
 status.textContent=contextErrors.get(c.key)||(job?'模型分析中 · ':count?'已分析 · ':'尚未分析 · ')+count+' / '+c.texts.length+' 段'+(count?' · '+(c.results.find(r=>r?.model)?.model||'模型'):'')
}
function refreshContextView(){if(view!=='read'||inlineStudio)return;const top=reader.scrollTop;showPage('read',sel);reader.scrollTop=top}
async function runContext(id,batch=false){
 const c=contextRows.get(id);if(!c)return
 const update=()=>{const section=document.getElementById('doc-'+id);if(section&&contextRows.get(id)?.key===c.key)contextStatus(section,c)}
 const existing=contextJobs.get(c.key);if(existing){existing.stop=true;update();return}
 const project=proj,job={stop:false};contextJobs.set(c.key,job);contextErrors.delete(c.key);update()
 const force=!batch&&c.texts.every((t,i)=>c.results[i]?.text===t);let saved=true
 try{for(const [i,target] of c.texts.entries()){
  if(job.stop||project!==proj||paperBlock(id)?.rev!==c.rev)break
  if(!force&&c.results[i]?.text===target)continue
  const r=await api('reading_analyze',{project,block:id,rev:c.rev,target,previous:(c.texts[i-1]||'').slice(-1400),next:(c.texts[i+1]||'').slice(0,1400)})
  if(project!==proj||paperBlock(id)?.rev!==c.rev)break
  c.results[i]={...r,text:target};try{localStorage.setItem(c.key,JSON.stringify(c.results))}catch{saved=false}update()
 }}catch(err){contextErrors.set(c.key,'分析未完成：'+err.message)}
 finally{contextJobs.delete(c.key);if(!saved&&!contextErrors.has(c.key))contextErrors.set(c.key,'结果在本次会话可用，本地缓存空间不足。');update();if(!batch&&project===proj&&contextRows.get(id)?.key===c.key&&readModes.model)refreshContextView()}
}
reader.addEventListener('change',e=>{if(!e.target.matches('[data-readsource]'))return;readModes.model=e.target.value==='model';storeReadingModes();refreshContextView()})
reader.addEventListener('focusin',e=>{if(e.target.matches('.lxMissing')){const r=e.target.getBoundingClientRect();readingReason(e.target,r.left,r.top)}})
reader.addEventListener('focusout',e=>{if(e.target.matches('.lxMissing'))aidTip.hidden=true})
reader.addEventListener('click',async e=>{
 const all=e.target.closest('[data-context-all]');if(all){runAllChapters();return}
 const run=e.target.closest('[data-context-run]');if(run){if(!allContextJobs.has(proj))runContext(run.dataset.contextRun);return}
 const btn=e.target.closest('[data-importread]');if(!btn)return;const project=proj
 const f=await filePick('.pdf,.md,.markdown,.docx,.tex');if(!f||project!==proj)return;btn.disabled=true
 try{if(f.size>50*1024*1024)throw Error('文件超过 50 MiB')
 const p=await api('upload',{project,name:f.name,data:await bytes64(f),intent:'作者新稿'});if(project!==proj)return
 const first=p.blocks.find(b=>!paperBlock(b.id)&&b.text);updateReader(p,project);showPage('read',first?.id||sel)
 }catch(err){const hint=reader.querySelector('.readingHint');if(hint){hint.hidden=false;hint.textContent='导入失败：'+err.message}}finally{btn.disabled=false}
})

const allContextJobs=new Map(),allContextMessages=new Map()
function paintContextAll(){
 const btn=reader.querySelector('[data-context-all]'),note=reader.querySelector('[data-all-status]');if(!btn)return
 const task=allContextJobs.get(proj);btn.hidden=note.hidden=!readModes.model;btn.disabled=!!task?.stop
 btn.textContent=task?'停止全文分析':'分析全文';note.textContent=task?.message||allContextMessages.get(proj)||''
 if(task)for(const b of reader.querySelectorAll('[data-context-run]'))b.disabled=true
}
async function runAllChapters(){
 const project=proj,old=allContextJobs.get(project)
 if(old){old.stop=true;old.message='当前段完成后停止';for(const c of contextRows.values()){const job=contextJobs.get(c.key);if(job)job.stop=true}paintContextAll();return}
 if([...contextRows.values()].some(c=>contextJobs.has(c.key))){allContextMessages.set(project,'请等当前章节完成后再分析全文。');paintContextAll();return}
 const chapters=[...contextRows.values()].filter(c=>c.texts.length),task={stop:false,message:''};allContextJobs.set(project,task);let done=0
 try{for(const c of chapters){
  if(task.stop||project!==proj||view!=='read'||contextRows.get(c.block)?.key!==c.key)break
  task.message='第 '+(done+1)+' / '+chapters.length+' 章';paintContextAll()
  if(!c.texts.every((t,i)=>c.results[i]?.text===t))await runContext(c.block,true)
  if(contextErrors.has(c.key)){task.message=contextErrors.get(c.key);break}
  if(!c.texts.every((t,i)=>c.results[i]?.text===t))break
  done++
 }}finally{allContextJobs.delete(project);allContextMessages.set(project,done===chapters.length?'已完成 '+done+' 章':('已完成 '+done+' / '+chapters.length+' 章 · '+(task.stop?'已停止':task.message)));if(project===proj){refreshContextView();paintContextAll()}}
}
