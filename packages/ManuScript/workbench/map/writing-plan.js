// A saved writing plan preserves card identity and the author's own brief.
const writingViews=new Map()
function writingPlanUI(container,b){
 const current=b.writingPlan||{steps:[],brief:''},steps=current.steps.map(s=>({id:s.id,reason:s.reason||'',node:s.node}));
 container.innerHTML='<details class="writingPlan"><summary>写作思路</summary><div class="planCards"><label>选入卡片 <select aria-label="选入卡片"></select></label><button type="button" data-plan-add>加入链条</button></div><ol></ol><label>作者简述<textarea aria-label="作者简述" rows="3" placeholder="先用自己的话说清这条论证；也可以直接写正文。"></textarea></label><small>保存时与正文一起留档；顺序可调整，不移动原导图。</small><p role="status"></p></details>';
 const root=container.firstElementChild,select=root.querySelector('select'),list=root.querySelector('ol'),brief=root.querySelector('textarea');brief.value=current.brief;
 select.innerHTML=map.filter(n=>n.id!=='root'&&!n.group&&!n.ghost).map(n=>'<option value="'+E(n.id)+'">'+E(n.t)+' · '+E(n.id.slice(-4))+'</option>').join('');
 function paint(){
  list.innerHTML=steps.map((s,i)=>'<li data-step="'+i+'"><button type="button" data-plan-locate="'+E(s.id)+'">'+E(by(s.id)?.t||s.node?.t||'原卡片已移除')+'</button><button type="button" data-plan-up="'+i+'" '+(!i?'disabled':'')+' aria-label="上移第 '+(i+1)+' 张卡片">↑</button><button type="button" data-plan-down="'+i+'" '+(i===steps.length-1?'disabled':'')+' aria-label="下移第 '+(i+1)+' 张卡片">↓</button><button type="button" data-plan-remove="'+i+'" aria-label="移除第 '+(i+1)+' 张卡片">移除</button><input aria-label="第 '+(i+1)+' 步的连接理由" placeholder="'+(i?'为什么接在前一张之后？':'从这个论点开始的理由')+'" value="'+E(s.reason)+'"></li>').join('')
 }
 root.oninput=e=>{const row=e.target.closest('[data-step]');if(row)steps[Number(row.dataset.step)].reason=e.target.value};
 root.onclick=async e=>{const button=e.target.closest('button');if(!button)return;e.preventDefault();
  const d=button.dataset;
  if(d.planLocate){if(!by(d.planLocate)){root.querySelector('[role=status]').textContent='原卡片已移除；保存记录仍保留原内容。';return}if(inlineStudio&&!await inlineStudio.close())return;for(let n=by(d.planLocate);n?.p;n=by(n.p))by(n.p).closed=false;showPage('map',d.planLocate);return}
  if('planAdd' in d){const id=select.value;if(!id)return;if(steps.some(s=>s.id===id)){root.querySelector('[role=status]').textContent='这张卡片已在链条中。';return}steps.push({id,reason:''})}
  if('planRemove' in d)steps.splice(Number(d.planRemove),1);
  if('planUp' in d||'planDown' in d){const i=Number(d.planUp??d.planDown),j=i+('planUp' in d?-1:1);[steps[i],steps[j]]=[steps[j],steps[i]]}
  paint();root.dispatchEvent(new Event('input',{bubbles:true}))
 };
 paint();return {read:()=>({steps:steps.map(({id,reason})=>({id,reason})),brief:brief.value})}
}
