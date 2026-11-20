// Host adapter for the public release's structural reader. Messages stay within this demo.
const structureFrame = (() => {
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  const send = (action, payload={}) => parent.postMessage({channel:'manuscript-structure',action,...payload},origin);
  const stages = ['overview','cards','logic'];
  let project, route, rows;
  function cached(key, fallback) {
    try {return JSON.parse(sessionStorage.getItem(key)) ?? fallback;} catch {return fallback;}
  }
  function request(op,args) {
    const key='manuscript.demo.structure.';
    switch(op){
      case 'work_status': return {status:'idle'};
      case 'team_catalog': return {rows:[]};
      case 'reading_glossary': return {exists:false};
      case 'file': if(structureSample.files[args.asset])return structureSample.files[args.asset];break;
      case 'state': return project;
      case 'settings':
        if(args.asDefault)throw Error('宿主默认设置需要在已安装的 ManuScript 中保存。');
        project.settings={...project.settings,logicStyle:args.values.logicStyle};
        sessionStorage.setItem(key+'style',JSON.stringify(project.settings.logicStyle));
        return project;
      case 'note':
        project.notes=[...project.notes,{block:args.block,start:args.start,end:args.end,version:args.version,quote:args.quote,message:args.message}];
        sessionStorage.setItem(key+project.id,JSON.stringify(project.notes));return project;
    }
    throw Error('此操作需要安装 ManuScript 并连接宿主。');
  }
  function render(mount,data) {
    route=data.route; rows=data.rows;
    const version=route.version, sample=structureSample;
    const seed=sample.snapshots[version] || sample.snapshots['02'];
    const byTitle=new Map(seed.blocks.map(b=>[b.title,b]));
    const blocks=[];
    const levels=[];
    for(const row of rows){
      if(row.key==='refs')continue;
      const original=row.key==='title'?seed.blocks[0]:byTitle.get(row.title);
      while(levels.length && levels.at(-1).level>=row.level)levels.pop();
      const b=original?{...original}:{id:'demo-'+row.key,format:'md',rev:1,parent:levels.at(-1)?.id};
      b.title=row.title;
      if(row.changed || !original)b.text=row.raw;
      b.demoKey=row.key; blocks.push(b);levels.push({id:b.id,level:row.level});
    }
    project={...sample.base,...seed,blocks,id:'demo-0130-'+version,settings:{...sample.base.settings}};
    project.settings.logicStyle=cached('manuscript.demo.structure.style',project.settings.logicStyle);
    project.notes=cached('manuscript.demo.structure.'+project.id,[]).filter(note=>{
      const block=blocks.find(b=>b.id===note.block);
      return block && Array.from(block.text).slice(note.start,note.end).join('')===note.quote;
    });
    if(!sample.snapshots[version])project.versions=[{id:version==='work'?'工作稿':'Draft '+version}];
    mount(project,sample.nodes);
    const root=document.querySelector('.msScales');
    const block=blocks.find(b=>b.demoKey===route.key)||blocks[0];
    const scale=stages.indexOf(route.scale)+1;
    root.querySelector('[data-scale-level="'+scale+'"]').click();
    const para=block?.id+':'+(route.rawIndex??0);
    const target=scale===1?root.querySelector('[data-scale-section="'+CSS.escape(block?.id??'')+'"]'):
      root.querySelector('.msScaleParagraph[data-paragraph="'+CSS.escape(para)+'"]') || root.querySelector('[data-scale-section="'+CSS.escape(block?.id??'')+'"]');
    function locate(el){
      const pane=root.querySelector(root.dataset.compare==='true'?'.msScaleMain':'.msReadingScroll');
      // Match the release reader's 12px paragraph anchor. CSS scroll-margin is for ordinary navigation.
      pane.scrollTop+=el.getBoundingClientRect().top-pane.getBoundingClientRect().top-12;
    }
    if(target){
      locate(target);
      if(target.matches('.msScaleParagraph'))target.dataset.demoCurrent='';
    }
    function report(el){
      const section=el?.closest('[data-scale-section],[data-compare-section]');
      const id=section?.dataset.scaleSection||section?.dataset.compareSection;
      const b=blocks.find(b=>b.id===id);
      const card=el?.closest('[data-paragraph]');
      const index=Number(card?.dataset.paragraph?.split(':').at(-1));
      const text=b && Number.isInteger(index)?b.text.split(/\n\s*\n/u).filter(x=>x.trim())[index]:null;
      send('position',{key:b?.demoKey,raw:text,scale:stages[Number(root.dataset.scale)-1]});
      if(card){
        root.querySelector('[data-demo-current]')?.removeAttribute('data-demo-current');card.dataset.demoCurrent='';
        if(card.matches('.msScaleParagraph'))locate(card);
      }
    }
    root.addEventListener('click',event=>{
      const el=event.target;
      if(el.closest('[data-scale-jump]')){
        const b=blocks.find(b=>b.id===el.closest('[data-scale-jump]').dataset.scaleJump);
        if(b)send('position',{key:b.demoKey,scale:'cards'});
      }else if(el.closest('[data-paragraph]') && !el.closest('button,a'))report(el);
    },true);
    new MutationObserver(()=>report(null)).observe(root,{attributes:true,attributeFilter:['data-scale']});
    root.addEventListener('click',e=>{
      if(e.target.closest('[data-scale-settings]'))queueMicrotask(()=>{
        const choice=document.querySelector('[data-logic-default] option[value="true"]');
        if(choice){choice.disabled=true;choice.textContent+='（需要宿主）';}
      });
      const manuscriptLink=e.target.closest('a[href]')?.getAttribute('href');
      const pageLink=manuscriptLink?.match(/^assets\/measurement-log\.pdf#page=([12])$/);
      if(pageLink){e.stopImmediatePropagation();e.preventDefault();send('source',{page:Number(pageLink[1])});}
      const citation=e.target.closest('button[data-ref="CupLog"]');
      if(citation){
        const page=structureSample.pins[citation.dataset.pid];
        if(page){e.stopImmediatePropagation();e.preventDefault();send('source',{page});}
      }
      if(e.target.closest('[data-compare-ask]')){
        e.stopImmediatePropagation();root.querySelector('[data-compare-selection]').textContent='询问需要连接宿主中的 Agent。';
      }
    },true);
    send('mounted');
  }
  function connect(mount) {
    let initialized=false;
    window.addEventListener('message',e=>{
      if(initialized || e.source!==parent || (origin!=='*'&&e.origin!==origin) ||
          e.data?.channel!=='manuscript-structure' || e.data.action!=='open')return;
      initialized=true;render(mount,e.data);
    });
    send('ready');
  }
  return {connect,request};
})();
