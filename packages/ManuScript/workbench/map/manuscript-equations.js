const ManuscriptEquations=(()=>{
 const autoTag='manuscript:auto';
 const automatic='\\tag{'+autoTag+'}';
 const markdownOpen=/\$\$|(?<!\$)\$(?!\$)/g;
 const latexOpen=/\\begin\{(equation\*?|displaymath|math)\}|\\(?:\(|\[)|\$\$|(?<!\$)\$(?!\$)/g;
 const syntax={
  '$':{close:'$',inline:true},'$$':{close:'$$'},
  '\\(':{close:'\\)',inline:true},'\\[':{close:'\\]'}
 };
 function escaped(text,at){
  let start=at;
  while(start>0&&text[start-1]==='\\')start--;
  return (at-start)%2===1;
 }
 function maskLatex(text){
  return text.replace(/\\(?:begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}|verb\*?([^a-zA-Z\s])[^\n]*?\2|[\s\S])|%[^\r\n]*/g,
   (match,environment,verb)=>environment||verb||match.startsWith('%')?match.replace(/[^\r\n]/g,' '):match);
 }
 function controls(tex){
  const masked=maskLatex(tex),tokens=[];
  const commands=/\\(tag\*?|label|notag|nonumber)(?![a-zA-Z])/g;
  for(const match of masked.matchAll(commands)){
   const from=match.index;
   if(escaped(masked,from))continue;
   const name=match[1],start=from+match[0].length;
   if(name==='notag'||name==='nonumber'){tokens.push({from,to:start,name});continue}
   const brace=start+(masked.slice(start).match(/^\s*/)?.[0].length??0);
   if(masked[brace]!=='{')continue;
   let depth=1,end=brace+1;
   for(;end<masked.length&&depth;end++){
    if(escaped(masked,end))continue;
    if(masked[end]==='{')depth++;
    else if(masked[end]==='}')depth--;
   }
   if(!depth&&!(tokens.at(-1)?.to>from))tokens.push({from,to:end,name,value:tex.slice(brace+1,end-1)});
  }
  return tokens;
 }
 function scan(text,format){
  const latex=format==='tex',result=[];
  const ranges=latex?[]:window.manuscriptLiteralRanges(text);
  const segments=[];let offset=0;
  for(const {from,to} of ranges){if(offset<from)segments.push([offset,from]);offset=Math.max(offset,to)}
  segments.push([offset,text.length]);
  const masked=latex?maskLatex(text):text;
  for(const [start,end] of segments){
   const part=masked.slice(start,end),open=new RegExp(latex?latexOpen:markdownOpen);
   for(let match;match=open.exec(part);){
    const from=match.index;
    if(escaped(part,from)||from&&match[0].startsWith('$')&&part[from-1]==='$')continue;
    const env=match[1],delimiter=match[0],spec=env?{close:'\\end{'+env+'}',inline:env==='math'}:syntax[delimiter];
    const bodyStart=open.lastIndex,lineEnd=spec.inline&&delimiter==='$'?part.indexOf('\n',bodyStart):-1;
    let at=part.indexOf(spec.close,bodyStart);
    while(at>=0&&(escaped(part,at)||spec.close==='$'&&(part[at-1]==='$'||part[at+1]==='$')))at=part.indexOf(spec.close,at+1);
    if(at<0||lineEnd>=0&&at>lineEnd||!part.slice(bodyStart,at).trim())continue;
    const tex=text.slice(start+bodyStart,start+at),meta=controls(tex),tag=meta.find(x=>x.name.startsWith('tag'));
    open.lastIndex=at+spec.close.length;
    const suffix=spec.inline?null:text.slice(start+open.lastIndex).match(/^[ \t]+\(([0-9]+[A-Za-z]?(?:[.-][0-9]+)*)\)[ \t]*(?=\r?\n|$)/);
    const numbered=!spec.inline&&tag?.name==='tag'&&tag.value.trim()===autoTag;
    result.push({from:start+from,to:start+open.lastIndex,bodyStart:start+bodyStart,bodyEnd:start+at,tex,meta,
     display:!spec.inline,number:numbered?null:tag?.value.trim()??suffix?.[1]??null,bareNumber:tag?.name==='tag*',
     tag,suffix,numbered,
     auto:env==='equation'&&!tag&&!meta.some(x=>x.name==='notag'||x.name==='nonumber')});
   }
  }
  return result;
 }
 function numbers(items){
  const fixed=new Set(items.filter(item=>item.display&&/^\d+$/.test(item.number??'')).map(item=>Number(item.number)));
  const nativeCount=items.filter(item=>item.auto).length;
  for(let n=1;n<=nativeCount;n++)fixed.add(n);
  let next=1;
  const result=new Map();
  for(const item of items){
   if(!item.numbered)continue;
   while(fixed.has(next))next++;
   result.set(item,next++);
  }
  return result;
 }
 function resolvedTex(item,number){
  const {from,to}=item.tag;
  return item.tex.slice(0,from)+'\\tag{'+number+'}'+item.tex.slice(to);
 }
 function blockContext(block,blocks,from=0,to=block.text.length){
  const index=blocks.findIndex(item=>item.id===block.id);
  if(index<0)return null;
  return {
   before:[...blocks.slice(0,index).map(item=>item.text),block.text.slice(0,from)].join('\n\n'),
   after:[block.text.slice(to),...blocks.slice(index+1).map(item=>item.text)].join('\n\n')
  };
 }
 function projections(text,format='md',getContext){
  const result=new Map();
  if(!text.includes(autoTag))return result;
  const context=getContext?.(),before=context?.before??'',end=before.length+text.length;
  for(const [item,number] of numbers(scan(before+text+(context?.after??''),format))){
   if(item.from<before.length||item.to>end)continue;
   const tex=resolvedTex(item,number),offset=before.length;
   const local={...item,from:item.from-offset,to:item.to-offset,bodyStart:item.bodyStart-offset,bodyEnd:item.bodyEnd-offset};
   result.set(local.from,{item:local,tex});
  }
  return result;
 }
 function materialize(text,format,context){
  const rows=[...projections(text,format,context).values()].reverse();
  for(const {item,tex} of rows)text=text.slice(0,item.bodyStart)+tex+text.slice(item.bodyEnd);
  return text;
 }
 function conversion(text,items){
  const changes=[];
  for(const item of items){
   if(!item.display||item.bareNumber||!/^\d+$/.test(item.number??''))continue;
   if(item.tag)changes.push({from:item.bodyStart+item.tag.from,to:item.bodyStart+item.tag.to,value:automatic});
   else if(item.suffix){
    changes.push({from:item.bodyEnd,to:item.bodyEnd,value:metadataBoundary(item.tex,' '+automatic+' ')});
    changes.push({from:item.to,to:item.to+item.suffix[0].length,value:''});
   }
  }
  if(!changes.length)return null;
  const from=changes[0].from,to=changes.at(-1).to;
  let value=text.slice(from,to);
  for(const change of changes.toReversed())value=value.slice(0,change.from-from)+change.value+value.slice(change.to-from);
  return {from,to,value};
 }
 function editable(item){
  let tex=item.tex;
  for(const {from,to} of item.meta.toReversed())tex=tex.slice(0,from)+tex.slice(to);
  return tex.trim();
 }
 function metadataBoundary(tex,tail){
  const last=tex.slice(tex.lastIndexOf('\n')+1);
  const comment=[...last.matchAll(/%/g)].some(match=>!escaped(last,match.index));
  return comment&&tail&&!/^[ \t]*\r?\n/.test(tail)?'\n'+tail.trimStart():tail;
 }
 function replaceBody(item,tex){
  const leading=item.tex.match(/^\s*/)[0],trailing=item.tex.match(/\s*$/)[0];
  let end=item.tex.length-trailing.length,protectedTail='';
  for(const token of item.meta.toReversed()){
   if(/^\s*$/.test(item.tex.slice(token.to,end))){
    protectedTail=item.tex.slice(token.from,end)+protectedTail;
    end=token.from;
    const spaces=item.tex.slice(0,end).match(/\s*$/)[0];
    protectedTail=spaces+protectedTail;end-=spaces.length;
   }else protectedTail=' '+item.tex.slice(token.from,token.to)+protectedTail;
  }
  return leading+tex+metadataBoundary(tex,protectedTail)+trailing;
 }
 function render(tex,display){
  return katex.renderToString(tex,{output:'mathml',displayMode:display,throwOnError:true,strict:'ignore',trust:false});
 }
 function validateContent(tex,display){
  if(!tex.trim())throw Error('请输入公式内容。');
  if(controls(tex).length)throw Error('请输入公式内容。编辑器会保留编号和标签。');
  if(!display&&tex.includes('\n'))throw Error('行内公式需要写在同一行。');
  return render(tex,display);
 }
 function entries(text,format){
  const items=scan(text,format),assigned=numbers(items);
  return items.map(item=>({...item,content:editable(item),name:item.meta.find(token=>token.name==='label')?.value||'',
   label:item.numbered?'('+assigned.get(item)+')':item.number!=null?(item.bareNumber?item.number:'('+item.number+')'):item.auto?'LaTeX 自动编号':item.display?'未编号':'行内'}));
 }
 function renderSource(tex,display){
  if(/\\(?:label|notag|nonumber)\b/.test(tex)){
   for(const {from,to,name} of controls(tex).toReversed()){
    if(!name.startsWith('tag'))tex=tex.slice(0,from)+tex.slice(to);
   }
  }
  return render(tex,display);
 }
 function emptySlots(tex){
  return Array.from(maskLatex(tex).matchAll(/\{\}/g),match=>match.index+1)
   .filter(index=>!escaped(tex,index-1));
 }
 function renderSlots(output,tex,display,slots){
  // Mark empty groups in a preview copy. The textarea remains the source of the formula.
  let marker='ManuScriptSlot';
  while(tex.includes(marker))marker+='X';
  let marked=tex;
  for(let i=slots.length-1;i>=0;i--){
   const position=slots[i];
   marked=marked.slice(0,position)+'\\text{'+marker+i+'}'+marked.slice(position);
  }
  const preview=document.createElement('template');
  try{preview.innerHTML=render(marked.trim(),display)}catch{return 0}
  let visible=0;
  for(const node of preview.content.querySelectorAll('mtext')){
   const token=node.textContent;
   if(!token.startsWith(marker))continue;
   const position=slots[Number(token.slice(marker.length))];
   if(position==null)continue;
   node.textContent='□';
   node.setAttribute('data-equation-slot',position);
   visible++;
  }
  // Markers can be consumed by LaTeX commands. Keep the normal rendering in that case.
  if(visible!==slots.length)return 0;
  const annotation=preview.content.querySelector('annotation');
  if(annotation)annotation.textContent=tex.trim();
  output.replaceChildren(preview.content);
  return visible;
 }
 const tools=[['分数','\\frac{','}{}'],['根式','\\sqrt{','}'],['上标','^{','}'],['下标','_{','}'],
  ['求和','\\sum_{','}^{}'],['积分','\\int_{','}^{}'],['α','\\alpha ',''],['×','\\times ','']];
 const toolExamples=['\\frac{a}{b}','\\sqrt{x}','x^n','x_i','\\sum_{i=1}^{n}','\\int_a^b','\\alpha','\\times'];
 function snippetButton(name,tex,kind,index){
  return '<button type="button" class="msControl" data-equation-'+kind+'="'+index+'" aria-label="'+E(name)+'">'+
   '<span aria-hidden="true">'+render(tex,false)+'</span><span>'+E(name)+'</span></button>';
 }
 const templates=[['求根公式','x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'],['定积分','\\int_a^b f(x)\\,dx'],
  ['矩阵','\\begin{bmatrix}a & b \\\\ c & d\\end{bmatrix}'],['分段函数','f(x)=\\begin{cases}x^2,&x\\ge 0\\\\-x,&x<0\\end{cases}']];
 function open({text,format,range,sectionAt,apply}){
  const items=scan(text,format),assigned=numbers(items);
  const insertion={numbered:true,from:range.from};
  const remaining=items.filter(item=>item.from>=range.to||item.to<=range.from);
  const number=numbers([...remaining,insertion].sort((a,b)=>a.from-b.from||Number(b===insertion)-Number(a===insertion))).get(insertion);
  const d=modal('插入公式','<div class="equationTabs" role="group" aria-label="公式工具">'+
   [['tools','快捷工具'],['templates','公式模板'],['history','稿件中的公式']].map(([key,label])=>toolButton(label,'class="msControl" data-equation-tab="'+key+'"')).join('')+
   '</div><div class="equationSnippets" data-equation-panel="tools">'+tools.map(([name],i)=>snippetButton(name,toolExamples[i],'tool',i)).join('')+
   '</div><div class="equationSnippets" data-equation-panel="templates" hidden>'+templates.map(([name,tex],i)=>snippetButton(name,tex,'template',i)).join('')+
   '</div><div class="equationHistory" data-equation-panel="history" aria-label="正文内已有的公式" hidden></div>'+
   '<div class="equationMigration" hidden>'+
   toolButton('将旧编号转为自动编号','class="msControl" data-equation-migrate')+
   '<div data-equation-migrate-confirmation hidden><p role="status"></p>'+
   toolButton('取消','class="msControl" data-equation-migrate-cancel')+
   toolButton('确认转换','class="msControl" data-equation-migrate-confirm')+'</div></div>'+
   '<div class="equationSwitch" hidden><p role="status"></p>'+
   toolButton('继续编辑当前公式','class="msControl" data-equation-keep')+
   toolButton('放弃改动并打开','class="msControl" data-equation-switch')+'</div>'+
   '<div data-equation-editor><div class="equationFields"><label>LaTeX 输入<textarea rows="6" aria-describedby="equation-feedback" spellcheck="false" placeholder="例如 E = mc^2"></textarea></label>'+
   '<div class="equationPreview" aria-label="公式预览"><span>预览</span><div><span data-equation-preview></span><small data-equation-number></small></div></div></div>'+
   '<small id="equation-feedback" data-equation-feedback role="status"></small><div class="equationFooter"><label data-equation-insert-style>形式<select><option value="display">独立公式 · 自动编号</option><option value="unnumbered">独立公式 · 不编号</option><option value="inline">行内公式</option></select></label>'+
   '<small data-equation-detail role="status"></small><div class="equationCommit">'+
   '<kbd aria-hidden="true">'+(/Mac/.test(navigator.platform)?'⌘':'Ctrl + ')+'Enter</kbd>'+
   toolButton('插入公式','class="msControl msPrimary" data-equation-apply aria-keyshortcuts="Control+Enter Meta+Enter" disabled')+'</div></div></div>');
  d.classList.add('equationDialog');
  const input=d.querySelector('textarea'),output=d.querySelector('[data-equation-preview]'),history=d.querySelector('.equationHistory'),style=d.querySelector('select'),confirm=d.querySelector('[data-equation-apply]');
  const feedback=d.querySelector('[data-equation-feedback]');
  const switchPrompt=d.querySelector('.equationSwitch');
  const migration=d.querySelector('.equationMigration'),migrateConfirmation=migration.querySelector('[data-equation-migrate-confirmation]');
  const legacy=items.filter(item=>item.display&&!item.bareNumber&&/^\d+$/.test(item.number??''));
  const detail=d.querySelector('[data-equation-detail]'),heading=d.querySelector('header strong'),numberLabel=d.querySelector('[data-equation-number]');
  const label=item=>item.numbered?'('+assigned.get(item)+')':item.number!=null?(item.bareNumber?item.number:'('+item.number+')'):item.auto?'LaTeX 自动编号':'未编号';
  let active=null,pending=null;
  function panel(key){
   switchPrompt.hidden=true;pending=null;
   migration.hidden=key!=='history'||!legacy.length;
   migrateConfirmation.hidden=true;
   for(const button of d.querySelectorAll('[data-equation-tab]'))button.setAttribute('aria-pressed',String(button.dataset.equationTab===key));
   for(const node of d.querySelectorAll('[data-equation-panel]'))node.hidden=node.dataset.equationPanel!==key;
   d.querySelector('[data-equation-editor]').hidden=key==='history';
   if(key==='history'&&!history.childElementCount){
    history.innerHTML=items.length?items.map((item,i)=>{
     const section=sectionAt(item.from).join(' › ');
     let math;try{math=render(editable(item),item.display)}catch{math='<code>'+E(editable(item))+'</code>'}
     return '<button type="button" data-equation-edit="'+i+'" aria-label="'+E('编辑公式 '+label(item)+(section?' · '+section:''))+'"><strong>'+E(label(item))+'</strong><small>'+E(section)+'</small><span>'+math+'</span></button>';
    }).join(''):'<p>当前稿件没有公式。</p>';
   }
  }
  function paintSlotFocus(){
   for(const slot of output.querySelectorAll('[data-equation-slot]')){
    slot.toggleAttribute('data-current',input.selectionStart===input.selectionEnd&&+slot.getAttribute('data-equation-slot')===input.selectionStart);
   }
  }
  function preview(){
   const value=input.value.trim(),display=active?.display??style.value!=='inline';
   confirm.disabled=true;numberLabel.textContent='';
   feedback.textContent='';
   detail.textContent=active?sectionAt(active.from).join(' › '):'';
   if(!value){output.textContent='输入后预览';return}
   output.textContent='等待有效公式';
   try{
    output.innerHTML=validateContent(value,display);
    const slots=emptySlots(input.value);
    if(slots.length&&renderSlots(output,input.value,display,slots)){
     paintSlotFocus();
     feedback.textContent='点预览中的方框定位，或按 Tab 跳到下一处。';
    }
    numberLabel.textContent=active?(active.numbered||active.number!=null||active.auto?label(active):''):style.value==='display'?'('+number+')':'';
    confirm.disabled=false;
   }catch(error){
    feedback.textContent=String(error.message).replace(/^KaTeX parse error: /,'公式语法有误。');
   }
  }
  function edit(item){
   active=item;const title=item?'编辑公式 '+label(item):'插入公式';
   heading.textContent=title;d.setAttribute('aria-label',title);
   input.value=item?editable(item):'';confirm.textContent=item?'保存修改':'插入公式';
   d.querySelector('[data-equation-insert-style]').hidden=!!item;
   panel('tools');preview();input.focus();
  }
  input.oninput=preview;style.onchange=preview;edit(null);
  input.addEventListener('selectionchange',paintSlotFocus);
  output.addEventListener('click',event=>{
   const slot=event.target.closest('[data-equation-slot]');
   if(!slot)return;
   const position=+slot.getAttribute('data-equation-slot');
   revealTextareaRange(input,position,position);
   paintSlotFocus();
  });
  input.onkeydown=event=>{
   if(event.isComposing)return;
   if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){
    event.preventDefault();confirm.click();return;
   }
   if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
   const slots=emptySlots(input.value);
   const slot=event.shiftKey
    ?slots.findLast(index=>index<input.selectionStart)
    :slots.find(index=>index>input.selectionEnd);
   if(slot==null)return;
   event.preventDefault();revealTextareaRange(input,slot,slot);paintSlotFocus();
  };
  actionOn(d,button=>{
   const x=button.dataset;
   if(x.equationTab){panel(x.equationTab);return}
   if(x.equationMigrate!=null){
    const dirty=input.value.trim()!==(active?editable(active):'');
    migrateConfirmation.querySelector('p').textContent='将转换 '+legacy.length+' 条普通数字编号。自定义编号和公式标签会保留。'+(dirty?' 当前未提交的公式改动会放弃。':'');
    migrateConfirmation.hidden=false;
    migration.querySelector('[data-equation-migrate-cancel]').focus();return;
   }
   if(x.equationMigrateCancel!=null){
    migrateConfirmation.hidden=true;
    migration.querySelector('[data-equation-migrate]').focus();return;
   }
   if(x.equationMigrateConfirm!=null&&!migrateConfirmation.hidden){
    const {from,to,value}=conversion(text,legacy);
    apply(from,to,value);d.close();return;
   }
   if(x.equationKeep!=null){panel('tools');input.focus();return}
   if(x.equationSwitch!=null&&pending){edit(pending);return}
   if(x.equationEdit!=null){
    const item=items[+x.equationEdit];
    if(item===active){panel('tools');input.focus();return}
    if(input.value.trim()!==(active?editable(active):'')){
     pending=item;
     switchPrompt.querySelector('p').textContent='当前公式有未提交的改动。要打开公式 '+label(item)+' 吗？';
     switchPrompt.hidden=false;
     switchPrompt.querySelector('[data-equation-keep]').focus();
     return;
    }
    edit(item);return;
   }
   if(x.equationTool!=null){
    const [,before,after]=tools[+x.equationTool],{selectionStart:start,selectionEnd:end}=input;
    const selection=input.value.slice(start,end);
    input.setRangeText(before+selection+after,start,end,'end');
    input.focus();
    if(after)input.setSelectionRange(start+before.length,start+before.length+selection.length);
    preview();return;
   }
   if(x.equationTemplate!=null){
    input.setRangeText(templates[+x.equationTemplate][1],input.selectionStart,input.selectionEnd,'end');
    input.focus();preview();return;
   }
   if(x.equationApply==null||confirm.disabled)return;
   const tex=input.value.trim();
   if(active){
    if(tex!==editable(active))apply(active.bodyStart,active.bodyEnd,replaceBody(active,tex));
   }
   else if(style.value==='inline'){
    apply(range.from,range.to,'$'+tex+'$');
   }else{
    const latex=format==='tex',auto=style.value==='display';
    const env=auto?'equation':'equation*';
    const left=latex?'\\begin{'+env+'}':'$$',right=latex?'\\end{'+env+'}':'$$';
    const before=text.slice(0,range.from),after=text.slice(range.to);
    const prefix=!before||before.endsWith('\n\n')?'':before.endsWith('\n')?'\n':'\n\n';
    const suffix=!after||after.startsWith('\n\n')?'':after.startsWith('\n')?'\n':'\n\n';
    apply(range.from,range.to,prefix+left+'\n'+tex+(auto?metadataBoundary(tex,' '+automatic):'')+'\n'+right+suffix);
   }
   d.close();
  });
  return d;
 }
 window.manuscriptEquationPreview=renderSource;
 window.manuscriptEquationProjections=projections;
 return {scan,open,materialize,blockContext,entries,validateContent,replaceBody};
})();
