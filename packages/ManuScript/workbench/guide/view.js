// Project-backed, edition-pinned reading guides. Content and figure assets travel with the project.
function openPaperGuide(p,api,detail=false,section=''){
 if(p.readingGuide?.article && !detail)return openWholePaper(p,api,section)
 const g=p.readingGuide,ref=p.references?.[g?.key],ed=ref?.editions.find(x=>x.sha===g.sha)
 const d=document.createElement('dialog');d.className='msGuide';document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true})
 const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 const btn=(attr,s)=>'<button type="button" '+attr+'>'+h(s)+'</button>'
 const pair=(z,e)=>'<div class="mgPair"><span lang="zh-CN">'+h(z)+'</span><span lang="en">'+h(e)+'</span></div>'
 d.innerHTML='<div class="mgHead"><strong>'+h(g?.title||'论文导读')+'</strong>'+btn('data-close','关闭')+'</div><div class="mgBody"></div>';d.querySelector('[data-close]').onclick=()=>d.close();d.showModal()
 const body=d.querySelector('.mgBody');if(!ed){body.textContent='固定版 PDF 不在项目中，无法打开这份导读。';return}
 const call=(op,args)=>api(op,{project:p.id,...args})
 const loc=(i,j)=>{const a=g.paras[i];return a.section+' · 第 '+a.para+' 段 · 句 '+(j+1)+' · PDF 第 '+a.page+' 页'}
 const quote=(i,j)=>'<div class="mgOriginal" data-q="'+i+':'+j+'"><small>'+h(loc(i,j))+'</small>'+pair(g.paras[i].zh[j],g.paras[i].en[j])+'</div>'
 function pageButtons(n){return btn('data-page="'+n+'"','查看 PDF 第 '+n+' 页')+(ref.zoteroKey?btn('data-zot="'+n+'"','在 Zotero 定位'):'')}
 const fig=(n)=>{const f=g.figures[n];return '<details class="mgFig" data-fig="'+h(n)+'"><summary>查看论文图 '+h(n)+' · 第 '+h(f.page)+' 页</summary><figure><div class="mgImage" role="status"></div><figcaption>'+h(f.caption)+'</figcaption></figure>'+pageButtons(f.page)+'</details>'}
 const group=(t,i)=>'<section data-gr="'+i+'"><h3>'+h(i+1+'. '+t.title)+'</h3>'+t.rows.map((r,j)=>'<details class="mgRow '+(r.tag.includes('假设')?'mgHyp':'')+'" data-row="'+i+'-'+j+'"><summary><small>'+h(r.tag)+'</small>'+pair(r.zh,r.en)+'</summary>'+r.loc.map(([a,b])=>quote(a,b)+btn('data-jump="'+a+':'+b+'"','在全文定位此句')).join('')+'</details>').join('')+fig(t.fig)+'</section>'
 const unchanged=p.blocks?.find(x=>x.id===g.block)?.text===g.paras.map(a=>a.en.join(' ')).join('\n\n')
 body.innerHTML='<small>'+h(g.publication)+' · §5.1–5.2 · 固定论文导读</small><nav>'+['主线','图解结构','逐句全文','插件摘句'].map((x,i)=>btn('data-v="'+i+'"',x)).join('')+'<label>显示语言 <select aria-label="显示语言"><option value="bi">中英对照</option><option value="zh">只看中文</option><option value="en">只看英文</option></select></label></nav>'+
 (!unchanged?'<p>当前稿与论文摘录已不同。以下导读及译文对应固定 PDF。</p>':'')+
 '<section data-pane="0">'+g.groups.map((t,i)=>'<section class="mgGist"><h3>'+h(t.title)+'</h3>'+pair(t.zh,t.en)+btn('data-expand="'+i+'"','展开这条主线 →')+'</section>').join('')+'</section>'+
 '<section data-pane="1">'+g.groups.map(group).join('')+'</section>'+
 '<section data-pane="2">'+g.paras.map((a,i)=>'<details data-para="'+i+'" '+(i===0?'open':'')+'><summary>'+h(a.section+' · 第 '+a.para+' 段　｜　'+a.en.length+' 句')+'</summary>'+a.en.map((_,j)=>quote(i,j)).join('')+pageButtons(a.page)+'</details>').join('')+btn('data-return hidden','返回刚才的论证')+'</section>'+
 '<section data-pane="3"></section><p role="status" class="mgStatus"></p><footer>原文与原图：'+h(g.publication)+' · '+h(g.doi)+' · '+h(g.license)+'。译文与结构为整理稿；图像裁自固定 PDF。</footer>'
 const msg=body.querySelector('.mgStatus'),sel=body.querySelector('select');let mode=0,origin=null,loaded=false
 function switchTo(n){mode=n;body.querySelectorAll('[data-pane]').forEach(s=>s.hidden=+s.dataset.pane!==n);body.querySelectorAll('[data-v]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.v===n)));msg.textContent='';body.scrollTop=0}
 function focusAt(el){el.scrollIntoView({block:'nearest'});el.tabIndex=-1;el.focus({preventScroll:true})}
 const cache=new Map()
 async function loadFig(details){const f=g.figures[details.dataset.fig],area=details.querySelector('.mgImage');area.textContent='正在读取原图…'
   try{if(!cache.has(f.asset))cache.set(f.asset,call('file',{asset:f.asset}));const file=await cache.get(f.asset);const img=new Image();img.alt=f.caption;img.src='data:image/jpeg;base64,'+file.data;area.replaceChildren(img)}catch(err){cache.delete(f.asset);area.textContent=err.message}}
 body.querySelectorAll('.mgFig').forEach(el=>el.addEventListener('toggle',()=>{if(el.open&&!el.querySelector('img'))loadFig(el)}))
 async function pageView(n){const box=document.createElement('dialog');box.className='msGuide mgPage';box.innerHTML='<div class="mgHead"><strong>固定 PDF · 第 '+n+' 页</strong>'+btn('data-close','返回导读')+'</div><div class="mgBody" role="status">正在读取原页…</div>';document.body.append(box);box.querySelector('button').onclick=()=>box.close();box.onclose=()=>box.remove();box.showModal();const a=box.querySelector('.mgBody')
   try{const png=await call('source_page',{key:g.key,sha:ed.sha,page:n});if(!box.open)return;const img=new Image();img.alt='论文原页 '+n;img.src='data:image/png;base64,'+png;a.replaceChildren(img)}catch(err){a.textContent=err.message}}
 body.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset
  try{if(k.v!==undefined){switchTo(+k.v);if(mode===3&&!loaded){const out=body.querySelector('[data-pane="3"]');if(!unchanged){out.textContent='当前稿已改动；此固定导读不把旧译文套用到新稿。';return}
     const blk=p.blocks.find(x=>x.id===g.block);const rows=await call('writing_fold',{block:g.block,rev:blk.rev});out.innerHTML='<small>当前插件按段摘取的英文原句</small>'+rows.map((r,i)=>{const j=g.paras[i]?.en.indexOf(r.brief);return j>=0?quote(i,j):'<p lang="en">'+h(r.brief)+'</p>'}).join('');loaded=true}}
   else if(k.expand!==undefined){switchTo(1);focusAt(body.querySelector('[data-gr="'+k.expand+'"] h3'))}
   else if(k.jump){origin=b.closest('[data-row]');switchTo(2);const panel=body.querySelector('[data-pane="2"]'),line=panel.querySelector('[data-q="'+k.jump+'"]');line.closest('details').open=true;panel.querySelectorAll('.mgActive').forEach(x=>x.classList.remove('mgActive'));line.classList.add('mgActive');body.querySelector('[data-return]').hidden=false;focusAt(line)}
   else if('return' in k&&origin){switchTo(1);focusAt(origin.querySelector('summary'))}
   else if(k.page)await pageView(+k.page)
   else if(k.zot){await call('open_reference_pdf',{key:g.key,asset:ed.asset,page:+k.zot,target:'zotero'});msg.textContent='已请求 Zotero 打开第 '+k.zot+' 页。'}
  }catch(err){msg.textContent=err.message}})
 let store='manuscript:guide-language';try{const old=localStorage.getItem(store);if(['bi','zh','en'].includes(old))sel.value=old}catch{}
 sel.onchange=()=>{d.dataset.lang=sel.value;try{localStorage.setItem(store,sel.value)}catch{}}
 d.dataset.lang=sel.value;switchTo(0)
}

// Full-edition reader; all text and coordinates are tied to the same immutable PDF.
function openWholePaper(project,api,start=''){
 const g=project.readingGuide,a=g.article,S=a.sections,F=a.figures,ref=project.references?.[g.key],ed=ref?.editions?.find(e=>e.sha===a.sha)
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 const btn=(key,val,label)=>'<button type="button" data-'+key+'="'+esc(val)+'">'+esc(label)+'</button>'
 const bi=(z,e)=>'<div class="mgPair"><span lang="zh-CN">'+esc(z)+'</span><span lang="en">'+esc(e)+'</span></div>'
 const groups=[
 ['摘要','Abstract',['abs']],['01 · 引言','Introduction',['1']],['02 · 方法','Methods',S.filter(s=>s.id.startsWith('2.')).map(s=>s.id)],
 ['03 · 结果','Results',S.filter(s=>s.id.startsWith('3.')).map(s=>s.id)],['04 · 讨论','Discussion',S.filter(s=>s.id.startsWith('4.')).map(s=>s.id)],
 ['05 · 验证','Validation',S.filter(s=>s.id==='5'||s.id.startsWith('5.')).map(s=>s.id)],
 ['06 · 结论','Conclusion',['6']],['声明与参考文献','Statements and references',['notes','refs']],['附录','Appendices',['A1','A2','A3','A4']]]
 const byId=new Map(S.map(s=>[s.id,s])),figLabel=k=>k.startsWith('T')?'表 '+k.slice(1):'图 '+k
 const d=document.createElement('dialog');d.className='msGuide mgWhole';d.innerHTML='<div class="mgHead"><strong>Sit 2024 · 全文图解</strong>'+btn('close','','关闭')+'</div><div class="mgBody"><small>'+esc(g.publication)+'</small><nav>'+btn('home','','全文主线')+btn('gallery','','图表索引')+btn('pages','','原版逐页')+btn('detail','','§5.1–5.2 逐句精读')+'<label>显示语言 <select aria-label="显示语言"><option value="bi">中英对照</option><option value="zh">只看中文</option><option value="en">只看英文</option></select></label></nav><div class="mgContent"></div><footer>原文与原图：'+esc(g.publication)+' · '+esc(g.doi)+' · '+esc(g.license)+'。中文为导读译述，图表取自固定 PDF。</footer></div>'
 document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.showModal()
 const area=d.querySelector('.mgContent'),body=d.querySelector('.mgBody'),lang=d.querySelector('select')
 if(!ed){area.textContent='此项目缺少导读对应的固定版 PDF。';d.querySelector('[data-close]').onclick=()=>d.close();return}
 const target=(s)=>S.indexOf(s),pageBtn=n=>btn('page',n,'PDF 第 '+n+' 页'),view=(markup)=>{area.innerHTML=markup;body.scrollTop=0}
 const pick=(id)=>{const s=byId.get(id);return '<button class="mgEntry" type="button" data-sec="'+target(s)+'"><small>'+esc(id)+'</small>'+bi(s.zh,s.title)+'</button>'}
 const routes=[['1','为什么要换试件？','Why change the specimen?','0° 悬垂 → 固态挠曲与液相聚结','0° overhang → solid and liquid mechanisms'],['2.4','怎么筛选参数？','How are settings screened?','薄圆盘 → 只改第 3 层 → 120 组','Thin disks → vary layer 3 → 120 settings'],['3.2','哪些组合能留下？','Which settings survive?','120 → 69 → 36 → 低 Sa 窗口','120 → 69 → 36 → low-Sa window'],['4.1','哪些指标能代替破坏性检查？','Can a surface metric help screen porosity?','圆盘截面孔隙率 ↔ Sa ↔ Ra','Disk porosity ↔ Sa ↔ Ra'],['5.1','圆盘参数能迁移到桥吗？','Do disk settings transfer to bridges?','看跨度 → 查成珠 → 核对 12 mm 桥密度','Compare spans → inspect beads → check density at 12 mm'],['5.4','结论到哪里为止？','Where do the findings stop?','短道迹、复杂几何、刮刀碰撞','Short tracks, complex geometry and recoater collision']]
 function home(){view('<h2>'+esc(a.title)+'</h2><p lang="en">'+esc(a.paperTitle)+'</p><small>全文 20 页（含封面） · 先按问题进入，或用下方目录按发表顺序阅读。</small><div class="mgRoutes">'+routes.map(([id,z,e,t,u])=>'<button class="mgEntry" data-sec="'+target(byId.get(id))+'">'+bi(z,e)+'<small>'+bi(t,u)+'</small></button>').join('')+'</div><h3>按章节阅读</h3>'+groups.map(([z,e,ids])=>'<details class="mgCategory"><summary>'+esc(z)+' / '+esc(e)+' · '+ids.length+'</summary><div class="mgRoutes">'+ids.map(pick).join('')+'</div></details>').join(''))}
 const figStrip=keys=>keys.map(k=>'<button data-figure="'+esc(k)+'">'+esc(figLabel(k))+' · '+bi(F[k].caption,F[k].en)+'</button>').join('')
 let active=null
 function section(i){const s=S[i];if(!s)return;active=s
 view('<small>全文主线 / '+esc(s.id)+'</small><h2>'+bi(s.zh,s.title)+'</h2><div class="mgThesis">'+bi(s.gist,s.gistEn)+(s.anchor?btn('locate','','定位关键原句'):'')+'</div><small>点击论证行，展开原段和对应页。'+(s.id==='refs'?'书目信息统一保留原文。':'中文为段落译述；验证节保留原有逐句配对。')+'</small>'+
 s.parts.map((p,j)=>'<details class="mgPass" data-part="'+j+'"><summary><small>'+esc(p.tag)+' · '+p.pages.map(n=>'p.'+n).join(' / ')+'</small>'+bi(p.zh.split(/(?<=[。！？])/u)[0],p.en.match(/^.*?[.!?](?=\s+[A-Z]|$)/)?.[0]||p.en.slice(0,155))+'</summary>'+
 (s.id==='refs'?'<div class="mgSource">'+esc(p.en)+'</div>':p.pairs?p.pairs.map(([z,e])=>bi(z,e)).join(''):bi(p.zh,p.en))+
 '<div class="mgActions">'+p.pages.map(pageBtn).join('')+'</div></details>').join('')+
 (s.figs.length?'<h3>对应原图与表</h3><div class="mgTiles">'+figStrip(s.figs)+'</div>':'')+
 (['5.1','5.2'].includes(s.id)?btn('detail','','展开已有的三条主线与逐句定位'):'')+
 '<div class="mgActions">'+(i>0?btn('sec',i-1,'← 上一节'):'')+(i<S.length-1?btn('sec',i+1,'下一节 →'):'')+btn('home','','回到全文主线')+'</div>')}
 let lastPage=null,loading=null
 async function source(n){if(lastPage===n&&loading)return loading;lastPage=n;const promise=api('source_page',{project:project.id,key:g.key,sha:ed.sha,page:n}).then(data=>{const img=new Image();img.src='data:image/png;base64,'+data;return img.decode().then(()=>img)});loading=promise;try{return await promise}catch(e){if(loading===promise)loading=null;throw e}}
 function pop(n,k){
 const box=document.createElement('dialog');box.className='msGuide mgPage';document.body.append(box);box.onclose=()=>box.remove();box.showModal();let serial=0
 async function paint(page,key){const token=++serial,f=F[key];box.innerHTML='<div class="mgHead"><strong>'+esc((f?figLabel(key)+' · ':'固定原文 · ')+'PDF 第 '+page+' 页')+'</strong>'+btn('back','','返回阅读位置')+'</div><div class="mgBody"><div class="mgActions">'+(f?btn('uncrop',page,'看完整原页'):((page>1?btn('turn',page-1,'← 上一页'):'')+(page<a.pages?btn('turn',page+1,'下一页 →'):'')))+'</div><div role="status">正在读取原版 PDF…</div></div>';box.querySelector('[data-back]').onclick=()=>box.close();box.querySelectorAll('[data-turn],[data-uncrop]').forEach(b=>b.onclick=()=>paint(+(b.dataset.turn||b.dataset.uncrop),null))
 const out=box.querySelector('[role=status]');try{const img=await source(page);if(!box.open||token!==serial)return
 if(f){const c=document.createElement('canvas'),[x,y,w,h]=f.rect,W=img.naturalWidth,H=img.naturalHeight;c.width=Math.round(w*W);c.height=Math.round(h*H);c.getContext('2d').drawImage(img,x*W,y*H,w*W,h*H,0,0,c.width,c.height);c.setAttribute('role','img');c.setAttribute('aria-label',f.caption);out.replaceChildren(c);const cap=document.createElement('figcaption');cap.innerHTML=bi(f.caption,f.original);out.append(cap)}
 else{const copy=img.cloneNode();copy.alt='固定论文第 '+page+' 页';out.replaceChildren(copy)}}catch(e){out.textContent=e.message}}
 paint(n,k)}
 d.onclick=e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset;if('close'in k)d.close();else if('home'in k)home();else if('sec'in k)section(+k.sec);else if('locate'in k&&active?.anchor){const q=active.anchor,part=area.querySelector('[data-part="'+q.part+'"]');part.open=true;let mark=part.querySelector('.mgHit');if(!mark){mark=document.createElement('blockquote');mark.className='mgHit';mark.tabIndex=-1;mark.textContent=q.text;part.querySelector('summary').after(mark)}mark.scrollIntoView({block:'center'});mark.focus({preventScroll:true})}else if('detail'in k)openPaperGuide(project,api,true);else if('figure'in k)pop(F[k.figure].page,k.figure);else if('page'in k)pop(+k.page,null);else if('gallery'in k)view('<h2>全部图表</h2><div class="mgTiles">'+figStrip([...Object.keys(F)].sort((x,y)=>F[x].page-F[y].page||F[x].rect[1]-F[y].rect[1]))+'</div>');else if('pages'in k)view('<h2>原版逐页</h2><p>PDF 第 1 页是出版商封面，第 2 页是论文首页。原页保留公式、图例、表格和排版。</p><div class="mgActions">'+Array.from({length:a.pages},(_,i)=>pageBtn(i+1)).join('')+'</div>')}
 try{lang.value=localStorage.getItem('manuscript:guide-language')||'bi'}catch{}
 lang.onchange=()=>{d.dataset.lang=lang.value;try{localStorage.setItem('manuscript:guide-language',lang.value)}catch{}};d.dataset.lang=lang.value
 if(byId.has(start))section(target(byId.get(start)));else home()
}
