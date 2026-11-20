// Manuscript displays refer to immutable keys; citation labels never replace the source anchors.
let styleCache=null,styleRequest=0
const citationViews=new WeakMap();
const builtInStyles=[
 ['keys','稳定引用键'],['apa','APA 7'],['ieee','IEEE'],['nature','Nature'],
 ['nlm-citation-sequence','Vancouver / NLM'],['chicago-author-date','Chicago 18（作者－年份）'],
 ['modern-language-association','MLA 9'],
 ['china-national-standard-gb-t-7714-2025-numeric','GB/T 7714-2025（顺序编码）'],
 ['china-national-standard-gb-t-7714-2025-author-date','GB/T 7714-2025（著者－出版年）'],
 ['china-national-standard-gb-t-7714-2015-numeric','GB/T 7714-2015（顺序编码）'],
];
function styleName(){return paper?.settings?.citationStyle||'keys'}
function currentStyle(){return styleCache?.project===proj&&styleCache.style===styleName()?styleCache:null}
function styleOptions(){
 const options=items=>items.map(([k,v])=>'<option value="'+E(k)+'" '+(styleName()===k?'selected':'')+'>'+E(v)+'</option>').join('');
 const custom=Object.entries(paper?.settings?.citationStyles||{}).map(([k,v])=>[k,v.title]);
 return options(builtInStyles)+(custom.length?'<optgroup label="项目自定义">'+options(custom)+'</optgroup>':'');
}
function citationStyleControls(scope){
 const key=scope==='document'?'data-document-csl':'data-csl';
 return '<label>引用样式<select '+key+'>'+styleOptions()+'</select></label>'+
  toolButton('导入自定义 CSL…','data-csl-import="'+scope+'"');
}
function bindCitationStyle(root,scope,{draft=()=>undefined,apply,onError}){
 const selector=scope==='document'?'[data-document-csl]':'[data-csl]';
 let pending=false;
 async function select(args){
  const input=root.querySelector(selector),project=proj,payload=draft();
  if(pending||!input)return;
  pending=true;input.disabled=true;input.setAttribute('aria-busy','true');
  try{
   const data=await callSch('citation_style',{...payload,...args});
   if(project!==proj)return;
   paper.settings.citationStyle=data.style;
   paper.settings.citationStyles=data.styles;
   for(const select of root.querySelectorAll(selector))select.innerHTML=styleOptions();
   if(root.isConnected)await apply(data,payload);
  }finally{
   pending=false;input.disabled=false;input.removeAttribute('aria-busy');
   if(project===proj)input.value=styleName();
  }
 }
 root.addEventListener('change',e=>{
  if(e.target.matches(selector))select({style:e.target.value}).catch(onError);
 });
 root.addEventListener('click',e=>{
  if(!e.target.closest('[data-csl-import="'+scope+'"]')||pending)return;
  const d=modal('导入自定义引用样式','<p>选择包含文内引文和文末参考文献规则的独立 CSL 样式。导入后将用于当前项目。</p>'+
   '<label>CSL 文件<input type="file" accept=".csl" data-csl-file></label>'+toolButton('导入并应用','data-csl-save'));
  actionOn(d,async button=>{
   if(!button.hasAttribute('data-csl-save'))return;
   const file=d.querySelector('[data-csl-file]').files[0];
   if(!file||file.size>512*1024)throw Error('请选择 512 KB 以内的 CSL 文件。');
   button.disabled=true;
   try{await select({csl:await file.text()});d.close()}finally{button.disabled=false}
  });
 });
}
const citationMarks=[['sc','span class="citationSmallCaps"'],['sup','sup'],['sub','sub'],['u','u'],['i','em'],['b','strong']];
function citationRuns(runs){
 return runs.map(v=>citationMarks.reduce((html,[flag,tag])=>v[flag]?'<'+tag+'>'+html+'</'+tag.split(' ')[0]+'>':html,E(v.text))).join('');
}
async function styleReader(root,{draft,footer,measure,isCurrent=()=>true,formatted}={}){
 if(!root?.isConnected)return;
 const num=++styleRequest,id=proj,style=styleName();
 const current=()=>num===styleRequest&&proj===id&&root.isConnected&&styleName()===style&&isCurrent();
 const key=[id,style,draft?.format,draft?.text,paperVersion,paper.settings.citationStyles?.[style]?.sha];
 const bibliographies=new Set(root.querySelectorAll('[data-biblio]'));
 if(footer)bibliographies.add(footer);
 let cache=citationViews.get(root);
 try{
  if(formatted||!cache?.key.every((value,i)=>value===key[i])){
   cache={key,result:formatted||callSch('citation_format',{style,...draft})};
   citationViews.set(root,cache);
  }
  const data=await cache.result;
  if(!current())return;
  styleCache={...data,style,project:id};
  for(const group of root.querySelectorAll('[data-citegroup]'))applyLabel(group);
  const html=data.entries.length?'<h3>References</h3>'+data.entries.map(x=>'<p><button type="button" class="bibEntry" data-ref="'+E(x.key)+'">'+citationRuns(x.runs||[{text:x.text}])+'</button></p>').join(''):'';
  for(const bib of bibliographies)if(bib.innerHTML!==html)bib.innerHTML=html;
  measure?.();
 }catch(e){
  if(citationViews.get(root)===cache)citationViews.delete(root);
  if(current()){for(const bib of bibliographies)bib.textContent='排版失败：'+e.message;measure?.()}
 }
}
function applyLabel(el){
 const data=currentStyle(),label=data?.groups[el.dataset.citegroup];
 if(el.hasAttribute('data-citation-source')){
  const runs=data?.groupRuns?.[el.dataset.citegroup];
  const html=label?citationRuns(runs||[{text:label}]):E('['+el.dataset.citegroup.split(',').join(', ')+']');
  if(el.innerHTML!==html)el.innerHTML=html;
  return;
 }
 const buttons=[...el.querySelectorAll('button[data-ref]')];if(!buttons.length)return
 if(!label){
  el.replaceChildren('[');buttons.forEach((b,i)=>{if(i)el.append(', ');b.textContent=b.dataset.ref;el.append(b)});el.append(']');return;
 }
 const html=citationRuns(data.groupRuns?.[el.dataset.citegroup]||[{text:label}]);
 if(buttons.length===1){
  if(buttons[0].innerHTML===html&&el.childNodes.length===1)return;
  buttons[0].innerHTML=html;el.replaceChildren(buttons[0]);return;
 }
 // Citeproc can reorder or collapse a cluster. Keep a separate target for every source.
 if(el.firstElementChild?.innerHTML===html&&el.querySelector('.citationChoices'))return;
 el.replaceChildren();const pick=document.createElement('button');pick.type='button';pick.className='citation';pick.innerHTML=html;pick.title='选择这组引文中的文献';pick.setAttribute('aria-expanded','false');el.append(pick);const list=document.createElement('span');list.className="citationChoices";list.hidden=true;pick.onclick=()=>{list.hidden=!list.hidden;pick.setAttribute('aria-expanded',String(!list.hidden))};for(const b of buttons)b.textContent=lib()[b.dataset.ref]?.title||b.dataset.ref;list.append(...buttons);el.append(list)
}
function notesList(r,insert){return '<section><h4>Zotero 阅读笔记</h4>'+(r.zoteroKey?toolButton('同步此文献批注','data-resync'):'从 Zotero 选择同一条目后可同步')+Object.values(r.readingNotes||{}).map((n,i)=>'<div class="refRow"><small>'+E(n.kind==='note'?'笔记':'标注')+' · '+E(n.page?'第 '+n.page+' 页':'页码未记录')+(n.removed?' · 原库已移除':'')+'</small><blockquote>'+E(n.text)+'</blockquote><p>'+E(n.comment)+'</p><a href="zotero://'+(n.attachment?'open-pdf/library/items/'+encodeURIComponent(n.attachment)+'?annotation='+encodeURIComponent(n.key):'select/library/items/'+encodeURIComponent(n.key))+'">在 Zotero 查看 ↗</a> '+(insert?toolButton('引入写作并附来源','data-usenote="'+i+'"'):'')+'</div>').join('')+'</section>'}
async function indexPage(list,bar,rebuild=false){bar.innerHTML='<label>项目检索方案 <select data-idxmode><option value="hybrid">关键词 + 本地主题向量</option><option value="exact">仅精确关键词</option></select></label>'+toolButton('重建本项目索引','data-rebuild');const select=bar.querySelector('select');select.value=paper.settings.indexMode||'hybrid';select.onchange=async()=>{const id=proj;select.disabled=true;try{await callSch('index_policy',{mode:select.value});if(proj===id)paper.settings.indexMode=select.value}catch(e){select.value=paper.settings.indexMode||'hybrid';list.textContent=e.message}finally{select.disabled=false}};const btn=bar.querySelector('button');btn.disabled=true;list.textContent=rebuild?'正在重建，已绑定的原文片段保留…':'正在核对原件…';try{const r=await callSch(rebuild?'index_rebuild':'index_status');list.innerHTML='<p>原文：SQLite FTS5 · 主题向量：本地 '+E(r.model)+'（按项目训练）。'+(r.ready?'向量已就绪':'未生成向量；关键词仍可用')+'。上限 '+r.limit+' 个片段。</p>'+(r.error?'<p>'+E(r.error)+'</p>':'')+r.rows.map(x=>'<div class="refRow"><b>'+E(x.key)+' · '+E(x.name)+'</b><small>'+E(x.status)+' · 有文字 '+x.covered+'/'+x.pages+' 页 · '+x.chunks+' 个片段</small></div>').join('')}catch(e){list.textContent=e.message}finally{btn.disabled=false}}
function originalFigure(o){const loc=o?.sourceRegion;return loc?toolButton(loc.key+' · 原图 '+loc.label+' · 第 '+loc.page+' 页 ↗','data-srcfigure="'+E(o.id)+'"'):''}
function showRegion(o){const l=o.sourceRegion,r=lib()[l.key],ed=r?.editions.find(x=>x.sha===l.sha);if(!ed)return
 const d=modal('对照出版原图 · '+l.key,'<p>'+E(r.title)+'</p><p>'+E(l.label)+' · 第 '+l.page+' 页 · '+E(l.license)+' · 原件 '+E(l.sha.slice(0,16))+'</p><div class="pageRegion"><img alt="原始 PDF 页"><i></i></div><p role="status"></p>')
 const [x,y,w,h]=l.box;d.querySelector('i').style.cssText='left:'+x+'%;top:'+y+'%;width:'+w+'%;height:'+h+'%';callSch('source_page',{key:l.key,sha:l.sha,page:l.page}).then(v=>d.querySelector('img').src='data:image/png;base64,'+v).catch(e=>d.querySelector('[role=status]').textContent=e.message)
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-srcfigure]');if(b){e.preventDefault();showRegion(objects()[b.dataset.srcfigure])}})
function sourceFigureForm(done){const refs=Object.values(lib()).flatMap(r=>r.editions.filter(e=>e.name.toLowerCase().endsWith('.pdf')).map(ed=>({r,ed})));const d=modal('从出版原页引用图片','<label>固定原件<select data-edition>'+refs.map(({r,ed},i)=>'<option value="'+i+'">'+E(r.key+' · '+ed.name)+'</option>').join('')+'</select></label><label>页码<input type="number" min="1" value="1" data-pg></label><label>出版图号<input data-fig placeholder="Figure 1"></label><label>图题<input data-title></label><label>署名与许可<input data-license placeholder="作者、许可或使用依据"></label><label>随章节展示<select data-block>'+paper.blocks.filter(b=>b.text).map(b=>'<option value="'+E(b.id)+'">'+E(b.title)+'</option>').join('')+'</select></label>'+toolButton('载入原页并框选','data-page')+'<div class="pageRegion"><img hidden alt="拖动框选原图"><i hidden></i></div>'+toolButton('保存引图','data-savefig'))
 let target,coords;const img=d.querySelector('img'),rect=d.querySelector('i'),value=k=>d.querySelector('[data-'+k+']').value
 d.onchange=e=>{if(e.target.matches('[data-edition],[data-pg]')){target=null;coords=null;img.hidden=rect.hidden=true}}
 const point=e=>{const r=img.getBoundingClientRect();return [100*Math.min(1,Math.max(0,(e.clientX-r.x)/r.width)),100*Math.min(1,Math.max(0,(e.clientY-r.y)/r.height))]};let start
 img.onpointerdown=e=>{e.preventDefault();start=point(e);img.setPointerCapture(e.pointerId)};img.onpointermove=e=>{if(!start)return;const [x,y]=point(e);coords=[Math.min(start[0],x),Math.min(start[1],y),Math.abs(x-start[0]),Math.abs(y-start[1])];rect.hidden=false;rect.style.cssText='left:'+coords[0]+'%;top:'+coords[1]+'%;width:'+coords[2]+'%;height:'+coords[3]+'%'};img.onpointerup=e=>{img.onpointermove(e);start=null}
 actionOn(d,async b=>{if(!refs.length)throw Error('请先附加 PDF 原件');if('page' in b.dataset){const {r,ed}=refs[+value('edition')],l={key:r.key,sha:ed.sha,page:+value('pg')};coords=null;rect.hidden=true;const data=await callSch('source_page',l);if(refs[+value('edition')].ed!==ed||+value('pg')!==l.page)return;target=l;img.src='data:image/png;base64,'+data;img.hidden=false}
 if('savefig' in b.dataset){if(!target||!coords)throw Error('请在原页上拖动框选');b.disabled=true;try{await callSch('source_figure',{...target,box:coords,label:value('fig'),caption:value('title'),license:value('license'),block:value('block')});await refreshSch();d.close();done()}finally{b.disabled=false}}})
}
// Lossless TeX editing: editable text runs and protected source islands (no TeX execution).
function texPieces(s){const out=[];let pos=0
 const pat=/\\begin\{([^{}]+)\}|\\(?:textbf|emph|textit|section|subsection)\{([^{}\\]*)\}|\\[A-Za-z@]+\*?|\\[\s\S]|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|%[^\n]*|[{}]/g;
 for(let m;m=pat.exec(s);){if(pos<m.index)out.push({text:s.slice(pos,m.index),plain:true});let end=pat.lastIndex;let token=m[0]
 if(m[1]){const close='\\end{'+m[1]+'}',at=s.indexOf(close,end);end=at<0?s.length:at+close.length}
 else if(m[2]==null&&token.startsWith('\\')){while(s[end]==='{'||s[end]==='['){const a=s[end],b=a==='{'?'}':']';let nesting=1;end++;while(end<s.length&&nesting){if(s[end]==='\\'){end+=2;continue}if(s[end]===a)nesting++;if(s[end]===b)nesting--;end++}}}
 const full=s.slice(m.index,end);out.push(m[2]!=null?{plain:true,text:m[2],wrap:token.slice(0,token.indexOf('{')+1),tag:token.startsWith('\\textbf')?'strong':token.includes('section')?'h3':'em'}:{text:full});pos=end;pat.lastIndex=end}
 if(pos<s.length||!out.length)out.push({text:s.slice(pos),plain:true});return out
}
const texPieceLength=piece=>(piece.wrap?piece.wrap.length+1:0)+piece.text.length;
function numberedTexPieces(text,pieces,context){
 const equations=window.manuscriptEquationProjections(text,'tex',context);
 let from=0;
 return pieces.map(piece=>{
  const start=from;
  from+=texPieceLength(piece);
  const equation=equations.get(start);
  if(!equation||equation.item.to!==from)return null;
  try{return window.manuscriptEquationPreview(equation.tex,true)}catch{return null}
 });
}
function renderTex(s,context){
 const pieces=texPieces(s),math=numberedTexPieces(s,pieces,context);
 return '<div class="texDoc">'+pieces.map((x,i)=>{if(math[i])return '<span>'+math[i]+'</span>';if(x.plain)return '<'+(x.tag||'span')+'>'+E(x.text)+'</'+(x.tag||'span')+'>';if(x.text.startsWith('$')||/^\\cite/.test(x.text))return '<span>'+E(x.text)+'</span>';return '<code>'+E(x.text)+'</code>'}).join('')+'</div>'
}
function texEditor(el,s,change,equationContext){
 let parts=texPieces(s),active=-1,input=null,selection=[0,0];
 el.innerHTML='<div class="schTools">'+toolButton('粗体','data-tex="textbf"')+toolButton('斜体','data-tex="emph"')+'<small>点正文直接编辑；灰色命令保留在源码中。</small></div><div class="texDoc"></div>';const body=el.querySelector('.texDoc')
 const read=()=>parts.map(t=>t.wrap?t.wrap+t.text+'}':t.text).join('');
 const store=()=>{if(input&&active>=0){parts[active].text=input.value;selection=[input.selectionStart,input.selectionEnd]}}
 function render(){body.replaceChildren();input=null;const math=numberedTexPieces(read(),parts,equationContext);parts.forEach((t,i)=>{const n=document.createElement(t.plain?t.tag||'span':math[i]?'span':'code');if(math[i])n.innerHTML=math[i];else n.textContent=t.text;n.dataset.run=i;if(t.plain){n.tabIndex=0;n.title='点击编辑这段正文';n.setAttribute('role','button');n.onclick=()=>edit(i);n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();edit(i)}}}else n.title='保留的 TeX 源码；可在源码模式修改';body.append(n)})}
 function edit(i){if(active===i&&input){input.focus();return}store();render();active=i;input=document.createElement('textarea');input.className='texRun';input.rows=1;input.value=parts[i].text;input.setAttribute('aria-label','LaTeX 正文片段');if(parts[i].tag==='strong')input.style.fontWeight='bold';if(parts[i].tag==='em')input.style.fontStyle='italic';body.children[i].replaceWith(input);input.oninput=()=>{store();change()};input.onblur=store;input.focus()}
 function put(txt,wrap=false){if(active<0){const i=parts.findIndex(t=>t.plain);if(i<0)return false;edit(i)}if(!input)edit(active);const [a,b]=document.activeElement===input?[input.selectionStart,input.selectionEnd]:selection;input.setRangeText(wrap?'\\'+txt+'{'+input.value.slice(a,b)+'}':txt,a,b,'end');store();change();if(wrap){parts=texPieces(read());active=-1;render()}else input.focus();return true}
 render();el.querySelectorAll('[data-tex]').forEach(x=>{x.onmousedown=e=>e.preventDefault();x.onclick=()=>put(x.dataset.tex,true)})
 const length=texPieceLength;
 function offset(){if(active<0||!input)return null;return parts.slice(0,active).reduce((n,t)=>n+length(t),0)+(parts[active].wrap?.length||0)+input.selectionEnd}
 function restore(at,heading=false){let base=0;for(const [i,t] of parts.entries()){const start=base+(t.wrap?.length||0);if(heading&&at===base&&t.wrap)at=start;if(t.plain&&start<=at&&at<=start+t.text.length&&(!heading||t.wrap)){edit(i);input.setSelectionRange(at-start,at-start);input.scrollIntoView({block:'nearest'});return true}base+=length(t)}return false}
 function viewport(){const top=el.getBoundingClientRect().top;let from=0,base=0;for(const [i,t] of parts.entries()){if(body.children[i].getBoundingClientRect().top<=top+40)from=base;base+=length(t)}return {from,top:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}}
 return {read,put,offset,restore,viewport}
}
function diagramForm(anchor,o){
 const old=o?.diagram,b=paperBlock(anchor.block),segments=old?.nodes||[...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(anchor.quote)].map(x=>x.segment.trim()).filter(Boolean).map((quote,i)=>({id:String(i+1),quote,label:quote.slice(0,80)}))
 if(!segments.length||segments.length>24){$('#save').textContent='请选择包含 1–24 句的段落';return}
 const d=modal('从原文绘制逻辑图','<p>每个节点保留原句。初始箭头只表示行文顺序，可更改关系或删除箭头。</p><label>图题<input data-title value="'+E(o?.caption||b.title+' · 论证关系')+'"></label>'+segments.map((n,i)=>'<label>'+n.id+' · '+E(n.quote)+'<input data-node="'+i+'" value="'+E(n.label)+'"></label>').join('')+'<label>关系（每行：起点 → 终点 | 关系）<textarea data-edges>'+E((old?.edges||segments.slice(1).map((n,i)=>({from:segments[i].id,to:n.id,label:'行文顺序'}))).map(x=>x.from+' → '+x.to+' | '+x.label).join('\n'))+'</textarea></label>'+toolButton('保存到正文','data-graphsave'))
 actionOn(d,async btn=>{if(!btn.hasAttribute('data-graphsave'))return;const nodes=segments.map((n,i)=>({...n,label:d.querySelector('[data-node="'+i+'"]').value.trim()})),edges=d.querySelector('[data-edges]').value.split('\n').filter(s=>s.trim()).map(s=>{const m=s.match(/^\s*(\d+)\s*(?:→|->)\s*(\d+)\s*\|\s*(.+)$/);if(!m||!nodes.some(n=>n.id===m[1])||!nodes.some(n=>n.id===m[2]))throw Error('请核对关系的节点编号');return {from:m[1],to:m[2],label:m[3].trim()}})
 if(nodes.some(n=>!n.label||n.label.length>120)||edges.length>64)throw Error('节点文字限 1–120 字；关系最多 64 条')
 const cv=document.createElement('canvas');cv.width=880;cv.height=64+nodes.length*96+edges.length*30;const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);c.font='19px system-ui';
 nodes.forEach((n,i)=>{const y=20+i*96;c.fillStyle='#e4f1eb';c.fillRect(155,y,705,72);c.fillStyle='#1c4536';c.fillText(n.id+'   '+n.label.slice(0,54),174,y+28,668);c.fillText(n.label.slice(54),174,y+54,668)});
 edges.forEach((e,i)=>{const f=nodes.findIndex(n=>n.id===e.from),t=nodes.findIndex(n=>n.id===e.to),y=44+f*96,z=62+t*96,x=134-((i%10)*11);c.strokeStyle='#5c8073';c.lineWidth=2;c.beginPath();c.moveTo(155,y);c.lineTo(x,y);c.lineTo(x,z);c.lineTo(151,z);c.stroke();c.beginPath();c.moveTo(144,z-5);c.lineTo(152,z);c.lineTo(144,z+5);c.stroke();c.fillStyle='#29493f';c.fillText(e.from+'  →  '+e.to+'     '+e.label,155,50+nodes.length*96+i*30,690)});
 btn.disabled=true;try{await callSch('exhibit_save',{kind:'figure',id:o?.id,rev:o?.rev,caption:d.querySelector('[data-title]').value,credit:'作者整理 · 正文选区',block:b.id,diagram:{anchor,nodes,edges},data:cv.toDataURL().split(',')[1]});await refreshSch();d.close()}finally{btn.disabled=false}})
}
function diagramView(o){return !o.diagram?'':'<div class="diagramFlow"><img alt="'+E(o.caption)+'" data-sch-img="'+E(o.asset)+'"><small>点击节点定位正文：</small>'+o.diagram.nodes.map(n=>toolButton(n.id+' · '+n.label,'data-graph="'+E(o.id)+'" data-goto="'+E(n.id)+'"')).join(' ')+'<div>'+o.diagram.edges.map(e=>E(e.from+' → '+e.to+' · '+e.label)).join('　')+'</div>'+toolButton('编辑逻辑图','data-editgraph="'+E(o.id)+'"')+'</div>'}
document.addEventListener('click',e=>{const el=e.target.closest('[data-editgraph],[data-graph]');if(!el)return;const o=objects()[el.dataset.editgraph||el.dataset.graph],g=o.diagram;if(el.dataset.editgraph)diagramForm(g.anchor,o);else{const quote=g.nodes.find(x=>x.id===el.dataset.goto).quote;document.querySelectorAll('dialog[open]').forEach(x=>x.close());showPage('read',g.anchor.block,{block:g.anchor.block,quote});}})
