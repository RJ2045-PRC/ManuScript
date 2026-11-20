// Each row follows explicit directed edges. Junctions repeat where paths split or
// meet; isolated units share a row without implying a relationship.
window.ManuscriptScaleGraph=(()=>{
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(p){
  const byId=new Map(p.units.map(n=>[n.id,n])),incoming=new Map(),outgoing=new Map();
  const edges=(p.edges||[]).filter(e=>byId.has(e.from)&&byId.has(e.to));
  for(const e of edges){incoming.set(e.to,(incoming.get(e.to)||0)+1);if(!outgoing.has(e.from))outgoing.set(e.from,[]);outgoing.get(e.from).push(e)}
  const node=id=>{const n=byId.get(id);return '<button type="button" class="msGraphNode'+(n.role==='假设'?' msHypothesis':'')+'" data-scale-unit="'+E(id)+'" data-scale-paragraph="'+E(p.id)+'" aria-haspopup="dialog" aria-expanded="false"><strong>'+E(n.label)+'</strong><small>'+E(n.role)+'</small></button>'};
  const seen=new Set(),rows=[];
  function path(edge){if(seen.has(edge))return;let row=node(edge.from);
   while(edge&&!seen.has(edge)){seen.add(edge);const symbol=edge.type==='假设'?'⇢':edge.type==='不一致'?'≠':'→';
    row+='<span class="msGraphStep"><span class="msGraphEdge" aria-label="'+E(byId.get(edge.from).label+'：'+edge.label+' → '+byId.get(edge.to).label)+'">'+E(edge.label)+' <b>'+symbol+'</b></span>'+node(edge.to)+'</span>';
    const next=outgoing.get(edge.to);edge=incoming.get(edge.to)===1&&next?.length===1?next[0]:null;
   }
   rows.push(row);
  }
  for(const e of edges)if(incoming.get(e.from)!==1||outgoing.get(e.from).length!==1)path(e);
  for(const e of edges)path(e); // Closed cycles have no starting junction.
  const isolated=p.units.filter(n=>!incoming.has(n.id)&&!outgoing.has(n.id));
  if(isolated.length)rows.push(isolated.map(n=>node(n.id)).join(''));
  return '<div class="msScaleGraph" data-scale-graph="'+E(p.id)+'">'+rows.map(r=>'<div class="msGraphPath">'+r+'</div>').join('')+'</div>';
 }
 return {html};
})();
