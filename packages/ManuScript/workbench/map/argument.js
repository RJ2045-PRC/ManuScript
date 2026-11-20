// A node, its manuscript block and a citation occurrence are separate identities.
const argumentPane=$('#argument')
let originNode=null,inlineStudio=null,evidencePane=null
function citedSentence(text,offset){
 const lineStart=text.lastIndexOf('\n',offset-1)+1,end=text.indexOf('\n',offset),line=text.slice(lineStart,end<0?undefined:end)
 const segments=new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(line)
 return segments.containing(offset-lineStart)?.segment.trim()||line.trim()
}
function citePosition(text,at,key){
 const sentence=citedSentence(text,at),start=text.lastIndexOf(sentence,at);if(start<0)return 0
 return [...text.slice(start,at).matchAll(/\[([^\[\]\n]{1,250})\]|\\cite(?:p|t)?\{([^}]+)\}/g)].reduce((n,m)=>n+parseKeys(m[1]||m[2]).filter(x=>x[0]===key).length,0)
}
function hideEvidence(){evidencePane?.remove();evidencePane=null}
window.lxClearInspection=()=>{if(!inlineStudio)hideArgument()}
function hideArgument(){sectionEditor?.finish();delete argumentPane.dataset.section;sectionIndex=null;hideEvidence();argumentPane.hidden=true;argumentPane.replaceChildren();document.body.classList.remove('inspecting');originNode=null}
function returnToNode(){
 const o=originNode;hideArgument();if(!o||o.proj!==proj)return
 sel=by(o.id)?o.id:'root';for(let n=by(sel);n?.p;n=by(n.p))by(n.p).closed=false
 draw();paint();vp.focus({preventScroll:true})
}
function passageFor(b,a){
 if(!a||!b)return null
 const i=quoteHere(b,a);if(i<0)return null
 const start=b.text.lastIndexOf('\n\n',i-1)+2,end=b.text.indexOf('\n\n',i+a.quote.length)
 const left=start===1?0:start
 return {start:left,text:b.text.slice(left,end<0?undefined:end)}
}
function inspectNode(id,fromChain=false,editNow=true){
 const n=by(id);if(!connected||!n||ed||inlineStudio)return
 if(!fromChain||!originNode)originNode={id,proj,tx,ty,zoom}
 hideEvidence();if(mode)closePane();pane.hidden=true
 argumentPane.dataset.current=id;argumentPane.hidden=false;document.body.style.setProperty('--arg-top',vp.offsetTop+'px');document.body.classList.add('inspecting');if(!fromChain)reveal()
 const a=n.anchor,b=paperBlock(a?.block||n.assets?.[0]||id),part=passageFor(b,a)
 const headingLink=Object.hasOwn(state.headingLinks||{},id)?state.headingLinks[id]:null;
 const fullEditor=nativeChat&&view==='map';
 const direct=kids(id),chain=direct.length?direct:n.kind?kids(n.p).filter(x=>x.kind):[]
 const name=direct.length?'导图子节点':'同级论证节点'
 argumentPane.innerHTML='<div class="argHead"><small>'+E(n.kind||'地图节点')+'</small><button data-back>返回节点 <kbd>Esc</kbd></button></div><h2>'+E(n.t)+'</h2><details class="argOutline"><summary>'+name+' · '+chain.length+'</summary>'+(chain.length?'<ol class="argChain">'+chain.map(x=>'<li><button data-chain="'+E(x.id)+'" aria-current="'+(x.id===id)+'">'+E(x.kind?x.kind+' · ':'')+E(x.t)+'</button></li>').join('')+'</ol>':'<p>此节点尚无子节点。</p>')+'</details>'+
 (id!=='root'?'<div class="ideaHeadingLink">'+(headingLink?'<small>已关联 · '+E(headingLink.title)+'</small><button data-heading-locate>定位正文</button>':'')+'<details class="sectionMenu"><summary>更多操作</summary><div><button data-heading-link>'+E(headingLink?'调整关联':'关联正文小标题')+'</button></div></details><small data-heading-status role="status" hidden></small></div>':'')+
 (fullEditor&&b?(headingLink?'':'<button data-block-locate>定位正文</button>'):'<h3>对应正文'+(b?' · '+E(b.title):'')+'</h3>'+(a&&!part?'<p class="anchorWarning">原句在当前稿中已改变或不唯一。上次关联：'+E(a.quote)+'</p>':'')+
 (b?'<div class="argDocument" data-manuscript="'+E(b.id)+'"><div class="rich"></div><button data-inline '+((a&&!part)?'disabled':'')+'>'+E(part?'编辑这一段':'编辑正文')+'</button></div>':'<p>'+E(n.detail||(headingLink?'此构思尚无独立章节。':'尚未关联正文。'))+'</p>'+(!n.anchor&&!n.group&&id!=='root'&&!headingLink?'<button data-start-writing>写这一节</button>':'')))
 const blockLocate=argumentPane.querySelector('[data-block-locate]');
 if(blockLocate)blockLocate.onclick=()=>locateMapBlock(id,b.id,a).catch(e=>window.msToast?.(e.message));
 if(b&&!fullEditor){const context=()=>ManuscriptEquations.blockContext(b,paper.blocks,part?.start,part?part.start+part.text.length:undefined);const text=part?.text??(a?'':scholarText(b)),doc=argumentPane.querySelector('.argDocument'),rich=doc.querySelector('.rich');rich.innerHTML=text?(b.format==='tex'?renderTex(text,context):ChatUI.md(ManuscriptEquations.materialize(text,b.format,context))):'<p>暂无可定位的正文。</p>';enhanceProse(rich);styleReader(rich);citationClicks(rich)
 doc.querySelector('[data-inline]').onclick=()=>{hideEvidence();doc.replaceChildren();const slot=document.createElement('div');doc.append(slot);writingStudio(b,slot,()=>inspectNode(id,true,false),part&&{...part,node:id})}}
 const start=argumentPane.querySelector('[data-start-writing]');if(start)start.onclick=async()=>{start.disabled=true;try{await writes;const p=await api('start_writing',{project:proj,node:id});updateReader(p,proj);incoming(proj,await api('team_state',{project:proj}));if(fullEditor){const block=paperBlock(by(id)?.assets?.[0]||id);if(block)await locateMapBlock(id,block.id);else inspectNode(id,true,false)}else inspectNode(id,true)}catch(err){start.disabled=false;start.textContent=err.message}}
 const linkButton=argumentPane.querySelector('[data-heading-link]');
 if(linkButton)linkButton.onclick=async()=>{if(inlineStudio&&!await inlineStudio.close())return;await writes;if(view==='map'&&argumentPane.dataset.current===id)editIdeaHeadingLink(n)};
 const locate=argumentPane.querySelector('[data-heading-locate]');
 if(locate)locate.onclick=async()=>{locate.disabled=true;try{await returnToManuscript(headingLink)}catch(error){const status=argumentPane.querySelector('[data-heading-status]');if(status){status.hidden=false;status.textContent=error.message}}finally{locate.disabled=false}};
 argumentPane.querySelector('[data-back]').onclick=leaveFocus
 for(const el of argumentPane.querySelectorAll('[data-chain]'))el.onclick=()=>inspectNode(el.dataset.chain,true)
 argumentPane.scrollTop=0
 if(!fullEditor&&editNow&&b&&(!a||part))argumentPane.querySelector('[data-inline]')?.click()
}
async function locateMapBlock(id,block,anchor){
 const project=proj,doc=await api('document_read',{project});
 if(project!==proj||view!=='map'||argumentPane.dataset.current!==id||argumentPane.hidden)return;
 const span=doc.spans.find(s=>s.block===block);if(!span)throw Error('正文位置已变化，请重新定位。');
 const body=Array.from(doc.text).slice(span.body,span.end).join('');
 const at=anchor?quoteHere({text:body},anchor):0;if(at<0)throw Error('原句已变化，请重新定位。');
 const start=span.body+Array.from(body.slice(0,at)).length;
 await showPage('read','root',null,{resume:true,doc});
 if(inlineStudio?.document&&view==='read'&&proj===project)await inlineStudio.revealReference({project,version:paperVersion,documentStart:start,documentEnd:start,quote:''});
}
window.lxInspect=id=>{
 if(mode==='chat'){window.updateAnchor?.();const label=box.querySelector('[data-native-anchor]');if(label)label.textContent='DSH 原生会话 · '+(by(id)?.t||'整个项目');return}
 inspectNode(id)
}
async function leaveFocus(){const whole=inlineStudio?.document;if(inlineStudio&&!await inlineStudio.close())return;if(whole){showPage('map','root');return}if(originNode)returnToNode();else hideEvidence()}
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.target.closest('.draftNote,.draftNoteEditor,.floatingToc,.tocPanel,.cm-editor')||e.key!=='Escape'||e.isComposing||ed||mode||document.querySelector('dialog[open]')||(!originNode&&!inlineStudio&&!evidencePane))return
 e.preventDefault();e.stopImmediatePropagation();if(evidencePane)hideEvidence();else leaveFocus()
},true)
// Save before leaving the inline editor. On a revision conflict leave the draft in place.
document.addEventListener('click',async e=>{
 if(!inlineStudio||document.querySelector('dialog[open]')||e.target.closest('.inlineStudio,.citeCompare,#teamPane,[data-back],[data-heading-link],[data-heading-locate],[data-workspace-view]'))return
 const target=e.target.closest('button,.topic,select,.manuscriptTools > .paperMenu > summary');if(!target)return
 if(inlineStudio.document&&!target.matches('#doc,.topic'))return;
 e.preventDefault();e.stopImmediatePropagation();const chain=target.dataset.chain;
 // Saving rebuilds the reader. Replay the author's command on its new control,
 // so opening materials or export does not require a second click.
 const command=target.closest('#reader')&&target.tagName==='BUTTON'?[...target.attributes].find(a=>a.name.startsWith('data-')):null;
 const disclosure=target.tagName==='SUMMARY'?target.closest('.paperMenu')?.dataset.paperMenu:null;
 if(await inlineStudio.close()){
  if(target.isConnected)target.click();else if(chain&&by(chain))inspectNode(chain,true);
  else if(disclosure){const menu=reader.querySelector('.paperMenu[data-paper-menu="'+CSS.escape(disclosure)+'"]');if(menu){menu.open=true;menu.querySelector('summary').focus({preventScroll:true})}}
  else if(command){const next=reader.querySelector('button['+command.name+'="'+CSS.escape(command.value)+'"]');if(next){const menu=next.closest('.paperMenu');if(menu)menu.open=true;next.click()}}
 }
},true)
function showEvidence(link,b){
 hideEvidence();const k=link.dataset.ref,r=lib()[k],sentence=link.dataset.sentence
 if(!r||!sentence)return
 const occ=Number(link.dataset.occ||0),markupPid=link.dataset.pid,exact=b.text.includes(sentence)&&b.text.indexOf(sentence)===b.text.lastIndexOf(sentence)
 const rec=exact&&(b.citationEvidence||[]).find(x=>x.key===k&&x.sentence===sentence&&(x.occ||0)===occ&&(!markupPid||x.pid===markupPid)),pid=markupPid||rec?.pid
 const el=document.createElement('aside');evidencePane=el;el.className='citeCompare';el.setAttribute('aria-label','引文对照');el.tabIndex=-1
 document.body.append(el)
 el.innerHTML='<div class="argHead"><strong>引文对照 · '+E(currentStyle()?.groups[k]||k)+'</strong><button data-closecite>收起对照</button></div><small>'+E(r.title)+'</small><h4>草稿原句</h4><blockquote>'+E(sentence)+'</blockquote><h4>文献原文</h4><div data-original></div><h4>引用理由</h4><p data-why></p><div class="citeBind"></div><p role="status"></p>'
 el.querySelector('[data-closecite]').onclick=()=>{hideEvidence();link.focus({preventScroll:true})}
 const original=el.querySelector('[data-original]'),why=el.querySelector('[data-why]'),controls=el.querySelector('.citeBind'),status=el.querySelector('[role=status]')
 const pending=(paper.wordReviews||[]).some(w=>w.rows.some(r=>r.block===b.id&&(r.current||r.sentence)===sentence&&r.needs?.some(n=>n.key===k&&n.occ===occ)))
 why.textContent=rec?.reason||(pending?'Word 中已更换文献。请重新选择原文并填写这处引用的理由。':'')||'尚未记录这段原文支持草稿中的哪一项判断。'
 let chosen=null
 function showHit(h,candidate){chosen=h;original.innerHTML='<small>'+E(candidate?'待确认片段':'已固定原件')+' · 第 '+Number(h.page)+' 页 · '+E(h.sha.slice(0,12))+'</small><blockquote>'+E(h.text)+'</blockquote>';const ed=r.editions.find(x=>x.sha===h.sha);if(ed){const open=document.createElement('button');open.textContent='打开该版原件';open.onclick=()=>refDetail(k,h.pid);original.append(open)}}
 if(pid){original.textContent='正在读取固定片段…';callSch('evidence_search',{key:k,pid}).then(h=>{if(el!==evidencePane)return;if(h[0])showHit(h[0],false);else original.textContent='这条固定证据不可用，未替换为相似段落。'}).catch(e=>status.textContent=e.message)}
 else original.textContent=r.editions.length?'只有书目引用，尚未为这句话绑定原文。':'仅有书目，项目中没有本地原文。'
 if(refLink(r)){const a=document.createElement('a');a.href=refLink(r);a.target='_blank';a.rel='noopener noreferrer';a.textContent='出版页面 ↗';el.querySelector('small').append(' · ',a)}
 if(!inlineStudio&&exact&&r.editions.length){
  controls.innerHTML='<details><summary>'+E(rec?'调整证据或理由':'绑定证据并说明理由')+'</summary><label>在此文献中查找 <input data-query placeholder="原文关键词"></label><button data-search>查找片段</button><div data-hits></div><label>引用理由<textarea data-reason rows="2" maxlength="4000"></textarea></label><button data-bind>确认绑定</button></details>';controls.querySelector('[data-reason]').value=rec?.reason||''
  controls.querySelector('[data-search]').onclick=async()=>{try{const query=controls.querySelector('[data-query]').value.trim();if(!query)return;const hits=await callSch('evidence_search',{key:k,query}),list=controls.querySelector('[data-hits]');list.replaceChildren();status.textContent=hits.length?'选择片段后还需确认绑定。':'没有匹配的原文。';for(const h of hits.slice(0,8)){const btn=document.createElement('button');btn.textContent='第 '+h.page+' 页 · '+h.text;btn.onclick=()=>showHit(h,true);list.append(btn)}}catch(e){status.textContent=e.message}}
  controls.querySelector('[data-bind]').onclick=async()=>{try{if(!chosen)throw Error('请先选择原文片段');if(markupPid&&chosen.pid!==markupPid)throw Error('源码已固定其他片段；请先修改源码里的引用。');const p=await callSch('citation_bind',{block:b.id,rev:b.rev,sentence,key:k,occ,pid:chosen.pid,reason:controls.querySelector('[data-reason]').value});if(el!==evidencePane)return;updateReader(p,proj);if(originNode){inspectNode(argumentPane.dataset.current||originNode.id,true)}else showPage('read',b.id);const at=[...document.querySelectorAll('[data-sentence]')].find(a=>a.isConnected&&a.offsetWidth&&a.dataset.ref===k&&a.dataset.sentence===sentence&&Number(a.dataset.occ||0)===occ);if(at)showEvidence(at,paperBlock(b.id))}catch(e){status.textContent=e.message}}
 }else if(!exact)status.textContent='草稿未保存、原句已经变化或不唯一；不能自动沿用已有理由。'
 el.focus({preventScroll:true});const pos=link.getBoundingClientRect(),gap=6,below=innerHeight-pos.bottom-gap-8,above=pos.top-gap-8,down=below>=Math.min(el.offsetHeight,320)||below>=above
 el.style.maxHeight=Math.max(64,down?below:above)+'px';el.style.left=Math.max(8,Math.min(innerWidth-el.offsetWidth-8,pos.left))+'px'
 el.style.top=(down?pos.bottom+gap:Math.max(8,pos.top-gap-el.offsetHeight))+'px'
}

document.addEventListener('pointerdown',e=>{if(evidencePane&&!e.target.closest('.citeCompare,dialog'))hideEvidence()});
document.addEventListener('scroll',e=>{if(evidencePane&&!evidencePane.contains(e.target)&&!e.target.closest?.('dialog'))hideEvidence()},true);
