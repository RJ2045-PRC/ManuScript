/*READING_ROLES*/
const readModes={model:true,split:true,color:false,only:true,bold:false,ruler:false,length:35,density:3},aidStore='lunxu:reading-aids-v2'
try{const prev=JSON.parse(localStorage.getItem(aidStore)||'{}');for(const k of Object.keys(readModes)){const v=prev[k];if(typeof readModes[k]==='boolean'&&typeof v==='boolean'||Number.isInteger(v)&&(k==='length'&&v>=10&&v<=100||k==='density'&&v>=1&&v<=5))readModes[k]=v}}catch{}
function storeReadingModes(){try{localStorage.setItem(aidStore,JSON.stringify(readModes))}catch{}}
const aidTip=document.createElement('div'),aidLine=document.createElement('div')
aidTip.className='lxAidTip';aidTip.setAttribute('role','tooltip');aidLine.className='lxLine';aidLine.setAttribute('aria-hidden','true');document.body.append(aidTip,aidLine)
function clearReadingOverlays(){aidTip.hidden=true;aidLine.hidden=true}
clearReadingOverlays()
function aidSpans(text){
 const ordered=classifyRules(text).map(roleView).filter(Boolean)
 if(readModes.split)return ordered
 const whole=[]
 for(const m of text.matchAll(/(?:[^.!?。！？]|\.(?=\d)|(?<=\bal)\.)+[.!?。！？]?/gi)){
  const i=m.index,end=i+m[0].length,roles=ordered.filter(r=>r.i<end&&r.end>i)
  if(!roles.length)continue
  const mixed=roles.some(r=>r.label!==roles[0].label)
  whole.push({i:i+(m[0].length-m[0].trimStart().length),end,k:mixed?3:roles[0].k,label:mixed?'多种作用':roles[0].label,reason:mixed?'整句含不止一种写作作用，切回句内拆标查看。':roles[0].reason,source:mixed?'':roles[0].source})
 }
 return whole
}
function prepareReadingAids(){
 contextRows.clear();
 for(const section of reader.querySelectorAll('section[data-block]')){
 const offsets=new Map(mapped(section,paperBlock(section.dataset.block)).map(x=>[x.node,x.i]))
 const b=paperBlock(section.dataset.block),chapter=contextChapter(b);contextRows.set(b.id,chapter)
 for(const para of section.querySelectorAll(':scope > .rich p,:scope > .rich > .texDoc')){
 if(para.closest('figure,table,blockquote pre')||para.querySelector('figure'))continue
 for(const br of para.querySelectorAll('br'))br.after(document.createTextNode(' '))
 const walker=document.createTreeWalker(para,NodeFilter.SHOW_TEXT),nodes=[];let text='',n,word=0
 let lastGroup=null
 while(n=walker.nextNode()){const group=n.parentElement.closest('[data-citegroup]');if(group){if(group!==lastGroup)text+='['+group.dataset.citegroup+']';lastGroup=group;continue}nodes.push({n,i:text.length});text+=n.data}
 if(!text.trim())continue
 const index=chapter.texts.push(text)-1,result=chapter.results[index]?.text===text?chapter.results[index]:null
 const spans=readModes.model?(result?contextSpans(result,text):[]):aidSpans(text),labeled=new Set()
 for(const {n,i} of nodes){if(n.parentElement.closest('a,button,math,pre,code,figure,[data-citegroup]')||!n.data.trim())continue
 const shell=document.createElement('span');if(offsets.has(n))shell.dataset.lxOffset=offsets.get(n)
 function put(lo,hi,role){if(hi<=lo)return;let dest=shell;if(role){dest=document.createElement('span');dest.className='lxRole kind'+role.k;dest.dataset.lxRole=role.label;if(role.reason)dest.dataset.lxReason=role.reason;if(role.source)dest.dataset.lxSource=role.source;if(!labeled.has(role)){dest.dataset.lxStart='';labeled.add(role)}shell.append(dest)}
 const str=n.data.slice(lo-i,hi-i);let at=0
 for(const m of str.matchAll(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g)){dest.append(str.slice(at,m.index));const t=m[0];if(!/^[A-Z]+$|\d|[a-z][A-Z]/.test(t)&&!n.parentElement.closest('strong,b,em,i')){const w=document.createElement('span');w.className='lxWord';w.dataset.seq=word;w.textContent=t;dest.append(w)}else dest.append(t);word++;at=m.index+t.length}dest.append(str.slice(at))
 }
 let at=i;const end=i+n.length;for(const role of spans){const lo=Math.max(i,role.i),hi=Math.min(end,role.end);if(hi<=lo)continue;put(at,lo);put(lo,hi,role);at=hi}put(at,end);n.replaceWith(shell)
 }
 if(readModes.model&&result?.missing?.length){
 const note=document.createElement('button');note.className='lxMissing';note.type='button';note.textContent='ⓘ';note.dataset.lxRole='本段没提';note.dataset.lxReason=result.missing.map(m=>m.question+'：'+m.reason).join('；');note.setAttribute('aria-label','本段没提：'+note.dataset.lxReason);para.after(note)
 }
 }contextStatus(section,chapter)}
 paintContextAll()
}
function updateWords(){
 let changed=false
 for(const w of reader.querySelectorAll('.lxWord')){const t=w.textContent,len=readModes.bold&&Number(w.dataset.seq)%(6-readModes.density)===0?Math.max(1,Math.round(t.length*readModes.length/100)):0
 if(+w.dataset.n===len)continue;changed=true;w.dataset.n=len;if(!len){w.textContent=t;continue}const b=document.createElement('b');b.className='lxPrefix';b.textContent=t.slice(0,len);w.replaceChildren(b,t.slice(len))}
 return changed
}

function applyReadingModes(){
 clearReadingOverlays()
 for(const key of ['color','only','bold','ruler']){reader.classList.toggle('mode-'+key,readModes[key]);const btn=reader.querySelector('[data-mode="'+key+'"]');btn.setAttribute('aria-pressed',String(readModes[key]));if(key==='only')btn.disabled=!readModes.color}
 for(const input of reader.querySelectorAll('[data-aid]')){const k=input.dataset.aid;input.value=readModes[k];input.disabled=!readModes.bold;reader.querySelector('[data-val="'+k+'"]').textContent=k==='length'?input.value+'%':'每 '+(6-readModes.density)+' 词强调 1 词'}
 reader.querySelector('[data-readsource]').value=readModes.model?'model':'rules';reader.querySelector('[data-grain]').disabled=readModes.model;
 reader.querySelector('[data-grain]').value=readModes.model?'split':readModes.split?'split':'whole'
 if(updateWords()&&window.CSS?.highlights?.has('annotations')){
 CSS.highlights.delete('annotations');for(const note of paper.notes){const sect=document.getElementById('doc-'+note.block);if(sect)highlight(sect,paperBlock(note.block),note)}
 }
 reader.querySelector('.readingHint').hidden=!(readModes.color||readModes.ruler);reader.querySelector('.readingHint').textContent=[readModes.color?'指向色块看它在这段话里的写作作用和判断依据。颜色不核验证据，也不把计划标成结果。':'',readModes.ruler?'阅读尺：指向正文定位，Alt + ↑ / ↓ 逐行移动。':''].join(' ')
}
reader.addEventListener('input',e=>{const k=e.target.dataset.aid;if(!k)return;readModes[k]=Number(e.target.value);applyReadingModes();storeReadingModes()})
function pointReadingAid(e){
 if(inlineStudio||view!=='read'||e.buttons===1&&e.type==='pointermove'){clearReadingOverlays();return}
 const p=e.target.closest('section > .rich p,.rich > .texDoc'),role=e.target.closest('[data-lx-role]')
 if(role?.classList.contains('lxMissing')&&readModes.color){aidLine.hidden=true;readingReason(role,e.clientX,e.clientY);return}
 if(!p||p.closest('table,figure')||e.target.closest('button,a,code,[data-citegroup]')){clearReadingOverlays();return}
 if(role&&readModes.color)readingReason(role,e.clientX,e.clientY);else aidTip.hidden=true
 if(!readModes.ruler)return
 const lines=readingLines(p),index=lines.findIndex(l=>Math.abs(l.mid-e.clientY)<=parseFloat(getComputedStyle(p).lineHeight)/2),r=lines[index]?.rect;if(r){rulerPara=p;rulerIndex=index}
 if(!r){aidLine.hidden=true;return}const box=p.getBoundingClientRect();aidLine.hidden=false;Object.assign(aidLine.style,{left:box.left+'px',width:box.width+'px',top:r.top+'px',height:r.height+'px'})
}
reader.addEventListener('pointermove',pointReadingAid);reader.addEventListener('pointerdown',pointReadingAid);reader.addEventListener('pointerleave',clearReadingOverlays);reader.addEventListener('scroll',clearReadingOverlays);window.addEventListener('resize',clearReadingOverlays)
reader.addEventListener('change',e=>{
 if(!e.target.matches('[data-grain]'))return
 readModes.split=e.target.value==='split';storeReadingModes()
 const top=reader.scrollTop;showPage('read',sel);reader.scrollTop=top;reader.querySelector('.paperMenu[data-menu-keep]').open=true;reader.querySelector('.lxAidOptions').open=true;reader.querySelector('[data-grain]').focus({preventScroll:true})
})
// Use actual laid-out text lines, including paragraphs in Chinese; no manuscript edits.
let rulerPara=null,rulerIndex=0
function readingLines(p){const r=new Range();r.selectNodeContents(p);const lines=[],gap=parseFloat(getComputedStyle(p).lineHeight)*.55
 for(const rect of r.getClientRects()){if(!rect.width||!rect.height)continue;const mid=rect.top+rect.height/2;if(!lines.length||Math.abs(lines.at(-1).mid-mid)>gap)lines.push({mid,rect})}
 return lines
}
function keyboardLine(e){
 if(!readModes.ruler||view!=='read'||inlineStudio||mode||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key)||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea'))return
 const paras=[...reader.querySelectorAll('section > .rich p')].filter(p=>!p.closest('figure,table')&&p.textContent.trim()&&p.offsetHeight),dir=e.key==='ArrowDown'?1:-1
 let idx=paras.indexOf(rulerPara),i=rulerIndex+dir
 if(idx<0){idx=paras.findIndex(p=>p.getBoundingClientRect().bottom>reader.getBoundingClientRect().top);if(idx<0)return;i=0}
 let p=paras[idx],lines=readingLines(p)
 if(i<0||i>=lines.length){p=paras[idx+dir];if(!p)return;lines=readingLines(p);i=dir>0?0:lines.length-1}
 if(!lines[i])return;e.preventDefault();rulerPara=p;rulerIndex=i;let rect=lines[i].rect,viewport=reader.getBoundingClientRect()
 if(rect.top<viewport.top||rect.bottom>viewport.bottom)reader.scrollTop+=rect.top-(viewport.top+viewport.height/2)
 const paint=()=>{if(!readModes.ruler||!p.isConnected)return;const box=p.getBoundingClientRect(),row=readingLines(p)[i]?.rect;if(!row)return;aidLine.hidden=false;Object.assign(aidLine.style,{left:box.left+'px',width:box.width+'px',top:row.top+'px',height:row.height+'px'})};requestAnimationFrame(paint)
}
document.addEventListener('keydown',keyboardLine)

/*MODEL_READING*/
