function manuscriptDirectoryHeadings(text,format,topLevel=false){
 if(format==='tex')return [...text.matchAll(/^\\(section|subsection|subsubsection)\*?\{([^}\n]+)\}/gm)].map(m=>({from:m.index,to:m.index+m[0].length,level:['section','subsection','subsubsection'].indexOf(m[1])+1,title:m[2]}));
 return window.manuscriptHeadings(text,topLevel);
}

function resolveManuscriptHeading(link,text,rev,headings){
 if(typeof link?.before!=='string'||typeof link.after!=='string')return;
 if(link.rev===rev){
  return headings.find(h=>h.from===link.from&&text.slice(h.from,h.to)===link.quote);
 }
 const before=link.before.slice(-64),after=link.after.slice(0,64);
 const matches=[],sameTitle=[];
 for(const h of headings){
  const left=link.atStart?h.from===0:!!before.trim()&&text.slice(Math.max(0,h.from-before.length),h.from)===before;
  const right=link.atEnd?h.to===text.length:!!after.trim()&&text.slice(h.to,h.to+after.length)===after;
  if(left&&right)matches.push(h);
  if(text.slice(h.from,h.to)===link.quote)sameTitle.push({h,context:left||right});
 }
 if(matches.length===1)return matches[0];
 if(!matches.length&&link.unique&&sameTitle.length===1&&sameTitle[0].context)return sameTitle[0].h;
}

async function editIdeaHeadingLink(node){
 const project=proj,previous=Object.hasOwn(state.headingLinks||{},node.id)?state.headingLinks[node.id]:null;
 const d=modal('关联正文小标题','<label>正文位置<select data-heading-target><option value="">请选择小标题</option></select></label><div class="headingLinkActions"><button data-link-save disabled>保存关联</button>'+(previous?'<button data-link-remove>解除关联</button>':'')+'</div>');
 d.setAttribute('aria-label','关联正文小标题');
 const select=d.querySelector('select'),save=d.querySelector('[data-link-save]'),status=d.querySelector('.schError');
 let doc,headings=[];
 select.onchange=()=>save.disabled=!select.value;
 actionOn(d,async button=>{
  if(!button.matches('[data-link-save],[data-link-remove]'))return;
  const h=headings.find(h=>String(h.from)===select.value);
  if(button===save&&!h)return;
  const target=button===save?{rev:doc.rev,start:[...doc.text.slice(0,h.from)].length,end:[...doc.text.slice(0,h.to)].length,quote:doc.text.slice(h.from,h.to),title:h.title}:null;
  const buttons=[...d.querySelectorAll('.headingLinkActions button')];
  for(const control of buttons)control.disabled=true;
  try{
   const result=await api('heading_link',{project,node:node.id,base:previous?.id,target});
   if(proj!==project)return;
   incoming(project,result);
   if(d.open)d.close();
   if(view==='map'&&argumentPane.dataset.current===node.id&&!argumentPane.hidden){
    inspectNode(node.id,true,false);
    argumentPane.querySelector('.sectionMenu summary')?.focus();
   }
  }catch(error){
   if(proj===project&&error.message.includes('关联已变化')){
    const team=await api('team_state',{project}).catch(()=>null);
    if(team)incoming(project,team);
   }
   throw error;
  }finally{
   for(const control of buttons)control.disabled=control===save&&!select.value;
  }
 });
 try{
  doc=await api('document_read',{project});
  if(!d.open||proj!==project)return;
  headings=manuscriptDirectoryHeadings(doc.text,doc.format);
  const parents=[];
  const current=previous&&resolveManuscriptHeading(previous,doc.text,doc.rev,headings);
  let line=1,lineStart=0;
  for(const h of headings){
   while(parents.at(-1)?.level>=h.level)parents.pop();
   parents.push(h);
   for(let newline=doc.text.indexOf('\n',lineStart);newline>=0&&newline<h.from;newline=doc.text.indexOf('\n',lineStart)){
    line++;lineStart=newline+1;
   }
   select.add(new Option(parents.map(p=>p.title).join(' › ')+' · 第 '+line+' 行',h.from));
  }
  if(current)select.value=String(current.from);
  if(!headings.length)status.textContent='正文中还没有小标题。';
  else if(previous&&!current)status.textContent='原小标题已无法准确定位，请重新关联。';
  save.disabled=!select.value;
 }catch(error){if(d.open)status.textContent=error.message}
}

async function returnToManuscript(heading){
 const project=proj;
 if(view!=='map'||(ideaSession?.isOpen&&!ideaSession.exitPair()))return false;
 if(inlineStudio&&!await inlineStudio.close())return false;
 const doc=heading&&await api('document_read',{project});
 if(proj!==project||view!=='map')return false;
 if(heading&&!resolveManuscriptHeading(heading,doc.text,doc.rev,manuscriptDirectoryHeadings(doc.text,doc.format))){
  throw Error('原小标题已无法准确定位，请重新关联。');
 }
 await showPage('read','root',null,{resume:true,heading,doc});
 return true;
}

async function openIdeaCardFromHeading(id){
 if(!by(id))throw Error('构思卡已移除');
 if(ideaSession?.isOpen&&!ideaSession.exitPair())return false;
 const project=proj;
 if(inlineStudio&&!await inlineStudio.close())return false;
 if(proj!==project||!by(id))return false;
 for(let n=by(id);n?.p;n=by(n.p))by(n.p).closed=false;
 showPage('map',id);
 inspectNode(id,false,false);
 argumentPane.querySelector('[data-heading-locate]')?.focus({preventScroll:true});
 return true;
}
