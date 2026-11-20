// One content model for both renderers. No model calls and no draft mutation.
window.ManuscriptScaleData=(()=>{
 const sit=/*SCALE_CASE*/null;
 const excerpt=text=>{const s=String(text||'').trim();return (s.match(/^.*?[。！？.!?](?=\s|$)/u)?.[0]||Array.from(s).slice(0,160).join(''))};
 const unit=(role,text,indices,diagram=null)=>({role,text,indices,diagram});
 const curated=[
  {task:'早期成珠，挑战“先成板再挠曲”的前提',diagram:{type:'compare',items:['致密板','第3层成珠'],marks:['plate','beads'],relation:'≠',label:'观察不符'},units:[
   unit('定性','第3层成珠 → 宏观缺陷的早期表现',[0,1]),
   unit('观察','毫米级金属珠 ≠ 致密水平层',[2,3],{type:'compare',items:['致密板','第3层成珠'],marks:['plate','beads'],relation:'≠',label:'观察不符'}),
   unit('对照 / 质疑','前人：致密层 → 挠曲 → 扰乱铺粉；Sit 质疑其成板前提与对挂渣的解释。',[4,5,6,7],{type:'process',items:['先成板','随后挠曲'],marks:['plate','bent'],relation:'→',label:'前人解释'}),
   unit('形貌对照','本研究3层 ↔ 前人120层；图14(a)跨材料 IN718 / AlSi10Mg，不是同条件因果验证。',[8]),
   unit('作者判断','液相聚结 → 毫米级凸起 → 早期宏观缺陷（所述实体区参数工况）',[9,10])]},
  {task:'“可聚结材料更多”能否解释跨度效应？',diagram:{type:'hypothesis',items:['跨度 ↑','材料 ↑','珠更大？'],marks:['span','material','bead'],relation:'⇢',label:'作者假设'},units:[
   unit('假设','跨度 ↑ ⇢ 可聚结材料 ↑ ⇢ 珠更大？',[0],{type:'hypothesis',items:['材料更多','珠更大？'],marks:['material','bead'],relation:'⇢',label:'待验证'}),
   unit('观察 / 对照','点云由较平坦过渡到大珠；液相凸起平均比文中对照的固态凸起高约一个数量级。',[1,2]),
   unit('假设解释','“材料更多” ⇢ 解释2 mm较平坦、14 mm出现大单珠',[3]),
   unit('后续研究','时间分辨热成像 + 机器学习 → 研究缺陷演化',[4]),
   unit('建模启示','早期成珠 → 重检“连续固体板”前提；不以材料更多假设已被证实为前提。',[5])]}
 ];
 function build(project,nodes=[],preview=false){
  const guide=project.readingGuide,sections=guide?.article?.sections||[];
  const excluded=new Set(project.readingStructureExcludedBlocks);
  return (project.blocks||[]).map(b=>{
   const s=sections.find(s=>s.id===b.sitSection),linked=new Map(),rows=[];
   const chunks=String(b.text||'').split(/\n\s*\n/u).filter(x=>x.trim());
   for(const [index,text] of chunks.entries()){
    const match=text.trim().match(/^!\[(?:\\.|[^\]\\])*\]\(figures\/Sit-2024-([A-Z0-9]+)\.png\)$/);
    if(match&&guide?.article?.figures?.[match[1]])linked.set(match[1],Math.max(0,rows.length-1));
    else rows.push({index,text});
   }
   const prose=linked.size?rows.map(r=>r.text).join('\n\n'):b.text,same=!!s&&prose===s.parts.map(p=>p.en).join('\n\n');
   const known=!!sit&&Array.isArray(guide?.paras)&&guide.sha===sit.sha&&s?.id==='5.2'&&same&&guide.paras.filter(p=>p.section==='§5.2').map(p=>p.en.join(' ')).join('\n\n')===prose;
   const pub=preview?project.logicWork?.preview:project.logicWork?.published,stored=pub?.chapters?.[b.id],workStale=!!stored&&((stored.text!==b.text&&!pub.proseMatchedBlocks?.includes(b.id))||stored.title!==b.title||pub.staleBlocks?.includes(b.id)),work=stored&&!workStale?stored:null;
   const paragraphs=rows.map(({text,index},i)=>{
    const source=same?s.parts[i]:null,example=known&&!pub?curated[i]:null,wr=work?.paragraphs?.[String(work.text===b.text?index:i)];
    if(/^\s*(?:#{1,6}|(?:>\s*)+)\s*$/.test(text))return {id:b.id+':'+i,text,marker:true,task:'结构标记',kind:'原文结构',units:[]};
    if(work?.supportKind)return {id:b.id+':'+i,text,task:'辅助材料',kind:work.supportKind,units:[],support:true};
    if(wr){const structured=pub.schema===2,units=wr.units.map((u,j)=>({...u,id:u.id||b.id+':'+i+':'+j,source:'原句'}));return {id:b.id+':'+i,text,translation:source?.zh||'',task:structured?wr.task[0]:'P'+(i+1)+' · 上次整理',purpose:(wr.purpose||[]).join('；'),legacyTask:structured?'':wr.task.join('；'),connection:structured?wr.connection.join('；'):'',issues:wr.issues,kind:structured?'模型解读 · 待核对':'旧版解读 · 重来可更新结构',units,structured,edges:wr.edges||[],diagram:null}}

    const attached=nodes.filter(n=>n.anchor?.block===b.id&&n.anchor.quote&&text.includes(n.anchor.quote)&&b.text.indexOf(n.anchor.quote)===b.text.lastIndexOf(n.anchor.quote));
    return {id:b.id+':'+i,text,translation:source?.zh||'',task:example?.task||attached[0]?.t||excerpt(text),
     kind:example?'示例解读 · 待确认':attached.length?'已关联导图 · 非自动核验':'原稿摘句 · 逻辑待梳理',diagram:example?.diagram||null,
     units:example?example.units.map(u=>({...u,quote:u.indices.map(j=>guide.paras.filter(p=>p.section==='§5.2')[i].en[j]).join(' '),source:'S'+u.indices.map(j=>j+1).join('、')})):
       attached.map(n=>({role:n.kind||'导图节点',text:n.t,quote:n.anchor.quote,source:'已关联原句',relation:n.relation||''}))};
   });
   const figures=Object.values(project.exhibits||{}).filter(o=>o.block===b.id||b.text?.includes('{{'+o.id+'}}')||b.text?.includes('{{ref:'+o.id+'}}')).map(o=>({id:o.id,label:o.id,caption:o.caption||'',original:o.caption||'',asset:o.asset,rows:o.rows,credit:o.credit||''}));
   for(const key of new Set([...(s?.figs||[]),...linked.keys()])){if(b.markdownSourceFigures?.includes('figures/Sit-2024-'+key+'.png')&&!linked.has(key))continue;const f=guide.article.figures?.[key];if(!f)continue;
    const asset=(project.assets||[]).find(a=>a.name==='Sit-2024-Fig-'+key+'.jpg');
    const existing=asset&&figures.find(o=>o.asset===asset.id);
    if(existing){existing.sourceNumber=key;continue;}
    figures.push({id:'guide:'+key,sourceNumber:key,label:(key.startsWith('T')?'表':'图')+key,caption:f.caption,original:f.original||'',asset:asset?.id,page:f.page,rect:f.rect,key:guide.key,sha:guide.sha,credit:'固定论文原图'+(!same?' · 不代表修订稿证据已更新':'')});
   }
   for(const f of figures){
    // Prefer an explicit manuscript embed, then a reference in the actual paragraph.
    const embed=paragraphs.find(p=>p.text.includes('{{'+f.id+'}}'));
    const ref=paragraphs.find(p=>p.text.includes('{{ref:'+f.id+'}}'));
    const key=f.sourceNumber||(/^[FT]\d+$/.test(f.id)?f.id.replace(/^F/,''):null);
    const number=key?.replace(/^T/,'');
    const prefix=key?.startsWith('T')?'(?:\\btables?\\.?|表)':'(?:\\bfig(?:ure)?s?\\.?|图)';
    const citation=number&&/^[A-Z]?\d+$/.test(number)?new RegExp(prefix+'\\s*'+number+'(?![\\da-z])','i'):null;
    const cited=(linked.has(key)&&paragraphs[linked.get(key)])||embed||ref||(citation&&paragraphs.find(p=>citation.test(p.text)));
    f.embedded=!!embed;f.sourceParagraph=cited?.id;
    f.structureParagraph=f.sourceParagraph||paragraphs.find(p=>p.units.some(u=>u.figures?.includes(f.id)))?.id;
   }
   for(const p of paragraphs)for(const u of p.units)u.figureLabels=(u.figures||[]).map(id=>figures.find(f=>f.id===id)?.label||id);
   const plan=(b.writingPlan?.steps||[]).map(x=>({text:x.node?.t||'',reason:x.reason||''}));
   if(!plan.length)for(const step of b.chain||[])plan.push({text:String(step),reason:''});
   return {id:b.id,parent:b.parent,title:b.title,format:b.format,text:b.text||'',purpose:b.purpose||'',plan,brief:b.writingPlan?.brief||'',structureExcluded:excluded.has(b.id),
    supportKind:work?.supportKind||'',pending:!!pub?.preview&&!stored,modelSummary:work&&pub.schema===2?work.summary:'',
    branch:pub?.schema===2&&!pub.stale?pub.overview?.branches?.find(x=>x.block===b.id):null,
    gist:work?.summary||(same?s.gist:(b.purpose||paragraphs[0]?.task||'尚待写作')),
    workStale,imageNote:work?(pub.imageMode==='captions'?'依据正文与图注；未分析原图。':(work.imageEvidence||[]).map(e=>(figures.find(f=>f.id===e.id)?.label||e.id)+'：'+(e.state==='image-sent'?'已发送原图（模型解读未核验）':(e.reason||'仅使用图注'))).filter((x,i,a)=>a.indexOf(x)===i).join('；')||'本章没有附图输入。'):'',
    basis:work?'模型解读 · 待作者核对':same?'固定原文导读 · 辅助解读':b.purpose?'作者写作意图':'当前稿摘句',
    stale:!!s&&!same,paragraphs,figures};
  });
 }
 return {build,excerpt};
})();
