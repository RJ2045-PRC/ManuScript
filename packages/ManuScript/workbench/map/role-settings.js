const toolNames={build_outline:'搭建框架',assign_task:'分派任务',read_block:'读取正文',read_source:'读取原件',find_evidence:'搜查项目证据',read_file:'读取项目文件',write_file:'保存项目文件',write_block:'交付正文',map_arguments:'从正文提取论证',propose_topic:'提出导图建议',team_status:'查看团队分工',deliver_task:'交付指定任务'}
function adoptRoles(){
 if(!state.roles)return
 for(const k of Object.keys(descriptions))delete descriptions[k]
 for(const r of Object.values(state.roles)){labels[r.id]=r.name;if(r.enabled)descriptions[r.id]=r.instruction}
 if(room!=='team'&&!descriptions[room])room='lead';if(!descriptions[target])target='writer'
}
async function refreshRoles(){const t=await api('team_state',{project:proj});Object.assign(state,{roles:t.roles,roleRev:t.roleRev,tasks:t.tasks,writers:t.writers,routes:t.routes,pins:t.pins});adoptRoles()}
function roleManagement(){if(!connected)return '';return '<div class="roleActions"><button data-role-new>创建角色</button><button data-role-assign>任务分工</button><button data-role-discuss>与主 Agent 核对分工</button></div><details class="teammeta"><summary>权限作用范围</summary>角色可读取本项目资料。写入须同时满足角色范围、任务范围和宿主权限。外部 MCP / 宿主工具仍按 DSH 授权。</details>'+Object.values(state.roles||{}).filter(r=>!r.builtin&&!r.enabled).map(r=>'<p>'+E(r.name)+' · 已停用 <button data-role-edit="'+r.id+'">调整角色</button></p>').join('')}
function roleDialog(title){const d=document.createElement('dialog');d.className='roleDialog';d.innerHTML='<form><h3>'+E(title)+'</h3><div data-fields></div><p class="roleError" role="status"></p><footer><button type="button" data-cancel>取消</button><button type="submit">保存</button></footer></form>';document.body.append(d);d.querySelector('[data-cancel]').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d}
async function editRole(key){
 try{await refreshRoles()}catch(e){notice=e.message;drawer();return}
 const project=proj,old=state.roles[key],base=state.roleRev,d=roleDialog(old?'调整角色':'创建角色'),field=d.querySelector('[data-fields]')
 field.innerHTML='<label>角色名称<input name="name" maxlength="40" required></label><label>职责类型<select name="kind" '+(old?'disabled':'')+'>'+['支持','执行','验收','内审'].map(x=>'<option>'+x+'</option>').join('')+'</select></label><label>职责与交付要求<textarea name="instruction" maxlength="3000" required rows="5"></textarea></label><p>交付给主 Agent。验收与内审不获得写入工具；类型创建后固定。范围只限制已勾选的写入工具。</p><fieldset><legend>可用项目工具</legend><div data-tools></div></fieldset><label>可写正文块（多选；不选表示全部，作者始终可直接编辑）<select name="blocks" multiple>'+state.writers.map(b=>'<option value="'+E(b.block)+'">'+E(b.title)+' · '+E(b.block)+'</option>').join('')+'</select></label><label>可写项目文件（每行一个文件名；* 表示全部；留空不能写文件）<textarea name="files" rows="2"></textarea></label><label><input name="enabled" type="checkbox" checked> 启用角色</label>'
 const form=d.querySelector('form'),el=n=>form.elements.namedItem(n)
 if(old){for(const id of old.blocks.filter(id=>!state.writers.some(b=>b.block===id)))el('blocks').add(new Option('已移除正文 · '+id,id));for(const n of ['name','kind','instruction'])el(n).value=old[n];el('files').value=old.files.join('\n');el('enabled').checked=old.enabled;for(const o of el('blocks').options)o.selected=old.blocks.includes(o.value)}
 el('name').focus();
 const tools=()=>{const template=state.roles[{支持:'support',执行:'writer',验收:'review',内审:'audit'}[el('kind').value]];field.querySelector('[data-tools]').innerHTML=template.tools.map(t=>'<label><input type="checkbox" name="tool" value="'+t+'" '+((old?old.tools:template.tools).includes(t)?'checked':'')+'>'+E(toolNames[t]||t)+'</label>').join('')};el('kind').onchange=tools;tools()
 form.onsubmit=async e=>{e.preventDefault();const save=form.querySelector('[type=submit]');save.disabled=true;try{await api('role_save',{project,base,...(old?{id:old.id}:{}),name:el('name').value,kind:el('kind').value,instruction:el('instruction').value,tools:[...form.querySelectorAll('[name=tool]:checked')].map(x=>x.value),blocks:[...el('blocks').selectedOptions].map(o=>o.value),files:el('files').value.split('\n').map(s=>s.trim()).filter(Boolean),enabled:el('enabled').checked});await refreshRoles();d.close();drawer()}catch(e){d.querySelector('.roleError').textContent=e.message}finally{save.disabled=false}}
}
async function assignRoles(){
 try{await refreshRoles()}catch(e){notice=e.message;drawer();return}
 const project=proj,d=roleDialog('任务分工');d.querySelector('footer [type=submit]').remove();d.querySelector('[data-cancel]').textContent='关闭'
 const fields=d.querySelector('[data-fields]'),err=d.querySelector('.roleError')
 async function render(){await refreshRoles();fields.innerHTML='<p>作者可直接编辑正文。此处只查看和重派 Agent 任务；交付先保存为候选稿，核对后采用。</p><h4>未完任务</h4>'+state.tasks.filter(j=>j.status==='待执行').map(j=>'<div class="roleAssignment" data-task="'+E(j.id)+'"><b>'+E(j.kind+' · '+j.instruction)+'</b><small>当前：'+E(labels[j.role]||j.role)+'</small><select aria-label="任务 '+E(j.id)+' 的接手角色">'+Object.values(state.roles).filter(r=>r.enabled).map(r=>'<option value="'+r.id+'" '+(j.role===r.id?'selected':'')+'>'+E(r.name)+'</option>').join('')+'</select><button type="button" data-reassign="'+E(j.id)+'">重新分派</button></div>').join('')}
 fields.onclick=async e=>{const b=e.target.closest('button');if(!b)return;b.disabled=true;err.textContent='';try{if(b.dataset.reassign){const j=state.tasks.find(x=>x.id===b.dataset.reassign);await api('role_assign',{project,id:j.id,taskRev:j.taskRev,fromRole:j.role,assignee:b.parentElement.querySelector('select').value,instruction:j.instruction})}await render();await sync(project,await api('team_state',{project}))}catch(e){err.textContent=e.message}finally{b.disabled=false}}
 await render()
}
