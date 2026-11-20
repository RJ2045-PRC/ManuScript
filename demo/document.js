// Use the release's Markdown editor and parser. Draft snapshots are immutable;
// only the working copy and newly saved snapshots live in this preview tab.
const manuscriptDesk = (() => {
  const storageKey = 'manuscript.demo.0.13.0.working-copy.v1';
  let working = paper.markdown['02'], extra = [], storageOK = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (typeof saved?.text === 'string' && Array.isArray(saved.drafts) && saved.drafts.every(t=>typeof t==='string')) {
      working=saved.text; extra=saved.drafts;
    }
  } catch { storageOK=false; }
  const number = n => String(n).padStart(2,'0');
  const latest = () => number(extra.length+2);
  const snapshot = v => paper.markdown[v] ?? extra[Number(v)-3];
  const valid = v => v === 'work' || typeof snapshot(v)==='string';
  let root, editor, rows=[], active='title', version='work', mode='read', previous=null;
  let openTree=innerWidth>700, position=null, pendingMode=null, frame=0, message='';
  let resumeSelection=null;
  const known = new Map(Object.entries(paper.sections).map(([key,s])=>[s.title,key]));
  const markdownRows = text => {
    const headings=window.manuscriptHeadings(text,true);
    const used=new Set();
    return headings.map((h,i)=>{
      let key=known.get(h.title) || (i===0?'title':'heading-'+h.from);
      if(used.has(key))key='heading-'+h.from;
      used.add(key);
      return {...h,key,end:headings[i+1]?.from??text.length};
    });
  };
  const originals=new Map();
  for(const v of ['01','02']){
    const text=paper.markdown[v];
    for(const h of markdownRows(text))if(paper.sections[h.key]){
      originals.set(text.slice(h.to,h.end).trim(),sectionBody(h.key,v));
    }
  }
  function proofBody(raw){
    if(originals.has(raw))return originals.get(raw);
    // Keep original math as MathML. Run user Markdown through the product sanitizer.
    const template=document.createElement('template');
    const expressions=[];
    const source=raw.replace(/^\$\$\s*\n([\s\S]*?)\n\$\$\s*$/gm,(_,tex)=>{
      expressions.push(tex);return '<span class="equation-slot">'+(expressions.length-1)+'</span>';
    });
    template.innerHTML=window.manuscriptRenderMarkdown(source);
    for(const el of template.content.querySelectorAll('*')){
      for(const a of [...el.attributes])if(a.name.startsWith('data-')||a.name==='name')el.removeAttribute(a.name);
      if(el.id&&!/^fig-\d+$/.test(el.id))el.removeAttribute('id');
    }
    for(const el of template.content.querySelectorAll('.equation-slot')){
      const tex=expressions[Number(el.textContent)];if(tex!==undefined)window.katex.render(tex,el,{output:'mathml',displayMode:true,throwOnError:false});
    }
    return template.innerHTML;
  }
  const badge = v=>v==='work'?tr('工作稿','Working copy'):'Draft '+v;
  function writeCache(){
    try{sessionStorage.setItem(storageKey,JSON.stringify({text:working,drafts:extra}));storageOK=true;}
    catch{storageOK=false;}
  }
  function status(){
    const out=root?.querySelector('[data-doc-status]');if(!out)return;
    out.textContent=!storageOK?tr('仅保留在当前页面，刷新前请复制正文','Page memory only. Copy your text before reloading.'):
      message || (version==='work'?tr('工作稿已保存在此标签页','Working copy saved in this tab'):tr('已保存的全文快照','Saved full-manuscript snapshot'));
  }
  function currentText(){return version==='work'?working:snapshot(version);}
  function updateOutline(){
    const panel=root.querySelector('.doc-toc');
    const query=panel.querySelector('input').value.trim().toLowerCase();
    panel.querySelector('nav').innerHTML=rows.filter(h=>h.title.toLowerCase().includes(query)).map(h=>
      `<button data-doc-jump="${esc(h.key)}" style="--depth:${Math.min(h.level,4)}" aria-current="${active===h.key}">${esc(h.title)}</button>`).join('');
  }
  function currentHeading(key){
    active=key;
    if(order.includes(key)){lastRead=key;selected=key;expanded=key.split('.')[0];}
    const h=rows.find(x=>x.key===key);
    const ancestors=[];
    if(h)for(const row of rows){
      while(ancestors.length && ancestors.at(-1).level>=row.level)ancestors.pop();
      ancestors.push(row);
      if(row.key===key)break;
    }
    const path=root.querySelector('[data-doc-path]');
    path.replaceChildren();
    for(const row of ancestors.slice(-2)){
      if(path.childNodes.length)path.append(' › ');
      const jumpButton=document.createElement('button');
      jumpButton.type='button';jumpButton.dataset.docJump=row.key;jumpButton.textContent=row.title;
      path.append(jumpButton);
    }
    root.querySelectorAll('.doc-toc [data-doc-jump]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.docJump===key)));
  }
  function readScroll(){return root.querySelector('.doc-pages');}
  function section(key){return [...root.querySelectorAll('.doc-section')].find(el=>el.dataset.key===key);}
  function visiblePosition(){
    if(!root)return null;
    if(mode==='edit'&&editor){
      const from=editor.viewport().from;
      const row=rows.findLast(h=>h.from<=from)||rows[0];
      return row?{key:row.key,ratio:(from-row.from)/Math.max(1,row.end-row.from),offset:from}:null;
    }
    if(mode==='source'){const area=root.querySelector('textarea');return area?{key:active,offset:area.selectionStart}:null;}
    const scroller=readScroll();
    if(!scroller)return null;
    const top=scroller.getBoundingClientRect().top;
    const items=[...root.querySelectorAll('.doc-section')];
    const block=items.findLast(el=>el.getBoundingClientRect().top<=top+18)||items[0];
    if(!block)return null;
    const box=block.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(top-box.top)/Math.max(1,box.height)));
    const h=rows.find(x=>x.key===block.dataset.key);
    return {key:block.dataset.key,ratio,offset:h?Math.round(h.from+ratio*(h.end-h.from)):0};
  }
  function jump(key,loc={},remember=false){
    const h=rows.find(x=>x.key===key)||rows[0];
    if(!h)return;
    if(remember)resumeSelection=null;
    if(remember){previous=visiblePosition();root.querySelector('[data-doc-back]').disabled=!previous;}
    currentHeading(h.key);
    const offset=Math.max(h.from,Math.min(h.end,loc.offset??Math.round(h.from+(loc.ratio||0)*(h.end-h.from))));
    if(mode==='edit'){editor.reveal(offset);return;}
    if(mode==='source'){const area=root.querySelector('textarea');area.focus();area.setSelectionRange(offset,offset);area.scrollTop=area.scrollHeight*offset/Math.max(1,working.length);return;}
    const block=section(h.key),scroller=readScroll();
    if(block)scroller.scrollTop+=block.getBoundingClientRect().top-scroller.getBoundingClientRect().top+(loc.ratio||0)*block.offsetHeight-8;
  }
  function drawProof(r,text){
    const page=readScroll();
    const blocks=rows.map(h=>{
      const raw=text.slice(h.to,h.end).trim();
      let content=proofBody(raw);
      if(r.located && h.key===r.key){
        const material=sectionMaterial(r);
        markSentence(material.paragraphs[material.index],material.lines,material.line);
        content=material.root.innerHTML+structureReturn(r);
      }
      return `<section class="doc-section" data-key="${esc(h.key)}"><h${h.level}>${esc(h.title)}</h${h.level}>${content}</section>`;
    }).join('');
    const intro=text.slice(0,rows[0]?.from??text.length).trim();
    page.innerHTML='<article class="prose" lang="zh-CN">'+(intro?proofBody(intro):'')+blocks+'</article>';
    page.querySelectorAll('a[href]').forEach(a=>{
      const href=a.getAttribute('href');
      const pageNumber=href.match(/^assets\/measurement-log\.pdf#page=([12])$/);
      if(pageNumber){a.dataset.page=pageNumber[1];a.classList.add('citation');}
    });
    page.addEventListener('scroll',queuePosition,{passive:true});
  }
  function queuePosition(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{if(root){const pos=visiblePosition();if(pos)currentHeading(pos.key);}});
  }
  function onEdit(text){
    working=text;message='';writeCache();status();
    rows=markdownRows(text);updateOutline();
  }
  function versionOptions(){
    const ids=['work','01','02',...extra.map((_,i)=>number(i+3))];
    return ids.map(v=>`<option value="${v}" ${v===version?'selected':''}>${badge(v)}</option>`).join('');
  }
  function template(){
    return `<section class="documentStudio"><div class="doc-tools"><button data-doc-toc aria-expanded="${openTree}">${tr('目录','Contents')}</button><span data-doc-path></span><button data-doc-back disabled>${tr('回到刚才','Go back')}</button><button data-toggle-mode></button><details class="doc-more"><summary>${tr('更多','More')}</summary><div><button data-doc-source>${tr('源码模式','Source mode')}</button><button data-doc-guide>${tr('走查引导','Walkthrough')}</button></div></details></div><div class="doc-grid"><aside class="doc-toc" ${openTree?'':'hidden'}><strong>${tr('正文目录','Contents')}</strong><input type="search" aria-label="${tr('搜索标题','Search headings')}" placeholder="${tr('搜索标题','Search headings')}"><nav></nav></aside><div class="doc-body"><div class="doc-pages"></div></div></div><div class="doc-foot"><small data-doc-status role="status"></small><label><span class="sr-only">${tr('稿件版本','Manuscript version')}</span><select id="draft"></select></label><button data-checkpoint>${tr('保存 Draft','Save Draft')}</button></div></section>`;
  }
  function mount(r){
    root=$('.documentStudio');version=r.version;
    mode=pendingMode || (version==='work'?mode:'read');pendingMode=null;
    if(version!=='work')mode='read';
    const text=currentText();rows=markdownRows(text);
    active=rows.some(h=>h.key===r.key)?r.key:rows[0]?.key||'title';
    const body=root.querySelector('.doc-body');
    root.querySelector('#draft').innerHTML=versionOptions();
    root.querySelector('[data-checkpoint]').disabled=version!=='work';
    const toggle=root.querySelector('[data-toggle-mode]');
    toggle.textContent=mode==='read'?tr('✎ 编辑','✎ Edit'):tr('阅读','Read');
    toggle.setAttribute('aria-label',mode==='read'?tr('切换到编辑模式','Switch to edit mode'):tr('切换到阅读模式','Switch to reading mode'));
    toggle.title=version==='work'?toggle.getAttribute('aria-label'):tr('编辑当前工作稿，保留这个 Draft','Edit the working copy; preserve this Draft');
    root.dataset.stage=mode;
    if(mode==='read')drawProof(r,text);
    else if(mode==='edit'){
      body.innerHTML='<div class="studioRich"></div>';
      editor=new window.ManuScriptLiveEditor({el:body.firstElementChild,initialValue:text,label:tr('正文编辑','Manuscript editor'),
        onChange:()=>onEdit(editor.getMarkdown()),onSelection:queuePosition});

    }else{
      body.innerHTML='<textarea aria-label="'+tr('论文源码','Manuscript source')+'"></textarea>';
      body.firstElementChild.value=text;
      body.firstElementChild.oninput=e=>onEdit(e.target.value);
    }
    updateOutline();status();
    root.querySelector('input').oninput=updateOutline;
    root.querySelector('#draft').onchange=e=>{position=visiblePosition();mode='read';navigate(active,e.target.value);};
    const loc=position && position.key===active?position:{};
    position=null;jump(active,loc);
    if(editor && loc.selection)editor.setSelection(...loc.selection.map(n=>Math.min(n,text.length)));
    if(mode==='read' && resumeSelection?.key===active)resumeSelection.top=readScroll().scrollTop;
    if(r.located)root.querySelector('.source-match')?.scrollIntoView({block:'nearest'});
  }
  function navigate(key,v){
    const route='read/'+encodeURIComponent(key)+'/'+v;
    if(location.hash.slice(1)===route)render();else location.hash=route;
  }
  function switchMode(to){
    position=visiblePosition()||{key:active};
    // If the caret is visible, resume the edit at that passage.
    if(editor){
      const editingRange=editor.getSelection();
      const caret=editingRange[0],bounds=editor.coords(caret);
      if(bounds && bounds.top>=root.querySelector('.doc-body').getBoundingClientRect().top && bounds.bottom<=root.querySelector('.doc-body').getBoundingClientRect().bottom){
        const row=rows.findLast(h=>h.from<=caret);
        if(row){
          position={key:row.key,offset:caret,ratio:(caret-row.from)/Math.max(1,row.end-row.from)};
          resumeSelection={...position,selection:editingRange};
        }
      }
    }
    if(to==='edit'&&mode==='read'&&version==='work'&&resumeSelection && Math.abs(readScroll().scrollTop-resumeSelection.top)<4){
      position=resumeSelection;
    }
    if(to==='edit')resumeSelection=null;
    pendingMode=to;message=version!=='work'?tr('正在编辑当前工作稿','Editing the current working copy'):'';
    navigate(position.key,to==='read'?version:'work');
  }
  function click(button){
    if(!root||!root.contains(button))return false;
    if(button.hasAttribute('data-toggle-mode'))switchMode(mode==='read'?'edit':'read');
    else if(button.hasAttribute('data-doc-source'))switchMode('source');
    else if(button.hasAttribute('data-doc-guide')){root.querySelector('details').open=false;const guide=$('.document-guide');guide.open=true;guide.scrollIntoView();}
    else if(button.hasAttribute('data-doc-toc')){openTree=!openTree;root.querySelector('.doc-toc').hidden=!openTree;button.setAttribute('aria-expanded',openTree);}
    else if(button.dataset.docJump){jump(button.dataset.docJump,{},true);if(innerWidth<=700){openTree=false;root.querySelector('.doc-toc').hidden=true;root.querySelector('[data-doc-toc]').setAttribute('aria-expanded','false');}}
    else if(button.hasAttribute('data-doc-back')&&previous){const old=previous;previous=visiblePosition();jump(old.key,old);}
    else if(button.matches('a[href]') && button.getAttribute('href')?.match(/^assets\/measurement-log\.pdf#page=[12]$/)){
      showSource(Number(button.hash.slice(-1)),button);
    }else if(button.hasAttribute('data-checkpoint')){
      if(working!==snapshot(latest())){extra.push(working);writeCache();root.querySelector('#draft').innerHTML=versionOptions();message=tr('已保存 Draft ','Saved Draft ')+latest();}
      else message=tr('没有新改动，未重复创建 Draft','No changes since Draft ')+ (english?latest():'');
      status();
    }else return false;
    return true;
  }
  function unmount(){
    cancelAnimationFrame(frame);if(editor){editor.destroy();editor=null;}
    root=null;
  }
  const baseline=paper.markdown['02'];
  const baselineSections=new Map(markdownRows(baseline).map(h=>[h.key,baseline.slice(h.to,h.end).trim()]));
  function structuralRows(v){
    const text=v==='work'?working:snapshot(v);
    return markdownRows(text).map(h=>{
      const raw=text.slice(h.to,h.end).trim();
      return {key:h.key,title:h.title,level:h.level,raw,changed:!paper.markdown[v] && baselineSections.get(h.key)!==raw};
    });
  }
  return {mount,unmount,template,click,valid,latest,visiblePosition,structuralRows,proofBody};
})();
