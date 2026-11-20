window.__ModuleLoader__.load({id:'manuscript',factory(require){
  const R=require('react'),h=R.createElement, lesson=/* A_LAB_DATA */null
  const wrap={display:'flex',flexWrap:'wrap',alignItems:'center',gap:10}
  const box={border:'1px solid currentColor',borderRadius:8,padding:'12px 16px',margin:'16px 0'}
  const button=(name,fn,extras={})=>h('button',{type:'button',onClick:fn,style:{padding:'5px 10px',cursor:'pointer'},...extras},name)
  function Case(){
    const [index,select]=R.useState(0),[answers,record]=R.useState({})
    const b=lesson.blocks[index],answer=answers[b.id]
    const link=id=>{const [label,url]=lesson.sources[id];return h('a',{key:id,href:url,target:'_blank',rel:'noopener noreferrer'},label)}
    return h('article',null,h('p',null,'Nature 主刊 · 开放论文练习'),h('h2',null,lesson.title),h('p',null,lesson.credit),' ',link('licence'),
      h('nav',{'aria-label':'论文块',style:{...wrap,marginTop:18}},lesson.blocks.map((x,i)=>button(x.name,()=>select(i),{key:x.id,'aria-pressed':i===index,style:{fontWeight:i===index?700:400,textDecoration:i===index?'underline':'none',padding:'6px 8px'}}))),
      h('section',{style:box},h('small',null,b.part+' · '+(index+1)+' / '+lesson.blocks.length),h('h3',null,b.question),h('p',null,b.record),
        b.quote?h('blockquote',{lang:'en'},b.quote):null,h('div',{style:wrap},b.refs.map(link))),
      h('details',{key:b.id},h('summary',null,'对照两版练习稿（LaTeX 正文）'),h('h4',null,'练习旧稿 · 含待改表述'),h('pre',{style:{whiteSpace:'pre-wrap'}},b.old),h('h4',null,'练习新稿'),b.current?h('pre',{style:{whiteSpace:'pre-wrap'}},b.current):h('p',null,'此段已移除，未指定替代位置。')),
      h('section',{style:box},h('h3',null,'试着判断'),h('p',null,b.task),h('div',{style:wrap},b.options.map((s,i)=>button(s,()=>record({...answers,[b.id]:i}),{key:s,'aria-pressed':i===answer}))),answer!==undefined?h('p',{'role':'status'},(answer===b.correct?'判断一致。':'再想一想。')+b.why):null),
      h('small',null,'练习选择仅在本页暂存，不修改论文，也不计入作者验收。'))
  }
  async function act(op,args={}){const r=await fetch(new URL('api/manuscript.action',document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,args})});const j=await r.json();if(!r.ok||j.error)throw Error(j.error||'DSH 请求失败');return j.result}
  const libraryCss=/* LIBRARY_CSS */''
  // Keep exactly one workspace per renderer. A new DSH window starts with a new library.
  let surface=null,workspaceRoot=null,parking=null,returnFocus=null
  function WorkspaceSlot(){
    const slot=R.useRef(null)
    R.useLayoutEffect(()=>{
      const container=slot.current
      if(!surface){
        parking=document.createElement('div')
        parking.inert=true
        parking.style.cssText='position:fixed;visibility:hidden;pointer-events:none;overflow:hidden;left:-100000px;top:0'
        document.body.append(parking)
        surface=document.createElement('div')
        surface.className=matchMedia('(prefers-reduced-motion: reduce)').matches?'msWorkspaceSurface':'msWorkspaceSurface msColdStart'
        surface.style.cssText='width:100%;height:100%;min-height:0;min-width:0'
        surface.addEventListener('focusin',event=>{returnFocus=event.target})
        container.append(surface)
        workspaceRoot=require('react-dom/client').createRoot(surface)
        surface.addEventListener('animationend',event=>{
          if(event.animationName==='msUnfoldRule')surface?.classList.remove('msColdStart')
        })
        workspaceRoot.render(h(Page))
      }else{
        container.moveBefore(surface,null)
        if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})
      }
      return ()=>{
        if(!surface||!parking)return
        const size=surface.getBoundingClientRect()
        parking.style.width=size.width+'px';parking.style.height=size.height+'px'
        surface.classList.remove('msColdStart')
        parking.moveBefore(surface,null)
      }
    },[])
    return h('div',{ref:slot,style:{width:'100%',height:'100%',minWidth:0,minHeight:0}})
  }
  async function confirmAccess(option,signal){
    const d=document.createElement('dialog'),form=document.createElement('form');form.method='dialog';d.append(form)
    const title=document.createElement('strong');title.textContent='更改此 DSH 会话的访问权限';form.append(title)
    const p=document.createElement('p');p.textContent='此预设允许访问工作区以外的文件。'+(option.approval==='never'?'DSH 不会逐次请求批准。':'批准策略由 DSH 原生预设决定。');form.append(p)
    const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';label.append(check,' 我了解这个会话的访问范围');form.append(label)
    const row=document.createElement('p'),cancel=document.createElement('button'),ok=document.createElement('button');cancel.value='cancel';cancel.textContent='取消';ok.value='allow';ok.textContent='应用到此会话';ok.disabled=true;check.onchange=()=>ok.disabled=!check.checked;row.append(cancel,ok);form.append(row)
    if(signal.aborted)return false;document.body.append(d);const abort=()=>d.close('cancel');signal.addEventListener('abort',abort,{once:true});return new Promise(resolve=>{d.onclose=()=>{const yes=!signal.aborted&&d.returnValue==='allow'&&check.checked;d.remove();signal.removeEventListener('abort',abort);resolve(yes)};d.showModal();cancel.focus()})
  }
  function Desk({project,map,onBack}){
    const desktop=location.protocol==='dsh-app:',[doc,setDoc]=R.useState(null),[err,setErr]=R.useState(''),[ready,setReady]=R.useState(!map)
    const u=new URL('api/manuscript.workspace',document.baseURI);u.searchParams.set('project',project.id);if(map){u.searchParams.set('view','map');u.searchParams.set('native','1')}
    const url=u.href
    R.useEffect(()=>{let live=true;if(desktop)fetch(url,{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('工作台载入失败（'+r.status+'）');const x=await r.text();if(!x.includes(map?'id="roster"':'id="projects"'))throw Error('宿主未提供工作台页面');if(live)setDoc(x.replace('<meta charset=', '<base href="'+url+'"><meta charset='))}).catch(e=>live&&setErr(e.message));return()=>{live=false}},[desktop,url])
    R.useEffect(()=>{const lifetime=new AbortController();let changing=false;function receive(e){
      const frame=document.getElementById('manuscript-project-frame'),m=e.data
      if(!frame||e.source!==frame.contentWindow||!map||m?.project!==project.id)return
      if(m.type==='ms-workspace-open'){
        if(m.error)setErr(m.error)
        else{setErr('');setReady(true)}
        return
      }
      if(m.type!=='manuscript-native')return
      ;(async()=>{const {sid}=await act('dsh_session',{project:project.id,role:m.role})
        if(sid!==m.sid)throw Error('会话绑定已变化，请重新打开')
        if(m.action==='jump'){hostCtx.uiWorkspace.openSession(sid);return}
        if(['plan','permission','preset'].includes(m.action)){
          if(changing)throw Error('已有会话设置正在更改');changing=true
          try{const cfg=await act('dsh_controls',{project:project.id,role:m.role,sid});let command
            if(m.action==='preset'){if(!cfg.presets.some(x=>x.id===m.text))throw Error('宿主未提供此预设');const r=await hostCtx.remote.agentPresets.select(sid,m.text);if(!r.ok)throw Error(r.error?.message||'DSH 不允许切换预设');return}
            if(m.action==='permission'){const opt=cfg.access.find(x=>x.id===m.text);if(!opt||!/^[-a-zA-Z0-9_.]+$/.test(opt.id))throw Error('宿主未提供此权限');if((opt.wide||opt.id==='auto')&&!await confirmAccess(opt,lifetime.signal))throw Error('已取消，未更改访问权限');command='/permission '+opt.id}
            else{if(!['on','off'].includes(m.text))throw Error('未知模式');command=m.text==='on'?'/plan':'/plan off'}
            if(lifetime.signal.aborted)throw Error('已离开项目')
            const r=await hostCtx.remote.commands.execute(sid,command,[]);if(!r.ok||!r.value||r.value.result?.kind==='error')throw Error(r.error?.message||r.value?.result?.text||'DSH 未执行命令')
          }finally{changing=false}return
        }
        if(m.action==='prompt'){if(changing)throw Error('会话权限切换中，请稍后发送');if(typeof m.text!=='string'||m.text.length>20000)throw Error('消息过长')
          const images=m.images??[]
          if(!Array.isArray(images)||images.length>4||images.some(i=>!i||!['image/png','image/jpeg','image/webp','image/gif'].includes(i.mediaType)||typeof i.data!=='string'||!i.data.length||i.data.length>4*Math.ceil(4*1024*1024/3)||typeof i.name!=='string'||i.name.length>256)||images.reduce((sum,i)=>sum+i.data.length,0)>4*Math.ceil(8*1024*1024/3)+12)throw Error('图片超出允许的格式、数量或大小')
          if(images.length){const cap=await act('dsh_image_capability',{project:project.id,role:m.role,sid});if(cap.state!=='supported')throw Error(cap.state==='unsupported'?'当前模型不支持图片；附件仍保留。':'无法确认当前模型是否支持图片；附件仍保留。')}
          await act('dsh_prepare',{project:project.id,role:m.role,sid,requestId:m.requestId,refs:m.refs||[],question:m.question})
          const content=[{type:'text',text:m.text},...images.map(({mediaType,data,name})=>({type:'image',mediaType,data,name}))]
          const r=await hostCtx.remote.session.prompt({sessionId:sid,requestId:m.requestId,mode:'queue',content},new AbortController().signal);if(!r.ok)throw Error(r.error?.message||'DSH 未接收消息')
          if(m.refs?.length&&m.question)await act('dsh_question_sent',{project:project.id,role:m.role,sid,requestId:m.requestId}).catch(()=>{}) // Accepted message; event reconciliation retries note persistence.
        }
      })().then(()=>e.source.postMessage({type:'manuscript-native-result',id:m.requestId},'*'),err=>e.source.postMessage({type:'manuscript-native-result',id:m.requestId,error:err.message},'*'))
    }window.addEventListener('message',receive);return()=>{lifetime.abort();window.removeEventListener('message',receive)}},[project.id,map])
    // CSS variables do not inherit across the iframe. Measure the host's own
    // leading-controls band; it changes on collapse, fullscreen and drawer mode.
    const probe=R.useRef(null),deskFrame=R.useRef(null)
    function syncClearance(){
      const el=deskFrame.current?.contentDocument?.documentElement
      if(el&&probe.current)el.style.setProperty('--ms-host-leading',probe.current.getBoundingClientRect().width+'px')
    }
    function syncScheme(){
      // The iframe's OS media query can differ from the active DSH theme.
      const sheet=deskFrame.current?.contentDocument?.getElementById('ms-host-dark')
      if(!sheet)return
      const mode=document.documentElement.style.colorScheme
      sheet.media=mode==='dark'?'all':mode==='light'?'not all':'(prefers-color-scheme: dark)'
    }
    R.useLayoutEffect(()=>{if(!probe.current)return;const ro=new ResizeObserver(syncClearance);ro.observe(probe.current);syncClearance()
      const changes=new MutationObserver(syncScheme);changes.observe(document.documentElement,{attributes:true,attributeFilter:['style','data-ds-theme-source']});syncScheme()
      return()=>{ro.disconnect();changes.disconnect()}},[desktop,doc,map])
    const opening=!ready||Boolean(err)
    R.useEffect(()=>{
      if(!opening||err)return
      const timer=setTimeout(()=>setErr('项目打开时间较长，可以返回项目库后重试。'),30000)
      return ()=>clearTimeout(timer)
    },[opening,err])
    const cover=opening?h('section',{className:'msProjectOpening','aria-label':'打开项目'},
      h('header',null,button('‹ 项目库',onBack),h('strong',null,project.title)),
      h('div',{className:'msOpeningPaper'},h('p',{role:err?'alert':'status'},err||'正在打开稿件…'))):null
    return h(R.Fragment,null,cover,h('span',{ref:probe,'aria-hidden':true,style:{position:'absolute',visibility:'hidden',pointerEvents:'none',height:0,width:'var(--dsh-frame-leading-clearance, 0px)'}}),desktop&&!doc?null:h('iframe',{ref:deskFrame,onLoad:()=>{syncClearance();syncScheme();deskFrame.current?.contentDocument?.addEventListener('focusin',event=>{returnFocus=event.target})},id:'manuscript-project-frame',...(desktop?{srcDoc:doc}:{src:url}),title:'ManuScript 论文工作台',allow:'fullscreen',style:{visibility:opening?'hidden':'visible',border:0,width:'100%',display:'block',flex:'1 1 0',minHeight:0,minWidth:0,height:'100%'}}))
  }
  function Page(){
    const [project,setProject]=R.useState(null),[openingId,setOpeningId]=R.useState(null),[mode,setMode]=R.useState('map'),[list,setList]=R.useState(null),[form,setForm]=R.useState(null),[path,setPath]=R.useState(''),[title,setTitle]=R.useState(''),[err,setErr]=R.useState(''),[working,setWorking]=R.useState(false)
    function enter(p){surface?.classList.remove('msColdStart');localStorage.setItem('lunxu:last:dsh',p.id);setProject(p);setMode('map');setForm(null);setErr('')}
    async function reload(){const ps=await act('dsh_library');setList(ps);return ps}
    R.useEffect(()=>{reload().catch(e=>setErr(e.message))},[])
    function choose(kind,p){setForm({kind,p});setPath('');setTitle('');setErr('')}
    async function open(p){if(!p.path){choose('link',p);return}setWorking(true);setOpeningId(p.id);setErr('');try{await act('dsh_bind',{project:p.id,path:p.path});enter(p)}catch(e){setErr(e.message)}finally{setOpeningId(null);setWorking(false)}}
    async function submit(e){e.preventDefault();if(working)return;setWorking(true);try{const b=await act('dsh_bind',{project:form.p?.id,path:path.trim(),title:title.trim(),create:form.kind!=='open'});if(form.kind==='new'&&!b.reused)await act('dsh_metadata',{project:b.id,category,description});const ps=await reload();enter(ps.find(x=>x.id===b.id))}catch(e){setErr(e.message)}finally{setWorking(false)}}
    async function pick(){try{const d=globalThis.__DSH_DIRECTORY_PICKER__,s=d?await d.pick():await hostCtx.uiWorkspace.pickDirectory();if(typeof s==='string'&&s)setPath(s)}catch{setErr('也可以直接输入本机文件夹绝对路径。')}}
    const [category,setCategory]=R.useState('其他'),[description,setDescription]=R.useState(''),[removed,setRemoved]=R.useState(null)
    const leaveOK=async()=>{const w=document.getElementById('manuscript-project-frame')?.contentWindow;return !w?.lxBeforeLeave||await w.lxBeforeLeave()}
    async function home(){if(!await leaveOK())return;setProject(null);setForm(null);await reload()}
    function cardForm(kind,p){setCategory(p?.category||'其他');setDescription(p?.description||'');choose(kind,p)}
    async function switchProject(id){if(!await leaveOK())return;const ps=await reload(),p=ps.find(x=>x.id===id);if(id==='__new'||!p?.path){setProject(null);cardForm(id==='__new'?'new':'link',p);return}await open(p)}
    R.useEffect(()=>{function message(e){const f=document.getElementById('manuscript-project-frame');if(!project||e.source!==f?.contentWindow||e.data?.type!=='lx-project-nav'||e.data.project!==project.id)return;(e.data.id?switchProject(e.data.id):home()).catch(x=>setErr(x.message))}
     function key(e){if(parking?.contains(surface)||e.key!=='Escape'||e.defaultPrevented||document.querySelector('dialog[open]'))return;if(form){setForm(null);e.preventDefault()}else if(project){e.preventDefault();home().catch(x=>setErr(x.message))}}
     window.addEventListener('message',message);window.addEventListener('keydown',key);return()=>{window.removeEventListener('message',message);window.removeEventListener('keydown',key)}},[project,form])
    const css=h('style',null,libraryCss),meta=()=>h(R.Fragment,null,h('label',null,'项目类别',h('input',{list:'lx-types',maxLength:50,value:category,onChange:e=>setCategory(e.target.value)})),h('datalist',{id:'lx-types'},['Paper-review','Paper-tech','开发项目','其他'].map(x=>h('option',{key:x,value:x}))),h('label',null,'项目简述',h('textarea',{maxLength:500,rows:2,value:description,onChange:e=>setDescription(e.target.value),placeholder:'这个项目在解决什么问题？'})))
    if(project)return h('main',{style:{height:'100%',position:'relative',display:'flex',flexDirection:'column',minHeight:0}},css,mode==='map'?null:h('nav',{className:'lxProjectNav'},button('‹ 项目库',home),button('返回稿件',async()=>{if(await leaveOK())setMode('map')})),err?h('p',{role:'alert'},err):null,h(Desk,{key:project.id+mode,project,map:mode==='map',onBack:home}))
    const selected=form?.p
    const finish=async fn=>{if(working)return;setWorking(true);try{await fn();await reload();if(removed)setRemoved(await act('dsh_removed'));setForm(null);setErr('')}catch(e){setErr(e.message)}finally{setWorking(false)}}
    return h('main',{className:'lxLibrary'},css,h('section',null,h('div',{className:'ms-library-brand'},h(mark,{size:28}),h('b',null,'ManuScript'),h('small',null,'工作空间')),h('h1',null,'项目库'),h('p',null,'选择项目，继续构思、写作与核对证据。'),h('nav',null,button('新建项目文件夹',()=>cardForm('new'),{className:'lxPrimary'}),button('打开本地文件夹',()=>cardForm('open')))),err?h('p',{role:'alert'},err):null,
     form?h('section',{className:'lxShelfDialog',role:'region','aria-label':'项目操作'},h('h3',null,({new:'新建项目',link:'绑定已有项目',open:'打开本地文件夹',meta:'编辑项目资料',remove:'从项目库移除？'})[form.kind]),
     form.kind==='remove'?h(R.Fragment,null,h('p',null,'仅移除「'+selected.title+'」的项目库入口。本地文件、稿件版本和 DSH 会话都会保留。'),h('p',{className:'lxPath'},selected.path||'该项目还没有绑定本地文件夹。'),selected.path?button('在文件管理器中打开',()=>act('dsh_reveal',{project:selected.id}).catch(e=>setErr(e.message))):null,h('p',null,'若要删除磁盘文件，请自行前往文件管理器操作。'),button('确认移除',()=>finish(()=>act('dsh_remove',{project:selected.id,confirmed:selected.id})),{disabled:working}),button('取消',()=>setForm(null))):
     form.kind==='meta'?h('form',{onSubmit:e=>{e.preventDefault();finish(()=>act('dsh_metadata',{project:selected.id,category,description}))}},meta(),h('button',{type:'submit',disabled:working},working?'正在保存…':'保存资料'),button('取消',()=>setForm(null))):
     h('form',{onSubmit:submit},h('label',null,'文件夹绝对路径',h('input',{required:true,autoFocus:true,value:path,onChange:e=>setPath(e.target.value),placeholder:'/Users/…/我的项目'})),button('浏览文件夹…',pick),form.kind==='new'?h(R.Fragment,null,h('label',null,'项目名称（可选）',h('input',{value:title,onChange:e=>setTitle(e.target.value)})),meta()):null,h('p',null,'已绑定的文件夹会打开原项目。'),h('button',{type:'submit',disabled:working},working?'正在绑定…':'进入项目'),button('取消',()=>setForm(null)))):null,
     h('section',null,button(removed?'收起已移除项目':'已移除项目',async()=>setRemoved(removed?null:await act('dsh_removed'))),removed?removed.length?removed.map(p=>h('p',{key:p.id},p.title,' ',button('恢复到项目库',()=>finish(()=>act('dsh_restore_card',{project:p.id}))))):h('p',null,'没有已移除的项目。'):null),
     h('section',{className:'lxGrid','aria-label':'项目列表'},list===null?(err?button('重新载入项目库',()=>{setErr('');reload().catch(e=>setErr(e.message))}):h('p',{role:'status'},'正在读取项目库…')):!list.length?h('p',null,'还没有项目。新建一个项目，或打开已有的本地文件夹。'):list.map(p=>h('article',{className:'lxCard',key:p.id,'data-opening':openingId===p.id||undefined,'aria-busy':openingId===p.id||undefined},h('button',{className:'lxOpen',type:'button',disabled:working,onClick:()=>open(p),'aria-label':'打开 '+p.title},h('small',null,p.category),h('strong',null,p.title),h('span',{role:openingId===p.id?'status':undefined},openingId===p.id?'正在打开…':p.description),h('small',{className:'lxPath'},p.path||'首次打开时绑定文件夹')),h('footer',null,button('资料',()=>cardForm('meta',p),{'aria-label':'编辑 '+p.title+' 的资料'}),button('移除',()=>cardForm('remove',p),{'aria-label':'移除 '+p.title}))))))

  }
  let hostCtx
  const markSource=/* MS_MARK */''
  // DSH owns the row and supplies size and active state. Only draw its glyph.
  function mark({size=16,active=false}={}){
    return h('svg',{...markSource.attrs,width:size,height:size,className:'ms-glyph','data-active':active?'true':undefined,'aria-hidden':true,focusable:false,dangerouslySetInnerHTML:{__html:markSource.paths}})
  }
  const glyphMotion=` .ms-glyph{display:block;flex:none;overflow:visible}
    @media(prefers-reduced-motion:no-preference){
      .ms-glyph .ms-nib{transition:transform 170ms var(--ds-ease-in-out,ease-in-out);transform-origin:15px 19px}
      @media(hover:hover){button:hover .ms-glyph .ms-nib{transform:translateY(-1px) rotate(-11deg)}}
      button:focus-visible .ms-glyph .ms-nib{transform:translateY(-1px) rotate(-11deg)}
      .ms-glyph[data-active=true] .ms-nib{animation:ms-sign 240ms ease-out}
      @keyframes ms-sign{from{transform:translate(-2px,1px) scale(.78)}}
    }`
  /* REPLY_VIEW */
  // Coalesce visible turn tails into one session lookup. A newly closed turn reloads the index.
  const replyLoads=new Map()
  function indexFor(sid,seq){
    let batch=replyLoads.get(sid)
    if(!batch||(batch.started&&seq>batch.max)){
      batch={started:false,max:seq};replyLoads.set(sid,batch)
      batch.task=Promise.resolve().then(()=>{batch.started=true;return act('dsh_reply_index',{sid})}).finally(()=>{if(replyLoads.get(sid)===batch)replyLoads.delete(sid)})
    }
    batch.max=Math.max(batch.max,seq);return batch.task
  }
  function NativeQuestionPick({sid,seq,turn}){
    const [value,pick]=R.useState(''),[choices,choose]=R.useState(null),[status,report]=R.useState('')
    R.useEffect(()=>{const capture=()=>{const sel=document.getSelection()
      const row=n=>(n?.nodeType===1?n:n?.parentElement)?.closest('[data-chat-flow-kind="assistant-step"]')
      const a=row(sel?.anchorNode),b=row(sel?.focusNode),v=sel?.toString().trim()
      if(a&&a===b&&a.dataset.chatTurn===String(turn)&&v&&v.length<=4000){pick(v);choose(null);report('')}
      else if(!document.activeElement?.closest('[data-question-picker]')){pick('');choose(null);report('')}
    };capture();document.addEventListener('pointerup',capture);document.addEventListener('keyup',capture);return()=>{document.removeEventListener('pointerup',capture);document.removeEventListener('keyup',capture)}},[turn,seq])
    async function replace(target){try{await act('dsh_question_excerpt',{sid,seq,project:target.project,key:target.key,selectedTarget:!target.linked,excerpt:value});report('已替换旁注摘录');choose(null)}catch(e){report(e.message)}}
    if(!value)return null
    return h('span',{'data-question-picker':'',onPointerUp:e=>e.stopPropagation()},button('用作旁注摘录',async()=>{try{const all=await act('dsh_question_targets',{sid,seq}),linked=all.filter(r=>r.linked),rows=linked.length?linked:all;if(linked.length===1)await replace(linked[0]);else if(rows.length){choose(rows);report('选择要替换摘录的原文：')}else report('当前稿中没有这条追问旁注。')}catch(e){report(e.message)}},{onPointerDown:e=>e.preventDefault()}),choices?.map(r=>button(r.quote,()=>replace(r),{key:r.key})),h('small',{role:'status'},status))
  }
  function ReplyActions({sessionId,seq,turn}){
    const [result,set]=R.useState(null)
    R.useEffect(()=>{let live=true;const refresh=()=>indexFor(sessionId,seq).then(v=>{if(live)set({sessionId,seq,kinds:v[seq]||[]})},()=>{})
      const updated=e=>{if(e.detail===sessionId)refresh()};refresh();window.addEventListener('focus',refresh);window.addEventListener('ms-reply-ready',updated);return()=>{live=false;window.removeEventListener('focus',refresh);window.removeEventListener('ms-reply-ready',updated)}},[sessionId,seq])
    if(result?.sessionId!==sessionId||result.seq!==seq||!result.kinds.length)return null
    return h('div',{style:wrap},result.kinds.map(kind=>kind==='question'?h(NativeQuestionPick,{key:sessionId+':'+seq,sid:sessionId,seq,turn:turn?.turn??turn}):button(kind==='map'?'查看导图变化':'对照原段落',()=>hostCtx.sidebarRight.openTab('manuscript-reply',{params:{seq,kind}}),{key:kind})))
  }
  function ReplyPanel({sessionId,useTabInfo}){
    const {tab}=useTabInfo(),{seq,kind}=tab.navigation.params||{},ref=R.useRef(null),[retry,tick]=R.useState(0)
    R.useLayoutEffect(()=>{let live=true;const root=ref.current;root.textContent='正在读取本轮变化…'
      act('dsh_reply_detail',{sid:sessionId,seq,kind}).then(v=>{if(live)renderReplyChanges(root,v)},err=>{if(live){root.textContent=err.message;const btn=document.createElement('button');btn.textContent='重试';btn.onclick=()=>tick(n=>n+1);root.append(btn)}})
      return()=>{live=false}},[sessionId,seq,kind,retry])
    return h('section',{style:{padding:16,height:'100%',overflow:'auto',boxSizing:'border-box'},'aria-label':'本轮改动'},h('h2',null,kind==='draft'?'对照原段落':'查看导图变化'),h('div',{ref}))
  }
  return {inject:['slots','layout','sidebarRightTabs','sidebarRight','uiWorkspace','remote','remote.session','remote.commands','remote.agentPresets'],apply(ctx){
    hostCtx=ctx
    ctx.effect(()=>()=>{workspaceRoot?.unmount();parking?.remove();workspaceRoot=null;parking=null;surface=null;returnFocus=null})
    ctx.effect(()=>{if(typeof BroadcastChannel==='undefined')return
      const channel=new BroadcastChannel('manuscript-reply-ready');channel.onmessage=e=>{
        replyLoads.delete(e.data);window.dispatchEvent(new CustomEvent('ms-reply-ready',{detail:e.data}))
      };return()=>channel.close()})
    ctx.effect(()=>{const style=document.createElement('style');style.textContent=glyphMotion;document.head.appendChild(style);return ()=>style.remove()})
    ctx.effect(()=>ctx.sidebarRightTabs.register({id:'manuscript-reply',kind:'manuscript-reply',title:()=>'本轮改动'}))
    ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:'manuscript-reply'},ReplyPanel))
    ctx.slots.inject('conversation.chat.turnTail',()=>ctx.slots.register({name:'conversation.chat.turnTail',id:'manuscript-reply'},ReplyActions))
    ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({name:'sidebar.panellist',id:'manuscript',order:20,label:()=>'ManuScript'},mark))
    ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'manuscript',inject:()=>({})},WorkspaceSlot))
  }}
}})
