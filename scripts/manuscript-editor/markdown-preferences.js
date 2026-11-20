import {presets,commands,edit,chord,display,reserved,template,parsePalette,readPrefs,storePrefs,applyPalette} from './markdown-writing.js';
import {markdownLanguage} from '@codemirror/lang-markdown';
const classify=n=>/^ATXHeading[1-6]$/.test(n)?'h'+n.at(-1):({StrongEmphasis:'bold',Emphasis:'italic',InlineCode:'code',FencedCode:'code',Link:'link',URL:'link',Blockquote:'quote',HeaderMark:'marker',EmphasisMark:'marker',CodeMark:'marker',QuoteMark:'marker',ListMark:'marker',LinkMark:'marker',CodeInfo:'marker',StrikethroughMark:'marker',TaskMarker:'marker'})[n];
function sourcePaint(el,text){
 const tree=markdownLanguage.parser.parse(text),fragment=document.createDocumentFragment();let last=0;const stack=[];
 function emit(end){if(end<=last)return;const str=text.slice(last,end),kind=stack.at(-1);if(kind){const span=document.createElement('span');span.style.color='var(--ms-'+kind+')';span.textContent=str;fragment.append(span)}else fragment.append(str);last=end}
 tree.iterate({enter(n){const k=classify(n.name);if(k){emit(n.from);stack.push(k)}},leave(n){if(classify(n.name)){emit(n.to);stack.pop()}}});emit(text.length);fragment.append('\u200b');el.replaceChildren(fragment);
}
export function connect(root,src,{editor,dirty,modal,download,onSourcePaint}){
 let prefs=readPrefs();applyPalette(root,prefs);let frame=0,last=null,shell,mirror,resize;
 // Keep the native textarea for IME, selection, undo and existing manuscript anchors.
 function paint(){
  if(!shell||src.hidden)return;
  const style=getComputedStyle(src);
  for(const property of ['padding','font','letterSpacing','wordSpacing','textIndent','tabSize','direction'])mirror.style[property]=style[property];
  mirror.style.width=src.clientWidth+'px';mirror.style.height=src.clientHeight+'px';
  if(last!==src.value){sourcePaint(mirror,src.value);last=src.value}
  mirror.scrollTop=src.scrollTop;mirror.scrollLeft=src.scrollLeft;onSourcePaint?.();
 }
 function repaint(){cancelAnimationFrame(frame);if(src&&!src.hidden)frame=requestAnimationFrame(paint)}
 function sync(){
  if(!src)return;
  if(!shell&&!src.hidden){
   shell=document.createElement('div');shell.className='msSourceShell';src.before(shell);
   mirror=document.createElement('div');mirror.className='msSourceInk';mirror.setAttribute('aria-hidden','true');shell.append(mirror,src);
   resize=new ResizeObserver(paint);
   // Horizontal padding can absorb a resize while the textarea's content box stays the same size.
   resize.observe(src,{box:'border-box'});
  }
  if(shell){shell.hidden=src.hidden;if(!src.hidden)paint()}
 }
 const scrolling=()=>{if(mirror){mirror.scrollTop=src.scrollTop;mirror.scrollLeft=src.scrollLeft}};src?.addEventListener('scroll',scrolling);
 src?.addEventListener('compositionstart',()=>shell?.classList.add('composing'));src?.addEventListener('compositionend',()=>{shell?.classList.remove('composing');repaint()});
 const mapped=c=>prefs.keys?.[c[0]]||c[2];
 function run(id){const rich=root.dataset.stage==='rich',ed=editor();if(rich&&ed?.view.composing)return false;if(!rich&&(!src||root.dataset.stage!=='source'))return false;const value=rich?ed.getMarkdown():src.value,[a,z]=rich?ed.getSelection():[src.selectionStart,src.selectionEnd],c=edit(id,value,a,z);if(!c)return false;
 if(rich){ed.view.dispatch({changes:{from:c.from,to:c.to,insert:c.insert},selection:{anchor:c.anchor,head:c.head},userEvent:'input.format',scrollIntoView:true})}
 else{src.focus();src.setSelectionRange(c.from,c.to);if(!document.execCommand(c.insert?'insertText':'delete',false,c.insert))src.setRangeText(c.insert,c.from,c.to,'end');src.setSelectionRange(c.anchor,c.head);dirty();repaint()}return true;}
 const keydown=e=>{if(e.defaultPrevented||!(e.target===src||e.target.closest('.studioRich .cm-content')))return;const k=chord(e),c=k&&commands.find(c=>mapped(c)===k);if(c&&run(c[0])){e.preventDefault();e.stopPropagation()}};root.addEventListener('keydown',keydown,true);
 function settings(){const d=modal('Markdown 配色与快捷键','<div class="msPrefs"><label>正文配色<select data-palette><option value="ink">分色</option><option value="plain">素色</option>'+Object.entries(presets).map(([id,p])=>'<option value="'+id+'">'+p.label+'</option>').join('')+'<option value="custom">导入的配色</option></select></label><div class="msThemeActions"><label class="msThemeFile">导入 CSS<input type="file" accept=".css,text/css" aria-label="导入配色 CSS"></label><button type="button" data-template>下载 CSS 样板</button></div><small data-theme-name></small><div class="msThemeSample"><b>一级标题</b><strong>加粗</strong><em>斜体</em><code>行内代码</code></div><h3>写作快捷键</h3><p>点按组合键可更改，再按新组合。Esc 取消。</p><div class="msKeyRows"></div><button data-default-keys type="button">恢复默认快捷键</button></div>');
 const status=d.querySelector('[role=status]'),sel=d.querySelector('select'),name=d.querySelector('[data-theme-name]'),rows=d.querySelector('.msKeyRows');let recording=null;
 function update(next){try{storePrefs(next);prefs=next;applyPalette(root,prefs);render();return true}catch{status.textContent='本机偏好未能保存。';return false}}
 function render(){sel.value=prefs.mode;sel.querySelector('[value=custom]').disabled=!prefs.palette;name.textContent=presets[prefs.mode]?presets[prefs.mode].description+' 随 DSH 浅色／深色自动切换。':prefs.mode==='custom'&&prefs.name?'已导入：'+prefs.name:'支持样板中的颜色变量；配色不会写入稿件。';applyPalette(d,prefs);rows.replaceChildren();for(const c of commands){const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=c[1];button.type='button';button.dataset.key=c[0];button.textContent=display(mapped(c));button.setAttribute('aria-label',c[1]+'：'+button.textContent);row.append(label,button);rows.append(row)}}
 render();sel.onchange=()=>update({...prefs,mode:sel.value});d.querySelector('[data-template]').onclick=()=>download(template,'ManuScript-配色.css','text/css');
 d.querySelector('input').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>131072)throw Error('请选择 128 KB 以内的配色 CSS。');const palette=parsePalette(await file.text());if(update({...prefs,mode:'custom',name:file.name,palette}))status.textContent='配色已应用。'}catch(err){status.textContent=err.message}finally{e.target.value=''}};
 rows.onclick=e=>{const b=e.target.closest('[data-key]');if(!b)return;recording=b.dataset.key;for(const btn of rows.querySelectorAll('button'))btn.textContent=display(mapped(commands.find(c=>c[0]===btn.dataset.key)));b.textContent='请按组合键…';status.textContent='';b.focus()};
 d.addEventListener('keydown',e=>{if(!recording||e.target.dataset.key!==recording)return;if(e.key==='Tab'){recording=null;render();return}if(e.key==='Escape'){e.preventDefault();recording=null;render();return}if(['Meta','Control','Alt','Shift'].includes(e.key))return;e.preventDefault();e.stopPropagation();const k=chord(e);if(!k||reserved.has(k)||commands.some(c=>c[0]!==recording&&mapped(c)===k)){status.textContent='此组合不可用或已被占用，请换一组。';return}const id=recording;recording=null;update({...prefs,keys:{...prefs.keys,[id]:k}});rows.querySelector('[data-key="'+id+'"]').focus();status.textContent='快捷键已保存。'});
 d.querySelector('[data-default-keys]').onclick=()=>{recording=null;update({...prefs,keys:{}});status.textContent='已恢复默认快捷键。'};}
 return {settings,sync,repaint,destroy(){cancelAnimationFrame(frame);resize?.disconnect();root.removeEventListener('keydown',keydown,true)}};
}
