const $ = selector => document.querySelector(selector);
const release = 'https://github.com/RJ2045-PRC/ManuScript';
const examples = release + '/releases/download/v0.13.0/ManuScript-0.13.0-example.zip';
const chapters = ['abstract','1','2','3','4','5','6','refs'];
const children = id => Object.keys(paper.sections).filter(key => key.startsWith(id + '.'));
const order = chapters.flatMap(id => [id, ...children(id)]);
const enTitles = {
  abstract:'Abstract', refs:'References',
  '1.1':'Comparison and motivation','1.2':'Background and questions',
  '2.1':'Design and simulated data','2.2':'Fixed cup pairs','2.3':'Crossover design','2.4':'Temperature and cooling rates','2.5':'Within-cup differences',
  '3.1':'Six paired observations','3.2':'Trajectories and pairing','3.3':'Eight within-cup comparisons','3.4':'Order and measurement precision',
  '4.1':'Interpreting the temperature gap','4.2':'The reference cup','4.3':'Limitations and next steps'
};
let english = new URLSearchParams(location.search).get('lang') === 'en';
const tr = (zh,en) => english ? en : zh;
const label = id => english && enTitles[id] ? (id.includes('.') ? id+' ' : '')+enTitles[id] : paper.sections[id].title;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {structure:'<path d="M3 4h18v16H3zM10 4v16M5 8h3m-3 4h3m5-4h5m-5 5h5"/>',map:'<path d="M3 12h5m0 0V5h5m-5 7v7h5"/><rect x="13" y="2" width="8" height="6" rx="1"/><rect x="13" y="16" width="8" height="6" rx="1"/>',read:'<path d="M12 6c-3-2-6-2-10-1v14c4-1 7-1 10 1 3-2 6-2 10-1V5c-4-1-7-1-10 1zm0 0v14"/>',review:'<rect x="2" y="4" width="9" height="15" rx="1"/><rect x="14" y="4" width="8" height="15" rx="1"/><path d="M4 8h4m8 0h4"/>'};
const icon = name => '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">'+icons[name]+'</svg>';
let focusSourceAfterNavigation = false;
let documentGuideOpen = false;
let expanded = '3', selected = '', menu = false, hints = true, seenSetup = false, lastRead = '2.2', lastDraft = '02';
const names = () => [tr('导图','Chapter map'),tr('正文编辑','Manuscript editor'),tr('结构阅读','Structural reading'),tr('返修对照','Review')];
function current(){
  const [view,key,version,scale,p,s] = location.hash.slice(1).split('/');
  const structure = view==='structure';
  const safeIndex = n => Number.isSafeInteger(Number(n)) && Number(n)>0 ? Number(n) : 1;
  return {view:['map','read','structure','review'].includes(view)?view:'map',
    key:(view==='read'||structure)&&(key==='title'||/^heading-\d+$/.test(key))?key:order.includes(key)&&!(structure&&key==='refs')?key:structure?'4.1':lastRead,
    version:(view==='read'||structure)&&manuscriptDesk.valid(version)?version:version==='01'?'01':'02',scale:['overview','logic'].includes(scale)?scale:'cards',
    located:['cards','logic'].includes(scale),paragraph:p==='0'?0:safeIndex(p),sentence:safeIndex(s)};

}
function go(view,key=lastRead,version=lastDraft){
  const hash=view==='read'?'read/'+key+'/'+version:view;
  if(location.hash==='#'+hash)render();else location.hash=hash;
}
function openSection(key,version=lastDraft){
  selected=key;expanded=key.split('.')[0];menu=false;go('read',key,version);
}
function mapPanel(){
  const rows=chapters.map(id=>{
    const subs=children(id),open=subs.length>0 && expanded===id;
    const toggle=subs.length?`data-expand="${id}" aria-expanded="${open}"`:`data-select="${id}"`;
    const leaves=open?'<ul class="leaves">'+subs.map(k=>`<li class="leaf"><button data-select="${k}" aria-pressed="${k===selected}" class="${k===selected?'selected':''}">${esc(label(k))}</button>${k===selected?more():''}</li>`).join('')+'</ul>':'';
    return `<li class="branch"><div class="nodebox ${open?'open':''}"><button class="parent" ${toggle}>${esc(label(id))}${subs.length?' <span aria-hidden="true">'+(open?'−':'+')+'</span>':''}</button>${id===selected?more():''}</div>${leaves}</li>`;
  }).join('');
  const context=selected?esc(label(selected)):tr('选择一个章节节点','Select a chapter or subsection');
  return `<section class="panel"><div class="panel-head"><h2>${names()[0]}</h2><span class="meta">${tr('6 章 · 14 个子节','6 chapters · 14 subsections')}</span></div><div class="canvas"><div class="tree"><div class="rootnode">${tr('杯盖与降温','Cup cooling')}</div><ul class="branches">${rows}</ul></div></div><div class="panel-foot"><span class="meta">${context}</span></div></section>`;
}
function more(){return `<button class="more" data-more aria-label="${tr('章节操作','Section actions')}" aria-expanded="${menu}">⋯</button>${menu?`<button class="node-action primary" data-read="${selected}" data-locate>${tr('定位正文','Locate in manuscript')}</button>`:''}`;}
function structureReturn(r){
  const reviewLink=r.view==='read'&&isReviewedPassage(r)?`<button data-position="${structurePath('review',r.key,r.version,r.scale,r.paragraph,r.sentence)}">${tr('查看这句话的返修','Review this passage')}</button>`:'';
  return reviewLink+`<button data-position="${structurePath('structure',r.key,r.version,r.scale,r.paragraph,r.sentence)}">${tr('返回结构阅读','Back to structural reading')}</button>`;
}
function review(){
  const r=paper.review;
  return `<section class="panel review"><p class="eyebrow">${tr('Word 批注 · 4.1 讨论','Word comment · Discussion 4.1')}</p><h2>${tr('温差来自杯盖吗？','Was the lid responsible?')}</h2><blockquote class="quote" lang="zh-CN">${esc(r.message)}<br><small>${esc(r.author)}</small></blockquote><div class="compare"><section><strong>Draft 01</strong> <span class="meta">${tr('送阅原句','Reviewed passage')}</span><p lang="zh-CN">${esc(r.quote)}</p><button data-read="4.1" data-version="01">${tr('在首稿中查看','Read Draft 01 in context')}</button></section><section><strong>Draft 02</strong> <span class="meta">${tr('修订原句','Revised passage')}</span><p lang="zh-CN">${esc(r.revised)}</p><button data-read="4.1" data-version="02">${tr('在修订稿中查看','Read Draft 02 in context')}</button></section></div><p><span class="pill">${english?'Accepted':esc(r.status)}</span> <span lang="zh-CN">${esc(r.reason)}</span></p><div class="actions">${current().located?structureReturn(current()):''}<a href="assets/review.docx" download>${tr('下载带批注的 Word 回稿','Download the annotated Word file')}</a></div></section>`;
}
function stage(r){
  if(r.view==='map')return 0;
  if(r.view==='structure'||r.view==='review'||r.key==='4.1')return 3;
  return r.key.startsWith('3') || (r.key==='2.2'&&seenSetup) ? 2 : 1;
}
function rail(r){
  const i=stage(r);
  const steps=[tr('从导图定位正文','Locate a passage'),tr('核对装置与引文','Check the cited setup'),tr('比较同一只杯子','Compare each cup'),tr('查看返修决定','Inspect the revision')];
  const questions=[tr('两只杯子除了盖子，还有什么不同？','What else differs between the cups?'),tr('装置记录写了什么？','What does the setup record say?'),tr('同一只杯子换盖，温度差多少？','How much changed within each cup?'),tr('作者怎样改写了原句？','How did the author revise the claim?')];
  let hint,action,button;
  if(i===0){
    if(expanded!=='2'){hint=tr('展开 2 Method，找到固定杯具的配对观察。','Expand 2 Method to find the fixed cup pairs.');action='expand';button=tr('展开 2 Method','Expand 2 Method');}
    else if(selected!=='2.2'){hint=tr('选中 2.2，再从节点旁的「⋯」定位正文。','Select 2.2 and use its section menu to locate the passage.');action='select';button=tr('选中 2.2','Select 2.2');}
    else {hint=tr('点节点旁的「⋯」，再选「定位正文」。','Use the selected node’s menu to locate its text.');action=menu?'locate':'menu';button=menu?tr('定位正文','Locate in manuscript'):tr('打开章节操作','Open section actions');}
  }else if(i===1){
    hint=tr('在 2.2 点绿色引文，查看课堂测量记录第 1 页。','Open the citation in 2.2 to inspect page 1 of the measurement log.');action=r.key==='2.2'?'source1':'method';button=r.key==='2.2'?tr('查看引文 · 第 1 页','Open citation · page 1'):tr('前往 2.2','Read 2.2');
  }else if(i===2){
    hint=tr('3.3 的表 2 比较每只杯子的有盖和敞口温度。3.1 的引文可回看固定装置的逐轮读数。','Table 2 in 3.3 compares each cup with and without its lid. The citation in 3.1 links to the earlier paired readings.');action=r.key==='3.3'?'structure':'compare';button=r.key==='3.3'?tr('阅读 4.1 段落卡片','Read the paragraph cards in 4.1'):tr('阅读 3.3 同杯比较','Read section 3.3');
  }else{
    hint=tr('对照首稿原句、审阅人的追问和修订稿，再打开 4.1 阅读上下文。','Compare the comment and both passages, then read section 4.1 in context.');action=r.view==='review'?'revised':'review';button=r.view==='review'?tr('阅读 Draft 02 · 4.1','Read Draft 02 · 4.1'):tr('查看返修对照','Open review');
  }
  if(!hints)return `<aside class="rail rail-pad"><button data-hints>${tr('打开走查引导','Show walkthrough')}</button></aside>`;
  return `<aside class="rail"><div class="rail-pad"><div class="rail-top"><span class="eyebrow">${tr('走查引导','Walkthrough')} · ${i+1}/4</span><button class="textbtn" data-hints>${tr('收起','Hide')}</button></div><h3>${questions[i]}</h3><p>${hint}</p><button class="primary" data-action="${action}">${button}</button>${i===2&&r.key!=='3.1'?`<button class="textbtn" data-read="3.1">${tr('核对 3.1 的六轮读数','Check the six rounds in 3.1')}</button>`:''}<ol class="stepnav">${steps.map((s,n)=>`<li><button data-step="${n}" aria-current="${n===i}"><span class="stepdot">${n+1}</span>${s}</button></li>`).join('')}</ol></div>${i===0?`<figure class="rail-img"><img src="assets/cup-setup.png" alt="${tr('有盖玻璃杯与敞口陶瓷杯','Lidded glass cup and open ceramic cup')}"><figcaption>${tr('图 1 · 两套固定装置','Figure 1 · The two fixed setups')}</figcaption></figure>`:''}</aside>`;
}
function render(){
  const priorGuide=$('.document-guide');
  if(priorGuide)documentGuideOpen=priorGuide.open;
  manuscriptDesk.unmount();
  const r=current();
  document.body.dataset.workspace=r.view;
  if(r.view==='read'&&order.includes(r.key)){lastRead=r.key;if(['01','02'].includes(r.version))lastDraft=r.version;selected=r.key;expanded=r.key.split('.')[0];}
  document.documentElement.lang=english?'en':'zh-CN';
  $('#edition').textContent=tr('公测版演示','Public beta demo');
  $('#language').textContent=tr('English','简体中文');
  $('#byline').textContent=tr('研究论文 · 原创模拟数据','Research paper · Simulated data');
  $('#title').textContent=tr('杯盖能解释多少温差？','How much of the temperature gap comes from the lid?');
  $('#subtitle').textContent=tr('固定杯具与同杯换盖的两项模拟冷却研究','Two simulated cooling studies with fixed cup pairs and a within-cup crossover');
  document.title=$('#title').textContent+' · ManuScript';
  $('#tabs').setAttribute('aria-label',tr('工作区','Workspace'));
  $('#tabs').innerHTML=['map','read','structure','review'].map((v,i)=>`<button data-view="${v}" aria-current="${r.view===v}">${icon(v)}${names()[i]}</button>`).join('');
  $('#workspace').innerHTML=r.view==='read'?manuscriptDesk.template()+'<details class="document-guide"><summary>'+tr('走查引导','Walkthrough')+'</summary>'+rail(r)+'</details>':r.view==='structure'?structuralReader(r):'<div class="layout">'+(r.view==='map'?mapPanel():review())+rail(r)+'</div>';
  if(r.view==='structure')updateStructureGuide(r);
  if(r.view==='read'){manuscriptDesk.mount(r);$('.document-guide').open=documentGuideOpen;}
  const install=english?'blob/main/README.en.md#install-with-an-agent':'#复制给-agent-安装';
  $('#footer').innerHTML=`<span>ManuScript · ${tr('v0.13.0 首次公开测试版。正式版仍在开发中。','v0.13.0 is the first public beta. The stable release is still in development.')}</span><span><a href="${examples}">${tr('下载完整示例','Download the full example')}</a><a href="${release}/${install}">${tr('安装 ManuScript','Install ManuScript')}</a></span>`;
}
let sourceOpener=null, sourcePage=0;
function showSource(page,button){
  const dlg=$('#source');sourceOpener=button;sourcePage=page;
  dlg.setAttribute('aria-labelledby','source-title');
  dlg.innerHTML=`<div class="source-head"><div><span class="eyebrow">${tr('固定证据','Pinned evidence')} / CupLog</span><p id="source-title"><strong>${tr('课堂测量记录','Classroom measurement log')}</strong></p></div><button data-close>${tr('关闭','Close')}</button></div><div class="source-body"><div class="actions"><strong>${tr('第 '+page+' 页，共 2 页','Page '+page+' of 2')}</strong><a href="assets/measurement-log.pdf#page=${page}" target="_blank" rel="noopener">${tr('打开原始 PDF','Open original PDF')}</a></div><p>${page===1?tr('装置记录 · 杯盖状态和杯体材质同时变化。','Setup record · Lid status and cup material both vary.'):tr('逐轮读数 · 首轮十分钟终温为 72.0 °C 和 68.0 °C。','Round-by-round readings · Round one ends at 72.0 °C and 68.0 °C.')}</p><img src="assets/source-${page}.png" alt="${page===1?tr('测量记录第 1 页，两套装置及模拟测量条件','Page 1, setups and simulated measurement conditions'):tr('测量记录第 2 页，六轮温度数据','Page 2, temperatures for all six rounds')}"></div>`;
  dlg.showModal();dlg.scrollTop=0;dlg.querySelector('[data-close]').focus({preventScroll:true});
}
$('#source').addEventListener('close',()=>{
  const r=current();
  if(sourcePage===1){seenSetup=true;const side=$('.rail');if(side)side.outerHTML=rail(r);}
  if(sourceOpener?.isConnected)sourceOpener.focus({preventScroll:true});else $('.citation')?.focus({preventScroll:true});
  sourcePage=0;
});
function setExpanded(id){expanded=expanded===id?'':id;selected=id;menu=false;render();document.querySelector('[data-expand="'+id+'"]')?.focus({preventScroll:true});}
function selectNode(id){selected=id;menu=false;render();document.querySelector('[data-select="'+id+'"]')?.focus({preventScroll:true});}
function showMenu(){menu=!menu;render();if(menu)$('[data-locate]')?.focus({preventScroll:true});else $('[data-more]')?.focus({preventScroll:true});}
function guide(action){
  switch(action){
    case 'expand':setExpanded('2');break;
    case 'select':selectNode('2.2');break;
    case 'menu':showMenu();break;
    case 'locate':case 'method':openSection('2.2');break;
    case 'source1':showSource(1,$('.citation[data-page="1"]'));break;
    case 'compare':openSection('3.3');break;
    case 'structure':navigateStructure('structure/4.1/02/cards/1/1');break;
    case 'review':go('review');break;
    case 'revised':openSection('4.1','02');break;
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a');if(!button)return;
  const d=button.dataset;
  if(manuscriptDesk.click(button)){event.preventDefault();return;}
  if(button.id==='language'){
    english=!english;const u=new URL(location.href);u.searchParams.set('lang',english?'en':'zh');history.replaceState(null,'',u);render();
  }else if(button.hasAttribute('data-close'))$('#source').close();
  else if(d.page){event.preventDefault();showSource(Number(d.page),button);}
  else if(d.position){
    focusSourceAfterNavigation = d.position.startsWith('read/');
    navigateStructure(d.position);

  }
  else if(d.view==='structure'){const r=current();navigateStructure(structurePath('structure',r.view==='read'&&r.key!=='refs'?r.key:'4.1',r.view==='read'?r.version:lastDraft,'overview',1,1));}
  else if(d.view==='read')go('read',lastRead,'work');
  else if(d.view)go(d.view);
  else if(d.expand)setExpanded(d.expand);
  else if(d.select)selectNode(d.select);
  else if(d.read)openSection(d.read,d.version||lastDraft);
  else if(button.hasAttribute('data-more'))showMenu();
  else if(button.hasAttribute('data-hints')){hints=!hints;render();$('[data-hints]').focus({preventScroll:true});}
  else if(d.action)guide(d.action);
  else if(d.step!==undefined){
    if(d.step==='0')go('map');
    else if(d.step==='1'){seenSetup=false;openSection('2.2');}
    else if(d.step==='2')openSection('3.3');
    else guide('structure');
  }else if(button.hash?.startsWith('#fig-')){
    event.preventDefault();const id=button.hash.slice(1);const dest=document.getElementById(id);
    if(dest)dest.parentElement.scrollIntoView({block:'center'});
    else {const owner=order.find(key=>paper.sections[key].html.includes('id="'+id+'"'));if(owner){openSection(owner);requestAnimationFrame(()=>document.getElementById(id)?.parentElement.scrollIntoView({block:'center'}));}}
  }
});
document.addEventListener('change',event=>{
  const r=current();
  if(event.target.id==='structure-key')navigateStructure(structurePath('structure',event.target.value,r.version,r.scale,1,1));
  if(event.target.id==='structure-paragraph')navigateStructure(structurePath('structure',r.key,r.version,r.scale,event.target.value,Number(event.target.selectedOptions[0]?.dataset.sentence)||1));
  if(event.target.id==='structure-version')navigateStructure(structurePath('structure',r.key,event.target.value,r.scale,r.paragraph,1));
  if(event.target.id==='toc')openSection(event.target.value);

});
function focusSource(){
  if(!focusSourceAfterNavigation)return;
  focusSourceAfterNavigation=false;
  const mark=$('.source-match');
  if(mark){mark.focus({preventScroll:true});mark.scrollIntoView({block:'nearest'});}
}
window.addEventListener('hashchange',()=>{
  if($('#source').open)$('#source').close();
  render();
  if(focusSourceAfterNavigation)focusSource();else window.scrollTo(0,0);
});
render();
document.addEventListener('keydown',event=>{
  if(event.key==='Escape' && menu && current().view==='map'){event.preventDefault();showMenu();}
});
