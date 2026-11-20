// Disclosures share keyboard/outside-click behavior without taking over the editor.
function paperMenu(label,contents,attrs=''){
 return '<details class="paperMenu" data-paper-menu="'+E(label)+'" '+attrs+'><summary class="msControl">'+E(label)+'<span aria-hidden="true">⌄</span></summary><div class="paperMenuPanel" role="group" aria-label="'+E(label)+'">'+contents+'</div></details>'
}
function positionPaperMenu(menu){
 const panel=menu.querySelector('.paperMenuPanel'),box=menu.querySelector('summary').getBoundingClientRect();
 panel.style.maxHeight=Math.max(100,innerHeight-24)+'px';
 const down=innerHeight-box.bottom-12,up=box.top-12,useDown=down>=Math.min(panel.scrollHeight,320)||down>=up;
 panel.style.maxHeight=Math.max(60,useDown?down:up)+'px';
 panel.style.left=Math.max(8,Math.min(innerWidth-panel.offsetWidth-8,box.right-panel.offsetWidth))+'px';
 panel.style.top=(useDown?box.bottom+6:Math.max(8,box.top-panel.offsetHeight-6))+'px';
}
document.addEventListener('toggle',e=>{
 if(!e.target.matches?.('.paperMenu'))return;
 if(e.target.open){for(const other of document.querySelectorAll('.paperMenu[open]'))if(other!==e.target)other.open=false;positionPaperMenu(e.target)}
},true);
document.addEventListener('pointerdown',e=>{
 for(const menu of document.querySelectorAll('.paperMenu[open]'))if(!menu.contains(e.target))menu.open=false;
});
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;
 const selection=document.querySelector('.inlineStudio .studioSelection:not([hidden])');
 if(selection){e.preventDefault();e.stopImmediatePropagation();inlineStudio?.selection.dismiss();inlineStudio?.focusText();return}
 const menu=document.querySelector('.paperMenu[open]');
 if(!menu){const find=document.querySelector('.inlineStudio .findBar:not([hidden])');if(find){e.preventDefault();e.stopImmediatePropagation();find.hidden=true;inlineStudio?.focusText()}return}
 e.preventDefault();e.stopImmediatePropagation();menu.open=false;menu.querySelector('summary').focus({preventScroll:true});
},true);
document.addEventListener('click',e=>{
 const button=e.target.closest('button'),menu=button?.closest('.paperMenu');
 if(menu&&!menu.hasAttribute('data-menu-keep'))menu.open=false;
});
document.addEventListener('scroll',e=>{
 for(const menu of document.querySelectorAll('.paperMenu[open]'))if(!menu.querySelector('.paperMenuPanel').contains(e.target))positionPaperMenu(menu);
},true);
window.addEventListener('resize',()=>document.querySelectorAll('.paperMenu[open]').forEach(positionPaperMenu));

function manuscriptTools(){
 const files=toolButton('参考文献','data-managerefs')+toolButton('图表库','data-manageobjs')+citationStyleControls('reader')+'<hr>'+toolButton('导入论文','data-importread title="作为新增章节导入当前项目"')+toolButton('Word / Zotero','data-worddesk');
 const reading='<div class="readingToggles">'+[['color','结构色块'],['only','只看色块'],['bold','词首加粗'],['ruler','阅读尺']].map(([k,v])=>toolButton(v,'data-mode="'+k+'"')).join('')+'</div><hr><label>标注来源<select data-readsource><option value="model">模型 · 上下文</option><option value="rules">规则标注</option></select></label>'+toolButton('分析全文','data-context-all')+'<small data-all-status role="status"></small><details class="lxAidOptions"><summary>详细设置</summary><label>标注颗粒度<select data-grain><option value="split">句内拆标</option><option value="whole">整句合标</option></select></label><label>词首长度 <output data-val="length"></output><input type="range" min="10" max="100" step="5" data-aid="length"></label><label>强调疏密 <output data-val="density"></output><input type="range" min="1" max="5" data-aid="density"></label></details><p class="readingHint" hidden></p>';
 return '<nav class="schTools manuscriptTools" aria-label="稿件工具"><span class="manuscriptLabel">正文</span>'+paperMenu('资料',files)+paperMenu('阅读设置',reading,'data-menu-keep')+toolButton('导出','data-exportdoc')+'</nav>';
}

function studioTools(modeTex,whole=false){
 const format=toolButton('格式','class="msControl" data-format aria-pressed="false"');
 const insert=toolButton('引用文献','data-library="refs"')+toolButton('引用原文片段','data-library="search"')+toolButton('图片与表格','data-library="objects"')+toolButton('公式','data-equation');
 const documentOptions=whole?toolButton('插入…','data-open-insert aria-haspopup="menu" aria-expanded="false"')
  +toolButton('源码模式','data-source-mode aria-pressed="false"')+format
  +(!modeTex&&paper.readingGuide?toolButton('补入来源图表的 Markdown 链接','data-materialize-figures'):'')+'<hr>'
  +toolButton('本章折叠写作','data-current-writing-fold')+toolButton('稿件管理','data-manuscript-management')+citationStyleControls('document')+toolButton('参考文献与图表','data-library="refs"')
  +toolButton('正文备份与恢复','data-document-recovery')+toolButton('导出稿件','data-document-export')+toolButton('正文设置','data-editor-settings')+'<hr>':'';
 const more=documentOptions+(!modeTex?toolButton('Markdown 配色与快捷键','data-markdown-prefs'):'')+toolButton('查找 / 替换','data-find')+toolButton(whole?'讨论全文':'讨论本章','data-engage="chat"')+toolButton('Agent 建议','data-suggestions')+'<div data-writing-records></div>';
 const modes=whole?'':'<div class="studioModes" role="group" aria-label="正文模式">'+[['rich','编辑'],['source','源码'],['proof','阅读']].map(([k,v])=>toolButton(v,'class="msControl" data-stage="'+k+'"')).join('')+'</div>';
 const modeToggle='<button type="button" class="msControl studioModeToggle" data-toggle-mode aria-label="切换到阅读模式"><svg data-mode-icon="edit" aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg><svg data-mode-icon="read" aria-hidden="true" viewBox="0 0 24 24" hidden><path d="M12 6v15m0-15C9 4 5 4 2.5 5v14c3-1 6.5-1 9.5 2 3-3 6.5-3 9.5-2V5C19 4 15 4 12 6Z"/></svg></button>';
 return '<div class="studioTools">'+modes+'<div class="studioCommands">'+(whole?modeToggle:paperMenu('插入',insert)+format)+paperMenu('更多',more)+'</div></div><div class="studioSelection" role="group" aria-label="选区操作" hidden>'+toolButton('高亮','class="msControl" data-engage="highlight"')+toolButton('批注','class="msControl" data-engage="note"')+(whole?toolButton('粘贴依据','class="msControl" data-engage="evidence"'):'')+toolButton('询问','class="msControl" data-engage="ask"')+'</div>';
}

function documentInsertMenu(root,{surface,prepare,focus,citationAt,editCitation,viewCitation}){
 const panel=document.createElement('div'),more=root.querySelector('[data-open-insert]');
 panel.className='paperMenuPanel studioInsertMenu';panel.hidden=true;
 panel.setAttribute('role','menu');panel.setAttribute('aria-label','插入');
 const insertItems=[
  ['引用','data-citation'],['原文引用','data-library="search"'],['图片','data-library="objects" data-object-kind="figure"'],
  ['表格','data-library="objects" data-object-kind="table"'],['公式','data-equation']
 ].map(([name,attr])=>toolButton(name,'role="menuitem" tabindex="-1" '+attr)).join('');
 root.append(panel);
 const events=new AbortController(),options={signal:events.signal};
 let items=[],citation=null;
 let returnFocus=focus;
 function close(restore=false){
  if(panel.hidden)return;
  panel.hidden=true;more?.setAttribute('aria-expanded','false');
  if(restore)returnFocus();
 }
 function open(x,y,trigger,target=null){
  citation=target;
  const label=citation?'引文':'插入';
  panel.setAttribute('aria-label',label);
  panel.innerHTML='<small aria-hidden="true">'+label+'</small>'+(citation?
   toolButton('编辑此处引文','role="menuitem" tabindex="-1" data-edit-citation')+
   toolButton('查看来源','role="menuitem" tabindex="-1" data-view-citation'):insertItems);
  items=[...panel.querySelectorAll('button')];
  returnFocus=trigger?()=>trigger.focus({preventScroll:true}):focus;
  panel.hidden=false;
  panel.style.maxHeight=Math.max(36,innerHeight-16)+'px';
  panel.style.left=Math.max(8,Math.min(x,innerWidth-panel.offsetWidth-8))+'px';
  panel.style.top=Math.max(8,Math.min(y,innerHeight-panel.offsetHeight-8))+'px';
  more?.setAttribute('aria-expanded','true');
  items[0].focus({preventScroll:true});
 }
 root.addEventListener('contextmenu',e=>{
  if(!surface()?.contains(e.target)||e.shiftKey)return;
  const target=citationAt(e);
  if((!target&&!more)||!prepare(e))return;
  e.preventDefault();e.stopPropagation();open(e.clientX,e.clientY,null,target);
 },options);
 root.addEventListener('keydown',e=>{
  if(!surface()?.contains(e.target)||!(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'))return;
  const target=citationAt();
  if((!target&&!more)||!prepare())return;
  const box=surface().getBoundingClientRect();
  e.preventDefault();open(target?.rect?.left??box.left+8,target?.rect?.bottom??box.top+8,null,target);
 },options);
 panel.addEventListener('keydown',e=>{
  const index=items.indexOf(document.activeElement);
  if(e.key==='Tab'){close(true);return}
  const next={ArrowDown:index+1,ArrowUp:index-1,Home:0,End:items.length-1}[e.key];
  if(next===undefined)return;
  e.preventDefault();items[(next+items.length)%items.length].focus({preventScroll:true});
 },options);
 window.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.isComposing||panel.hidden)return;
  e.preventDefault();e.stopImmediatePropagation();close(true);
 },{...options,capture:true});
 document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target))close()},{...options,capture:true});
 window.addEventListener('resize',()=>close(true),options);
 panel.addEventListener('click',e=>{
  const button=e.target.closest('button');
  if(!button)return;
  close(!!citation);
  if(button.hasAttribute('data-edit-citation'))editCitation(citation);
  if(button.hasAttribute('data-view-citation'))viewCitation(citation);
 },options);
 return {close,openFrom(button){
  if(!prepare())return;
  const disclosure=button.closest('.paperMenu'),summary=disclosure.querySelector('summary'),box=summary.getBoundingClientRect();
  disclosure.open=false;open(box.right-166,box.bottom+4,summary);
 },destroy(){events.abort();panel.remove()}};
}
