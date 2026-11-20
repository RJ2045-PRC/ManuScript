// All commands operate on the same map, selection and undo stack as keyboard editing.
let mapClip=null,menu=null,moveGesture=null,contextPress=null
function canvasNotice(t){$('#status').textContent=t}
function mapMoveNeighbor(command){
 if(batch.size)return;
 const node=by(sel);
 if(!node?.p)return;
 const peers=kids(node.p);
 return peers[peers.indexOf(node)+(command==='up'?-1:1)];
}
function updateMapMoveControls(){
 const sections=window.manuscriptSectionNeighbors?.();
 for(const command of ['up','down']){
  $('#bar [data-a='+command+']').disabled=sections?!sections[command]:!mapMoveNeighbor(command);
 }
}
function setupMapToolMenus(){
 const bar=$('#bar'),menus=[...bar.querySelectorAll('.mapToolMenu')];
 let active=null;
 function close(focus=false){
  if(!active)return;
  const trigger=active.querySelector('summary');
  active.open=false;active=null;
  if(focus)trigger.focus({preventScroll:true});
 }
 for(const panel of menus){
  const trigger=panel.querySelector('summary'),items=panel.querySelector('.mapToolItems');
  trigger.onclick=e=>{
   e.preventDefault();
   const wasOpen=active===panel;
   close();closeCanvasMenu();
   if(wasOpen)return;
   window.manuscriptFlushSectionClick?.();
   active=panel;panel.open=true;
   const rect=trigger.getBoundingClientRect();
   items.style.left=Math.max(8,Math.min(rect.left,innerWidth-items.offsetWidth-8))+'px';
   items.style.top=rect.bottom+5+'px';
   items.style.maxHeight=Math.max(80,innerHeight-rect.bottom-13)+'px';
   const first=e.detail===0&&[...items.querySelectorAll('button:enabled,select,summary')]
    .find(control=>control.getClientRects().length);
   (first||trigger).focus({preventScroll:true});
  };
 }
 bar.addEventListener('click',e=>{
  if(e.target.closest('.mapToolItems button:enabled')||e.target.closest('[data-idea-tool],[data-idea-history]')){
   close(!!active?.contains(document.activeElement));
  }
 });
 bar.addEventListener('change',e=>{if(e.target.id==='lxDepth')close(true)});
 document.addEventListener('pointerdown',e=>{if(active&&!active.contains(e.target))close()},true);
 document.addEventListener('focusin',e=>{if(active&&!active.contains(e.target))close()},true);
 window.addEventListener('keydown',e=>{
  if(e.repeat&&bar.contains(e.target)&&['Enter',' '].includes(e.key)){
   e.preventDefault();e.stopImmediatePropagation();return;
  }
  if(!active||e.key!=='Escape'||e.isComposing)return;
  e.preventDefault();e.stopImmediatePropagation();close(true);
 },true);
 window.addEventListener('resize',()=>close());
 // Changing views or entering the version comparison closes the disclosure.
 new MutationObserver(()=>{if(!bar.getClientRects().length)close()})
  .observe(document.body,{attributes:true,attributeFilter:['class','data-view']});
}
function liveCanvas(){return view==='map'&&!vp.hidden&&!document.body.classList.contains('idea-open')&&!document.body.classList.contains('map-annotating')&&!document.querySelector('dialog[open]')&&!ed&&!summaryEdit}
function realTopics(){return (batch.size?[...batch]:[sel]).filter(k=>by(k)&&!isGhost(k))}
function clipNodes(){
 const selected=new Set(realTopics()),ids=new Set(),roots=[]
 for(const n of map){let v=n;while(v&&!selected.has(v.id))v=by(v.p);if(v)ids.add(n.id)}
 for(const n of map)if(ids.has(n.id)&&!ids.has(n.p))roots.push(n.id)
 const nodes=map.filter(n=>ids.has(n.id)).map(n=>structuredClone(n))
 const lines=[];function walk(k,d){const n=by(k);lines.push('\t'.repeat(d)+n.t);for(const c of kids(k))walk(c.id,d+1)}for(const k of roots)walk(k,0)
 return {nodes,roots,text:lines.join('\n'),project:proj}
}
function copyTopics(cut,event){
 if(!realTopics().length||cut&&realTopics().includes('root'))return
 const c=clipNodes();c.cut=cut;mapClip=c
 if(event?.clipboardData){event.clipboardData.setData('text/plain',c.text);event.preventDefault()}
 else c.write=navigator.clipboard?.writeText(c.text).then(()=>true,()=>false)??Promise.resolve(false)
 if(cut)deleteSelection(c.roots);canvasNotice(cut?'已剪切主题，可撤销或粘贴到目标主题。':'已复制主题及子主题。')
}
function pasteText(raw,parent){
 if(!by(parent)||!raw.trim())return;const same=mapClip?.text===raw&&mapClip.project===proj;let list,roots
 if(same){list=mapClip.nodes;roots=new Set(mapClip.roots)}else{list=[];const stack=[];for(const line of raw.split(/\r?\n/)){const t=line.trim();if(!t)continue;const depth=Math.min(stack.length,(line.match(/^\t*/)||[''])[0].length);const n={id:uid(),p:depth?stack[depth-1]:null,t:t.slice(0,120),origin:'user'};list.push(n);stack[depth]=n.id;stack.length=depth+1}roots=new Set(list.filter(n=>n.p===null).map(n=>n.id))}
 if(list.length+map.length>2500){canvasNotice('粘贴后将超过地图的 2500 个主题上限。');return}
 const moving=same&&mapClip.cut&&list.every(n=>!by(n.id)),ids=new Map(list.map(n=>[n.id,moving?n.id:uid()]))
 // A clone gets its own identity. References to source material stay references; comments and reviews stay with the original.
 const copies=list.map(n=>{const v=moving?structuredClone(n):Object.fromEntries(['t','detail','kind','relation','media','assets','source','anchor','closed','origin'].filter(k=>Object.hasOwn(n,k)).map(k=>[k,structuredClone(n[k])]))
  return {...v,...(!moving&&!v.assets?.length?{ideaOnly:true}:{}),id:ids.get(n.id),p:roots.has(n.id)?parent:ids.get(n.p)}
 })
 record();batch.clear();by(parent).closed=false;map.push(...copies);sel=ids.get([...roots][0]);if(moving)mapClip.cut=false;window.lxClearInspection?.();save();draw();reveal();vp.focus({preventScroll:true})
}
async function pasteMenu(parent){const project=proj;let raw
 try{raw=mapClip?.write&&!(await mapClip.write)?mapClip.text:await navigator.clipboard.readText()}catch{raw=mapClip?.text}
 if(project!==proj||!by(parent))return;if(raw?.trim())pasteText(raw,parent);else canvasNotice('请先复制主题或文字，或用 ⌘V / Ctrl+V 粘贴。')
}
function projectMove(id,target,where){
 const a=by(id),t=by(target);if(!a||!t||id==='root'||descendant(target,id)||where!=='inside'&&!t.p)return
 const dest=where==='inside'?t.id:t.p,items=kids(dest)
 if(a.p===dest&&(where==='inside'?items.at(-1)===a:items[items.indexOf(t)+(where==='after'?1:-1)]===a))return
 const next=map.filter(n=>n!==a).map(n=>n.id===dest?{...n,closed:false}:n)
 next.splice(where==='inside'?next.length:next.findIndex(n=>n.id===target)+(where==='after'?1:0),0,{...a,p:dest})
 return next
}
function moveTopic(id,target,where){
 const next=projectMove(id,target,where);if(!next)return
 window.lxClearInspection?.();record();map=next
 batch.clear();sel=id;pane.hidden=true;save();draw();reveal();vp.focus({preventScroll:true})
}
function closeCanvasMenu(focus=false){if(!menu)return;let owner=menu.owner;menu.remove();menu=null;owner?.setAttribute('aria-expanded','false');if(focus)(owner||vp).focus({preventScroll:true})}
function openCanvasMenu(x,y,target,section='',owner=null){
 if(!liveCanvas())return;closeCanvasMenu()
 if(target&&by(target)&&!batch.has(target))pin(target)
 const ids=realTopics(),valid=!!target&&ids.length>0,one=valid&&ids.length===1,n=one?by(ids[0]):null,removable=valid&&!ids.includes('root'),dest=target||'root',project=proj
 const siblings=n?kids(n.p):[],idx=siblings.indexOf(n)
 const actions={
  copy:()=>copyTopics(false),cut:()=>copyTopics(true),paste:()=>pasteMenu(dest),del:()=>deleteSelection(ids),
  up:()=>moveTopic(n.id,siblings[idx-1].id,'before'),down:()=>moveTopic(n.id,siblings[idx+1].id,'after'),
  relation:()=>editEdge(dest),image:()=>mediaDialog('image',dest),link:()=>mediaDialog('link',dest),tex:()=>mediaDialog('tex',dest),
  fit:center,actual:()=>scaleAt(1),plus:()=>scaleAt(zoom*1.2),minus:()=>scaleAt(zoom/1.2)
 }
 const items={main:[['复制','copy',valid],['粘贴','paste',!batch.size],['剪切','cut',removable],['删除','del',removable],null,['编辑连线文字…','relation',one&&n.p],['插入','insert',one],['顺序','order',one&&n.p],['显示','view',true]],insert:[['图片…','image',true],['链接…','link',true],['LaTeX 公式…','tex',true]],order:[['上移','up',idx>0],['下移','down',idx>=0&&idx<siblings.length-1]],view:[['适应画布','fit',true],null,['实际大小（100%）','actual',true],['放大','plus',true],['缩小','minus',true]]}
 const root=document.createElement('div');root.className='canvasMenu';root.setAttribute('role','menu');root.owner=owner;document.body.append(root);menu=root
 if(owner)owner.setAttribute('aria-expanded','true')
 let page=section||'main'
 function showPage(key,back=false){
  page=key;const sub=key!=='main'&&!section
  root.setAttribute('aria-label',({main:'画布菜单',view:'显示',insert:'插入',order:'顺序'})[key])
  root.innerHTML=(sub?'<button role="menuitem" data-cmd="back">‹ 返回</button><hr>':'')+items[key].map(row=>{
   if(!row)return '<hr>';const [name,cmd,enabled]=row,group=items[cmd]
   return '<button aria-label="'+name+'" role="menuitem" '+(group?'aria-haspopup="menu" ':'')+'data-cmd="'+cmd+'" '+(enabled?'':'disabled')+'>'+name+(group?'<span>›</span>':'')+'</button>'}).join('')
  root.style.left=Math.max(4,Math.min(x,innerWidth-root.offsetWidth-4))+'px';root.style.top=Math.max(4,Math.min(y,innerHeight-root.offsetHeight-4))+'px'
  ;(back?root.querySelector('[data-cmd="'+back+'"]'):root.querySelector('button:enabled:not([data-cmd=back])'))?.focus({preventScroll:true})
 }
 function invoke(cmd){if(project!==proj)return closeCanvasMenu();if(cmd==='back')return showPage('main',page);if(items[cmd])return showPage(cmd);closeCanvasMenu(true);actions[cmd]?.()}
 root.onclick=e=>{e.stopPropagation();const b=e.target.closest('button:enabled');if(b)invoke(b.dataset.cmd)}
 root.onkeydown=e=>{e.stopPropagation();const buttons=[...root.querySelectorAll('button:enabled')],i=buttons.indexOf(document.activeElement),cmd=buttons[i]?.dataset.cmd
  if(['Escape','Tab'].includes(e.key)){e.preventDefault();if(e.key==='Escape'&&page!=='main'&&!section)invoke('back');else closeCanvasMenu(true)}
  else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus()}
  else if(e.key==='ArrowRight'&&items[cmd]){e.preventDefault();invoke(cmd)}else if(e.key==='ArrowLeft'&&page!=='main'&&!section){e.preventDefault();invoke('back')}}
 showPage(page)
}
setupMapToolMenus();
document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&e.target!==menu.owner)closeCanvasMenu()},true)
window.addEventListener('blur',()=>closeCanvasMenu())
function isMapFocus(el){return liveCanvas()&&(el===document.body||vp.contains(el))&&!el.closest('a,input,textarea,[contenteditable],button')}
for(const event of ['copy','cut','paste'])document.addEventListener(event,e=>{if(!isMapFocus(e.target))return
 if(event==='paste'){const text=e.clipboardData?.getData('text/plain');if(text&&!batch.size){e.preventDefault();pasteText(text,sel)}}else copyTopics(event==='cut',e)
})
vp.addEventListener('keydown',e=>{if(!liveCanvas()||!(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey))return;e.preventDefault();const r=pos[sel].el.getBoundingClientRect();openCanvasMenu(r.left+10,r.bottom,sel)})

window.addEventListener('keydown',e=>{if(menu&&menu.contains(e.target)&&['Escape','Tab','ArrowDown','ArrowUp','Home','End','ArrowRight','ArrowLeft'].includes(e.key))menu.onkeydown(e)},true)

function editEdge(id){
 const n=by(id);if(!n?.p||!liveCanvas())return
 const dlg=document.createElement('dialog');dlg.className='canvasMedia';dlg.innerHTML='<form><h3>连线文字</h3><small></small><label>关系说明<input maxlength="80" placeholder="例如：支持、需要验证"></label><div class="mediaButtons"><button type="button">取消</button><button>保存</button></div></form>'
 dlg.querySelector('small').textContent=by(n.p).t+' → '+n.t;const input=dlg.querySelector('input');input.value=n.relation||'';document.body.append(dlg);dlg.onclose=()=>{dlg.remove();vp.focus({preventScroll:true})};dlg.querySelector('[type=button]').onclick=()=>dlg.close()
 dlg.onsubmit=e=>{e.preventDefault();const t=input.value.trim();if(t!==(n.relation||'')){record();n.relation=t;n.last='user';delete n.review;save();draw()}dlg.close()};dlg.showModal();input.select()
}
W.addEventListener('click',e=>{const edge=e.target.closest('[data-edge]');if(edge&&liveCanvas()){e.stopPropagation();editEdge(edge.dataset.edge)}})
