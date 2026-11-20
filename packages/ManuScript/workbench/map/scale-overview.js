// A reading overview follows manuscript order. Only supplied model relations become arrows.
window.ManuscriptScaleOverview=(()=>{
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=s=>s.title.match(/^\s*(\d+(?:\.\d+)*)(?=[\s　、.:：]|$)/)?.[1]||'';
 function groups(sections){const byId=new Map(sections.map(s=>[s.id,s])),out=[];
  for(const s of sections){let ancestor=s,seen=new Set([s.id]);while(byId.has(ancestor.parent)&&!seen.has(ancestor.parent)){ancestor=byId.get(ancestor.parent);seen.add(ancestor.id)}const n=number(s),key=ancestor!==s?'parent:'+ancestor.id:n?'number:'+n.split('.')[0]:'section:'+s.id;
   // A preceding parent with the same number belongs in this group too.
   const last=out.at(-1),matching=last&&(last.key===key||s.parent&&last.items.some(x=>x.id===ancestor.id));
   if(matching)last.items.push(s);else out.push({key,items:[s]});
  }
  return out.map(g=>{const top=g.items.find(s=>number(s)&&!number(s).includes('.'))||g.items.find(s=>g.items.some(x=>x.parent===s.id));return {...g,title:top?.title||(g.key.startsWith('number:')?'第 '+g.key.slice(7)+' 章':g.items[0].title),root:top}});
 }
 function html(sections,published,{figureLink}={}){
  const overview=published&&!published.stale?published.overview:null,links=overview?.connections||[];
  function card(s){const generated=!!s.modelSummary||!!s.branch,claim=s.supportKind?'':s.branch?.detail||s.modelSummary||'',pending=s.pending,subtitle=pending?'本轮尚未完成':s.supportKind?'辅助材料 · 保留原文':s.workStale?'材料已变化 · 等待更新':!s.text.trim()?'尚未写正文':generated?'':s.paragraphs.some(p=>p.legacyTask)?'旧版解读 · 可继续更新':'逻辑待整理';
   const marker=s.branch?.kind&&/假设|待|限制|推测/.test(s.branch.kind)?s.branch.kind:'';
   return '<article class="msOutlineCard" data-scale-section="'+E(s.id)+'" data-outline-card="'+E(s.id)+'"><button class="msOutlineOpen" data-scale-jump="'+E(s.id)+'" data-scale-target="'+(s.supportKind?'4':'2')+'"><span class="msOutlineLocation">'+E(s.title)+'</span>'+(claim?'<strong>'+E(claim)+'</strong>':'')+(subtitle?'<span class="msOutlineStatus">'+E(subtitle)+'</span>':'')+'</button>'+(marker||s.figures.length?'<div class="msOutlineFoot">'+(marker?'<span class="msOutlineCaution">'+E(marker)+'</span>':'')+s.figures.map(f=>figureLink(f)).join('')+'</div>':'')+'</article>';
  }
  return '<div class="msOutline">'+groups(sections).map(g=>{
   const ids=new Set(g.items.map(s=>s.id)),relations=links.filter(l=>ids.has(l.from)&&ids.has(l.to));
   const supplied=overview?.groups?.find(x=>x.key===g.key.replace('number:',''));
   return '<section class="msOutlineGroup"><header><h3>'+E(supplied?.title||g.title)+'</h3><span>'+g.items.length+' 节</span></header>'+(supplied?.task?'<p class="msOutlineTask">'+E(supplied.task)+'</p>':'')+'<div class="msOutlineCards">'+g.items.map(card).join('')+'</div>'+(relations.length?'<div class="msOutlineRelations" aria-label="本章论证关系">'+relations.map(l=>relation(l,sections)).join('')+'</div>':'')+'</section>';
  }).join('')+'</div>';
 }
 function relation(l,sections){const a=sections.find(s=>s.id===l.from),b=sections.find(s=>s.id===l.to);if(!a||!b)return '';return '<div class="msOutlineRelation"><button data-scale-jump="'+E(a.id)+'">'+E(number(a)||a.title)+'</button><span>→</span><button data-scale-jump="'+E(b.id)+'">'+E(number(b)||b.title)+'</button><small>'+E(l.text)+'</small></div>'}
 function route(sections,published){const o=published&&!published.stale?published.overview:null;if(!o?.connections?.length)return '';const gg=groups(sections),groupOf=id=>gg.findIndex(g=>g.items.some(s=>s.id===id)),links=o.connections.filter(l=>{const from=groupOf(l.from),to=groupOf(l.to);return from>=0&&to>=0&&from!==to});
  return links.length?'<details class="msOutlineRoute"><summary>章节之间怎样衔接 · '+links.length+' 条关系</summary><div>'+links.map(l=>relation(l,sections)).join('')+'</div></details>':'';
 }
 return {groups,html,route};
})();
