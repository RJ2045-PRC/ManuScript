// Mounted within the project workspace; original bytes and versions stay in the project store.
const lib=()=>paper?.references||{},objects=()=>paper?.exhibits||{}
function scholarText(b){let text=b.text;for(const o of Object.values(objects())){const tag='{{'+o.id+'}}';if(o.block!==b.id||text.includes(tag))continue;if(o.original){if(text.includes(o.original))text=text.replace(o.original,tag)}else text+='\n\n'+tag}return text}
const callSch=(op,a={})=>api(op,{...a,project:proj})
async function refreshSch(){const id=proj,p=await api('state',{project:id});if(id===proj){updateReader(p,id);if(view==='read'&&!inlineStudio)showPage('read',sel)}}
function toolButton(label,attr){return '<button type="button" '+attr+'>'+E(label)+'</button>'}
function modal(title,html){const d=document.createElement('dialog');d.className='writingDialog scholarDialog';d.setAttribute('aria-label',title);d.innerHTML='<header><strong>'+E(title)+'</strong>'+toolButton('关闭','class="msControl" data-x')+'</header><main>'+html+'</main><p class="schError" role="status"></p>';document.body.append(d);d.querySelector('[data-x]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.showModal();return d}
function actionOn(d,fn){d.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.hasAttribute('data-x')||!d.contains(b))return;try{await fn(b,e)}catch(err){d.querySelector('.schError').textContent=err.message}})}
function bytes64(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(file)})}
function filePick(accept){return new Promise(ok=>{const i=document.createElement('input');i.type='file';i.accept=accept;i.onchange=()=>ok(i.files[0]);i.oncancel=()=>ok(null);i.click()})}
function blobFrom(v,type){return new Blob([Uint8Array.from(atob(v),c=>c.charCodeAt(0))],{type})}
function downloadSch(text,name,type){const a=document.createElement('a'),u=URL.createObjectURL(text instanceof Blob?text:new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function parseKeys(raw){const out=[];for(let term of raw.split(/[,;]/)){term=term.trim().replace(/^@/,'');let m=term.match(/^S(\d+)\s*[-–]\s*S?(\d+)$/);if(m){if(+m[2]<+m[1]||+m[2]-m[1]>99)return [];for(let n=+m[1];n<=+m[2];n++)out.push(['S'+n,''])}else out.push(term.split('#'))}return out.length&&out.every(([k])=>Object.hasOwn(lib(),k))?out:[]}
const citationSource=String.raw`(?:\[@[^\[\]\n]+\])+|\[[^\[\]\n]{1,250}\]`;
const wholeCitation=new RegExp('^(?:'+citationSource+')$');
function citationMembers(raw){
 if(!wholeCitation.test(raw))return [];
 const groups=[...raw.matchAll(/\[([^\[\]\n]+)\]/g)].map(m=>parseKeys(m[1]));
 return groups.every(g=>g.length)?[...new Map(groups.flat().map(item=>[JSON.stringify(item),item])).values()]:[];
}
const citationGroup=members=>[...new Set(members.map(([key])=>key))].join(',');
function citationMarkup(members){
 return members.length?'['+members.map(([key,pin])=>'@'+key+(pin?'#'+pin:'')).join('; ')+']':'';
}
function joinCitation(text,at,value){
 const link=window.manuscriptLinkAt(text,at);
 if(!link)return null;
 const {from,to}=link,members=citationMembers(text.slice(from,to)),additions=citationMembers(value);
 if(!members.length||!additions.length)return null;
 for(const item of additions){
  const [key,pin]=item;
  if(!members.some(([k,p])=>k===key&&(!pin||p===pin)))members.push(item);
 }
 return {from,to,value:citationMarkup(members)};
}
const refLink=r=>r?.doi?'https://doi.org/'+r.doi:/^https?:\/\//i.test(r?.url||'')?r.url:''
function cellText(s){const rx=/\[([^\[\]\n]{1,250})\]/g;let out='',i=0;for(const m of s.matchAll(rx)){const ks=parseKeys(m[1]);if(!ks.length)continue;out+=E(s.slice(i,m.index))+'<span data-citegroup="'+E(ks.map(x=>x[0]).join(','))+'">['+ks.map(([k,pid])=>toolButton(k,'class="citation" data-ref="'+E(k)+'" data-pid="'+E(pid||'')+'"')).join(', ')+']</span>';i=m.index+m[0].length}return out+E(s.slice(i))}
function exhibitHTML(o){const label=(o.kind==='figure'?'Fig. ':'Table ')+o.id.slice(1);return '<figure data-obj="'+E(o.id)+'">'+(o.diagram?diagramView(o):o.kind==='figure'?'<img data-sch-img="'+E(o.asset)+'" alt="'+E(o.caption)+'">':'<div class="tablewrap"><table>'+o.rows.map((r,i)=>'<tr>'+r.map(c=>i?'<td>'+cellText(c)+'</td>':'<th>'+cellText(c)+'</th>').join('')+'</tr>').join('')+'</table></div>')+'<figcaption><b>'+E(label)+'</b> | '+E(o.caption)+(o.credit?'<small>'+E(o.credit)+'</small>':'')+originalFigure(o)+'</figcaption></figure>'}
function enhanceProse(root){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),list=[];while(walker.nextNode())list.push(walker.currentNode)
 for(const n of list){if(!n.parentElement||n.parentElement.closest('a,button,code,figure,math'))continue;const text=n.data,rx=new RegExp('('+citationSource+')'+String.raw`|\\cite(?:p|t)?\{([^}]+)\}|\{\{(ref:)?([FT]\d+)\}\}|(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)|(==[^=\n]+?==)`,'g');let m,start=0,out=document.createDocumentFragment()
 while(m=rx.exec(text)){let el=document.createElement('span')
 if(m[1]||m[2]){const ks=m[1]?citationMembers(m[1]):parseKeys(m[2]);if(!ks.length)continue;el.append('[');ks.forEach(([k,pid],i)=>{if(i)el.append(', ');const a=document.createElement('button');a.className='citation';a.textContent=k;a.dataset.ref=k;a.dataset.occ=citePosition(text,m.index,k);a.dataset.sentence=citedSentence(text,m.index);a.dataset.pid=pid||'';a.title=lib()[k].title;el.append(a)});el.append(']');el.dataset.citegroup=citationGroup(ks);applyLabel(el)}
 else if(m[4]){const o=objects()[m[4]];if(!o)continue;if(m[3])el.innerHTML=toolButton((o.kind==='figure'?'Fig. ':'Table ')+o.id.slice(1),'data-visual="'+E(o.id)+'"');else el.innerHTML=exhibitHTML(o)}
 else if(m[6]){el=document.createElement('mark');el.textContent=m[6].slice(2,-2)}
 else if(m[5]){const s=m[5],displayMode=s.startsWith('$$');try{el.innerHTML=window.manuscriptEquationPreview(s.slice(displayMode?2:1,displayMode?-2:-1),displayMode)}catch{continue}}
 out.append(text.slice(start,m.index),el);start=m.index+m[0].length}
 if(start){out.append(text.slice(start));n.replaceWith(out)}}
 for(const g of root.querySelectorAll("figure [data-citegroup]"))applyLabel(g);
 hydrateFigures(root)
}
async function projectImageSource(project,asset){
 const file=await api('file',{project,asset});
 const type=/\.png$/i.test(file.name)?'png':/\.webp$/i.test(file.name)?'webp':'jpeg';
 return 'data:image/'+type+';base64,'+file.data;
}
async function hydrateFigures(root){const id=proj;for(const el of root.querySelectorAll('img[data-sch-img]')){try{const src=await projectImageSource(id,el.dataset.schImg);if(el.isConnected&&proj===id)el.src=src}catch{el.alt+='（原件不可用）'}}}
function observeLibraryFigures(root,dialog){
 const project=proj;
 const observer=new IntersectionObserver(entries=>{for(const {target,isIntersecting} of entries){
  if(!isIntersecting||!target.isConnected)continue;
  observer.unobserve(target);target.loadFigure();
 }},{root:dialog,rootMargin:'80px 0px'});
 for(const image of root.querySelectorAll('img[data-sch-img]')){
  const preview=document.createElement('span');preview.className='schFigurePreview';preview.textContent='图片预览';image.replaceWith(preview);
  preview.loadFigure=async()=>{
   try{image.src=await projectImageSource(project,image.dataset.schImg);await image.decode();if(preview.isConnected&&proj===project)preview.replaceChildren(image)}
   catch{preview.textContent='图片原件不可用'}
  };
  observer.observe(preview);
 }
 return ()=>observer.disconnect();
}
function renderManuscriptToken(el,raw){
 const valid=raw.startsWith('[')?citationMembers(raw).length:!!objects()[raw.replace(/[{}]/g,'').replace('ref:','')];
 if(!el)return valid;
 if(raw.startsWith('[')&&valid){
  el.dataset.citationSource=raw;
  el.dataset.citegroup=citationGroup(citationMembers(raw));
  applyLabel(el);
 }else if(valid){el.textContent=raw;enhanceProse(el)}
}
function citationClicks(root){
 root.addEventListener('click',e=>{
  const a=e.target.closest('[data-ref],[data-visual]');
  if(!a||e.defaultPrevented)return;
  e.preventDefault();
  if(a.dataset.ref){
   const b=paperBlock(a.closest('[data-manuscript]')?.dataset.manuscript||a.closest('section[data-block]')?.dataset.block);
   if(b&&!a.dataset.sentence&&a.closest('td,th'))a.dataset.sentence=a.closest('td,th').textContent;
   if(b&&a.dataset.sentence)showEvidence(a,b);
   else refDetail(a.dataset.ref,a.dataset.pid);
  }else objectForm(objects()[a.dataset.visual],()=>root.dispatchEvent(new Event('scholarchange')));
 });
}
citationClicks(reader)
function refForm(r={},done){const d=modal(r.key?'编辑书目':'新增书目','<div class="fieldGrid">'+[['key','引用键（新条目可留空）'],['title','题名'],['author','作者'],['year','年份'],['journal','期刊 / 出版物'],['volume','卷'],['issue','期'],['pages','页码 / 文章编号'],['doi','DOI'],['url','原文网址']].map(([k,l])=>'<label>'+l+'<input data-f="'+k+'" value="'+E(r[k]||'')+'" '+(k==='key'&&r.key?'readonly':'')+'></label>').join('')+'</div>'+toolButton('保存书目','data-store'))
 actionOn(d,async b=>{if(!b.hasAttribute('data-store'))return;const v=Object.fromEntries([...d.querySelectorAll('[data-f]')].map(i=>[i.dataset.f,i.value]));const saved=await callSch('ref_save',{...v,rev:r.rev});await refreshSch();d.close();done?.(saved.key)})}
function refDetail(key,pid='',insert=null){const r=lib()[key];if(!r)return;const d=modal(key+' · '+r.title,'<p>'+E([r.author,r.year,r.journal,r.volume,r.issue,r.pages].filter(Boolean).join(' · '))+'</p><div class="schTools">'+(refLink(r)?'<a target="_blank" rel="noopener noreferrer" class="openPaper" href="'+E(refLink(r))+'">打开出版原文 ↗</a>':'')+toolButton('编辑书目','data-meta')+toolButton('附加原件','data-attach')+(insert?toolButton('插入书目引用','data-insert'):'')+'</div><p>附件：'+(r.editions.length?r.editions.map((v,i)=>toolButton(v.name+' · '+v.pages+' 页','data-ed="'+i+'"')).join(' '):'仅有书目，尚无可检索的本地原文。')+'</p>' +notesList(r,insert)+ '<div class="pinned"></div><div class="pdfArea"></div>')
 const project=proj;let request=0;const urls=[];d.addEventListener('close',()=>urls.forEach(x=>URL.revokeObjectURL(x)))
 async function open(ed,page=1){const ticket=++request,f=await api('file',{project,asset:ed.asset});if(!d.open||ticket!==request)return;const area=d.querySelector('.pdfArea');if(!ed.name.toLowerCase().endsWith('.pdf')){area.innerHTML='<pre>'+E(new TextDecoder().decode(Uint8Array.from(atob(f.data),x=>x.charCodeAt(0))))+'</pre>';return}
 const u=URL.createObjectURL(blobFrom(f.data,'application/pdf'));urls.push(u);area.innerHTML='<p>原件 SHA-256：<code>'+E(ed.sha.slice(0,16))+'…</code> · 第 '+Number(page)+' 页 · '+toolButton('用本机 PDF 阅读器打开','data-pdf-target="system" data-asset="'+E(ed.asset)+'" data-page="'+Number(page)+'"')+(r.zoteroKey?' '+toolButton('在 Zotero 打开第 '+Number(page)+' 页','data-pdf-target="zotero" data-asset="'+E(ed.asset)+'" data-page="'+Number(page)+'"'):'')+'</p><iframe title="本地论文原件" src="'+u+'#page='+Number(page)+'"></iframe>'}
 let hit
 if(pid)callSch('evidence_search',{key,pid}).then(async hits=>{if(!d.open)return;hit=hits[0];if(!hit){d.querySelector('.pinned').textContent='引用片段未在此书目的原件中找到，未替换为相似段落。';return}d.querySelector('.pinned').innerHTML='<b>固定证据 · 第 '+hit.page+' 页</b><blockquote>'+E(hit.text)+'</blockquote>';await open(r.editions.find(e=>e.sha===hit.sha),hit.page)}).catch(e=>d.querySelector('.schError').textContent=e.message)
 else if(r.editions.length)open(r.editions.at(-1)).catch(e=>d.querySelector('.schError').textContent=e.message)
 actionOn(d,async b=>{if(b.dataset.pdfTarget){const target=b.dataset.pdfTarget,page=Number(b.dataset.page),msg=d.querySelector('.schError');b.disabled=true;msg.textContent='正在打开…';try{await api('open_reference_pdf',{project,key,asset:b.dataset.asset,page,target});msg.textContent=target==='zotero'?'已请求 Zotero 定位第 '+page+' 页。':'已交给系统默认阅读器。引用位置：第 '+page+' 页。'}finally{b.disabled=false}return}if(b.hasAttribute('data-resync')){await callSch('zotero_import',{key:r.zoteroKey});await refreshSch();d.close();refDetail(key,pid,insert)}else if(b.dataset.usenote!=null){const n=Object.values(r.readingNotes)[+b.dataset.usenote];insert([n.text,n.comment?'阅读笔记：'+n.comment:'','[@'+key+']'].filter(Boolean).join(' '));d.close()}else if(b.hasAttribute('data-meta'))refForm(r,()=>{d.close();refDetail(key,pid,insert)});else if(b.hasAttribute('data-insert')){insert('[@'+key+(pid?'#'+pid:'')+']');d.close()}else if(b.dataset.ed!=null)await open(r.editions[+b.dataset.ed]);else if(b.hasAttribute('data-attach')){const f=await filePick('.pdf,.txt,.md');if(!f)return;d.querySelector('.schError').textContent='正在建立本地原文索引…';await callSch('ref_attach',{key,name:f.name,data:await bytes64(f)});await refreshSch();d.close();refDetail(key,pid,insert)}})
}
function objectForm(o={},done){
 const kind=o.kind||'figure',isFig=kind==='figure';
 const original=isFig?paper.assets.find(a=>a.id===o.asset):null,filename=original?.name.replace(/\.[^.]+$/,'');
 const nameField=original?'<label>文件名<input data-filename maxlength="120" value="'+E(filename)+'" aria-describedby="figure-filename-extension"></label><small id="figure-filename-extension">扩展名 '+E(original.name.slice(filename.length))+'</small>':'';
 const d=modal((o.id?'编辑':'新增')+(isFig?'图片':'表格'),'<label>标题<input data-caption value="'+E(o.caption||'')+'"></label><label>来源 / 图表说明<input data-credit value="'+E(o.credit||'')+'"></label>'+'<label>随章节展示<select data-assoc><option value="">仅存入图表库</option>'+paper.blocks.filter(b=>b.text).map(b=>'<option value="'+E(b.id)+'" '+(o.block===b.id?'selected':'')+'>'+E(b.title)+'</option>').join('')+'</select></label>'+(isFig?'<label>图片原件<input type="file" accept="image/png,image/jpeg,image/webp"></label>'+nameField+(o.asset?exhibitHTML(o):''):'<div class="gridEdit"></div><div class="schTools">'+toolButton('加一行','data-row')+toolButton('加一列','data-col')+toolButton('移除末行','data-delrow')+toolButton('移除末列','data-delcol')+toolButton('导入 CSV','data-csv')+'</div>')+toolButton('保存图表','data-store'))
 hydrateFigures(d);let rows=(o.rows||[['条件','测量结果'],['','']]).map(r=>r.slice())
 function grid(){if(isFig)return;d.querySelector('.gridEdit').innerHTML='<table>'+rows.map((r,i)=>'<tr>'+r.map((c,j)=>'<td><input aria-label="第 '+(i+1)+' 行第 '+(j+1)+' 列" data-i="'+i+'" data-j="'+j+'" value="'+E(c)+'"></td>').join('')+'</tr>').join('')+'</table>'}
 grid();d.oninput=e=>{if(e.target.dataset.i!=null)rows[+e.target.dataset.i][+e.target.dataset.j]=e.target.value}
 actionOn(d,async b=>{if(b.hasAttribute('data-row')){rows.push(rows[0].map(()=>''));grid()}else if(b.hasAttribute('data-col')){rows.forEach(r=>r.push(''));grid()}else if(b.hasAttribute('data-delrow')&&rows.length>2){rows.pop();grid()}else if(b.hasAttribute('data-delcol')&&rows[0].length>1){rows.forEach(r=>r.pop());grid()}else if(b.hasAttribute('data-csv')){const f=await filePick('.csv,.tsv');if(!f)return;rows=await callSch('parse_table',{text:await f.text(),sep:f.name.endsWith('.tsv')?'\t':','});grid()}else if(b.hasAttribute('data-store')){
  const f=d.querySelector('[type=file]')?.files[0],name=d.querySelector('[data-filename]')?.value.trim();
  const rename=original&&name!==filename,studio=inlineStudio,project=proj;
  if(f&&rename)throw Error('请分开重命名和替换原件。');
  b.disabled=true;
  try{
   let documentRev;
   if(rename){
    if(studio&&!await studio.flush())throw Error('请先保存当前正文。');
    documentRev=(await api('document_read',{project})).rev;
   }
   const rec=await api('exhibit_save',{project,id:o.id,rev:o.rev,kind,block:d.querySelector('[data-assoc]').value,
    caption:d.querySelector('[data-caption]').value,credit:d.querySelector('[data-credit]').value,
    rows,name:f?.name,data:f?await bytes64(f):null,...(rename?{rename:name,documentRev}:{})});
   await refreshSch();
   d.close();
   if(rec.renamed&&studio===inlineStudio&&studio&&project===proj){
    if(await studio.close()&&studio.document)await openDocumentEditor('root',{resume:true});
   }
   done?.(rec);
  }finally{b.disabled=false}
 }})}
function library(tab='refs',insert=null,markdown=false,{kind,quote,figureEditing}={}){if(!paper)return;const d=modal(kind==='figure'?'插入图片':kind==='table'?'插入表格':quote?'原文引用':'文献与图表','<div class="schTabs">'+(kind||quote?'':[['refs','参考文献'],['search','检索原文'],['objects','图表库'],['index','索引管理']].map(([k,v])=>toolButton(v,'data-tab="'+k+'"')).join(''))+'</div><div class="libBar"></div><div class="libList"></div>');const bar=d.querySelector('.libBar'),list=d.querySelector('.libList');let hits=[],query='',stopPreviews;
 d.addEventListener('close',()=>stopPreviews?.(),{once:true});
 function render(k=tab){stopPreviews?.();stopPreviews=null;tab=k;for(const b of d.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',b.dataset.tab===k)
 if(k==='refs'){bar.innerHTML='<input placeholder="按题名、作者、DOI 筛选" data-filter>'+toolButton('新增书目','data-new')+toolButton('导入 BibTeX / CSL','data-bib')+toolButton('导出 BibTeX','data-export')+toolButton('从 Zotero 选择','data-zot');showRefs('')}
 else if(k==='index'){indexPage(list,bar)}else if(k==='search'){bar.innerHTML='<input data-query placeholder="例如：电导率、remelting、481.7" value="'+E(query)+'"><select data-method aria-label="检索方式"><option value="hybrid">关键词 + 主题相似</option><option value="exact">仅关键词</option></select>'+toolButton('检索','data-search');bar.querySelector('[data-method]').value=paper.settings.indexMode||'hybrid';list.innerHTML='<p>按原件全文检索。结果保留文件版本、页码和原文；相关性不等于证据支持。</p>'}
 else{
  const draft=figureEditing&&kind==='figure'?figureEditing.rows():[];
  const figureList=draft.length?'<h3>稿件中的图片</h3>'+draft.map((row,i)=>'<div class="refRow">'+
   '<small data-figure-section>'+E(row.section)+'</small>'+
   '<span data-figure-description>'+E([row.label,row.body||row.alt||row.path].filter(Boolean).join(' · '))+'</span> '+
   (row.id&&!row.duplicate?toolButton('交叉引用','data-draft-figure-ref="'+i+'"'):
    toolButton(row.duplicate?'分配新标识':'自动编号','data-draft-figure-number="'+i+'"'))+'</div>').join(''):'';
  bar.innerHTML=(kind==='table'?'':toolButton('引用 PDF 原图','data-pubfig')+toolButton('添加图片','data-add="figure"'))+(kind==='figure'?'':toolButton('新建数据表','data-add="table"'));const libraryItems=Object.values(objects()).filter(o=>!kind||o.kind===kind).map(o=>'<div>'+exhibitHTML(o)+toolButton('编辑','data-objedit="'+o.id+'"')+
   (insert?toolButton('插入正文','data-embed="'+o.id+'"')+(figureEditing&&o.kind==='figure'?'':toolButton('交叉引用','data-cross="'+o.id+'"')):'')+'</div>').join('');
  list.innerHTML=figureList+(figureList&&libraryItems?'<h3>图表库</h3>':'')+libraryItems||'<p>暂无可插入的条目。</p>';
  stopPreviews=observeLibraryFigures(list,d);
  for(const button of list.querySelectorAll('[data-draft-figure-ref],[data-draft-figure-number]')){
   const i=Number(button.dataset.draftFigureRef??button.dataset.draftFigureNumber);
   button.addEventListener('click',()=>{try{
    if(button.hasAttribute('data-draft-figure-ref'))figureEditing.reference(draft[i]);
    else figureEditing.number(draft[i]);
    d.close();
    figureEditing.focus();
   }catch(error){d.querySelector('.schError').textContent=error.message}});
  }}}
 function showRefs(q){const refs=Object.values(lib()).filter(r=>[r.key,r.title,r.author,r.doi,r.year].join(' ').toLowerCase().includes(q.toLowerCase()));list.innerHTML=refs.map(r=>'<div class="refRow"><b>'+E(r.key)+'</b> '+toolButton(r.title,'data-detail="'+E(r.key)+'"')+'<small>'+E([r.author,r.year,r.editions.length?'有本地原件':'仅书目'].filter(Boolean).join(' · '))+'</small>'+(insert?toolButton('插入引用','data-ins="'+E(r.key)+'"'):'')+'</div>').join('')||'<p>未找到条目。可添加书目、导入 BibTeX 或从 Zotero 选择。</p>'}
 const put=token=>{insert?.(token);d.close()}
 const putPassage=hit=>{
  const citation='[@'+hit.key+'#'+hit.pid+']';
  put(quote&&markdown?'\n\n'+hit.text.trim().split(/\r?\n/).map(line=>'> '+line).join('\n')+'\n\n'+citation+'\n\n':citation);
 };
 render();d.oninput=e=>{if(e.target.hasAttribute('data-filter'))showRefs(e.target.value)};d.onkeydown=e=>{if(e.key==='Enter'&&e.target.hasAttribute('data-query'))d.querySelector('[data-search]').click()}
 actionOn(d,async b=>{const x=b.dataset;d.querySelector('.schError').textContent=''
 if(x.rebuild!=null)await indexPage(list,bar,true);else if(x.pubfig!=null)sourceFigureForm(()=>render());else if(x.tab)render(x.tab);else if(x.new!=null)refForm({},()=>render());else if(x.detail)refDetail(x.detail,'',insert?put:null);else if(x.ins)put('[@'+x.ins+']')
 else if(x.bib!=null){const f=await filePick('.bib,.json');if(!f)return;await callSch('ref_import',{name:f.name,kind:f.name.toLowerCase().endsWith('.bib')?'bib':'json',data:await bytes64(f)});await refreshSch();render()}
 else if(x.export!=null){const f=await callSch('bib_export');downloadSch(blobFrom(f.data,'text/plain'),f.name)}
 else if(x.zot!=null){bar.innerHTML='<input data-zq placeholder="Zotero 题名或关键词">'+toolButton('查询本机 Zotero','data-zsearch');list.innerHTML=''}
 else if(x.zsearch!=null){const rs=await callSch('zotero_search',{query:bar.querySelector('input').value});list.innerHTML=rs.map(r=>toolButton(r.title,'data-zkey="'+E(r.key)+'"')).join('')||'未找到书目'}
 else if(x.zkey){await callSch('zotero_import',{key:x.zkey});await refreshSch();render('refs')}
 else if(x.search!=null){query=bar.querySelector('input').value;hits=await callSch('evidence_search',{query,mode:bar.querySelector('[data-method]').value});list.innerHTML=hits.map((h,i)=>'<div class="refRow"><b>'+E(h.key)+' · 第 '+h.page+' 页 · '+E(h.match||'关键词')+'</b><p>'+E(h.text)+'</p>'+toolButton('查看原页','data-hit="'+i+'"')+(insert?toolButton('引用此段','data-citehit="'+i+'"'):'')+'</div>').join('')||'未找到匹配的可提取原文。可换关键词，或先为书目附加 PDF / 文本。'}
 else if(x.hit!=null){const h=hits[+x.hit];refDetail(h.key,h.pid,insert?(quote?()=>putPassage(h):put):null)}else if(x.citehit!=null)putPassage(hits[+x.citehit])
 else if(x.add)objectForm({kind:x.add},()=>render());
 else if(x.objedit)objectForm(objects()[x.objedit],rec=>{if(rec.renamed&&figureEditing)d.close();else render()});
 else if(x.embed){const o=objects()[x.embed];
 if(figureEditing&&o.kind==='figure'&&o.asset){figureEditing.add(o);d.close();figureEditing.focus();return}
 if(markdown&&o.asset&&o.kind==='figure'){const a=paper.assets.find(a=>a.id===o.asset);const alt=('Fig. '+o.id.slice(1)+' | '+o.caption+(o.credit?' — '+o.credit:'')).replace(/([\\\[\]])/g,'\\$1').replace(/\s+/g,' ');put('\n\n!['+alt+']('+documentImagePath(a)+')\n\n')}
 else if(markdown&&o.rows){const rows=o.rows.map(row=>row.map(c=>c.replace(/\|/g,'\\|').replace(/\n/g,' ')));rows.splice(1,0,rows[0].map(()=>'---'));put('\n\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n\n'+'Table '+o.id.slice(1)+' · '+o.caption+(o.credit?' — '+o.credit:'')+'\n\n')}
 else put('{{'+x.embed+'}}')}else if(x.cross)put(markdown?(objects()[x.cross].kind==='figure'?'Fig. ':'Table ')+x.cross.slice(1):'{{ref:'+x.cross+'}}')})}

function writingStudio(b,slot,onFinish,part=null,initialStage=null,resumeDocument=false){
 const project=proj,modeTex=b.format==='tex',d=document.createElement('div');d.className=b.whole?'inlineStudio documentStudio':'inlineStudio';d.dataset.manuscript=b.id;slot.replaceChildren(d);d.innerHTML='<div class="studioHead"><strong>'+E(part?'当前段落':b.title)+'</strong>'+toolButton('收起','data-x')+'</div>'+studioTools(modeTex,b.whole)+'<div class="findBar" hidden><input aria-label="查找文字" placeholder="查找文字"><input aria-label="替换为" placeholder="替换为">'+toolButton('替换下一处','data-replace')+toolButton('关闭查找','data-find-close')+'</div><div class="studioRich"></div><textarea aria-label="论文源码" class="studioSource" spellcheck="false" hidden></textarea><div class="studioProof rich" tabindex="0" aria-label="正文阅读" hidden></div><div class="studioFoot"><div class="studioSave"><span class="writeStatus" role="status">修改后自动保存</span>'+toolButton('重试保存','class="msControl" data-save-retry hidden')+'</div><span class="wordCount"></span>'+toolButton('保存','data-ok')+'</div><p class="schError" role="status"></p>'
 d.querySelector('.studioFoot').append(d.querySelector('[data-x]'));d.querySelector('.studioHead').remove();
 d.classList.add('studio');const src=d.querySelector('.studioSource'),rich=d.querySelector('.studioRich'),proof=d.querySelector('.studioProof'),status=d.querySelector('.writeStatus'),draftKey='lunxu:edit:'+host.host+':'+project+':'+b.id+(part?':'+part.start:'');let current=part?part.text:scholarText(b),rev=b.rev,last=current,stage='',tex=null,ed=null,switching=false,pendingSave=null,sourcePos=0,sourceEnd=0,richPos=null,scrolls={},scrollAt={},timer=null,localTimer=null,autoTimer=null,stale=false
 const equationContext=b.whole?undefined:()=>ManuscriptEquations.blockContext(b,paper.blocks,part?.start,part?part.start+part.text.length:undefined);
 const retry=d.querySelector('[data-save-retry]');let composing=false;
 const isComposing=()=>composing||ed?.view.composing;
 d.addEventListener('compositionstart',()=>{composing=true});
 d.addEventListener('compositionend',()=>{composing=false;queueAutosave()});
 function paintSave(state,message){
  status.dataset.state=state;
  if(status.textContent!==message)status.textContent=message;
  retry.disabled=state==='saving';
  if(state!=='saving')retry.hidden=state!=='error';
  if(state==='saved'||state==='dirty')d.querySelector('[data-recover]')?.remove();
 }
 function queueAutosave(){clearTimeout(autoTimer);autoTimer=setTimeout(()=>{if(!stale)save()},900)}
 const mdWriting=!modeTex?window.manuscriptMarkdownWriting(d,src,{editor:()=>ed,dirty,modal,download:downloadSch,onSourcePaint:()=>annotations?.layout()}):null;
 const figures=b.whole&&!modeTex?documentFigureTools(project,b.document):null;
 const bibliography=b.whole?document.createElement('section'):null;
 if(bibliography){bibliography.dataset.biblio='';bibliography.className='studioBibliography';}
 let citationTimer;
 function refreshCitations(formatted){
  clearTimeout(citationTimer);
  const text=current;
  return styleReader(d,{draft:b.whole?{text,format:b.format}:undefined,footer:bibliography,formatted,
   isCurrent:()=>!b.whole||current===text,measure:()=>ed?.view.requestMeasure()});
 }
 const caretKey=draftKey+':caret';let bookmark=null,caretTimer=0;
 if(b.whole)try{bookmark=JSON.parse(localStorage.getItem(caretKey))}catch{}
 const resume=writingViews.get(draftKey);if(resume){sourcePos=resume.sourcePos;sourceEnd=resume.sourceEnd;scrolls=resume.scrolls;scrollAt=resume.scrollAt||{}}
 let editStage=resume?.editStage||bookmark?.stage||'rich',equationDialog=null,managementDialog=null,insertMenu=null;
 try{const prev=JSON.parse(localStorage.getItem(draftKey)||'null');if(prev&&prev.text!==last){if(prev.rev===rev){current=prev.text;status.textContent='已恢复上次未保存的草稿'}else{const btn=document.createElement('button');btn.textContent='下载先前冲突草稿';btn.onclick=()=>downloadSch(prev.text,'冲突草稿.'+(modeTex?'tex':'md'),'text/plain');d.querySelector('[data-writing-records]').append(btn)}}}catch{}
 // A normal reopen restores an insertion point, never a selection that typing could replace.
 let restoredStage=null;
 const exactResume=resumeDocument&&resume?.rev===rev&&current===last;
 if(b.whole&&bookmark&&!exactResume){
  const {pos,left,right}=bookmark;let at=-1;
  if(Number.isInteger(pos)&&pos>=0&&typeof left==='string'&&typeof right==='string'){
   if(pos<=current.length&&current.slice(Math.max(0,pos-left.length),pos)===left&&current.slice(pos,pos+right.length)===right)at=pos;
   else if(left||right){const sample=left+right,found=current.indexOf(sample);if(found>=0&&current.indexOf(sample,found+1)<0)at=found+left.length}
  }
  if(at>=0){sourcePos=sourceEnd=at;restoredStage=bookmark.stage==='source'?'source':'rich';scrollAt={}}
 }
 function recordCaret(){clearTimeout(caretTimer);if(!b.whole||ended||switching||stage==='proof')return;
  const pos=stage==='source'?src.selectionEnd:modeTex?tex?.offset?.():ed?.view?.state.selection.main.head;
  if(!Number.isInteger(pos)||pos<0||pos>current.length)return;
  const entry={stage,pos,left:current.slice(Math.max(0,pos-32),pos),right:current.slice(pos,pos+32)};
  try{localStorage.setItem(caretKey,JSON.stringify(entry))}catch{}
 }
 function queueCaret(){if(b.whole&&!switching&&!ended){clearTimeout(caretTimer);caretTimer=setTimeout(recordCaret,100)}}
 const planSlot=document.createElement('div');d.querySelector('.studioSelection').after(planSlot);
 const planner=part||b.whole?null:writingPlanUI(planSlot,b);let lastPlan=JSON.stringify(planner?.read()||null);
 const planChanged=()=>JSON.stringify(planner?.read()||null)!==lastPlan;
 planSlot.oninput=()=>{status.textContent='写作思路有未保存修改';persistLocal()};
 try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(planner&&saved?.plan&&saved.rev===rev){const restored=writingPlanUI(planSlot,{...b,writingPlan:saved.plan});planner.read=restored.read}}catch{}
 const persistLocal=()=>{try{if(current!==last||planChanged())localStorage.setItem(draftKey,JSON.stringify({rev,text:current,plan:planner?.read()}));else localStorage.removeItem(draftKey)}catch{}}
 function count(){d.querySelector('.wordCount').textContent=(current.match(/[\u3400-\u9fff]|[\p{L}\p{N}]+/gu)||[]).length+' 字 / 词'}
 function dirty(){mdWriting?.repaint();if(switching)return;queueCaret();current=stage==='rich'&&modeTex?tex.read():stage==='rich'?ed.getMarkdown():src.value;count();annotations?.layout();toc?.schedule();if(!stale)paintSave('dirty','有未保存修改');
 if(b.whole&&stage==='rich'){clearTimeout(citationTimer);citationTimer=setTimeout(refreshCitations,240)}
 clearTimeout(localTimer);localTimer=setTimeout(persistLocal,200);queueAutosave();draftFooter?.dirty()}
 let draftFooter=null;
 let richNodes=[];
 function richMappings(){let cursor=0;const spans=[];for(const node of richNodes){const start=current.indexOf(node.text,cursor);if(start>=0){spans.push({...node,start,end:start+node.text.length});cursor=start+node.text.length}}return spans}
 function toRich(at){if(ed?.live)return at;const spans=richMappings(),s=spans.find(s=>s.start<=at&&at<=s.end);if(s)return s.pos+at-s.start;const next=spans.find(s=>s.start>at);return next?.pos??(spans.at(-1)?spans.at(-1).pos+spans.at(-1).text.length:1)}
 function toSource(at){if(ed?.live)return at;const spans=richMappings(),s=spans.find(s=>s.pos<=at&&at<=s.pos+s.text.length);if(s)return s.start+at-s.pos;return spans.find(s=>s.pos>at)?.start??current.length}
 function citationsPlugin({pmState:{Plugin},pmView:{Decoration,DecorationSet}}){return {wysiwygPlugins:[()=>{
  function build(doc){const ds=[];richNodes=[];doc.descendants((n,pos)=>{if(n.isText)richNodes.push({text:n.text,pos});if(!n.isText||n.marks.some(m=>m.type.name==='code'))return;for(const m of n.text.matchAll(/\[([^\[\]\n]{1,250})\]|\{\{(ref:)?([FT]\d+)\}\}/g)){if(m[1]?!parseKeys(m[1]).length:!objects()[m[3]])continue;const start=pos+m.index,end=start+m[0].length;
   ds.push(Decoration.inline(start,end,{class:'lxCiteSource'}),Decoration.widget(end,()=>{const span=document.createElement('span');if(m[3]){const o=objects()[m[3]];span.innerHTML=(m[2]?'':exhibitHTML(o))+toolButton(m[2]?(o.kind==='figure'?'Fig. ':'Table ')+o.id.slice(1):'编辑'+(o.kind==='figure'?'图片':'表格'),'data-visual="'+E(o.id)+'"');if(!m[2])setTimeout(()=>hydrateFigures(span),0)}else{span.textContent=m[0];enhanceProse(span);for(const el of span.querySelectorAll('[data-ref]')){el.dataset.sentence=citedSentence(n.text,m.index);el.dataset.occ=citePosition(n.text,m.index,el.dataset.ref)}}return span},{key:m[0]+'@'+(objects()[m[3]]?.rev||0)+':'+(m[1]?citedSentence(n.text,m.index):''),side:-1}))}});return DecorationSet.create(doc,ds)}
  const plugin=new Plugin({state:{init:(_,state)=>build(state.doc),apply:(tr,prev)=>tr.docChanged?build(tr.doc):prev},props:{decorations:state=>plugin.getState(state)}});return plugin}]}}
 citationClicks(rich);rich.addEventListener('scholarchange',()=>{if(stage==='rich'&&ed){switching=true;ed.setMarkdown(current,false);switching=false}})
 let selectedQuote='',ended=false,annotations=null,toc=null;
 const selectionFloat=attachSelectionTools({root:d,panel:d.querySelector('.studioSelection'),source:src,surface:()=>stage==='source'?src:stage==='proof'?proof:rich,onSelection:q=>{selectedQuote=q}});
 if(nativeChat){const button=document.createElement('button');button.type='button';button.textContent='回看思路';button.dataset.paragraphRecall='';d.querySelector('.studioSelection').append(button);button.onpointerdown=e=>e.preventDefault();button.onclick=e=>{e.stopPropagation();if(selectedQuote)openParagraphRecall(project,selectedQuote)}}
 const selectionTools=()=>selectionFloat.refresh();
 d.addEventListener('pointerdown',e=>{if(e.target.closest('.studioTools,.studioSelection'))capture()});
 function capture(){
  if(stage==='source'){sourcePos=src.selectionStart;sourceEnd=src.selectionEnd;scrolls.source=src.scrollTop}
  if(stage==='rich'&&ed){
   richPos=ed.getSelection();scrolls.rich=ed.getScrollTop();
   try{sourcePos=toSource(richPos[0]);sourceEnd=toSource(richPos[1])}catch{}
  }
  if(stage==='rich'&&modeTex){sourcePos=sourceEnd=tex?.offset()??0;scrolls.rich=rich.scrollTop}
  if(stage==='proof'){scrolls.proof=proof.scrollTop;const r=draftDOMSelection(proof,current);if(r){sourcePos=r.start;sourceEnd=r.end}else sourceEnd=sourcePos}
  if(stage)scrollAt[stage]=sourcePos;
 }
 function captureTocPosition(){capture();return {stage,readingEntry:stage==='proof'&&readingEntry?{...readingEntry}:null,from:sourcePos,to:sourceEnd,top:scrolls[stage]||0,backward:stage==='source'?src.selectionDirection==='backward':ed?.view.state.selection.main.anchor>ed?.view.state.selection.main.head}}
 function restoreTocPosition(position){
  if(position.stage!==stage)setStage(position.stage);
  if(stage==='source'){src.setSelectionRange(position.from,position.to,position.backward?'backward':'forward');focusText();src.scrollTop=position.top}
  else if(stage==='proof'){focusText();proof.scrollTop=position.top;readingEntry=position.readingEntry}
  else if(modeTex){tex?.restore(position.to);rich.scrollTop=position.top}
  else if(ed){
   ed.view.dispatch({selection:{anchor:position.backward?position.to:position.from,head:position.backward?position.from:position.to}});
   ed.focus();ed.setScrollTop(position.top);
  }
  capture();queueCaret();
 }
 function paintProof(){
  const html=modeTex?renderTex(current,equationContext):window.manuscriptRenderMarkdown(ManuscriptEquations.materialize(figures?figures.markdown(current):current,b.format,equationContext));
  if(figures){const template=document.createElement('template');template.innerHTML=html;figures.proof(template.content,current);proof.replaceChildren(template.content)}else proof.innerHTML=html;
  enhanceProse(proof);if(b.whole)proof.insertAdjacentHTML('beforeend','<section class="studioBibliography" data-biblio></section>');
 }
 let stopViewportHold=()=>{},readingEntry=null;
 function activeSurface(){
  return stage==='proof'?proof:stage==='source'?src:ed?.live?ed.view.scrollDOM:rich;
 }
 function viewportAnchor(caret){
  const v=manuscriptViewport(activeSurface(),current,stage==='rich'?ed?.view:null);
  try{return v.capture(caret)}finally{v.dispose()}
 }
 function workspaceAnchor(){
  if(stage!=='proof')return viewportAnchor(sourceEnd);
  const selected=draftDOMSelection(proof,current);
  const samePlace=readingEntry&&Math.abs(proof.scrollTop-readingEntry.top)<2;
  if(!selected&&samePlace)return {at:readingEntry.at,dy:readingEntry.dy??0,image:readingEntry.image};
  return viewportAnchor(selected?.end);
 }
 function holdViewport(anchor){
  stopViewportHold();const surface=activeSurface(),mode=stage,events=new AbortController();
  let frame=0,first=true,framesLeft=3;
  function align(){
   if(ended||mode!==stage||!d.isConnected)return;
   const cm=mode==='rich'?ed?.view:null,v=manuscriptViewport(surface,current,cm);
   try{if(!v.align(anchor)&&first&&cm)ed.reveal(anchor.at,false)}finally{v.dispose()}
   first=false;expected=surface.scrollTop;
   if(mode==='proof'&&readingEntry)readingEntry.top=surface.scrollTop;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;align();if(framesLeft-->0)schedule()})}
  const observer=new ResizeObserver(schedule);observer.observe(surface);
  if(mode==='rich'&&ed?.view)observer.observe(ed.view.contentDOM);
  for(const evt of ['pointerdown','wheel','touchstart','keydown','beforeinput'])d.addEventListener(evt,stop,{capture:true,passive:true,signal:events.signal});
  let expected=surface.scrollTop;
  surface.addEventListener('scroll',()=>{if(Math.abs(surface.scrollTop-expected)>2&&mode==='proof')stop()},{signal:events.signal});
  surface.addEventListener('load',schedule,{capture:true,signal:events.signal});
  function stop(){events.abort();observer.disconnect();cancelAnimationFrame(frame);stopViewportHold=()=>{}}
  stopViewportHold=stop;align();schedule();
 }
 function setStage(to,continueReading=false){if(to===stage)return;stopViewportHold();if(to==='proof')recordCaret();capture();
 const sameReadingPlace=stage==='proof'&&readingEntry&&Math.abs(proof.scrollTop-readingEntry.top)<2;
 const selected=continueReading&&stage==='proof'&&draftDOMSelection(proof,current);
 const caret=stage!=='proof'?sourceEnd:selected?selected.end:sameReadingPlace?readingEntry.at:null;
 const anchor=continueReading&&viewportAnchor(caret);
 if(anchor&&stage==='proof'){
  const range=anchor.caret&&(selected||readingEntry?.selection);
  sourcePos=range?range.start:anchor.at;sourceEnd=range?range.end:anchor.at;
 }
 readingEntry=to==='proof'&&anchor?{...anchor,top:0,selection:anchor.caret?{start:sourcePos,end:sourceEnd}:null}:null;
 switching=true;if(stage==='source')current=src.value;if(stage==='proof')figures?.release(proof);stage=to;if(to!=='proof')editStage=to;d.dataset.stage=to;d.querySelector('[data-format]').hidden=true;src.hidden=to!=='source';rich.hidden=to!=='rich';proof.hidden=to!=='proof';for(const btn of d.querySelectorAll('[data-stage]'))btn.setAttribute('aria-pressed',btn.dataset.stage===to)
 if(b.whole){
  insertMenu?.close();
  const toggle=d.querySelector('[data-toggle-mode]'),reading=to==='proof';
  toggle.setAttribute('aria-label',reading?'切换到编辑模式':'切换到阅读模式');
  toggle.title=reading?'阅读模式 · 切换到编辑':(to==='source'?'源码模式':'编辑模式')+' · 切换到阅读';
  toggle.querySelector('[data-mode-icon="edit"]').toggleAttribute('hidden',reading);
  toggle.querySelector('[data-mode-icon="read"]').toggleAttribute('hidden',!reading);
  d.querySelector('[data-source-mode]').setAttribute('aria-pressed',String(editStage==='source'));
  d.querySelector('[data-open-insert]').hidden=reading;
  const materialize=d.querySelector('[data-materialize-figures]');if(materialize)materialize.hidden=reading;
 }
 if(to==='source')src.value=current;
 mdWriting?.sync();
 if(to==='source'){src.focus({preventScroll:true});src.setSelectionRange(Math.min(sourcePos,current.length),Math.min(sourceEnd,current.length));if(restoredStage==='source')revealTextareaRange(src,sourcePos,sourceEnd);else src.scrollTop=scrollAt.source===sourcePos?scrolls.source||0:src.scrollHeight*(sourcePos/Math.max(1,current.length))}
 if(to==='rich'&&modeTex){tex=texEditor(rich,current,dirty,equationContext);if(bibliography)rich.append(bibliography);if(restoredStage==='rich'||exactResume&&sourceEnd)tex.restore(sourceEnd);if(exactResume&&scrollAt.rich===sourcePos)rich.scrollTop=scrolls.rich||0}else if(to==='rich'){if(!ed)ed=new window.ManuScriptLiveEditor({el:rich,initialValue:current,onChange:dirty,figures,equationContext,footer:bibliography,renderToken:renderManuscriptToken,onSelection:()=>{selectionTools();annotations?.layout();queueCaret()}});else ed.setMarkdown(current,false);if(!ed._lxBound){ed.on('change',dirty);ed._lxBound=true}try{ed.setSelection(toRich(sourcePos),toRich(sourceEnd))}catch{if(richPos)try{ed.setSelection(...richPos)}catch{}}
 ed.focus();if(scrollAt.rich===sourcePos)ed.setScrollTop(scrolls.rich||0)}
 if(to==='proof'){
 paintProof();proof.scrollTop=scrollAt.proof===sourcePos?scrolls.proof||0:proof.scrollHeight*(sourcePos/Math.max(1,current.length));
 const needle=exactResume||anchor?'':current.slice(sourcePos,sourceEnd>sourcePos?sourceEnd:sourcePos+35).split('\n')[0];if(needle){const walker=document.createTreeWalker(proof,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode())if(n.data.includes(needle)){const r=new Range();r.setStart(n,n.data.indexOf(needle));r.collapse(true);const box=r.getBoundingClientRect();proof.scrollTop+=box.top-proof.getBoundingClientRect().top-20;break}}}switching=false;count();selectionTools();refreshCitations();annotations?.layout();toc?.refresh();if(anchor)holdViewport(anchor)}
 function insert(t,caret){
  if(stage==='proof'){setStage('rich');capture()}
  let [from,to]=stage==='rich'&&ed?richPos||ed.getSelection():[sourcePos,sourceEnd];
  if(!modeTex&&from===to&&t.startsWith('[@')){
   const cluster=joinCitation(current,from,t);
   if(cluster)({from,to,value:t}=cluster);
  }
  if(stage==='rich'&&modeTex){if(!tex.put(t)){setStage('source');insert(t)}return}
  if(stage==='rich'){
   ed.setSelection(from,to);ed.insertText(t,caret);
  }else{
   src.setRangeText(t,from,to,'end');const at=from+(caret??t.length);src.setSelectionRange(at,at);src.focus();dirty();
  }
 }
 function setFigureSelection(from,to=from){
  if(stage==='rich'){ed.setSelection(from,to);richPos=[from,to]}
  else revealTextareaRange(src,from,to);
  sourcePos=from;sourceEnd=to;
 }
 function figureSnippet(o,includeCaption){
  const asset=paper.assets.find(a=>a.id===o.asset);
  if(!asset)throw Error('找不到这张图片的原件。');
  const alt=(o.caption||asset.name).trim();
  const caption=includeCaption?[o.caption,o.credit].filter(Boolean).join(' — ').replace(/\s+/g,' ').trim():'';
  return manuscriptFigureImage(documentImagePath(asset),alt)+manuscriptFigureAnchor(newManuscriptFigureId())+'\n\n**图注** '+caption;
 }
 function insertFigures(objects,includeCaption){
  const text='\n\n'+objects.map(o=>figureSnippet(o,includeCaption)).join('\n\n');
  insert(text+'\n\n',text.length);
 }
 const figureEditing=figures&&{
  rows:()=>{
   const parsed=figures.scan(current);
   return parsed.entries.map(row=>({...row,basis:current,duplicate:row.id&&!parsed.ids.get(row.id),
    section:toc.sectionAt(row.from).join(' › ')||'正文开头'}));
  },
  reference(row){
   if(row.basis!==current)throw Error('正文已变化，请重新打开图片列表。');
   insert('[图](#'+row.id+')');
  },
  number(row){
   if(row.basis!==current)throw Error('正文已变化，请重新打开图片列表。');
   const anchor=manuscriptFigureAnchor(newManuscriptFigureId());
   if(row.captionFrom===null){
    const caption=row.id?row.alt:manuscriptLegacyFigureCaption(row.alt);
    setFigureSelection(row.imageEnd,row.end);
    insert(anchor+'\n\n**图注** '+caption);
   }else if(!row.id){
    const firstLine=current.slice(row.start).split('\n',1)[0];
    const caption=manuscriptLegacyFigureCaption(firstLine);
    const gap=current.slice(row.end,row.captionFrom);
    setFigureSelection(row.imageEnd,row.start+firstLine.length-caption.length);
    insert(anchor+gap+'**图注** ');
   }else{
    setFigureSelection(row.imageEnd,row.end);
    insert(anchor);
    setFigureSelection(row.start+anchor.length-(row.end-row.imageEnd));
   }
  },
  add(o){insertFigures([o],true)},
  focus:focusText
 };
 if(figures){
  figures.jump=id=>{
   const row=figures.scan(current).ids.get(id);if(!row)return;
   if(stage==='rich'){ed.reveal(row.from,false);ed.focus()}
   else if(stage==='proof')proof.querySelector('#'+id)?.parentElement.scrollIntoView({block:'start'});
  };
  proof.addEventListener('click',e=>{
   const link=e.target.closest('.msFigureReference');
   if(link){e.preventDefault();figures.jump(link.getAttribute('href').slice(1))}
  });
  const supportedImage=file=>['image/png','image/jpeg','image/webp'].includes(file.type)||
   (!file.type&&/\.(?:png|jpe?g|webp)$/i.test(file.name));
  async function insertFiles(files,event){
   const basis=current,startStage=stage;
   capture();
   const at=event.type==='drop'&&stage==='rich'?ed.view.posAtCoords({x:event.clientX,y:event.clientY}):null;
   const from=at??sourcePos,to=at??sourceEnd,stored=[];
   try{
    for(const [i,file] of files.entries()){
     const name=file.name||'粘贴图片-'+(i+1)+'.png',caption=name.replace(/\.[^.]+$/,'').slice(0,1200);
     stored.push(await api('exhibit_save',{project,kind:'figure',name,caption,data:await bytes64(file)}));
    }
    if(ended||project!==proj)return;
    await refreshSch();
    if(ended||current!==basis||stage!==startStage||isComposing())throw Error('图片已加入图表库。编辑位置已改变，请从「插入 → 图片」选择。');
    setFigureSelection(from,to);insertFigures(stored,false);
   }catch(error){if(!ended)d.querySelector('.schError').textContent=error.message}
  }
  for(const name of ['paste','dragover','drop'])d.addEventListener(name,event=>{
   const surface=stage==='rich'?rich:stage==='source'?src:null;
   if(!surface?.contains(event.target))return;
   const transfer=event.clipboardData||event.dataTransfer;
   const files=[...(transfer?.files||[])].filter(supportedImage);
   const dragging=name==='dragover'&&[...(transfer?.items||[])].some(item=>item.kind==='file'&&/^image\/(png|jpeg|webp)$/.test(item.type));
   if(!files.length&&!dragging)return;
   // Leave Markdown/HTML text in a mixed clipboard payload to the regular editor.
   if(name==='paste'&&transfer.getData('text/plain').trim())return;
   event.preventDefault();event.stopPropagation();
   if(name!=='dragover')insertFiles(files,event);
  },true);
 }
 function openEquations(){
  capture();
  const basis=current;
  const range={from:sourcePos,to:sourceEnd};
  equationDialog=ManuscriptEquations.open({text:basis,format:b.format,range,
   sectionAt:offset=>toc?.sectionAt(offset)||[],
   apply(from,to,value){
    if(ended||proj!==project||current!==basis||stage==='proof')throw Error('稿件已变化，请关闭后重新打开公式面板。');
    if(current.slice(from,to)===value)return;
    if(stage==='rich'&&!modeTex){ed.setSelection(from,to);ed.insertText(value)}
    else{
     if(stage!=='source')setStage('source');
     src.setRangeText(value,from,to,'end');dirty();revealTextareaRange(src,from+value.length,from+value.length);
    }
   }});
  equationDialog.addEventListener('close',()=>{equationDialog=null;if(!ended)focusText()},{once:true});
 }
 function openManagement(){
  const position=captureTocPosition();
  const usable=()=>!ended&&proj===project;
  function requireBasis(basis){
   if(!usable()||current!==basis||isComposing())throw Error('稿件已变化，请重新打开稿件管理。');
  }
  managementDialog=openManuscriptManagement({read:()=>current,format:b.format,headings:()=>toc.managementHeadings(),figures,
   caret:stage==='proof'?toc.managementOffset():position.to,
   restore:()=>{if(usable())restoreTocPosition(position)},
   locate(from,to){
    if(!usable())return;
    if(stage==='proof'){
     const image=proof.querySelector('[data-document-image-from="'+from+'"]');
     const range=image?null:draftDOMRange(proof,current,from,to);
     if(image||range){
      const target=image?.getBoundingClientRect()||range.getClientRects()[0];
      (image?.matches('button')?image:proof).focus({preventScroll:true});
      if(range){getSelection().removeAllRanges();getSelection().addRange(range)}
      if(target)proof.scrollTop+=target.top+target.height/2-proof.getBoundingClientRect().top-proof.clientHeight/2;
      selectionFloat.dismiss();capture();queueCaret();return;
     }
     setStage(editStage);
    }
    if(stage==='rich'&&ed){ed.revealCentered(from,to);ed.focus()}
    else{if(stage!=='source')setStage('source');revealTextareaRange(src,from,to,.5)}
    selectionFloat.dismiss();capture();queueCaret();
   },
   async updateFormula(item,value,basis){
    requireBasis(basis);
    if(value!==item.content){
     const replacement=ManuscriptEquations.replaceBody(item,value);
     if(stage==='rich'&&!modeTex){ed.setSelection(item.bodyStart,item.bodyEnd);ed.insertText(replacement)}
     else{
      if(stage!=='source')setStage('source');
      src.setRangeText(replacement,item.bodyStart,item.bodyEnd,'end');dirty();
     }
    }
    return await save();
   },
   async updateFile(exhibit,command,name,basis){
    requireBasis(basis);
    if(!await save())throw Error('请先保存当前正文。');
    requireBasis(basis);
    const documentRev=rev;
    const rec=command==='remove'?await api('exhibit_remove',{project,id:exhibit.id,rev:exhibit.rev,documentRev}):
     await api('exhibit_save',{project,...exhibit,rename:name,documentRev});
    const next=await api('state',{project});
    requireBasis(basis);updateReader(next,project);
    if(rec.renamed){
     const updated=await api('document_read',{project});
     requireBasis(basis);
     last=current=updated.text;rev=updated.rev;persistLocal();
     const visible=stage;
     if(visible==='proof')figures?.release(proof);
     stage='';setStage(visible);draftFooter?.refresh();await annotations?.refresh();
    }
   }
  });
  managementDialog.addEventListener('close',()=>{managementDialog=null},{once:true});
 }
 async function saveEditorSettings(floatingToc,figureLabelStyle){
  const previous=ManuscriptFigureSettings.style(paper.settings?.figureLabelStyle);
  const result=await api('settings',{project,values:{floatingToc,figureLabelStyle}});
  if(ended||proj!==project)return;
  paper.settings=result.settings;
  if(!figures||previous===figureLabelStyle)return;
  ed?.refreshPreview();
  if(stage==='proof'){
   const top=proof.scrollTop;figures.release(proof);paintProof();proof.scrollTop=top;
   refreshCitations();annotations?.layout();
  }
 }
 function recordLink(p){
 const rec=p.assets.filter(a=>a.role==='写作留档'&&a.name.startsWith('写作记录-'+b.id+'-')).at(-1);
 if(rec){let link=d.querySelector('[data-writing-record]');if(!link){link=document.createElement('button');link.dataset.writingRecord='';link.textContent='下载写作记录';d.querySelector('[data-writing-records]').append(link)}link.onclick=async()=>{const file=await api('file',{project,asset:rec.id});downloadSch(blobFrom(file.data,'text/markdown'),rec.name)}}
 }
 async function save(){if(isComposing())return false;if(pendingSave){if(!await pendingSave||isComposing())return false;if((current!==last||planChanged())&&!stale)return save();return !stale}if(current===last&&!planChanged()){if(stale){stale=false;paintSave('saved','工作稿已保存')}return true}const content=current,plan=planner?.read(),planText=JSON.stringify(plan||null),includePlan=planText!==lastPlan
 paintSave('saving','正在保存工作稿…');
 pendingSave=(async()=>{try{const p=await api(b.whole?'document_edit':'edit',{project,block:b.id,rev,...(includePlan?{writingPlan:plan}:{}),passage:part?{node:part.node,offset:[...b.text.slice(0,part.start)].length,old:last,text:content}:undefined,text:part?b.text.slice(0,part.start)+content+b.text.slice(part.start+part.text.length):content,label:'编辑正文：'+b.title});figures?.saved(p.blocks);last=content;lastPlan=planText;stale=false;rev=b.whole?p.documentRev:p.blocks.find(x=>x.id===b.id).rev;if(proj===project){updateReader(p,project);if(part&&!content.includes(by(part.node)?.anchor?.quote))incoming(project,await api('team_state',{project}))}persistLocal();if(current===last&&!planChanged())paintSave('saved',p.manuscriptBackup?.state==='pending'?'工作稿已保存，备份待补':'工作稿已保存');else paintSave('dirty','有未保存修改');draftFooter?.refresh();if(!b.whole)refreshCitations();
 recordLink(p);annotations?.refresh().catch(e=>status.textContent=e.message);
 return true}catch(e){paintSave('error','保存失败 · '+e.message+'。输入已在本机保留。');persistLocal();stale=true;return false}})();try{return await pendingSave}finally{pendingSave=null}}
 for(const btn of d.querySelectorAll('[data-engage],[data-stage]'))btn.onmousedown=e=>e.preventDefault()
 recordLink(paper);src.oninput=dirty;src.onblur=()=>{sourcePos=src.selectionStart;sourceEnd=src.selectionEnd};citationClicks(proof);
 if(b.whole)bindCitationStyle(d,'document',{
  draft:()=>({text:current,format:b.format}),
  apply:async(data,draft)=>{await refreshCitations(current===draft.text?data:undefined);window.msToast?.('已更新引用样式')},
  onError:err=>{d.querySelector('.schError').textContent=err.message},
 });
 src.addEventListener('select',queueCaret);if(b.whole)window.addEventListener('pagehide',recordCaret)
 const startAutosave=()=>setInterval(()=>{if(!stale&&(current!==last||planChanged()))save()},Math.max(10,Number(paper.settings?.saveSeconds)||60)*1000);timer=startAutosave();
 let pausePosition;
 function finish(){if(ended)return;stopViewportHold();if(!pausePosition){recordCaret();capture()}window.removeEventListener('pagehide',recordCaret);writingViews.set(draftKey,{rev,anchor:pausePosition?.anchor||(b.whole&&workspaceAnchor()),sourcePos,sourceEnd,scrolls,scrollAt,stage,editStage});ended=true;insertMenu?.destroy();equationDialog?.close();managementDialog?.close();annotations?.destroy();toc?.destroy();selectionFloat.destroy();clearInterval(timer);clearTimeout(localTimer);clearTimeout(autoTimer);clearTimeout(citationTimer);window.removeEventListener('beforeunload',beforeUnload);draftFooter?.destroy();figures?.destroy();mdWriting?.destroy();persistLocal();ed?.destroy();if(inlineStudio?.el===d)inlineStudio=null;slot.remove();onFinish()}
 const close=async()=>{if(isComposing())return false;if(annotations&&!await annotations.flush()){status.textContent='批注未能保存，输入已保留';return false}if(await save()){if(isComposing())return false;if(current!==last||planChanged())return close();finish();return true}if(stale&&!d.querySelector('[data-recover]'))d.querySelector('.studioFoot').insertAdjacentHTML('beforeend',toolButton('下载草稿并关闭','data-recover'));return false}
 d.querySelector('[data-x]').onclick=async()=>{if(await close()&&b.whole)showPage('map','root')};inlineStudio={document:!!b.whole,selection:selectionFloat,close,save,flush:async()=>await save()&&(!annotations||await annotations.flush()),el:d,pause(){
  stopViewportHold();recordCaret();pausePosition=captureTocPosition();pausePosition.anchor=workspaceAnchor();clearInterval(timer);clearTimeout(autoTimer);clearTimeout(caretTimer);
  selectionFloat.dismiss();
 },wake(){
  timer=startAutosave();const saved=pausePosition;pausePosition=null;
  restoreTocPosition(saved);toc?.layout();ed?.view.requestMeasure();
 },release:finish,clean:()=>current===last&&!isComposing(),markHeading:from=>toc?.markHeading(from),headingInk:from=>toc?.headingInk(from),matches:doc=>rev===doc.rev&&current===last&&!isComposing(),motionOrigin(){
  capture();const anchor=workspaceAnchor(),at=anchor?.at??sourceEnd;
  return {...toc?.motionOrigin(at),at};
 },stage:()=>stage,caret:()=>{capture();return sourceEnd},setStage,focusText,revealReference,jumpToHeading:link=>{stopViewportHold();return toc?.jumpToLink(link)},refreshHeadingLinks:()=>toc?.refreshLinks()};
 async function revealReference(ref){
  stopViewportHold();
  if(ref.project!==project||ref.version!==paperVersion||current!==last)return false;
  const start=[...current].slice(0,ref.documentStart).join('').length,end=[...current].slice(0,ref.documentEnd).join('').length;
  if(current.slice(start,end)!==ref.quote)return false;
  if(stage==='rich'&&ed){ed.setSelection(toRich(start),toRich(end));ed.focus()}
  else if(stage==='proof'){const range=draftDOMRange(proof,current,start,end);if(!range)return false;getSelection().removeAllRanges();getSelection().addRange(range);range.startContainer.parentElement.scrollIntoView({block:'center'})}
  else{setStage('source');revealTextareaRange(src,start,end)}
  sourcePos=start;sourceEnd=end;selectionFloat.dismiss();return true
 }
 const beforeUnload=e=>{recordCaret();if(current!==last||pendingSave){persistLocal();e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',beforeUnload);
 if(b.whole){draftFooter=manuscriptDraftFooter({root:d,project,save:async()=>await save()&&(!annotations||await annotations.flush()),rev:()=>rev,status,isDirty:()=>current!==last,refreshNotes:()=>annotations?.refresh()});annotations=manuscriptAnnotations({root:d,project,surface:()=>stage==='source'?src:stage==='proof'?proof:rich.querySelector('.cm-scroller')||rich,editor:()=>stage==='rich'?ed:null,text:()=>current,stage:()=>stage,reveal:ref=>revealDraftReference({...ref,project}),save,sectionAt:offset=>toc?.sectionAt(offset)});annotations.refresh().catch(e=>status.textContent=e.message);toc=manuscriptTOC({root:d,onReadingJump:at=>{readingEntry={at,top:proof.scrollTop,selection:{start:at,end:at}}},text:()=>current,revision:()=>current===last?rev:null,stage:()=>stage,editor:()=>ed,tex:()=>tex,source:src,proof,format:b.format,title:b.title,capturePosition:captureTocPosition,restorePosition:restoreTocPosition,focusText,settings:paper.settings?.floatingToc,figureStyle:()=>paper.settings?.figureLabelStyle,saveSettings:saveEditorSettings})}
 insertMenu=documentInsertMenu(d,{
  citationAt(event){
   if(stage!=='rich'||!ed?.live||isComposing())return null;
   let range,rect;
   if(event){
    const widget=event.target.closest('[data-citation-source]');
    if(!widget||!ed.view.contentDOM.contains(widget))return null;
    const from=ed.view.posAtDOM(widget);
    range={from,to:from+widget.dataset.citationSource.length};
    if(current.slice(from,range.to)!==widget.dataset.citationSource)return null;
   }else{
    const [from,to]=ed.getSelection();
    range=window.manuscriptLinkAt(current,from);
    if(!range||to>range.to)return null;
    rect=ed.coords(range.from);
   }
   const members=citationMembers(current.slice(range.from,range.to));
   return members.length?{...range,members,basis:current,rect}:null;
  },
  editCitation(target){
   editCitationGroup(target.members,members=>{
    if(stage!=='rich'||ended||current!==target.basis)throw Error('正文已变化，请重新选择引文。');
    ed.setSelection(target.from,target.to);
    ed.insertText(citationMarkup(members));
   });
  },
  viewCitation(target){viewCitationSources(target.members)},
  surface:()=>stage==='source'?src:stage==='rich'?rich:null,focus:focusText,
  prepare(event){
   if(stage==='proof'||isComposing())return false;
   if(event&&stage==='rich'&&ed){
    const at=ed.view.posAtCoords({x:event.clientX,y:event.clientY},false);
    const [from,to]=ed.getSelection();
    if(at!=null&&(at<from||at>to))ed.setSelection(at);
   }
   capture();selectionFloat.dismiss();return true;
  }
 });
 setStage(initialStage||(resumeDocument&&resume?.stage)||restoredStage||resume?.stage||'rich');restoredStage=null;
 if(exactResume&&resume.anchor){
  if(stage==='proof')readingEntry={...resume.anchor,top:proof.scrollTop,selection:null};
  holdViewport(resume.anchor);
 }
 d.addEventListener('manuscript-tools-closed',()=>{toc?.configure(paper.settings?.floatingToc);draftFooter?.refresh();refreshCitations()});
 d.onkeydown=e=>{if(e.isComposing)return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save()}
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='f'){e.preventDefault();d.querySelector('.findBar').hidden=false;d.querySelector('.findBar input').focus()}
  if(e.key==='Escape'&&!d.querySelector('.findBar').hidden){e.preventDefault();e.stopPropagation();d.querySelector('.findBar').hidden=true;focusText()}
 }
 function focusText(){if(stage==='source')src.focus({preventScroll:true});else if(stage==='rich'&&ed)ed.focus();else if(stage==='proof')proof.focus({preventScroll:true});else rich.querySelector('textarea,[contenteditable]')?.focus({preventScroll:true})}
 actionOn(d,async btn=>{const x=btn.dataset
 if(x.saveRetry!==undefined){const focused=document.activeElement===btn;if(await save()&&focused)focusText();return}
 if(x.toggleMode!==undefined){if(!isComposing())setStage(stage==='proof'?editStage:'proof',true);return}
 if(x.sourceMode!==undefined){if(!isComposing())setStage(editStage==='source'?'rich':'source');return}
 if(x.openInsert!==undefined){insertMenu.openFrom(btn);return}
 if(x.citation!==undefined){capture();citationPicker(insert);return}
 if(x.markdownPrefs!==undefined){mdWriting?.settings();return}
 if(x.editorSettings!==undefined){toc?.preferences();return}
 if(x.manuscriptManagement!==undefined){if(!isComposing())openManagement();return}
 if(x.currentWritingFold!==undefined){
  capture();const place=workspaceAnchor()?.at??sourcePos;
  if(!await inlineStudio.flush())return;
  const doc=await api('document_read',{project});
  if(ended||proj!==project||view!=='read')return;
  if(doc.text!==current||doc.rev!==rev)throw Error('稿件已变化，请核对当前正文后再打开折叠写作。');
  const at=Array.from(current.slice(0,place)).length,span=doc.spans.findLast(row=>row.start<=at);
  if(!span||!paperBlock(span.block)?.text.trim())throw Error('请将光标放到有正文的章节，再打开折叠写作。');
  openWritingFold(span.block,offset=>{
   if(ended||proj!==project||view!=='read')return;
   finish();openDocumentEditor(span.block,{paragraphOffset:offset});
  });
  return;
 }
 if(x.documentRecovery!==undefined){
  if(!await save()||annotations&&!await annotations.flush())return;
  openManuscriptRecovery({project,format:b.format,applied:async p=>{
   if(ended||proj!==project)return;
   finish();updateReader(p,project);await openDocumentEditor();
   window.msToast?.(p.manuscriptBackup?.state==='pending'?'已采用外部修改，备份待补':'已采用外部修改');
  }});
  return;
 }
 if(x.documentExport!==undefined){if(await save())exportDialog();return}
 if(x.format!==undefined){const open=d.classList.toggle('format-open');btn.setAttribute('aria-pressed',String(open));return}
 if(x.findClose!==undefined){d.querySelector('.findBar').hidden=true;focusText();return}
 if(x.suggestions!==undefined){if(b.whole){if(await save())await openWritingSuggestions()}else if(await close())await openWritingSuggestions(b.id);return}
 if(x.engage){
  capture();const selectedStart=sourcePos,selectedEnd=sourceEnd,q=current.slice(selectedStart,selectedEnd);
  selectionFloat.dismiss();
  if(x.engage==='chat'){if(await save())talk('lead',b.whole?'root':b.id);return}
  if(!q){status.textContent='请先选中正文中的文字';return}
  if(!await save())return;
  const doc=await api('document_read',{project}),span=b.whole?null:doc.spans.find(s=>s.block===b.id),base=b.whole?0:span?.body;
  if(base===undefined){status.textContent='无法定位原文，请重新选择';return}
  const at=base+[...current.slice(0,selectedStart)].length,end=base+[...current.slice(0,selectedEnd)].length;
  const ctx=await api('draft_context',{project,version:paperVersion,documentStart:at,documentEnd:end,quote:q}),ref=ctx.selection;
  if(x.engage==='highlight'&&annotations)await annotations.highlight(ref);
  else if(x.engage==='evidence'&&annotations){
   const original=current,baseRev=rev;
   const form=modal('为选中原句粘贴依据','<label>实验表摘录<textarea data-excerpt rows="5" maxlength="8000" placeholder="粘贴两行数据，可带表头和单位"></textarea></label><label>写入工作稿的图注<textarea data-caption rows="3"></textarea></label>'+toolButton('保存图注与依据','data-save-excerpt'));
   form.querySelector('[data-caption]').value=q;form.querySelector('[data-excerpt]').focus();
   actionOn(form,async button=>{if(!button.hasAttribute('data-save-excerpt'))return;
    const caption=form.querySelector('[data-caption]').value,excerpt=form.querySelector('[data-excerpt]').value;
    if(!caption.trim()||!excerpt.trim())throw Error('请保留图注并粘贴实验表摘录');
    if(ended||rev!==baseRev||current!==original)throw Error('当前稿已改变，请保留摘录并重新选择原句');
    button.disabled=true;
    try{
     const text=original.slice(0,selectedStart)+caption+original.slice(selectedEnd);
     const p=await api('document_edit',{project,rev:baseRev,text,captionEvidence:{...ref,caption,excerpt}});
     form.close();finish();updateReader(p,project);await openDocumentEditor();
     await inlineStudio?.revealReference({...ref,version:paperVersion,documentEnd:at+[...caption].length,quote:caption});
    }finally{button.disabled=false}
   });
  }
  else if(x.engage==='note'&&annotations)annotations.add(ref);
  else if(x.engage==='note')noteDialog(ref);
  else attachDraftReference(ref);
 }else if(x.stage){if(!isComposing())setStage(x.stage)}else if(x.ok!=null){if(b.whole)await draftFooter.checkpoint();else await save();}else if(x.recover!=null){downloadSch(current,b.title+(modeTex?'.tex':'.md'),'text/plain');finish()}
 else if(x.materializeFigures!=null&&figures){const next=figures.markdown(current);if(next===current){status.textContent='没有需要补入的来源图表';return}setStage('source');src.value=next;dirty();status.textContent='已补入 Markdown 图片链接'}
 else if(x.library){
  const inMenu=btn.closest('.studioInsertMenu'),canInsert=!b.whole||inMenu;
  library(x.library,canInsert?insert:null,!!figures,{kind:x.objectKind,
   quote:b.whole&&inMenu&&x.library==='search',figureEditing:canInsert?figureEditing:null});
 }
 else if(x.equation!=null&&b.whole)openEquations();
 else if(x.equation!=null){const f=modal('插入公式','<label>LaTeX 公式<input aria-label="公式" placeholder="例如 E=mc^2"></label>'+toolButton('插入','data-eq'));actionOn(f,bb=>{if(bb.hasAttribute('data-eq')){const v=f.querySelector('input').value.trim();if(v){f.close();insert('$'+v+'$')}}})}
 else if(x.find!=null){const q=d.querySelector('.findBar');q.hidden=!q.hidden;if(!q.hidden)q.querySelector('input').focus()}
 else if(x.replace!=null){const [find,replace]=d.querySelectorAll('.findBar input');if(!find.value)return;setStage('source');let i=src.value.indexOf(find.value,src.selectionEnd);if(i<0)i=src.value.indexOf(find.value);if(i<0){status.textContent='没有找到文字';return}src.setRangeText(replace.value,i,i+find.value.length,'end');dirty()}})}
function exportDialog(version,label){const d=modal('导出稿件','<p>'+E(label||'当前已保存的工作稿')+'</p><label class=exportNotes><input type=checkbox data-export-writing> 包含旧版章节备注</label><label class=exportNotes><input type=checkbox data-export-notes> 包含原文高亮与批注</label><p><small>Word 原生批注 · PDF 旁注 · Markdown 高亮与批注清单</small></p>'+['docx','pdf','md','tex'].map(f=>toolButton(f.toUpperCase(),'data-out="'+f+'"')).join(' '));actionOn(d,async b=>{if(!b.dataset.out)return;b.disabled=true;try{const f=await callSch('export',{format:b.dataset.out,version,includeWritingNotes:d.querySelector('[data-export-writing]').checked,includeNotes:d.querySelector('[data-export-notes]').checked});downloadSch(blobFrom(f.data,'application/octet-stream'),f.name);d.close()}finally{b.disabled=false}})}
function wordDesk(){
 const d=modal('Word 与 Zotero 引文往返','<p>在 Word 的 Zotero 选项卡修改引文，再导回此项目。此入口只同步引用，不覆盖其他 Word 正文改动。</p><label>交接范围<select data-scope><option value="">整篇稿件</option>'+paper.blocks.filter(b=>b.text).map(b=>'<option value="'+E(b.id)+'">'+E(b.title)+'</option>').join('')+'</select></label><div class="schTools">'+toolButton('导出 Zotero 动态引文稿','data-wordout')+toolButton('导回 Word 核对','data-wordin')+'</div><div data-report></div>');let data,version
 let historyRows=[];const report=d.querySelector('[data-report]'),rows=items=>(historyRows=items).map((r,idx)=>'<div class="refRow"><b>'+E(r.title)+' · '+E(r.status)+'</b><blockquote>'+E(r.current||r.sentence)+'</blockquote><small>'+E(r.old.join(', ')+' → '+(r.new.join(', ')||'待核实')+(r.newTitles?.length?' · 新增书目：'+r.newTitles.join('；'):''))+'</small>'+(r.block?toolButton('定位草稿句','data-wordjump="'+idx+'"'):'')+'</div>').join('')
 if(paper.wordReviews?.length)report.innerHTML='<details><summary>上次导回时的核对记录</summary>'+rows(paper.wordReviews.at(-1).rows)+'</details>'
 actionOn(d,async btn=>{if(btn.disabled)return;btn.disabled=true;try{
 if('wordjump' in btn.dataset){const r=historyRows[Number(btn.dataset.wordjump)],b=paperBlock(r.block);if(!b)return;d.close();const quote=r.current||r.sentence;showPage('read',r.block,{block:r.block,quote});const key=r.needs?.[0]?.key||r.new[0]||r.old[0],occ=r.needs?.[0]?.occ||0;const link=[...document.getElementById('doc-'+b.id).querySelectorAll('[data-ref]')].find(a=>a.dataset.ref===key&&a.dataset.sentence===quote&&Number(a.dataset.occ||0)===occ);if(link){showEvidence(link,b);evidencePane?.querySelector('details')?.setAttribute('open','')}return}
 if('wordout' in btn.dataset){const f=await callSch('word_export',{block:d.querySelector('[data-scope]').value});downloadSch(blobFrom(f.data,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),f.name)}
 if('wordin' in btn.dataset){const f=await filePick('.docx');if(!f)return;report.textContent='正在读取 Word 动态引文字段…';data=await bytes64(f);const v=await callSch('word_preview',{data});version=v.version;report.innerHTML='<p>同一文献、显示变化 '+v.style+' 处 · 未变 '+v.same+' 处 · 需核对 '+v.rows.length+' 处</p>'+rows(v.rows)+(v.rows.length?toolButton('应用引文变化并记录待核对项','data-wordapply'):'<p>文献身份一致，原来的证据和理由已保留。</p>')}
 if('wordapply' in btn.dataset){const v=await callSch('word_apply',{data,version});await refreshSch();report.innerHTML='<p>已处理 · '+E(v.version)+'</p>'+rows(v.rows)}
 }finally{btn.disabled=false}})
}
