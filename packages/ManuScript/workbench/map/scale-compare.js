// Read-only manuscript companion. Selection anchors always refer to the saved source version.
window.ManuscriptScaleCompare=(()=>{
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(root,project,sections,options){
  const abort=new AbortController(),parts=new Map();let selection=null;
  root.innerHTML='<header><strong>正文对照</strong><small>只读 · '+E(project.versions?.at(-1)?.id||'当前稿')+'</small><label class="msScrollSync"><input type="checkbox" data-scroll-sync '+(options.sync?'checked':'')+'>同步滚动</label></header><div class="msCompareActions"><span data-compare-selection>选中文字后批注或询问</span><button data-compare-note disabled>批注</button><button data-compare-ask disabled>询问</button><button data-compare-translate aria-haspopup="dialog" disabled>翻译选段</button></div><div class="msCompareScroll" aria-label="只读正文">'+sections.map(s=>{let cursor=0;return '<section data-compare-section="'+E(s.id)+'"><h3>'+E(s.title)+'</h3>'+s.paragraphs.map(p=>{const at=s.text.indexOf(p.text,cursor);cursor=at+p.text.length;parts.set(p.id,{p,block:s.id,base:at,body:s.text});return '<div class="msCompareParagraph" data-paragraph="'+E(p.id)+'"><div class="msScaleProse">'+options.prose(p.text,s.format,s,at)+'</div>'+(options.figures?.(s,p)||'')+'</div>'}).join('')+(options.figures?.(s,null)||'')+'</section>'}).join('')+'<div data-compare-notes></div></div>';
  const scroll=root.querySelector('.msCompareScroll'),label=root.querySelector('[data-compare-selection]');
  root.querySelector('[data-scroll-sync]').addEventListener('change',e=>options.setSync(e.target.checked),{signal:abort.signal});
  function setSelection(ref){selection=ref;label.textContent=ref?'已选原文：'+ref.quote.slice(0,30)+(ref.quote.length>30?'…':''):'选中文字后批注或询问';for(const b of root.querySelectorAll('.msCompareActions button'))b.disabled=!ref}
  function select(){const s=getSelection();if(!s?.rangeCount||s.isCollapsed)return;const r=s.getRangeAt(0),el=r.startContainer.parentElement?.closest('.msCompareParagraph');if(!el||!el.contains(r.endContainer)){setSelection(null);return}options.focus?.(el.dataset.paragraph);const src=parts.get(el.dataset.paragraph);if(!src||src.base<0)return;
   // DOM fragments are mapped in source order, so repeated phrases keep their own occurrence.
   const walker=document.createTreeWalker(el.querySelector('.msScaleProse'),NodeFilter.SHOW_TEXT),mapped=[];let n,cursor=0;
   while(n=walker.nextNode()){if(n.parentElement.closest('button,figure,[data-citegroup]'))continue;const at=src.p.text.indexOf(n.data,cursor);if(at>=0){mapped.push({node:n,start:at});cursor=at+n.length}}
   const hits=mapped.filter(x=>r.intersectsNode(x.node));if(!hits.length){setSelection(null);return}const first=hits[0],last=hits.at(-1),a=first.start+(r.startContainer===first.node?r.startOffset:0),z=last.start+(r.endContainer===last.node?r.endOffset:last.node.length);
   if(z<=a){setSelection(null);return}const start=src.base+a,end=src.base+z;setSelection({block:src.block,version:project.versions.at(-1).id,start:Array.from(src.body.slice(0,start)).length,end:Array.from(src.body.slice(0,end)).length,quote:src.body.slice(start,end)});
  }
  root.addEventListener('pointerup',()=>queueMicrotask(select),{signal:abort.signal});root.addEventListener('keyup',e=>{if(e.shiftKey)select()},{signal:abort.signal});
  root.querySelector('.msCompareActions').addEventListener('pointerdown',e=>e.preventDefault(),{signal:abort.signal});
  root.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!selection)return;const ref={...selection};try{if(b.hasAttribute('data-compare-note'))await options.note(ref);if(b.hasAttribute('data-compare-ask'))await options.ask(ref);if(b.hasAttribute('data-compare-translate'))await options.translate(ref,b)}catch(e){label.textContent=e.message}},{signal:abort.signal});
  function notes(notes){const box=root.querySelector('[data-compare-notes]');box.innerHTML=notes?.length?'<details class="msCompareNotes"><summary>原文批注 · '+notes.length+'</summary>'+notes.map(n=>'<div><small>'+E(n.version)+'</small><blockquote>'+E(n.quote)+'</blockquote><p>'+E(n.message)+'</p></div>').join('')+'</details>':''}notes(project.notes);
  function focus(id,block){const el=id?[...root.querySelectorAll('[data-paragraph]')].find(e=>e.dataset.paragraph===id):[...root.querySelectorAll('[data-compare-section]')].find(e=>e.dataset.compareSection===block);if(el){scroll.scrollTop+=el.getBoundingClientRect().top-scroll.getBoundingClientRect().top-12;for(const n of root.querySelectorAll('.msCompareCurrent'))n.classList.remove('msCompareCurrent');el.classList.add('msCompareCurrent')}}
  return {focus,notes,scroll,destroy(){abort.abort()}};
 }
 return {mount};
})();
