// All coordinates are one-based indices into a specific section and Draft.
function structurePath(view, key, version, scale, paragraph, sentence) {
  return [view, key, version, scale, paragraph, sentence].join('/');
}
function navigateStructure(path) {
  if (location.hash.slice(1) === path) { render(); focusSource(); }
  else location.hash = path;
}
function sectionBody(key, version) {
  return version === '01' ? paper.original[key] ?? paper.sections[key].html : paper.sections[key].html;
}
function proseParagraphs(root) {
  return [...root.children].filter(el => el.matches('p') && el.textContent.trim() &&
    !el.querySelector('math,img') && !el.textContent.startsWith('图注'));
}
function sentences(text) {
  return (text.match(/[^。！？]*[。！？]+|[^。！？]+$/gu) || []).filter(s => s.trim());
}
function sectionMaterial(r) {
  const root = document.createElement('div');
  const row=manuscriptDesk.structuralRows(r.version).find(h=>h.key===r.key);
  root.innerHTML = row?manuscriptDesk.proofBody(row.raw):'';
  const paragraphs = proseParagraphs(root);
  const index = Math.min(r.paragraph, paragraphs.length) - 1;
  const lines = index >= 0 ? sentences(paragraphs[index].textContent) : [];
  const line = Math.min(r.sentence, lines.length) - 1;
  return {root, paragraphs, index, lines, line};
}
// Preserve links and emphasis in the source paragraph when marking an exact sentence.
function markSentence(paragraph, lines, line) {
  if (!paragraph || line < 0) return;
  const start = lines.slice(0,line).join('').length;
  const end = start + lines[line].length;
  const range = document.createRange();
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let offset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const next = offset + node.length;
    if (start >= offset && start < next) range.setStart(node, start - offset);
    if (end > offset && end <= next) {
      range.setEnd(node, end - offset);
      const mark = document.createElement('mark');
      mark.className = 'source-match'; mark.tabIndex = -1;
      mark.append(range.extractContents());
      range.insertNode(mark);
      return;
    }
    offset = next;
  }
}
function isReviewedPassage(r){
  if(r.key!=='4.1'||!['01','02'].includes(r.version))return false;
  const m=sectionMaterial(r);
  return m.paragraphs[m.index]?.textContent===(r.version==='01'?paper.review.quote:paper.review.revised);
}
function structuralReader(r){
  const opts=manuscriptDesk.structuralRows(r.version).filter(h=>h.key!=='refs').map(h=>
    `<option value="${esc(h.key)}" ${r.key===h.key?'selected':''}>${esc(english&&enTitles[h.key]?label(h.key):h.title)}</option>`).join('');
  const versions=['work',...Array.from({length:Number(manuscriptDesk.latest())},(_,i)=>String(i+1).padStart(2,'0'))];
  return `<section class="panel structure-panel"><div class="toolbar"><label>${tr('章节','Section')} <select id="structure-key">${opts}</select></label>
    <label>${tr('版本','Version')} <select id="structure-version">${versions.map(v=>`<option value="${v}" ${r.version===v?'selected':''}>${v==='work'?tr('工作稿','Working copy'):'Draft '+v}</option>`).join('')}</select></label></div>
    <div class="structure-guide"></div><iframe id="structure-workbench" title="${tr('ManuScript 0.13.0 结构阅读','ManuScript 0.13.0 structural reader (Chinese UI)')}" src="assets/structure/workbench.html"></iframe></section>`;
}
function updateStructureGuide(r){
  const m=sectionMaterial(r);
  const quote=m.lines[m.line];
  const guide=document.querySelector('.structure-guide');
  const paragraphPicker=m.paragraphs.length?`<label>${tr('正文段落','Prose paragraph')} <select id="structure-paragraph">${m.index<0?'<option value="0">—</option>':''}${m.paragraphs.map((_,i)=>`<option value="${i+1}" data-sentence="${isReviewedPassage({...r,paragraph:i+1})?sentences(m.paragraphs[i].textContent).length:1}" ${i===m.index?'selected':''}>P${i+1}</option>`).join('')}</select></label>`:'';
  guide.innerHTML=`<span>${tr('示例走查','Walkthrough')} · ${esc(r.key)}</span>${paragraphPicker}
    ${quote?`<button data-position="${structurePath('read',r.key,r.version,r.scale==='overview'?'cards':r.scale,m.index+1,m.line+1)}">${tr('在全文中定位原句','Locate sentence in full text')}</button>`:`<button data-position="read/${esc(r.key)}/${r.version}">${tr('在全文中打开本节','Open section in full text')}</button>`}
    ${isReviewedPassage(r)?`<button data-position="${structurePath('review',r.key,r.version,'cards',m.index+1,m.line+1)}">${tr('查看这句话的返修','Review this passage')}</button>`:''}
    ${quote&&r.scale!=='overview'?`<q lang="zh-CN">${esc(quote)}</q>`:''}`;
}
window.addEventListener('message',event=>{
  const frame=document.querySelector('#structure-workbench');
  if(!frame || event.source!==frame.contentWindow || (location.protocol!=='file:'&&event.origin!==location.origin) ||
      event.data?.channel!=='manuscript-structure')return;
  const r=current(),msg=event.data;
  const rows=manuscriptDesk.structuralRows(r.version);
  if(msg.action==='ready'){
    // The native model counts all Markdown blocks. The walkthrough counts prose paragraphs.
    const row=rows.find(h=>h.key===r.key);
    const material=sectionMaterial(r),text=material.paragraphs[material.index]?.textContent;
    const chunks=row?.raw.split(/\n\s*\n/u).filter(x=>x.trim())||[];
    const rawIndex=chunks.findIndex(c=>plainParagraph(c)===text);
    frame.contentWindow.postMessage({channel:msg.channel,action:'open',rows,route:{...r,rawIndex:Math.max(0,rawIndex)}},location.protocol==='file:'?'*':location.origin);
  }else if(msg.action==='source'&&[1,2].includes(msg.page)){showSource(msg.page,frame);}
  else if(msg.action==='position'){
    if(!['overview','cards','logic'].includes(msg.scale))return;
    if(msg.key && !rows.some(h=>h.key===msg.key))return;
    const next={...r,key:msg.key||r.key,scale:msg.scale};
    if(msg.key && (msg.key!==r.key||msg.raw)){
      const m=sectionMaterial(next);
      const index=msg.raw?m.paragraphs.findIndex(p=>p.textContent===plainParagraph(msg.raw)):-1;
      next.paragraph=msg.raw?index+1:1;next.sentence=1;
      const lines=sectionMaterial(next).lines;
      if(msg.quote){
        const line=lines.findIndex(s=>s.trim()===plainParagraph(msg.quote));
        if(line>=0)next.sentence=line+1;
      }else if(isReviewedPassage(next))next.sentence=lines.length;
    }
    history.replaceState(null,'','#'+structurePath('structure',next.key,r.version,next.scale,next.paragraph,next.sentence));
    const picker=document.querySelector('#structure-key');picker.value=next.key;
    updateStructureGuide(next);
  }
});
function plainParagraph(raw){
  const root=document.createElement('div');root.innerHTML=manuscriptDesk.proofBody(raw);
  return root.textContent.trim();
}
