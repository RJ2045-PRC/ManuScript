// These views share the map's selection and the host's versioned manuscript.
const reader=$('#reader'),docButton=$('#doc')
let paper=null,paperVersion='',activeQuote=null
function setPaper(p){paper=p;paperVersion=p.versions.at(-1)?.id}
function paperBlock(id){return paper?.blocks.find(b=>b.id===id)}
function talk(k,id,prompt=''){sel=id;room=k;mode='chat';pane.hidden=true;notice='';const key=loc();if(prompt){if(nativeChat){const targetKey=nativeKey(),n=nativeStates.get(targetKey)||{cursor:null,messages:[],draft:''};n.draft=[n.draft,prompt].filter(Boolean).join('\n');nativeStates.set(targetKey,n)}else drafts.set(key,[drafts.get(key),prompt].filter(Boolean).join('\n'))}drawer();box.querySelector('textarea')?.focus();if(!nativeChat&&!rows.length)catalog(false)}
function dialog(title,body){const d=document.createElement('dialog');d.className='writingDialog';d.innerHTML='<form method="dialog"><h3>'+E(title)+'</h3>'+body+'<div class="dialogBtns"><span role="status"></span><button value="cancel" formnovalidate>关闭</button><button type="button" class="primary" data-ok>保存</button></div></form>';document.body.append(d);d.onclose=()=>d.remove();d.showModal();return d}
/*SCHOLAR*/
/*ARGUMENT*/
function sourceAction(b,stage=null){if(reader.dataset.document==='true')return;if(!b||inlineStudio)return;const section=document.getElementById('doc-'+b.id);if(!section)return;const prose=section.querySelector('.rich');prose.hidden=true;section.querySelector('.readActions').hidden=true;const slot=document.createElement('div');prose.before(slot);const top=reader.scrollTop;writingStudio(b,slot,()=>{showPage('read',b.id);reader.scrollTop=top},null,stage)}
function clearQuote(){activeQuote=null;$('#quoteTools')?.remove()}
function mapped(section,b){const body=section.querySelector('.rich'),w=document.createTreeWalker(body,NodeFilter.SHOW_TEXT),out=[];let node,cursor=0;while(node=w.nextNode()){const s=node.data;if(!s.trim())continue;const origin=node.parentElement.closest('[data-lx-offset]');if(node.parentElement.closest('[data-citegroup],figure,button'))continue;let i;if(origin){const r=new Range();r.selectNodeContents(origin);r.setEnd(node,0);i=Number(origin.dataset.lxOffset)+r.toString().length}else i=b.text.indexOf(s,cursor);if(i>=0){out.push({node,i,end:i+s.length});cursor=i+s.length}}
 return out}
function anchoredRange(items,start,end){const a=items.find(x=>x.i<=start&&start<x.end),z=items.find(x=>x.i<end&&end<=x.end);if(!a||!z)return;const r=new Range();r.setStart(a.node,start-a.i);r.setEnd(z.node,end-z.i);return r}
function quoteHere(b,anchor){const q=anchor.quote;if(!q)return -1;if(anchor.start!=null){const i=[...b.text].slice(0,anchor.start).join('').length;if(b.text.slice(i,i+q.length)===q)return i}const i=b.text.indexOf(q);return i!==-1&&b.text.indexOf(q,i+1)===-1?i:-1}
function highlight(s,b,anchor,scroll=false){const i=quoteHere(b,anchor);if(i<0)return false;const r=anchoredRange(mapped(s,b),i,i+anchor.quote.length);if(!r)return false
 if(window.CSS?.highlights&&window.Highlight){const key=scroll?'passage':'annotations';let h=CSS.highlights.get(key);if(!h||scroll){h=new Highlight();CSS.highlights.set(key,h)}h.add(r)}
 if(scroll)r.startContainer.parentElement.scrollIntoView({block:'center'});return true}
function noteDialog(a){const id=proj,d=dialog('给这段原文留批注','<blockquote>'+E(a.quote)+'</blockquote><label>我的批注<textarea rows="4" autofocus></textarea></label>'),ok=d.querySelector('[data-ok]');ok.onclick=async()=>{const msg=d.querySelector('textarea').value.trim();if(!msg)return;ok.disabled=true;try{const p=await api('note',{project:id,...a,message:msg});if(id===proj){updateReader(p,id);if(!inlineStudio)showPage('read',a.block,a)}d.close()}catch(e){d.querySelector('[role=status]').textContent=e.message;ok.disabled=false}}}
function selectPassage(){if(view!=='read'||!paper||inlineStudio)return;clearQuote();const s=getSelection();if(!s.rangeCount||s.isCollapsed)return
 const r=s.getRangeAt(0),sect=r.startContainer.parentElement?.closest('#reader section'),b=sect&&paperBlock(sect.dataset.block);if(!b||!sect.querySelector('.rich')?.contains(r.endContainer))return
 const items=mapped(sect,b),rr=items.filter(x=>r.intersectsNode(x.node));if(!rr.length)return
 const a=rr[0],z=rr.at(-1),i=a.i+(r.startContainer===a.node?r.startOffset:0),j=z.i+(r.endContainer===z.node?r.endOffset:z.node.length);if(i>=j)return
 activeQuote={block:b.id,version:paperVersion,quote:b.text.slice(i,j),start:[...b.text.slice(0,i)].length,end:[...b.text.slice(0,j)].length};const q=activeQuote,el=document.createElement('div');el.id='quoteTools';el.setAttribute('role','group');el.setAttribute('aria-label','对选中的原文操作');el.innerHTML='<small>已选原文 · '+E(q.quote.slice(0,24))+(q.quote.length>24?'…':'')+'</small><button>批注</button><button>询问</button><button>生成逻辑图</button>';reader.before(el);el.onpointerdown=e=>e.preventDefault();el.onclick=e=>{if(e.target.tagName!=='BUTTON')return;clearQuote();if(e.target.textContent==='批注')noteDialog(q);else if(e.target.textContent==='生成逻辑图')diagramForm(q);else askAboutBlock(q)}}
reader.addEventListener('pointerup',()=>setTimeout(selectPassage,0));reader.addEventListener('keyup',e=>{if(e.shiftKey)setTimeout(selectPassage,0)})
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#quoteTools'))clearQuote()})
function highlightsClear(){window.CSS?.highlights?.delete('passage');window.CSS?.highlights?.delete('annotations')}
function notesHtml(b){const notes=paper.notes.filter(x=>x.block===b.id);return notes.length?'<details class="readNotes"><summary>批注 · '+notes.length+'</summary>'+notes.map(n=>'<div><b>'+E(n.actor==='author'?'作者':n.actor)+'</b> · '+E(n.version)+'<blockquote>'+E(n.quote)+'</blockquote><p>'+E(n.message)+'</p>'+(quoteHere(b,n)>=0?'<button data-note="'+E(n.id)+'">定位原句</button>':'<small>原文已变 · 保留旧版引文</small>')+'<button data-discuss-note="'+E(n.id)+'">附到主 Agent 讨论</button></div>').join('')+'</details>':''}
function readerSection(b){
 const text=scholarText(b),context=()=>ManuscriptEquations.blockContext(b,paper.blocks);
 const extras=(paper?.readingGuide&&(paper.readingGuide.block===b.id||b.sitSection)?toolButton('图解试读','data-guide="'+E(b.sitSection||'')+'"'):'')+(b.text?toolButton('折叠写作','data-writefold="'+E(b.id)+'"'):'')+toolButton('讨论本章','data-chatdoc="'+E(b.id)+'"')+(b.text?toolButton('提取正文论证','data-extract="'+E(b.id)+'"')+toolButton('分析本章','data-context-run="'+E(b.id)+'"')+'<small data-context-status role="status"></small>':'');
 return '<section id="doc-'+E(b.id)+'" data-block="'+E(b.id)+'"><small>'+E(b.status)+'</small><h3>'+E(b.title)+'</h3><div class="readActions">'+toolButton('编辑','data-editdoc="'+E(b.id)+'"')+paperMenu('更多',extras)+'</div><div class="rich">'+(b.text?(b.format==='md'?ChatUI.md(ManuscriptEquations.materialize(text,b.format,context)):text.includes('manuscript:auto')?renderTex(text,context):text.split(/\n\s*\n/).map(piece=>renderTex(piece)).join('')):'<p>'+E(b.purpose||'正文待写')+'</p>')+'</div>'+notesHtml(b)+'</section>'
}
function showPage(which,id=sel,anchor=null,documentOptions){if(!connected)return;clearViewMotion();closeSectionActions();if(which!=='map'||!documentOptions?.doc)releaseParkedDocument();manuscriptScalesView?.destroy();manuscriptScalesView=null;hideArgument();clearReadingOverlays();if(ed)commit();clearQuote();highlightsClear();const n=by(id);if(n)sel=id;const bId=anchor?.block||n?.anchor?.block||n?.assets?.[0]||id;anchor=anchor||n?.anchor
 const back=ideaSession?.isOpen?'↩ 回到版本对照':'↩ 回到地图';view=which;vp.hidden=which!=='map';$('#bar').hidden=which!=='map';reader.hidden=which==='map';pane.hidden=true;docButton.textContent=which==='read'?back:'查看成果';document.body.dataset.view=which;updateAnchor()
 if(flatProject())docButton.textContent=which==='read'?(ideaSession?.isOpen?back:'思维导图'):'回到手稿'
 if(which==='map'&&documentOptions?.doc){loadSectionMap(documentOptions.caret,documentOptions.keepViewport,documentOptions.doc);
  revealSectionMap(documentOptions.origin);vp.focus({preventScroll:true});return}
 if(which==='map'){loadSectionMap(documentOptions?.caret,documentOptions?.keepViewport);draw();if(!documentOptions?.keepViewport)reveal();vp.focus({preventScroll:true});return}
 if(which==='scales'){openManuscriptScales();return}
 if(documentOptions?.warmStudio){
  inlineStudio=documentOptions.warmStudio;inlineStudio.wake();
  if(documentOptions.heading&&!inlineStudio.jumpToHeading(documentOptions.heading))window.msToast?.('原小标题已变化，请重新定位。');
  return;
 }
 if(which==='read'&&!anchor)return openDocumentEditor(id,documentOptions);
 delete reader.dataset.document;
 reader.innerHTML='<article>'+manuscriptTools()+'<h2>'+E(paper.title)+'</h2>'+paper.blocks.filter(b=>b.text||b.id===bId||!paper.blocks.some(x=>x.text)).map(readerSection).join('')+'<div data-biblio></div></article>';styleReader(reader.querySelector('article'))
 if(flatProject())flatTools()
 for(const rich of reader.querySelectorAll('section .rich'))enhanceProse(rich);
 prepareReadingAids();applyReadingModes();
 for(const s of reader.querySelectorAll('section')){const b=paperBlock(s.dataset.block);for(const note of paper.notes.filter(x=>x.block===b.id))highlight(s,b,note);if(b.id===bId)s.classList.add('here')}
 const s=document.getElementById('doc-'+bId);if(s){if(flatProject()&&anchor)flatLevel(s,'full');s.scrollIntoView({block:'start'});if(anchor&&!highlight(s,paperBlock(bId),anchor,true)){s.insertAdjacentHTML('afterbegin','<p class="anchorWarning">这条引文在当前稿无法唯一定位。保留的引文：'+E(anchor.quote)+'</p>')}}
}
bindCitationStyle(reader,'reader',{
 apply:data=>styleReader(reader.querySelector('article'),{formatted:data}),
 onError:err=>{$('#save').textContent=err.message},
});
reader.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset
 if(d.discussNote){const note=paper.notes.find(n=>n.id===d.discussNote);if(note)talk('lead',note.block,'讨论我的批注（'+note.version+'）：「'+note.quote+'」\n'+note.message+'\n');return}
 if(d.mode){readModes[d.mode]=!readModes[d.mode];storeReadingModes();applyReadingModes();return}
 if(d.guide!=null)openPaperGuide(paper,api,false,d.guide);else if(d.managerefs!=null)library();else if(d.manageobjs!=null)library('objects');else if(d.worddesk!=null)wordDesk();else if(d.exportdoc!=null)exportDialog();else if(d.writefold)openWritingFold(d.writefold);else if(d.editdoc)sourceAction(paperBlock(d.editdoc));else if(d.chatdoc)talk('lead',d.chatdoc);else if(d.extract)talk('lead',d.extract,'请提取本章的正文论证，把主张、依据、限制写入地图，每条关联真实原句。');else if(d.note){const n=paper.notes.find(x=>x.id===d.note);if(n)highlight(b.closest('section'),paperBlock(n.block),n,true)}})
async function openManuscript(id=sel){
 if(inlineStudio&&!await inlineStudio.close())return;
 showPage('read',id);
}

if(host){docButton.onclick=()=>view==='read'?showPage('map',flatProject()?(flatFocusSection()?.dataset.block||sel):sel):openManuscript()}

/*FLAT_PAPER*/
/*READING_AIDS*/

async function openWritingSuggestions(block){
 if(inlineStudio&&!await (inlineStudio.document?inlineStudio.save():inlineStudio.close()))return;
 await ManuscriptSuggestions.open(api,proj,block,p=>{updateReader(p,proj);if(view!=='map'&&!inlineStudio)showPage(view,sel);else if(originNode)inspectNode(sel,false,false)});
}
