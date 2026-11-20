// One writing surface for the entire draft. Block IDs remain storage/anchor identities.
let documentOpenRequest=0;
function manuscriptDraftFooter({root,project,save,rev,status,isDirty,refreshNotes}){
 const foot=root.querySelector('.studioFoot'),author=document.createElement('button'),version=document.createElement('button');
 author.className='manuscriptAuthor';author.textContent='设置作者署名';author.setAttribute('aria-label','设置稿件作者署名');
 version.className='manuscriptDraft';version.textContent='当前工作稿';version.setAttribute('aria-label','查看 Draft 版本');
 foot.insertBefore(author,foot.querySelector('[data-ok]'));foot.insertBefore(version,foot.querySelector('[data-ok]'));
 const saveDraft=foot.querySelector('[data-ok]');
 saveDraft.textContent='保存 Draft';saveDraft.classList.add('msControl');saveDraft.dataset.control='commit';
 let meta=null,ticket=0,disposed=false,localDirty=false,busy=false;
 function paint(){if(!meta)return;author.textContent=meta.author||'设置作者署名';author.title=meta.author||'设置作者署名';const last=meta.drafts.at(-1);version.textContent=last?(localDirty||meta.changed?'基于 '+last.id+' · 有后续修改':last.id)+' ▾':'当前工作稿 ▾'}
 async function refresh(){const id=++ticket;try{const next=await api('draft_info',{project});if(disposed||id!==ticket)return;meta=next;localDirty=isDirty();paint()}catch(e){if(!disposed)status.textContent='版本状态未能读取：'+e.message}}
 author.onclick=()=>{if(!meta)return;const d=modal('稿件作者署名','<label>作者姓名（多位作者可并列）<input data-author maxlength="200" autocomplete="off"></label><p>署名用于当前稿件和之后保存的 Draft，不改变旧版署名。</p>'+toolButton('保存署名','data-author-save'));d.querySelector('[data-author]').value=meta.author;const base=meta.author;actionOn(d,async b=>{if(!b.hasAttribute('data-author-save'))return;b.disabled=true;try{meta=await api('draft_author',{project,name:d.querySelector('[data-author]').value,base});paint();d.close()}finally{b.disabled=false}})};
 version.onclick=async()=>{await refresh();if(!meta)return;const drafts=meta.drafts,d=modal('稿件 Draft','<p>日常改动自动保存；以下是你主动保存的整篇快照。</p><div class="draftVersions">'+(drafts.length?drafts.slice().reverse().map(v=>'<button data-draft-version="'+E(v.version)+'"><strong>'+E(v.id)+'</strong><span>'+E(v.author||'未署名')+'</span><small>'+E(new Date(v.time).toLocaleString())+'</small></button>').join(''):'<p>尚未保存 Draft。点击右下角「保存 Draft」留下第一版。</p>')+'</div>'+(drafts.length>1?'<div class="draftCompare"><label>从<select data-from>'+drafts.map(v=>'<option value="'+E(v.version)+'">'+E(v.id)+'</option>').join('')+'</select></label><label>到<select data-to>'+drafts.map(v=>'<option value="'+E(v.version)+'">'+E(v.id)+'</option>').join('')+'</select></label>'+toolButton('比较两版','data-draft-compare')+'</div>':'')+'<div data-draft-preview></div>');if(drafts.length>1)d.querySelector('[data-to]').value=drafts.at(-1).version;
  actionOn(d,async b=>{if(b.dataset.draftVersion){const ctx=await api('draft_context',{project,version:b.dataset.draftVersion});const area=d.querySelector('[data-draft-preview]');area.replaceChildren();const heading=document.createElement('h3');heading.textContent=drafts.find(v=>v.version===ctx.version).id+' · 只读快照';const pre=document.createElement('pre');pre.className='draftSnapshotText';const out=document.createElement('button');out.textContent='导出此 Draft';out.onclick=()=>{d.close();exportDialog(ctx.version,heading.textContent)};area.append(heading,out,pre);renderAnnotatedDraft(pre,ctx)}if(b.hasAttribute('data-draft-compare')){const ds=await api('diff',{project,from:d.querySelector('[data-from]').value,to:d.querySelector('[data-to]').value});d.querySelector('[data-draft-preview]').innerHTML=ds.length?ds.map(x=>'<section><h3>'+E(x.title)+'</h3><div class="draftSnapshotText">'+x.parts.map(([tag,l,r])=>tag==='equal'?E(l):(l?'<del>'+E(l)+'</del>':'')+(r?'<ins>'+E(r)+'</ins>':'')).join('')+'</div></section>').join(''):'<p>两版正文没有变化。</p>'}});
 };
 async function checkpoint(){if(busy)return;busy=true;const button=foot.querySelector('[data-ok]');button.disabled=true;try{if(!await save())return;const result=await api('draft_checkpoint',{project,rev:rev()});meta=result;const p=await api('state',{project});if(proj===project)updateReader(p,project);await refreshNotes();localDirty=isDirty();paint();status.textContent=result.created?'已保存 '+result.drafts.at(-1).id:'没有新改动，未重复创建 Draft';window.msToast?.(status.textContent)}catch(e){status.textContent='Draft 未保存：'+e.message}finally{busy=false;button.disabled=false}}
 const changed=e=>{if(e.detail===project)refresh()};document.addEventListener('manuscript-notes-changed',changed);refresh();
 return {refresh,checkpoint,dirty(){localDirty=true;paint()},destroy(){disposed=true;document.removeEventListener('manuscript-notes-changed',changed)}};
}

function openManuscriptRecovery({project, format, applied}){
 const d=modal('正文备份与恢复',
  '<p>备份按版本保存为只读文件。接着写时，请先将备份另存到其他位置，或保存一份可编辑副本。</p>'+
  '<section class="manuscriptRecoveryFiles" aria-label="本地备份">'+
  '<p data-backup-state role="status">正在检查本地备份…</p><code data-backup-path hidden></code>'+
  '<div class="schTools">'+toolButton('打开项目文件夹','data-backup-reveal hidden')+
  toolButton('重试备份','data-backup-retry hidden')+toolButton('保存可编辑副本','data-backup-copy')+'</div></section>'+
  '<section aria-label="导入外部修改"><label>导入外部修改<input type="file" data-import-file accept="'+(format==='tex'?'.tex':'.md,.markdown')+'"></label>'+
  '<p>选文件后核对差异。确认采用后，变更才会写入当前工作稿。</p>'+
  '<div data-import-diff role="region" aria-label="外部稿件差异" tabindex="0" hidden></div>'+
  '<div class="schTools">'+toolButton('刷新差异','data-import-refresh hidden')+
  toolButton('确认采用外部修改','class="msControl" data-control="commit" data-import-apply disabled')+'</div></section>');
 const path=d.querySelector('[data-backup-path]'),backup=d.querySelector('[data-backup-state]'),
  reveal=d.querySelector('[data-backup-reveal]'),retry=d.querySelector('[data-backup-retry]'),
  input=d.querySelector('[data-import-file]'),diff=d.querySelector('[data-import-diff]'),
  refreshButton=d.querySelector('[data-import-refresh]'),apply=d.querySelector('[data-import-apply]'),
  status=d.querySelector('.schError');
 let file=null, review=null;
 async function backupStatus(){
  retry.disabled=true;
  try{
   const value=await api('document_backup_status',{project});
   backup.textContent=value.state==='saved'?'最近备份 '+value.version+' · '+new Date(value.time).toLocaleString():
    value.state==='pending'?'备份待补'+(value.version?' · 上次成功 '+value.version:'')+'。'+value.error:
    value.state==='unbound'?'请在 DSH 项目库为稿件绑定本地项目文件夹。':'首份正文保存后会自动写入备份。';
   path.hidden=!value.folder;path.textContent=value.path||value.folder||'';
   reveal.hidden=!value.folder||host.host!=='dsh';
   retry.hidden=value.state!=='pending';
  }catch(e){
   backup.textContent='备份状态读取失败 · '+e.message;retry.hidden=false;
  }finally{retry.disabled=false}
 }
 async function reviewFile(){
  input.disabled=refreshButton.disabled=true;
  apply.disabled=true;review=null;diff.hidden=true;status.textContent='';
  try{
   review=await api('document_import_preview',{project,...file});
   diff.innerHTML=review.groups.length?review.groups.map(group=>
    '<section><small>当前稿第 '+group.before+' 行 · 外部稿第 '+group.after+' 行</small>'+
    '<pre>'+group.parts.map(([tag,old,text])=>tag==='equal'?E(old):
     (old?'<del>'+E(old)+'</del>':'')+(text?'<ins>'+E(text)+'</ins>':'')).join('')+'</pre></section>').join(''):
    '<p>所选文件与当前正文一致。</p>';
   diff.hidden=false;apply.disabled=!review.groups.length;
  }finally{input.disabled=refreshButton.disabled=false;refreshButton.hidden=false}
 }
 input.onchange=async()=>{
  const selected=input.files[0];if(!selected)return;
  input.disabled=true;apply.disabled=true;refreshButton.hidden=true;
  file=review=null;diff.hidden=true;status.textContent='';
  try{
   if(selected.size>50*1024*1024)throw Error('文件超过 50 MiB');
   file={name:selected.name,data:await bytes64(selected)};
   await reviewFile();
  }catch(e){status.textContent=e.message}finally{input.disabled=false}
 };
 actionOn(d,async button=>{
  if(button===reveal)return api('dsh_reveal',{project});
  if(button===retry)return backupStatus();
  if(button===refreshButton&&file)return reviewFile();
  if(button===apply&&review&&file){
   apply.disabled=input.disabled=refreshButton.disabled=true;
   try{
    const next=await api('document_import_apply',{project,...file,rev:review.rev,digest:review.digest});
    d.close();await applied(next);
   }finally{input.disabled=refreshButton.disabled=false}
  }
  if(button.hasAttribute('data-backup-copy')){
   button.disabled=true;
   try{
    const copy=await api('document_copy',{project});
    downloadSch(blobFrom(copy.data,copy.name.endsWith('.zip')?'application/zip':'text/plain'),copy.name);
   }finally{button.disabled=false}
  }
 });
 backupStatus();
}

// The draft stays editable Markdown. Legacy PDF callouts are view decorations.
const manuscriptFigureAnchor=id=>' <a id="'+id+'"></a>';
const newManuscriptFigureId=()=>'fig-'+Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>n.toString(16).padStart(2,'0')).join('');
const documentImagePath=asset=>asset.figurePath||'figures/'+asset.sha+'.'+asset.name.split('.').pop().toLowerCase();
function manuscriptFigureImage(path,alt){
 return '!['+alt.replace(/([\\\[\]])/g,'\\$1').replace(/\s+/g,' ').trim()+']('+path+')';
}
function manuscriptLegacyFigureCaption(text){
 const number=/^(?:fig(?:ure)?[ \t]+|fig\.[ \t]*|图[ \t　]*)(?:[a-z][ .-]?)?[0-9０-９]+(?:[.．–－-][0-9０-９]+)*(?:[a-z](?=[.:：．。]))?(?=$|[ \t　.:：．。、|–—（(\-])/i.exec(text);
 if(!number)return text;
 return text.slice(number[0].length).replace(/^[ \t　]*(?:[.:：．。、|–—-][ \t　]*)?/,'');
}
const manuscriptNumberedFigureLabel=String.raw`(?:图|Fig\.|Figure) \d+`;
const manuscriptCaptionMark=new RegExp(String.raw`^\n[ \t]*\n(?<mark>\*\*(?:图注|`+manuscriptNumberedFigureLabel+String.raw`\.)\*\*)[ \t]*`);
const manuscriptReferenceText=String.raw`(?:图|图号待确认|`+manuscriptNumberedFigureLabel+')';
const manuscriptReferenceLabel=new RegExp('^'+manuscriptReferenceText+'$');
const manuscriptFigureLink=new RegExp(String.raw`(?<![!\\])\[`+manuscriptReferenceText+String.raw`\]\(#(fig-[a-f0-9]{16})\)`,'g');
function manuscriptFigureSyntax(text,style){
 const literal=window.manuscriptLiteralRanges(text);
 const writable=at=>!literal.some(range=>range.from<=at&&at<range.to);
 const images=new Map(),captions=new Map(),references=new Map(),ids=new Map(),entries=[];
 const lines=/^ {0,3}(?<image>!\[(?<alt>(?:\\.|[^\]\\\n])*)\]\((?<path><[^<>\n]+>|[^()\s]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\))(?<anchor>[ \t]+<a id="(?<id>fig-[a-f0-9]{16})"><\/a>)?[ \t]*$/gm;
 let number=0;
 for(const match of text.matchAll(lines)){
  const {image,alt,id,path}=match.groups,from=match.index+match[0].indexOf(image),end=match.index+match[0].length;
  if(!writable(from))continue;
  const after=text.slice(end);
  const caption=manuscriptCaptionMark.exec(after);
  const captionFrom=caption?end+caption[0].indexOf(caption.groups.mark):null;
  const start=caption?end+caption[0].length:end;
  const body=caption?text.slice(start).split(/\n(?:[ \t]*\n|[ \t]*(?:#{1,6}(?:\s|$)|>|[-*+]\s|\d+[.)]\s|!\[|`{3}|~{3}))/u,1)[0].trim():'';
  const row={from,end,imageEnd:from+image.length,alt:alt.replace(/\\([\\\[\]])/g,'$1'),path:path.replace(/^<(.*)>$/,'$1'),id,body,captionFrom,start};
  entries.push(row);
  if(!id)continue;
  row.number=++number;row.label=ManuscriptFigureSettings.label(style,row.number);
  images.set(from,row);
  if(caption)captions.set(captionFrom,{row,to:captionFrom+caption.groups.mark.length});
  ids.set(id,ids.has(id)?null:row);
 }
 for(const m of text.matchAll(manuscriptFigureLink)){
  if(writable(m.index))references.set(m.index,{id:m[1],to:m.index+m[0].length,label:ids.get(m[1])?.label||'图号待确认'});
 }
 return {entries,images,captions,references,ids};
}
function documentFigureTools(project,doc){
 const resources=doc.imageResources||{},cache=new Map(),pages=new Map();
 const lazy=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){lazy.unobserve(e.target);e.target.loadPreview?.()}},{rootMargin:'200px'});
 const units=Array.from(doc.text),offsets=[0];for(const c of units)offsets.push(offsets.at(-1)+c.length);
 let original=(doc.imageHints||[]).map(h=>({...h,at:offsets[h.at],start:offsets[h.start]}));
 const spans=doc.spans.map(s=>({...s,offset:offsets[s.body],prefix:doc.text.slice(offsets[s.start],offsets[s.body])}));
 let lastText,lastHints;
 function hints(text){
  if(!original.length||text===doc.text)return original;
  if(text===lastText)return lastHints;
  // Follow saved section delimiters in document order; never move a photo to a guessed heading.
  let cursor=0;const bounds=spans.map(s=>{const start=s.prefix?text.indexOf(s.prefix,cursor):-1;
   if(start>=0)cursor=start+s.prefix.length;return {start,body:start<0?-1:cursor}});
  lastHints=[];
  for(const [i,s] of spans.entries()){
   const from=bounds[i].body,end=bounds[i+1]?.start??text.length;if(from<0||end<from)continue;
   const body=text.slice(from,end),masked=body.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*$|(?![\s\S]))|`[^`\n]*`/gm,v=>' '.repeat(v.length));
   for(const h of original){if(h.block!==s.block||masked.includes(']('+h.path+')'))continue;
    const m=new RegExp(h.pattern,'i').exec(masked);if(!m)continue;
    const tail=m.index+m[0].length,blank=body.slice(tail).search(/\n[ \t]*\n/);
    lastHints.push({...h,at:from+(blank<0?body.trimEnd().length:tail+blank)});
   }
  }
  lastText=text;return lastHints;
 }
 let syntaxText,syntaxStyle,syntax;
 function scan(text){
  const style=ManuscriptFigureSettings.style(paper?.settings?.figureLabelStyle);
  if(syntaxText!==text||syntaxStyle!==style){syntax=manuscriptFigureSyntax(text,style);syntaxText=text;syntaxStyle=style}
  return syntax;
 }
 function lookup(path){
  path=path.replace(/^\.\//,'');
  if(/^figures\/[^/]+$/.test(path)){
   try{path='figures/'+encodeURIComponent(decodeURIComponent(path.slice(8))).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}catch{}
  }
  if(Object.hasOwn(resources,path))return {...resources[path],label:resources[path].caption||'正文插图'};
  const alias=paper?.figureAliases?.[path];
  const a=paper?.assets?.find(a=>alias?a.id===alias:'figures/'+a.sha+'.'+a.name.split('.').pop().toLowerCase()===path);
  return a&&{path,asset:a.id,label:a.name,mime:'image/'+(/\.jpe?g$/i.test(a.name)?'jpeg':a.name.split('.').pop())};
 }
 async function pixels(f){
  if(f.asset){const v=await api('file',{project,asset:f.asset});return 'data:'+f.mime+';base64,'+v.data}
  const key=f.sha+':'+f.page;
  if(!pages.has(key))pages.set(key,(async()=>{const im=new Image();im.src='data:image/png;base64,'+await api('source_page',{project,key:f.key,page:f.page,sha:f.sha});await im.decode();return im})().catch(e=>{pages.delete(key);throw e}));
  const im=await pages.get(key),[x,y,w,h]=f.rect,c=document.createElement('canvas');c.width=Math.round(im.width*(x+w))-Math.round(im.width*x);c.height=Math.round(im.height*(y+h))-Math.round(im.height*y);
  c.getContext('2d').drawImage(im,Math.round(im.width*x),Math.round(im.height*y),c.width,c.height,0,0,c.width,c.height);return c.toDataURL('image/png')
 }
 function render(h){
  const f=lookup(h.path),button=document.createElement('button');button.type='button';button.className='msDocumentThumb';button.contentEditable='false';button.setAttribute('aria-label','打开原图：'+h.label);
  if(h.figure)button.dataset.figureId=h.figure.id;
  const remote=!f&&h.figure&&/^https?:\/\//i.test(h.path);
  button.title=h.label;button.textContent='图片预览';
  let opening=false;
  function load(){
   if(!f&&!remote)return Promise.reject(Error('图片原件不可用'));
   const key=f?.path||h.path;
   if(!cache.has(key))cache.set(key,(async()=>{const image=new Image();image.src=remote?h.path:await pixels(f);await image.decode();return image})().catch(error=>{cache.delete(key);throw error}));
   return cache.get(key);
  }
  function show(image){if(!button.isConnected||button.querySelector('img'))return;const preview=image.cloneNode();preview.removeAttribute('style');preview.alt=h.label;button.replaceChildren(preview);button.title=h.label}
  function failed(error){button.textContent='图片未能读取 · 重试';button.title=error.message}
  button.loadPreview=()=>load().then(show).catch(failed);
  button.disposePreview=()=>lazy.unobserve(button);
  lazy.observe(button);
  button.onmousedown=e=>e.preventDefault();button.onclick=async e=>{
   e.preventDefault();e.stopPropagation();if(opening)return;opening=true;
   try{const image=await load();if(button.isConnected){
    show(image);const row=h.figure;
    const captionHTML=row&&window.manuscriptRenderMarkdown('**'+row.label+'.**'+(row.body?' '+row.body:''),true);
    ManuscriptImageViewer.open({image:image.cloneNode(),alt:h.label,caption:f?.caption||h.label,captionHTML,trigger:button});
   }}
   catch(error){failed(error)}finally{opening=false}
  };
  return button;
 }
 function markdown(text){for(const h of [...hints(text)].sort((a,b)=>b.at-a.at))text=text.slice(0,h.at)+'\n\n'+h.markdown+text.slice(h.at);return text}
 function proof(root,text){
  const {entries,ids}=scan(text);
  // Match repeated paths in occurrence order, including legacy images projected from a PDF.
  const key=path=>lookup(path)?.path??path,placements=new Map(),rendered=new Map(),position=new Map();
  const uses=[...entries.map(row=>({path:row.path,from:row.from,at:row.from})),...hints(text).map(h=>({path:h.path,from:h.start,at:h.at}))];
  for(const row of uses.sort((a,b)=>a.at-b.at)){
   const id=key(row.path);if(!placements.has(id))placements.set(id,[]);placements.get(id).push(row.from);
  }
  for(const img of root.querySelectorAll('img[src]')){
   const id=key(img.getAttribute('src'));if(!rendered.has(id))rendered.set(id,[]);rendered.get(id).push(img);
  }
  for(const [id,imgs] of rendered){
   const offsets=placements.get(id);if(offsets?.length===imgs.length)imgs.forEach((img,i)=>position.set(img,offsets[i]));
  }
  const rows=new Map();
  for(const row of entries)if(row.id){
   if(!rows.has(row.id))rows.set(row.id,[]);
   rows.get(row.id).push(row);
  }
  for(const anchor of root.querySelectorAll('a[id^="fig-"]')){
   const row=rows.get(anchor.id)?.shift(),p=anchor.parentElement,img=anchor.previousElementSibling;
   if(!row||!img?.matches('img[src]'))continue;
   const path=img.getAttribute('src');
   p.classList.add('msBodyFigure');
   const thumbnail=render({path,label:img.alt||row.label,figure:row});
   thumbnail.dataset.documentImageFrom=row.from;img.replaceWith(thumbnail);
   const caption=p.nextElementSibling,mark=caption?.firstElementChild;
   if(row.captionFrom!==null&&mark?.matches('strong')){mark.textContent=row.label+'.';caption.classList.add('msFigureCaption')}
   else {const label=document.createElement('p');label.className='msFigureCaption';label.textContent=row.label;p.after(label)}
  }
  for(const link of root.querySelectorAll('a[href^="#fig-"]')){
   if(!manuscriptReferenceLabel.test(link.textContent))continue;
   const id=link.getAttribute('href').slice(1);
   link.textContent=ids.get(id)?.label||'图号待确认';
   if(ids.get(id))link.classList.add('msFigureReference');
   else link.removeAttribute('href');
  }
  for(const img of root.querySelectorAll('img[src]')){
   const f=lookup(img.getAttribute('src'));let element=img;
   if(f){element=render({...f,label:img.alt||f.label});img.replaceWith(element)}else img.loading='lazy';
   if(position.has(img))element.dataset.documentImageFrom=position.get(img);
  }
 }
 function release(root){for(const button of root.querySelectorAll('.msDocumentThumb'))button.disposePreview?.()}
 function saved(blocks){const byId=new Map(blocks.map(b=>[b.id,b.markdownSourceFigures]));original=original.filter(h=>!byId.get(h.block)?.includes(h.path));lastText=undefined}
 function blockPosition(id,text){
  const span=spans.find(row=>row.block===id);
  if(text===doc.text)return span?.offset;
  if(!span?.prefix)return;
  const start=text.indexOf(span.prefix);
  if(start>=0&&start===text.lastIndexOf(span.prefix))return start+span.prefix.length;
 }
 return {hints,scan,lookup,render,markdown,proof,release,saved,blockPosition,destroy(){lazy.disconnect();pages.clear();cache.clear()}};
}
async function openDocumentEditor(id='root',options={}){
 const request=++documentOpenRequest,project=proj;
 reader.dataset.document='true';reader.innerHTML='<article class="wholeDocument"><div role="status">正在打开正文…</div></article>';
 try{
  const doc=options.doc||await api('document_read',{project});
  if(request!==documentOpenRequest||proj!==project||view!=='read')return;
  const article=reader.querySelector('article');article.innerHTML='<div data-document-slot></div>';
  const whole={id:'__document__',title:paper.title,text:doc.text,format:doc.format,rev:doc.rev,whole:true,document:doc};
  writingStudio(whole,article.querySelector('[data-document-slot]'),()=>{delete reader.dataset.document},null,null,options.resume);
  inlineStudio.el.querySelector('[data-x]').textContent='回到构思导图';
  if(options.heading){if(!inlineStudio.jumpToHeading(options.heading))window.msToast?.('原小标题已无法准确定位，请返回构思卡重新关联。');return;}
  const span=doc.spans.find(s=>s.block===id),block=paperBlock(id);if(span&&block?.text){const focus=window.ManuscriptScales?.anchor(project),at=focus?.block===id&&focus.focusQuote&&Number.isInteger(focus.focusAt)&&block.text.startsWith(focus.focusQuote,focus.focusAt)?focus.focusAt:-1,start=options.paragraphOffset??(at>=0?Array.from(block.text.slice(0,at)).length:0),quote=Array.from(block.text).slice(start,start+80).join('');await inlineStudio.revealReference({project,version:paperVersion,documentStart:span.body+start,documentEnd:span.body+start+Array.from(quote).length,quote})}
 }catch(e){if(request!==documentOpenRequest||proj!==project||view!=='read')return;reader.querySelector('article').innerHTML='<p role="status">'+E(e.message)+'</p>'+toolButton('重试打开正文','data-document-retry');reader.querySelector('[data-document-retry]').onclick=()=>openDocumentEditor(id,{...options,doc:null})}
}

function citationPicker(insert){
 const d=modal('插入引用','<div class="citationSearch"><input aria-label="查找引用文献" placeholder="输入题名、作者或关键词" autofocus>'+toolButton('搜索 Zotero','data-cite-search')+'</div><p class="citationHint">从本机 Zotero 或本项目文献中选择，插入到正文光标处。</p><div class="citationResults"></div>');
 const input=d.querySelector('input'),results=d.querySelector('.citationResults'),error=d.querySelector('.schError');let ticket=0;
 function projectResults(){const q=input.value.trim().toLowerCase();results.innerHTML=Object.values(lib()).filter(r=>[r.title,r.author,r.year,r.doi].join(' ').toLowerCase().includes(q)).map(r=>'<button type="button" data-cite-local="'+E(r.key)+'"><strong>'+E(r.title)+'</strong><small>'+E([r.author,r.year,'项目文献'].filter(Boolean).join(' · '))+'</small></button>').join('')||'<p>项目中暂无匹配文献，可搜索 Zotero。</p>'}
 input.oninput=projectResults;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();d.querySelector('[data-cite-search]').click()}};projectResults();
 actionOn(d,async b=>{
  if(b.dataset.citeLocal){insert('[@'+b.dataset.citeLocal+']');d.close();return}
  if(b.hasAttribute('data-cite-search')){const n=++ticket;b.disabled=true;error.textContent='正在搜索 Zotero…';try{const rows=await callSch('zotero_search',{query:input.value});if(n!==ticket||!d.open)return;results.innerHTML=rows.map(r=>'<button type="button" data-cite-zotero="'+E(r.key)+'"><strong>'+E(r.title)+'</strong><small>'+E([r.author,r.year,'Zotero'].filter(Boolean).join(' · '))+'</small></button>').join('')||'<p>Zotero 中没有匹配文献。</p>';error.textContent=''}finally{b.disabled=false}}
  if(b.dataset.citeZotero){b.disabled=true;error.textContent='正在插入引用…';try{const r=await callSch('zotero_import',{key:b.dataset.citeZotero});await refreshSch();if(d.open){insert('[@'+r.key+']');d.close()}}finally{b.disabled=false}}
 });
}


function viewCitationSources(members){
 if(members.length===1){refDetail(...members[0]);return}
 const dialog=modal('查看来源',members.map(([key,pin],i)=>
  toolButton(lib()[key].title+(pin?' · '+pin:''),'data-cite-member="'+i+'"')).join(' '));
 actionOn(dialog,button=>{
  if(!button.hasAttribute('data-cite-member'))return;
  dialog.close();refDetail(...members[Number(button.dataset.citeMember)]);
 });
}

function editCitationGroup(original,apply){
 const members=original.slice();
 const dialog=modal('编辑此处引文','<div class="citationResults" data-cite-members></div><div class="dialogBtns">'+
  toolButton('添加文献','data-cite-add')+toolButton('保存修改','class="msControl" data-control="commit" data-cite-apply')+'</div>');
 const list=dialog.querySelector('[data-cite-members]');
 function render(){
  list.innerHTML=members.map(([key,pin],i)=>'<div class="refRow"><span>'+E(lib()[key].title)+(pin?' · '+E(pin):'')+'</span> '+
   toolButton('移除','data-cite-remove="'+i+'" aria-label="'+E('移除 '+lib()[key].title)+'"')+'</div>').join('')||'<p>保存后将移除这处引文。</p>';
 }
 render();
 actionOn(dialog,button=>{
  if(button.hasAttribute('data-cite-add')){
   citationPicker(value=>{
    for(const item of citationMembers(value)){
     if(!members.some(([key])=>key===item[0]))members.push(item);
    }
    render();
   });
  }else if(button.hasAttribute('data-cite-remove')){
   members.splice(Number(button.dataset.citeRemove),1);render();
   (list.querySelector('button')||dialog.querySelector('[data-cite-add]')).focus();
  }else if(button.hasAttribute('data-cite-apply')){
   if(JSON.stringify(members)!==JSON.stringify(original))apply(members);
   dialog.close();
  }
 });
}
