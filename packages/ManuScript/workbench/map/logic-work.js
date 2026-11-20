// The host owns execution. This view keeps one compact trigger and a stable control dialog.
window.ManuscriptWork=(()=>{
 const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(root,{project,api,onResult}){
  let latest=null,timer,disposed=false,busy=false,seen=false,toastTimer,dialog=null,rows=[],requestSerial=0;const controller=new AbortController();
  function render(){if(disposed)return;const el=root.querySelector('[data-work-panel]');if(!el)return;
   const running=latest?.status==='running',percent=Math.max(0,Math.min(100,Number(latest?.percent)||0)),warning=latest&&(latest.changed||['partial','error','cancelled','interrupted','stale'].includes(latest.status));
   const focused=el.contains(document.activeElement);
   const label='整理结构'+(running?' · '+percent+'% · '+latest.stage:warning?' · '+(latest.changed?'稿件已变化':latest.stage):latest?.status==='done'?' · 已完成':'');
   const shortStatus=latest?.changed||latest?.status==='stale'?'待更新':({partial:'部分失败',error:'失败',cancelled:'已停止',interrupted:'已中断'})[latest?.status];
   const progress='<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" class="msWorkTrack"/><circle cx="16" cy="16" r="12" class="msWorkArc" pathLength="100" stroke-dasharray="'+percent+' 100"/></svg><span>'+percent+'%</span>';
   el.innerHTML='<button type="button" class="msControl msWorkTrigger" data-work-open aria-haspopup="dialog" aria-label="'+E(label)+'" title="'+E(label)+'">'+(running?progress:'整理结构'+(shortStatus?'<small> · '+E(shortStatus)+'</small>':''))+'</button>';
   if(focused)el.firstElementChild.focus({preventScroll:true});renderDialog();
  }
  function renderDialog(){if(!dialog?.open)return;const running=latest?.status==='running',status=dialog.querySelector('[data-work-status]');
   status.innerHTML=latest&&latest.status!=='idle'?'<p>'+E(running&&latest.activeChapters?.length?'正在整理 '+[...new Set(latest.activeChapters)].join('、'):latest.stage)+' · '+latest.percent+'%</p><p>已整理 '+latest.chapters+'/'+latest.totalChapters+' 章 · '+latest.done+'/'+latest.total+' 批'+(latest.reused?' · 复用 '+latest.reused+' 批':'')+'</p>'+(latest.failed||latest.pending?'<p>'+latest.failed+' 批失败 · '+latest.pending+' 批尚未完成</p>':'')+(latest.changed?'<p class="msScaleWarning">稿件已变化，请更新整理。</p>':'')+(latest.error?'<p>'+E(latest.error)+'</p>':''):'<p>整理当前项目整篇已保存稿件。</p>';
   dialog.querySelector('[data-work-model]').disabled=busy||running||!rows.length;
   const start=dialog.querySelector('[data-work-start]');start.disabled=busy||running||!rows.length;start.textContent=latest&&latest.status!=='idle'?'继续 / 更新':'开始';
   dialog.querySelector('[data-work-cancel]').disabled=busy||!running;
   dialog.querySelector('[data-work-restart]').disabled=busy||!rows.length;
   dialog.querySelector('[data-work-details]').innerHTML=(latest?.route?'<p>'+E(latest.route.name||latest.route.model)+'</p>':'')+(latest?.basis?'<p>所据稿版 '+E(latest.basis)+'</p>':'')+(latest?.localSections?'<p>'+latest.localSections+' 节辅助材料保留原文，不调用模型分析。</p>':'')+(latest?.timings?.length?'<p>已完成调用耗时：'+Math.round(latest.timings.reduce((n,t)=>n+t.modelMs,0)/1000)+' 秒（各任务累计；并发时不等于等待时间）</p>':'')+'<p>'+E(latest?.imageMode==='captions'?'上次调用只使用正文和图注。':'支持图片的模型会接收可读取原图；实际发送情况在章节信息中查看。')+'</p>'+((latest?.failures||[]).map(x=>'<p>'+E(x.chapter)+'：'+E(x.error)+'</p>').join(''));
  }
  function toast(){let t=root.querySelector('.msWorkToast');if(!t){t=document.createElement('div');t.className='msWorkToast';t.setAttribute('role','status');root.append(t)}t.textContent='已完成';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.remove(),1000)}
  async function poll(){clearTimeout(timer);if(disposed)return;const serial=++requestSerial;
   try{const next=await api('work_status',{project});if(disposed||serial!==requestSerial)return;const wasRunning=latest?.status==='running',changed=latest?.id!==next.id||latest?.status!==next.status||latest?.changed!==next.changed||latest?.chapters!==next.chapters;latest=next;render();
    if(changed&&next.status!=='idle'){await onResult();if(disposed)return;if(seen&&wasRunning&&next.status==='done')toast()}seen=true;
   }catch(e){if(!disposed){const trigger=root.querySelector('[data-work-open]');if(trigger)trigger.title='进度读取失败：'+e.message+'；正在重新连接。';if(dialog?.open)dialog.querySelector('[data-work-error]').textContent=e.message}}
   if(!disposed)timer=setTimeout(poll,latest?.status==='running'?1000:5000);
  }
  async function begin(op,route){busy=true;requestSerial++;clearTimeout(timer);render();try{latest=await api(op,{project,route});seen=true;render();if(latest.status==='done'){await onResult();if(!disposed)toast()}await poll()}finally{busy=false;render()}}
  async function open(){if(dialog?.open)return;rows=[];dialog=modal('整理整篇稿件的结构','<label class="msWorkModel">调用模型<select data-work-model aria-label="调用模型" disabled><option>正在读取模型…</option></select></label><div data-work-status role="status"></div><div class="msWorkActions"><button class="msControl" data-control="commit" data-work-start disabled>开始</button><button class="msControl" data-work-cancel disabled>停止</button><button class="msControl" data-work-restart disabled>重来</button></div><p class="msWorkHint">继续 / 更新会复用有效批次；重来会停止当前任务并重新生成全部内容。新结果完整成功前保留旧解读。</p><p data-work-error role="alert"></p><details><summary>调用详情</summary><div data-work-details></div></details>');
   const d=dialog;d.classList.add('msWorkDialog');d.addEventListener('close',()=>{if(dialog===d)dialog=null},{once:true});renderDialog();
   d.addEventListener('click',async e=>{const b=e.target.closest('[data-work-start],[data-work-restart],[data-work-cancel]');if(!b||busy)return;d.querySelector('[data-work-error]').textContent='';try{if(b.hasAttribute('data-work-cancel')){busy=true;requestSerial++;clearTimeout(timer);render();try{latest=await api('work_cancel',{project});await poll()}finally{busy=false;render()}}else{const route=rows[+d.querySelector('[data-work-model]').value];if(!route)throw Error('请选择模型');await begin(b.hasAttribute('data-work-restart')?'work_restart':'work_start',route)}}catch(error){if(d.open)d.querySelector('[data-work-error]').textContent=error.message}});
   try{const catalog=await api('team_catalog',{refresh:true});if(disposed||!d.open)return;rows=catalog.rows||[];const last=latest?.route;rows.sort((a,b)=>Number(b.provider===last?.provider&&b.model===last?.model)-Number(a.provider===last?.provider&&a.model===last?.model));d.querySelector('[data-work-model]').innerHTML=rows.map((r,i)=>'<option value="'+i+'">'+E(r.name||r.model)+'</option>').join('')||'<option>没有可用模型</option>';if(!rows.length||catalog.errors?.length)d.querySelector('[data-work-error]').textContent=rows.length?catalog.errors.join('；'):'请先在宿主配置模型，再使用「整理结构」。';renderDialog();}catch(e){if(d.open)d.querySelector('[data-work-error]').textContent=e.message}
  }
  root.addEventListener('click',e=>{if(e.target.closest('[data-work-open]'))open()},{signal:controller.signal});timer=setTimeout(poll,0);
  return {render,destroy(){disposed=true;clearTimeout(timer);clearTimeout(toastTimer);controller.abort();dialog?.close();dialog=null}};
 }
 return {mount};
})();
