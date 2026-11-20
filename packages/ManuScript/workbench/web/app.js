const $=s=>document.querySelector(s), H=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const btn=(action,text,id='',extra='')=>'<button data-act="'+H(action)+'" data-id="'+H(id)+'" '+extra+'>'+H(text)+'</button>'
const tag=(text,cl='')=>'<span class="badge '+H(cl)+'">'+H(text)+'</span>'
const clStatus=s=>s==='作者已确认'?'ok':s==='AI 已核验'?'review':s==='撰写中'?'Agent':'author'
const options=xs=>xs.map(([k,v])=>'<option value="'+H(k)+'">'+H(v)+'</option>').join('')
const group=(title,body)=>'<article><h3>'+H(title)+'</h3>'+body+'</article>'
const detail=(title,body)=>'<details><summary>'+H(title)+'</summary>'+body+'</details>'
const textblock=s=>'<pre>'+H(s)+'</pre>', safeURL=u=>/^https?:\/\//i.test(u||'')?H(u):''
const tabs=['论文地图','任务看板','甘特图','版本时间轴','返修对照','文献与经验','设置']
const toolParams=new URL(document.baseURI).searchParams;
const embeddedTools=toolParams.get('embedded')==='1';
const visibleTabs=embeddedTools?tabs.slice(3):tabs;
if(embeddedTools)document.body.classList.add('embeddedTools');
let p,tab=visibleTabs.includes(toolParams.get('tab'))?toolParams.get('tab'):visibleTabs[0],bid='',draft=null,selection=null,forms=null,busy=false,from='',to='',cmp='',lessonList=[],projectList=[],route={},saveTick,activeFeedback=''
const activeRuns=new Set();let issuingOrigin='作者';
const projectKey='lunxu:last:'+env.host,routeKey='lunxu:model:'+env.host
try{route=JSON.parse(localStorage.getItem(routeKey)||'{}')}catch{}
if(env.host==='codex'){const b=$('#openTeam');b.hidden=false;b.onclick=()=>guard(async()=>{await flush();const url=new URL(location.href);url.searchParams.set('view','map');if(p)url.searchParams.set('project',p.id);location.assign(url)})}
const head=()=>p?.versions.at(-1), B=()=>p?.blocks.find(b=>b.id===bid), V=id=>p?.versions.find(v=>v.id===id)
const findB=(v,id)=>v?.blocks.find(x=>x.id===id)
function msg(s,bad=false){$('#notice').textContent=s;$('#notice').className=bad?'error':''}
async function api(op,args={}){if(env.host==='codex-mcp')return window.manuscriptMcpApi(op,args);const native=env.host==='dsh'&&location.href==='about:srcdoc';const r=await (native?parent.fetch.bind(parent):fetch)(new URL(env.api,document.baseURI),{method:'POST',headers:{'Content-Type':'application/json','X-ManuScript-Key':env.token},body:JSON.stringify({op,args})});const x=await r.json();if(!r.ok||x.error)throw Error(x.error||'宿主未就绪');return x.result}
function choose(paper){p=paper;localStorage.setItem(projectKey,p.id);if(!B())bid=p.blocks[0]?.id||'';clearInterval(saveTick);saveTick=setInterval(()=>{if(draft&&!busy&&!$('#modal').open)guard(async()=>{await flush();render();msg('已按设定间隔保存')})},p.settings.saveSeconds*1000)}
async function mutation(op,args={}){choose(await api(op,{...args,project:p.id}));cmp=''}
async function flush(){if(!draft)return;const d={...draft};await mutation('edit',{block:d.block,rev:d.rev,text:d.text,label:'保存：'+d.title,origin:d.origin||'作者'});if(draft?.text===d.text)draft=null;else if(draft?.block===d.block)draft.rev=B().rev}
function form(title,fields,remember=null){if($('#modal').open)throw Error('请先完成当前窗口');$('#mt').textContent=title;$('#fields').innerHTML=fields.map(([k,label,type,val,opts])=>'<label>'+H(label)+(type==='select'?'<select name="'+k+'">'+options(opts)+'</select>':type==='area'?'<textarea name="'+k+'"></textarea>':'<input name="'+k+'" type="'+H(type||'text')+'">')+'</label>').join('');for(const [k,,t,v] of fields)if(v!=null&&t!=='file')$('#form').elements[k].value=v;const form=$('#form');form.oninput=form.onchange=null;$('#cancel').textContent=remember?'关闭':'取消'
 if(remember){
  const cache=feedbackDrafts(),saved=cache.get(remember)
  for(const [name,value] of Object.entries(saved||{})){const field=form.elements.namedItem(name);if(field&&(!field.options||[...field.options].some(o=>o.value===value)))field.value=value}
  form.oninput=form.onchange=()=>cache.set(remember,Object.fromEntries(new FormData(form)))
  const hint=document.createElement('small');hint.textContent='关闭后仍保留草稿；点「确定」才加入返修记录。';$('#fields').append(hint)
 }
 $('#modal').showModal();return new Promise(resolve=>forms=resolve)}
$('#form').onsubmit=e=>{e.preventDefault();const r={};for(const x of $('#form').elements)if(x.name)r[x.name]=x.type==='file'?x.files[0]:x.type==='checkbox'?x.checked:x.value;$('#modal').close();forms?.(r);forms=null}
$('#cancel').onclick=()=>{$('#modal').close();forms?.(null);forms=null};$('#modal').oncancel=()=>{forms?.(null);forms=null}
const verOpts=()=>p.versions.map(v=>[v.id,v.id+' · '+v.label]), blockOpts=()=>p.blocks.map(b=>[b.id,b.title]), F=(k,l,v='')=>[k,l,'text',v], A=(k,l,v='')=>[k,l,'area',v], S=(k,l,opts,v)=>[k,l,'select',v,opts]
async function guard(fn){if(busy)return;busy=true;document.body.dataset.busy='true';try{await fn()}catch(e){msg(e.message,true)}finally{busy=false;delete document.body.dataset.busy}}
async function list(){projectList=await api('list');$('#projects').innerHTML=options(projectList.length?projectList.map(x=>[x.id,x.title]):[['','尚无项目']]);if(p)$('#projects').value=p.id}
async function load(id){await flush();p=null;bid='';from='';to='';cmp='';choose(await api('state',{project:id}));await list();render()}
$('#projects').onchange=e=>{const id=e.target.value;guard(()=>load(id))}
function refs(rs){return (rs||[]).map(r=>{const s=p.sources.find(x=>x.id===r.source);return btn('sourcepage',(s?.title||r.source)+' · '+r.locator,r.source,'data-page="'+(Number(r.page)||Number(String(r.locator).match(/\d+/)?.[0])||1)+'"')+(r.quote?'<blockquote>'+H(r.quote)+'</blockquote>':'')}).join(' ')}
function tree(parent=null){const kids=p.blocks.filter(b=>b.parent===parent);return kids.length?'<div class="tree">'+kids.map(b=>'<button class="node '+(bid===b.id?'selected':'')+'" data-act="block" data-id="'+H(b.id)+'"><strong>'+H(b.title)+'</strong><br><small>'+H(b.purpose)+'</small><br>'+tag(b.status,clStatus(b.status))+'</button>'+tree(b.id)).join('')+'</div>':''}
function jobs(){return p.jobs.slice().reverse().map(j=>group(j.kind+' · '+j.status,'<p>'+H(j.instruction)+'</p>'+ (j.block?'<small>'+H(p.blocks.find(b=>b.id===j.block)?.title)+'</small>':'')+ (j.result?textblock(j.result.text||j.result.detail||JSON.stringify(j.result,null,2)):'')+refs(j.result?.refs)+(j.status==='待执行'?btn('run',activeRuns.has(p.id+'/'+j.id)?'Agent 处理中…':'运行 '+j.kind+' Agent',j.id,activeRuns.has(p.id+'/'+j.id)?'disabled':''):'')+(j.status==='已交付'&&['框架','拆解','统筹'].includes(j.kind)?btn('apply','调整并采用提案',j.id):''))).join('')||'<p>暂无派发任务。</p>'}
function notes(b){return p.notes.filter(x=>x.block===b.id).map(x=>group(x.actor+' · '+x.version,tag(x.actor,/agent/i.test(x.actor)?'Agent':'author')+textblock(x.quote)+H(x.message)+(x.userQuestion?'<p>作者原问：'+H(x.userQuestion)+'</p>':'')+refs(x.refs))).join('')||'<small>尚无批注。选中正文后可以添加。</small>'}
function questions(b){return p.questions.filter(x=>x.block===b.id).map(q=>group(q.message,textblock(q.quote)+'<p>'+H(q.answer||'等待解释 Agent')+'</p>'+refs(q.refs)+(q.answer&&!q.promoted?btn('promote','收录为署名备忘',q.id):q.answer?'已收录':btn('run','请求解释',p.jobs.find(j=>j.context.question===q.id)?.id)))).join('')||'<small>问答与批注分别存档。</small>'}
function mapView(){
 const b=B();return '<div class="panes"><aside class="panel"><h2>论文结构</h2><p class="meta">按块查看写作目的和论证顺序</p>'+btn('add','＋ 论文块')+' '+btn('outline','与主 Agent 拟框架')+tree()+'</aside><section>'+(!b?group(p.settings.outline==='作者先搭建'?'先搭你的第一块':'从研究意图开始','写下研究问题，或将已有稿件导入为项目。<div class="row">'+btn('outline','讨论框架')+btn('upload','接入稿件')+'</div>'):('<article><div class="row">'+tag(b.status,clStatus(b.status))+tag('作者可直接编辑')+'</div><h2>'+H(b.title)+'</h2><p>'+H(b.purpose||'可在框架中填写本块的写作目的。')+'</p><div class="chain">'+b.chain.map(H).map(s=>'<span>'+s+'</span>').join(' → ')+'</div><div class="row">'+btn('scholar','论文编辑器 · 引文与图表')+btn('layout','编辑框架')+btn('split','从光标拆块')+btn('archive','移出当前稿')+btn('suggestions','Agent 建议')+btn('job','派发任务')+'</div><label>正文 · '+H(b.format==='tex'?'LaTeX 原文':'Markdown 原文')+'<textarea id="editor" spellcheck="false" '+''+'></textarea></label><div class="row">'+btn('save','保存正文')+btn('origin','修改缘由：'+issuingOrigin)+btn('note','批注选区')+btn('ask','询问选区')+btn('accept','确认本版',b.id,b.status==='AI 已核验'?'':'disabled')+'</div>'+refs(b.refs)+'</article>'+detail('批注与署名备忘',notes(b))+detail('有来源的问答',questions(b))+detail('关联返修记录',p.feedback.filter(f=>f.block===b.id).map(f=>btn('feedbackjump',f.status+' · '+f.message,f.id)).join('')||'暂无关联')+detail('本块的执笔记录',p.handoffs.filter(x=>x.block===b.id).map(x=>'<p>'+H(x.version+' · '+x.writer+' · '+x.time)+'</p>').join('')||'暂无交接')))+'</section></div>'
}
function history(){from=V(from)?from:(p.versions.at(-2)||head()).id;to=V(to)?to:head().id
 return '<div class="row">'+btn('checkpoint','手动保存 / 标为重要')+btn('send','固定送出版本')+btn('togglever',p.settings.allVersions?'只看重要版本':'展开全部版本')+'</div><div class="grid"><div class="panel timeline"><h2>版本时间轴</h2>'+p.versions.filter(v=>p.settings.allVersions||v.important).slice().reverse().map(v=>'<article>'+tag(v.id)+' '+tag(v.origin,v.origin)+' <b>'+H(v.label)+'</b><p class="meta">'+H(v.time)+'</p>'+p.summaries.filter(s=>s.to===v.id).map(s=>'<p>'+tag(s.from+' → '+s.to)+' '+H(s.text)+'</p>').join('')+btn('tov','作为对照目标',v.id)+' '+btn('restore','恢复为新版本',v.id)+'</article>').join('')+'</div><div class="panel"><h2>两版对照</h2><div class="row"><label>对照基准 <select aria-label="对照基准" id="from">'+options(verOpts())+'</select></label> → <label>查看版本 <select aria-label="查看版本" id="to">'+options(verOpts())+'</select></label>'+btn('compare','查看精确 diff')+btn('summary','请 AI 总结')+'</div>'+cmp+'</div></div>'}
function feedbackDrafts(){const owner=env.host==='dsh'&&window.parent!==window?parent:window;return owner.manuscriptFeedbackDrafts??=new owner.Map()}
function feedbackPassage(f,cur){
 const body=cur?.text||'',q=f.quote,at=q?body.indexOf(q):-1;
 if(toolParams.get('embedded')!=='1'||at<0||body.indexOf(q,at+1)!==-1)return textblock(body||'没有可靠对应位置');
 return '<pre>'+H(body.slice(0,at))+'<a href="#feedback-passage" data-act="feedbackpassage" data-id="'+H(f.id)+'" title="在正文中定位原句">'+H(q)+'</a>'+H(body.slice(at+q.length))+'</pre>';
}
function feedback(){return '<div class="row">'+btn('upload','导入反馈文件')+btn('paste',feedbackDrafts().has(p.id)?'继续填写返修意见':'粘贴整段意见')+'</div>'+(!p.feedback.length?'<p>尚未收到返修意见。导入反馈文件或粘贴意见后，可在此核对原句与当前稿。</p>':'')+p.feedback.slice().reverse().map(f=>{const old=V(f.basis),oldBlock=findB(old,f.originalBlock||f.block)||old?.blocks.find(b=>f.quote&&b.text.includes(f.quote)),cur=findB(head(),f.block);return '<article id="f-'+H(f.id)+'"><div class="row">'+tag(f.origin,f.origin)+tag(f.status)+tag(f.alignment)+'</div><h3>'+H(f.author||f.kind)+' · '+H(f.basis)+(f.page?' · 第 '+f.page+' 页':'')+'</h3>'+textblock(f.message)+ (f.changes?.length?textblock(f.changes.map(c=>(c.type==='ins'?'+ ':'− ')+c.text+' · '+c.author).join('\n')):'')+'<div class="grid">'+group('收到意见时的原句',textblock(f.quote||oldBlock?.text||'意见信没有正文选区'))+group('当前稿 · '+(cur?.title||'待定位'),feedbackPassage(f,cur))+'</div>'+btn('locate','手动定位',f.id)+' '+btn('decompose','讨论并拆解',f.id)+' '+btn('decide','记录决定',f.id)+(f.asset?' '+btn('file','取回反馈原件',f.asset):'')+f.decisions.map(x=>'<p>'+H(x.version+' · '+x.status+' · '+x.reason)+'</p>').join('')+'</article>'}).join('')}
function gantt(){
 const valid=p.blocks.filter(b=>b.start&&b.due),marks=p.settings.ganttVersions?p.versions.filter(v=>v.important):[]
 const ds=[...valid.flatMap(b=>[b.start,b.due]),...marks.map(v=>v.time.slice(0,10))].sort()
 const low=Date.parse(ds[0]||new Date()),high=Date.parse(ds.at(-1)||new Date())+864e5,frac=d=>Math.max(0,Math.min(100,(Date.parse(d)-low)/(high-low)*100))
 return group('计划日期与实际节点','<p class="meta">在论文块的「编辑框架」中设置开始与结束日期。</p>'+p.blocks.map(b=>'<p>'+btn('block',b.title,b.id)+' '+H(b.start||'未排期')+' — '+H(b.due||'未排期')+'</p>'+(b.start&&b.due?'<div class="bar"><i style="margin-left:'+frac(b.start)+'%;width:'+Math.max(.5,frac(b.due)-frac(b.start))+'%"></i></div>':'')).join('')+marks.map(v=>'<p style="border-left:2px solid var(--ink);padding-left:6px;margin-left:'+Math.min(60,frac(v.time.slice(0,10)))+'%">◆ '+H(v.time.slice(0,10)+' '+v.label)+'</p>').join(''))
}
function render(){
 $('#tabs').innerHTML=visibleTabs.map(s=>btn('tab',s,s,'aria-current="'+(tab===s)+'"')).join('');if(!p){$('#view').innerHTML='<div class="empty"><h1>从一个研究问题开始</h1><p>新建项目，或载入带送阅稿、审阅意见与修订稿的「杯盖与降温」示例。每个副本可以独立编辑。</p>'+btn('example','打开杯盖与降温示例')+'</div>';return}
 const base='<div class="row"><h2>'+H(p.title)+'</h2>'+(p.readingGuide?.manuscriptLayout&&env.host==='dsh'?btn('flatdesk','打开手稿'):p.readingGuide?btn('readguide','图解试读'):'')+'<small>稿件 '+H(head().id)+'</small></div>'
 let content=''
 if(tab===tabs[0])content=mapView()
 if(tab===tabs[1])content='<div class="row">'+btn('job','派发任务')+btn('coordinate','和主 Agent 讨论下一步')+btn('refresh','刷新交付')+'</div><div class="grid">'+['构思','撰写中','待审查','需返工','AI 已核验','作者已确认'].map(s=>group(s,p.blocks.filter(b=>b.status===s).map(b=>btn('block',b.title,b.id)).join(' ')||'—')).join('')+'</div>'+jobs()
 if(tab===tabs[2])content=gantt()
 if(tab===tabs[3])content=history()
 if(tab===tabs[4])content=feedback()
 if(tab===tabs[5])content='<div class="row">'+btn('upload','导入稿件 / 文献 / 反馈')+btn('zotero','从 Zotero 本机库选入')+btn('export','导出稿件')+btn('pack','备份整个项目')+btn('lesson','记一条跨项目经验')+'</div>'+group('证据与书目',p.sources.map(s=>'<p>'+H(s.title)+' '+btn('sourcepage','查看出处',s.id)+' '+btn('file','原件',s.asset)+'</p>').join('')||'可导入本地 PDF、BibTeX 或参考笔记。')+group('项目文件',p.assets.map(a=>'<p>'+tag(a.version)+' '+H(a.role)+' · '+btn('file',a.name,a.id)+'</p>').join('')||'尚无文件')+group('跨项目经验 · 不自动套用',lessonList.map(l=>'<p>'+H(l.text)+'<br><small>'+H(l.title+' · '+l.version+' · '+l.condition)+'</small></p>').join('')||'暂无')
 if(tab===tabs[6])content=(env.host==='dsh'?group('思路回看（Flash-Jev）','<p>开启后，WorkBuddy 的 DeepSeek Flash 会分析本项目各助手会话此后的文字，不补扫旧聊天。写 Draft 时可选中正文回看，或直接问助手。</p>'+btn('jev','读取中…','','disabled')):'')+group('工作偏好','<p>'+H(p.settings.outline)+' · 正文编辑停顿后自动保存</p><p>时间轴：'+(p.settings.allVersions?'所有版本':'重要版本')+(embeddedTools?'':'；甘特图：'+(p.settings.ganttVersions?'同步版本节点':'只看计划'))+'</p>'+btn('settings','调整设置')+' '+(env.host==='dsh'?btn('model','选择 DSH 模型'):'使用本机 Codex 登录和模型设置。'))+group('结构阅读呈现','<p>'+H(ManuscriptScaleSettings.label(p.settings.logicStyle))+'</p><p class=meta>全文结构、段落卡片、段内逻辑与只读正文对照共用一份内容；更换样式不改稿、不调用模型。</p>'+btn('scalesettings','选择逻辑呈现样式'))+group('正文导航','<p>正文目录：'+(p.settings.floatingToc?.enabled===false?'关闭':'开启')+' · 宽窗展开目录，顶部章节路径随正文滚动更新。</p>'+btn('tocsettings','正文目录设置'))+group('项目记录',p.events.slice(-20).reverse().map(e=>'<p class="meta">'+H([e.time,e.op,e.actor,e.version].join(' · '))+'</p>').join(''))
 $('#view').innerHTML=base+content
 const jev=$('[data-act=jev]');if(jev){const project=p.id;api('dsh_recall_state',{project}).then(s=>{jev.dataset.enabled=String(s.enabled);jev.textContent=s.enabled?'暂停本项目回看':'开启本项目回看';jev.disabled=false}).catch(e=>{jev.textContent='状态不可用：'+e.message})}
 if($('#editor')){$('#editor').value=draft?.block===bid?draft.text:B().text;$('#editor').oninput=e=>{draft={block:bid,rev:B().rev,title:B().title,origin:issuingOrigin,text:e.target.value}}}

 if($('#from')){$('#from').value=from;$('#to').value=to;$('#from').onchange=e=>{from=e.target.value;cmp='';render()};$('#to').onchange=e=>{to=e.target.value;cmp='';render()}}
}
function readSel(){const e=$('#editor');if(!e||e.selectionEnd===e.selectionStart)throw Error('请先在正文中拖选词、句或段落');return {start:[...e.value.slice(0,e.selectionStart)].length,end:[...e.value.slice(0,e.selectionEnd)].length,quote:e.value.slice(e.selectionStart,e.selectionEnd)}}
function download(name,b64){const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bin]));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
const as64=file=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(file)})
async function act(k,id,el){
 msg('');if(k==='full'){if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();return}
 if(k==='jev'){const project=p.id;el.disabled=true;try{await api('dsh_recall_toggle',{project,enabled:el.dataset.enabled!=='true'});if(p.id===project)render()}finally{el.disabled=false}return}
 const sel=(k==='note'||k==='ask')?readSel():null,offset=k==='split'?[...$('#editor').value.slice(0,$('#editor').selectionStart)].length:null
 await flush()
 if(k==='readguide'){openPaperGuide(p,api);return}
 if(k==='create'||k==='example'){let t;if(k==='create'){const prefs=await api('preferences');t=await form('新建论文项目',[F('title','项目名称'),S('outline','谁先搭框架',['Agent 先提案','作者先搭建'].map(x=>[x,x]),prefs.outline),A('idea','研究意图（Agent 优先）或第一块标题（作者优先，可留空）')]);if(!t)return}
 p=null;bid='';from=to=cmp='';choose(await api(k,t||{}));await list();tab=p.jobs.some(j=>j.status==='待执行')?tabs[1]:tabs[0];render();return}
 if(k==='unpack'){let f=await form('恢复为独立项目副本',[['file','选择 ManuScript 项目 ZIP','file']]);if(!f?.file)return;const np=await api('restore_package',{data:await as64(f.file)});choose(np);await list();render();return}
 if(!p)return
 let f,b=B();const docVer=head().id
 if(k==='scholar'||k==='flatdesk'){const u=new URL(document.baseURI);u.searchParams.set('view','map');u.searchParams.set('project',p.id);if(k==='flatdesk'){u.searchParams.set('guide','1');u.searchParams.delete('chapter')}else u.searchParams.set('chapter',bid||'root');if(env.host==='dsh'&&location.href==='about:srcdoc'){const r=await parent.fetch(u,{cache:'no-store'});if(!r.ok)throw Error('编辑器未载入');const doc=await r.text();window.frameElement.srcdoc=doc.replace('<meta charset=',()=>'<base href="'+H(u.href)+'"><meta charset=')}else location.assign(u);return}
 if(k==='tab'){tab=id;if(id===tabs[5])lessonList=await api('lessons');render();return}
 if(k==='block'){issuingOrigin='作者';bid=id;tab=tabs[0];render();return}
 if(k==='feedbackjump'){tab=tabs[4];render();document.getElementById('f-'+id)?.scrollIntoView();return}
 if(k==='refresh'){await load(p.id);return}
 if(k==='add'){f=await form('新增论文块',[F('title','用短语说明这一块做什么'),S('parent','属于',[['','项目根节点'],...blockOpts()]),A('purpose','写作目的')]);if(!f)return;await mutation('add',f);bid=p.blocks.at(-1).id}
 if(k==='layout'){f=await form('编辑框架',[F('title','块标题',b.title),S('parent','上级块',[['','项目根节点'],...blockOpts().filter(([i])=>i!==b.id)],b.parent||''),A('purpose','本块回答什么',b.purpose),A('chain','论证链 · 每行一步',b.chain.join('\n')),['start','计划开始','date',b.start],['due','计划完成','date',b.due]]);if(!f)return;await mutation('layout',{...f,parent:f.parent||null,chain:f.chain.split('\n').filter(Boolean),block:bid,rev:b.rev})}
 if(k==='split'){f=await form('按光标位置拆分',[F('title','新块标题')]);if(!f)return;await mutation('split',{...f,offset,block:bid,rev:b.rev})}
 if(k==='suggestions'){await ManuscriptSuggestions.open(api,p.id,bid,result=>{choose(result);render()});return}
 if(k==='handoff'){f=await form('交接本块执笔权',[S('writer','下一位执笔者',[['author','作者'],['agent','写作 Agent'],['word','外部 Word']],b.writer)]);if(!f)return;await mutation('handoff',{...f,block:bid,rev:b.rev})}
 if(k==='archive'){f=await form('移出当前稿（历史版本保留）',[F('check','输入块标题确认：'+b.title)]);if(!f)return;if(f.check!==b.title)throw Error('标题不匹配');await mutation('archive',{block:bid,rev:b.rev})}
 if(k==='restore'){f=await form('从 '+id+' 创建新版本',[F('check','输入版本号确认', '')]);if(!f)return;if(f.check!==id)throw Error('版本号不匹配');await mutation('restore_version',{version:id})}
 if(k==='pack'){const x=await api('package',{project:p.id});download(x.name,x.data)}
 if(k==='origin'){const v=await form('本块接下来为何修改？',[S('value','标在时间轴上的修改来源',['作者','导师','审稿人'].map(s=>[s,s]),issuingOrigin)]);if(v)issuingOrigin=v.value}
 if(k==='save')msg('正文已保存到当前版本')
 if(k==='accept')await mutation('accept',{block:bid,rev:b.rev})
 if(sel){f=await form(k==='ask'?'询问解释 Agent':'留下批注',[A('message','选中：'+sel.quote.slice(0,120)),...(k==='ask'?[S('source','优先参考的资料',[['','项目资料'],...p.sources.filter(s=>s.title.endsWith('.pdf')).map(s=>[s.id,s.title])]),F('page','定位页码（可选）','1')]:[])]);if(!f)return;await mutation(k,{...f,...sel,version:docVer,block:bid,pages:f.source?{[f.source]:Number(f.page)}:{}});if(k==='ask'){const j=p.jobs.at(-1);if(env.host==='codex'||route.model||(await api('team_state',{project:p.id})).routes.helper?.model){msg('解释 Agent 正在查阅项目资料…');await mutation('run',{id:j.id,route})}else msg('问题已入队。在设置中选择模型，或在宿主对话中让 Agent 处理。')}}
 if(k==='promote')await mutation('promote',{id})
 if(['outline','coordinate','job','summary','decompose'].includes(k)){
 const kind={outline:'框架',coordinate:'统筹',summary:'摘要',decompose:'拆解'}[k]
 f=await form(kind||'派发 Agent 任务',[...(!kind?[S('kind','角色',['搜证','写作','审查','统筹'].map(x=>[x,x])),S('block','目标块',blockOpts(),bid)]:[]),A('instruction','工作要求或需要讨论的问题',k==='summary'?'按块总结这两版的区别，用简短语块标明实质变化。':k==='decompose'?'保留意见原话，建议拆分并关联论文块。':'')]);if(!f)return;await mutation('job',{...f,kind:kind||f.kind,context:k==='summary'?{from,to}:k==='decompose'?{feedback:id}:{},block:f.block||null});tab=tabs[1];msg('任务已入队，可在下方运行或交给当前宿主 Agent。')
 }
 if(k==='run'){
 const pid=p.id,key=pid+'/'+id;if(activeRuns.has(key))return;activeRuns.add(key);render();msg('Agent 正在处理任务，你仍可批注或编辑其他块。');
 (async()=>{await api('start',{project:pid,id,route});const until=Date.now()+190000;while(Date.now()<until){await new Promise(r=>setTimeout(r,1300));const v=await api('run_status',{project:pid,id});if(v.status==='done')return;if(v.status==='error')throw Error(v.error);if(v.status==='unknown')throw Error('宿主已重新载入，请刷新后核对交付状态。')}throw Error('等待模型超时；可刷新任务核对状态。')})().then(async()=>{if(p?.id!==pid)return;const latest=await api('state',{project:pid});if(p?.id!==pid)return;choose(latest);msg('结果已保存，可查看交付与依据。')}).catch(e=>{if(p?.id===pid)msg(e.message,true)}).finally(()=>{activeRuns.delete(key);if(p?.id===pid&&!draft&&!document.querySelector('dialog[open]'))render()});return
}
 if(k==='apply'){const j=p.jobs.find(x=>x.id===id),field=j.kind==='框架'?'blocks':j.kind==='统筹'?'tasks':'items';f=await form('调整后确认采用 · 保留原提案',[A('json','提案（可修改标题、顺序、关联）',JSON.stringify(j.result[field]||[],null,2))]);if(!f)return;await mutation('apply',{id,[field]:JSON.parse(f.json)})}
 if(k==='checkpoint'){f=await form('保存版本',[F('label','简短说明','手动保存'),S('kind','类型',[['日常','日常版本'],['里程碑','重要版本']],'里程碑'),S('origin','修改缘由',['作者','导师','审稿人'].map(s=>[s,s]),issuingOrigin)]);if(!f)return;await mutation('checkpoint',{...f,important:f.kind==='里程碑'})}
 if(k==='send'){f=await form('固定送出稿',[S('kind','送出用途',[['送导师','送导师'],['投稿','投稿']])]);if(!f)return;msg('正在生成固定 Word 与 PDF 副本…');await mutation('send',f)}
 if(k==='togglever')await mutation('settings',{values:{allVersions:!p.settings.allVersions}})
 if(k==='tov'){to=id;k='compare'}
 if(k==='compare'){const ds=await api('diff',{project:p.id,from,to});cmp=ds.map(d=>group(d.title,'<div class="diff">'+d.parts.map(([t,l,r])=>t==='equal'?H(l):(l?'<del>'+H(l)+'</del>':'')+(r?'<ins>'+H(r)+'</ins>':'')).join('')+'</div>'+Object.entries(d.metadata).map(([key,vs])=>'<small>'+H(key+': '+JSON.stringify(vs))+'</small>').join(''))).join('')||'两个版本没有变化。'}
 if(k==='upload'){f=await form('文件用于什么？',[['file','选择文件','file'],S('intent','用途',['参考资料','作者新稿','对旧版的反馈'].map(s=>[s,s]),tab===tabs[4]?'对旧版的反馈':tab===tabs[0]?'作者新稿':'参考资料'),S('basis','反馈针对的固定版本',verOpts(),docVer),S('block','主稿接入方式',[['','新增章节，保留原稿'],...blockOpts().map(([i,t])=>[i,'交回单块：'+t])]),F('origin','反馈来源','导师')]);if(!f||!f.file)return;if(f.file.size>50*1024*1024)throw Error('单文件上限为 50 MiB');const args={name:f.file.name,data:await as64(f.file),intent:f.intent,basis:f.basis,origin:f.origin};if(f.block&&f.intent==='作者新稿')Object.assign(args,{block:f.block,rev:p.blocks.find(b=>b.id===f.block).rev});await mutation('upload',args);msg('文件及原件已保存')}
 if(k==='paste'){f=await form('粘贴完整意见',[A('message','反馈原话'),F('author','署名'),F('origin','来源','导师'),S('basis','针对哪一版',verOpts(),docVer)],p.id);if(!f){render();return}await mutation('feedback',f);feedbackDrafts().delete(p.id)}
 if(k==='locate'){f=await form('为意见定位',[S('block','选择当前论文块',blockOpts()),F('reason','定位依据')]);if(!f)return;await mutation('locate',{...f,id})}
 if(k==='decide'){f=await form('记录作者决定',[S('status','决定',['采纳','部分采纳','已解决','不改','待定位'].map(x=>[x,x])),S('version','对应版本',verOpts(),docVer),A('reason','改在哪里 / 不改理由')]);if(!f)return;await mutation('decide',{...f,id})}
 if(k==='export'){f=await form('导出固定版本',[S('version','版本',verOpts(),docVer),S('format','文档格式',['tex','md','docx','pdf'].map(x=>[x,x])),['includeWritingNotes','包含章节写作备注','checkbox']]);if(!f)return;const v=await api('export',{...f,project:p.id});download(v.name,v.data)}
 if(k==='file'){const v=await api('file',{asset:id,project:p.id});download(v.name,v.data)}
 if(k==='sourcepage'){const n=el.dataset.page||'1',f=await form('定位来源',[F('page','页码（PDF 从 1 开始）',n)]);if(!f)return;const v=await api('source_read',{source:id,page:Number(f.page),project:p.id});await form(v.title+' · '+v.page,[A('text','原文摘录（只读查看，不会写回）',v.text)])}
 if(k==='lesson'){f=await form('记录可复用经验',[A('text','经验'),F('condition','适用条件')]);if(!f)return;await mutation('lesson',{...f,version:docVer});lessonList=await api('lessons')}
 if(k==='scalesettings'){f=await form('结构阅读呈现设置',[S('logicStyle','呈现样式',ManuscriptScaleSettings.options,p.settings.logicStyle||'symbols'),S('asDefault','适用范围',[['false','当前项目'],['true','当前项目及此宿主的新项目']],'false')]);if(!f)return;await mutation('settings',{asDefault:f.asDefault==='true',values:{logicStyle:f.logicStyle}})}
 if(k==='tocsettings'){f=await form('正文目录设置',ManuscriptTocSettings.fields(p.settings.floatingToc));if(!f)return;await mutation('settings',{values:{floatingToc:{...p.settings.floatingToc,...ManuscriptTocSettings.read(f)}}})}
 if(k==='settings'){const s=p.settings;f=await form('项目设置',[S('outline','默认搭建方式',['Agent 先提案','作者先搭建'].map(x=>[x,x]),s.outline),F('save','自动保存检查间隔（秒）',s.saveSeconds),S('all','时间轴',[['false','重要版本'],['true','全部版本']],String(s.allVersions)),...(embeddedTools?[]:[S('gantt','甘特图',[['false','仅计划'],['true','同步版本']],String(s.ganttVersions))]),S('asDefault','适用范围',[['false','当前项目'],['true','当前项目及此宿主的新项目']])]);if(!f)return;await mutation('settings',{asDefault:f.asDefault==='true',values:{outline:f.outline,allVersions:f.all==='true',...(embeddedTools?{}:{ganttVersions:f.gantt==='true'}),saveSeconds:Number(f.save)}})}
 if(k==='model'){const ps=await api('providers');if(!ps.length)throw Error('宿主没有提供可用模型，请改用宿主对话处理已派发任务');f=await form('DSH 模型来源',[S('provider','供应商',ps.map(x=>[x.id,x.name]),route.provider)]);if(!f)return;const ms=await api('models',f);if(!ms.length)throw Error('此供应商没有可用模型');const m=await form('DSH 模型',[S('model','模型',ms.map(x=>[x.id,x.name]),route.model)]);if(!m)return;route={...f,...m};localStorage.setItem(routeKey,JSON.stringify(route));msg('模型已选择')}
 if(k==='zotero'){f=await form('从本机 Zotero 读取',[F('query','作者或标题关键字')]);if(!f)return;const xs=await api('zotero_search',f);if(!xs.length)throw Error('本机文献库中没有匹配条目');const v=await form('导入书目快照',[S('key','条目',xs.map(x=>[x.key,x.title]))]);if(!v)return;await api('zotero_import',{project:p.id,...v});choose(await api('state',{project:p.id}))}
 render()
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;if(el.dataset.act==='feedbackpassage'){e.preventDefault();if(!busy)window.frameElement?.dispatchEvent(new CustomEvent('manuscript-feedback-passage',{detail:{project:p.id,id:el.dataset.id}}));return}guard(()=>act(el.dataset.act,el.dataset.id,el))})
window.lxBeforeLeave=async()=>{
 if($('#modal').open||busy){msg($('#modal').open?'请先完成或关闭当前窗口。':'正在处理，请稍后再切换。');return false}
 busy=true
 try{while(draft)await flush();return true}catch(e){msg('正文未保存，仍留在当前稿：'+e.message,true);return false}finally{busy=false}
}
window.addEventListener('beforeunload',e=>{if(draft){e.preventDefault();e.returnValue=''}})
;(async()=>{try{await list();const last=toolParams.get('project')||localStorage.getItem(projectKey);if(projectList.length)await load(projectList.find(x=>x.id===last)?.id||projectList[0].id);else render()}catch(e){msg(e.message,true)}})()

if(env.host==='dsh'&&window.parent!==window&&toolParams.get('embedded')!=='1'){const current=new URL(document.baseURI).searchParams.get('project');const nav=id=>parent.postMessage({type:'lx-project-nav',project:current,id},'*');$('#projects').onchange=e=>{const id=e.target.value;e.target.value=current;nav(id)};document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!document.querySelector('dialog[open]'))nav()})}
