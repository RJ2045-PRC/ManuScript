// Reading density is a view on the live manuscript, never a second chapter tree.
const flatState={level:'topic',lang:'bi',over:new Map()}
function flatProject(){return host?.host==='dsh'&&paper?.readingGuide?.manuscriptLayout===1}
function flatPair(z,en){return '<span class="fpZh" lang="zh-CN">'+E(z)+'</span><span class="fpEn" lang="en">'+E(en)+'</span>'}
function flatButton(label,k,v=''){return '<button type="button" data-fp-'+k+'="'+E(v)+'">'+E(label)+'</button>'}
function flatBlock(sect){return paperBlock(sect.dataset.block)}
function flatSection(sect){return paper.readingGuide.article.sections.find(s=>s.id===flatBlock(sect)?.sitSection)}
function flatSync(sect){const level=flatState.over.get(sect.dataset.block)||flatState.level;sect.dataset.level=level
 const btn=sect.querySelector('[data-fp-cycle]');if(btn){btn.setAttribute('aria-expanded',String(level!=='topic'));btn.title=level==='topic'?'展开到论证':level==='structure'?'展开到全文':'折回主线'}
}
function flatTools(){
 const g=paper.readingGuide,a=g.article,art=reader.querySelector('article');art.classList.add('fpPaper');art.dataset.lang=flatState.lang
 const tools=art.querySelector('.schTools'),h=art.querySelector('h2');h.textContent=a.paperTitle
 const note=h.previousElementSibling;if(note?.tagName==='SMALL')note.remove()
 h.insertAdjacentHTML('afterend','<div class="fpByline">Sit 等 · 2024 · Virtual and Physical Prototyping</div>')
 const more=document.createElement('details');more.className='fpMore';more.innerHTML='<summary>稿件工具</summary>';tools.replaceWith(more);more.append(tools)
 const rail=document.createElement('nav');rail.className='fpRail';rail.setAttribute('aria-label','手稿视图');rail.innerHTML=['topic','structure','full'].map((k,i)=>flatButton(['主线','论证','全文'][i],'density',k)).join('')+'<select aria-label="正文语言" data-fp-lang><option value="bi">中英对照</option><option value="zh">中文</option><option value="en">English</option></select>'+'<select aria-label="跳到章节" data-fp-nav><option value="">跳到章节…</option>'+paper.blocks.map(b=>'<option value="'+E(b.id)+'">'+E(b.title)+'</option>').join('')+'</select>'
 h.nextElementSibling.after(rail);rail.append(more);rail.querySelector('[data-fp-lang]').value=flatState.lang
 for(const b of rail.querySelectorAll('[data-fp-density]'))b.setAttribute('aria-pressed',String(flatState.level===b.dataset.fpDensity))
 docButton.textContent='思维导图'
 for(const sect of art.querySelectorAll('section[data-block]')){
 const s=flatSection(sect),b=flatBlock(sect);if(!s)continue;const same=b.text===s.parts.map(x=>x.en).join('\n\n'),rich=sect.querySelector('.rich'),acts=sect.querySelector('.readActions')
 const heading={'2.1':['2　实验方法','2　Methods'],'3.1':['3　结果','3　Results'],'4.1':['4　讨论','4　Discussion'],'A1':['附录','Appendices']}[s.id];if(heading){const group=document.createElement('h2');group.className='fpMajor';group.innerHTML=flatPair(...heading);sect.before(group)}
 sect.classList.add('fpSection');sect.dataset.current=String(same);sect.firstElementChild.remove()
 const title=sect.querySelector('h3'),display=b.title;title.replaceChildren();const toggle=document.createElement('button');toggle.dataset.fpCycle='';toggle.innerHTML='<i aria-hidden="true"></i>'+flatPair(display,(/^\d/.test(s.id)?s.id+'　':'')+s.title);title.append(toggle)
 const guid=acts.querySelector('[data-guide]');guid?.remove()
 const edit=acts.querySelector('[data-editdoc]'),chat=acts.querySelector('[data-chatdoc]');edit.textContent='编辑';chat.textContent='AI 讨论';title.append(edit,chat);acts.hidden=true
 const summary=document.createElement('div');summary.className='fpSummary'
 const passages=b.text.split(/\n\s*\n/),brief=t=>t.match(/^.*?[.!?。！？](?=\s|$)/u)?.[0]||t.slice(0,200)
 summary.innerHTML=same?flatPair(s.gist,s.gistEn):'<small>当前稿摘句 · 原论文译述未套用</small>'+E(brief(passages[0]||''))
 title.after(summary)
 const outline=document.createElement('div');outline.className='fpStructure'
 if(same){const special=g.groups.flatMap(group=>group.rows).filter(r=>g.paras[r.loc[0][0]].section==='§'+s.id)
 outline.innerHTML=(special.length?special.map(r=>({tag:r.tag,zh:r.zh,en:r.en,quote:g.paras[r.loc[0][0]].en[r.loc[0][1]]})):s.parts.map((x,i)=>({tag:x.tag,zh:x.zh.split(/(?<=[。！？])/u)[0],en:brief(x.en),quote:s.anchor?.part===i?s.anchor.text:brief(x.en)}))).map(r=>'<div class="fpRow"><small>'+E(r.tag)+'</small><button type="button" data-fp-quote="'+E(r.quote)+'">'+flatPair(r.zh,r.en)+'</button></div>').join('')
 }else outline.innerHTML=passages.map((x,i)=>'<div class="fpRow"><small>¶ '+(i+1)+'</small>'+E(brief(x))+'</div>').join('')
 summary.after(outline)
 if(same&&s.parts.every(x=>x.pairs)){
 rich.innerHTML=s.parts.flatMap(x=>x.pairs).map(([z,en])=>'<div lang="zh-CN" class="fpZh fpTranslation">'+E(z)+'</div><p lang="en" class="fpEn">'+E(en)+'</p>').join('')
 }else if(same){const ps=[...rich.children].filter(el=>el.tagName==='P');if(ps.length===s.parts.length){ps.forEach((el,j)=>{el.classList.add('fpEn');if(s.id==='refs'){el.classList.remove('fpEn');return}const z=document.createElement('div');z.className='fpZh fpTranslation';z.lang='zh-CN';z.textContent=s.parts[j].zh;el.before(z)})}else if(s.id!=='refs'){const z=document.createElement('div');z.className='fpZh fpTranslation';z.textContent=s.parts.map(x=>x.zh).join('\n\n');for(const el of rich.children)el.classList.add('fpEn');rich.prepend(z)}}
 const proof=document.createElement('div');proof.className='fpProof';const pages=[...new Set(s.parts.flatMap(p=>p.pages))]
 proof.innerHTML=(s.figs||[]).map(k=>flatButton(k.startsWith('T')?'表 '+k.slice(1):'图 '+k,'fig',k)).join('')+pages.map(n=>flatButton('原页 '+n,'page',String(n))).join('');rich.after(proof);flatSync(sect)
 }
}
function flatFocusSection(){const top=reader.getBoundingClientRect().top+(reader.querySelector('.fpRail')?.offsetHeight||50);return [...reader.querySelectorAll('.fpSection')].find(x=>x.getBoundingClientRect().bottom>top+10)}
function flatHold(action){const s=flatFocusSection(),y=s?.getBoundingClientRect().top;action();if(s)reader.scrollTop+=s.getBoundingClientRect().top-y}
function flatLevel(s,k){flatState.over.set(s.dataset.block,k);flatSync(s)}
async function flatMedia(sect,key,n){
 const wrapping=sect.querySelector('.fpProof');wrapping.querySelector('.fpMedia')?.remove();const area=document.createElement('figure');area.className='fpMedia';wrapping.append(area)
 const g=paper.readingGuide,f=key&&g.article.figures[key],page=f?f.page:n,project=paper.id;area.innerHTML='<figcaption>'+E(f?f.caption:'固定 PDF · 第 '+page+' 页')+'</figcaption><div role="status">正在读取原图…</div><div>'+flatButton('收起','hide')+(f?flatButton('看完整原页','page',String(page)):'')+flatButton('在 Zotero 打开此页','zot',String(page))+'</div>'
 const out=area.querySelector('[role=status]');try{const png=await api('source_page',{project,key:g.key,sha:g.sha,page});const im=new Image();im.src='data:image/png;base64,'+png;await im.decode();if(!area.isConnected)return
 if(f){const [x,y,w,h]=f.rect,W=im.naturalWidth,H=im.naturalHeight,c=document.createElement('canvas');c.width=Math.round(W*w);c.height=Math.round(H*h);c.getContext('2d').drawImage(im,W*x,H*y,W*w,H*h,0,0,c.width,c.height);c.setAttribute('role','img');c.setAttribute('aria-label',f.caption);out.replaceChildren(c)}else{im.alt='论文原页 '+page;out.replaceChildren(im)}
 }catch(e){out.textContent=e.message}
}
reader.addEventListener('change',e=>{if(!reader.querySelector('.fpPaper'))return
 if(e.target.matches('[data-fp-lang]'))flatHold(()=>{flatState.lang=e.target.value;reader.querySelectorAll('.fpShowOrigin').forEach(x=>x.classList.remove('fpShowOrigin'));reader.querySelector('.fpPaper').dataset.lang=flatState.lang})
 if(e.target.matches('[data-fp-nav]')&&e.target.value){document.getElementById('doc-'+e.target.value)?.scrollIntoView({block:'start'});e.target.value=''}
})
reader.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!reader.querySelector('.fpPaper'))return;const d=b.dataset,s=b.closest('.fpSection')
 if(d.fpDensity){flatHold(()=>{flatState.level=d.fpDensity;flatState.over.clear();reader.querySelectorAll('.fpSection').forEach(flatSync);reader.querySelectorAll('[data-fp-density]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))})}

 else if(d.fpCycle!=null){flatLevel(s,({topic:'structure',structure:'full',full:'topic'})[s.dataset.level])}
 else if(d.fpQuote){flatLevel(s,'full');const original=s.querySelector('.rich');if(reader.querySelector('.fpPaper').dataset.lang==='zh'){s.classList.add('fpShowOrigin')}highlight(s,flatBlock(s),{quote:d.fpQuote},true)||original.scrollIntoView({block:'nearest'})}
 else if(d.fpFig)await flatMedia(s,d.fpFig);else if(d.fpPage)await flatMedia(s,null,+d.fpPage)
 else if(d.fpHide!=null)b.closest('figure').remove();else if(d.fpZot){const g=paper.readingGuide,r=paper.references[g.key];try{await callSch('open_reference_pdf',{key:g.key,asset:r.editions.find(x=>x.sha===g.sha).asset,page:+d.fpZot,target:'zotero'})}catch(err){b.title=err.message;b.textContent=err.message}}
})
