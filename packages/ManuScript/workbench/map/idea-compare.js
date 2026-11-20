// Render the same stable IDs in both versions. A moved edge and a renamed topic are separate differences.
function ideaGraph(values,other,rootId,side,comments,ref,focus,otherRef,frozen){
 const root=values.get(rootId);if(!root)return '<p class="ideaEmpty">这版还没有该主题。</p>'
 const children=new Map()
 for(const v of values.values()){if(!children.has(v.p))children.set(v.p,[]);children.get(v.p).push(v)}
 const only=side==='left'?'移除':'新增'
 function target(v,kind,label,flag){
  const saved=frozen?.filter(c=>c.id===v.id&&c.kind===kind&&(kind==='node'||c.parent===v.p))||[]
  const relevant=comments.filter(c=>(!frozen||c.onHistory)&&!saved.some(s=>s.key===c.key)&&c.id===v.id&&c.kind===kind&&(c.ref===ref||c.confirmedRef===ref)&&(kind==='node'||c.parent===v.p)&&(otherRef!==ref||side===c.side))
  const active=focus?.side===side&&focus.id===v.id&&focus.kind===kind
  const marker=flag?'<small class="igFlag">'+E(flag)+'</small>':''
  const title=kind==='edge'?'连线：'+label:label
  return '<div class="igTarget '+(kind==='edge'?'igLink':'')+'"><button data-id="'+E(v.id)+'" data-kind="'+kind+'" data-flag="'+E(flag)+'" aria-label="'+E(title)+'" title="'+(document.body.classList.contains('map-annotating')?'在此写批注：':'查看保存时的记录：')+E(title)+'">'+E(label)+marker+'</button>'+
   saved.map(c=>'<article class="igNote"><small>保存时 · '+E(c.intent)+'</small><div>'+E(c.text)+'</div></article>').join('')+
   relevant.map(c=>'<article class="igNote" data-note-key="'+E(c.key)+'"><small>'+(frozen?'回看留言 · ':'')+'#'+(comments.indexOf(c)+1)+' · '+E(c.version)+' · '+E(c.intent)+' · '+(c.sent?'已发给 Agent':'待发送')+'</small><div>'+E(c.text)+'</div>'+(!c.sent?'<button data-remove="'+E(c.key)+'" aria-label="移除这条批注">×</button>':'')+'</article>').join('')+
   (active?'<form class="igEditor"><textarea aria-label="批注原话" maxlength="2000" rows="2" required placeholder="写下这处的问题或改法…"></textarea><button type="submit">保存批注</button> <button type="button" data-cancel>取消</button></form>':'')+'</div>'
 }
 function branch(v,first){
  const prior=other.get(v.id),tag=!prior?only:v.t!==prior.t?'改名':'',edge=!prior?only:prior.p!==v.p?'移动':prior.rel!==v.rel?'关系变更':''
  return '<li><div class="igBranch">'+(!first?target(v,'edge',v.rel||'下级主题',edge):'')+target(v,'node',v.t,tag)+
   (children.get(v.id)?.length?'<ul>'+children.get(v.id).map(c=>branch(c,false)).join('')+'</ul>':'')+'</div></li>'
 }
 return '<ul class="igTree">'+branch(root,true)+'</ul>'
}
function ideaPublicMessage(m,previewTurn){
 if(m.from==='user'&&m.text.startsWith('[ManuScript 构思预览 / ')){
  try{const p=JSON.parse(m.text.split('\n').at(-1));return p.versionFacts?'确认导图，请根据实际差异写版本说明。':[p.thought,...(p.notes||[]).map(n=>'［'+(n.version||'预览')+' · '+(n.intent||'备注')+'］'+n.target+'：'+n.text)].filter(Boolean).join('\n')}catch{return '讨论导图'}
 }
 if(previewTurn&&m.from==='agent'){try{const p=JSON.parse(m.text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));return p.text||p.summary||m.text}catch{}}
 return m.text
}
function ideaLines(tree){
 tree.querySelector(':scope > .igWires')?.remove()
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg')
 const rect=tree.getBoundingClientRect(),scale=rect.width/tree.offsetWidth||1
 if(!rect.width)return
 svg.setAttribute('class','igWires');svg.setAttribute('aria-hidden','true');tree.prepend(svg)
 function pos(btn,end){const b=btn.getBoundingClientRect();return [(b[end]-rect.left)/scale,(b.top+b.height/2-rect.top)/scale]}
 function wire(a,b,id,flag){
  const x=(a[0]+b[0])/2,d='M'+a+' C'+x+','+a[1]+' '+x+','+b[1]+' '+b
  for(const hit of [false,true]){const path=document.createElementNS(ns,'path');path.setAttribute('d',d);path.setAttribute('class',hit?'igHit':'igWire');path.dataset.flag=flag;if(hit){path.dataset.line='1';path.dataset.kind='edge';path.dataset.id=id}svg.append(path)}
 }
 for(const item of tree.querySelectorAll('.igBranch')){
  const up=item.parentElement.parentElement.closest('.igBranch');if(!up)continue
  const child=item.querySelector(':scope > .igTarget > [data-kind=node]'),edge=item.querySelector(':scope > .igLink > button'),parent=up.querySelector(':scope > .igTarget > [data-kind=node]')
  if(parent&&child&&edge){wire(pos(parent,'right'),pos(edge,'left'),child.dataset.id,edge.dataset.flag);wire(pos(edge,'right'),pos(child,'left'),child.dataset.id,edge.dataset.flag)}
 }
}
