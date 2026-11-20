"""Project role policy. Checked inside the same transaction as every Agent write."""
from pathlib import Path
import copy,json,re,uuid
BUILTINS=json.loads((Path(__file__).with_name('roles.json')).read_text())
TOOLS={'team_outline':'build_outline','team_arguments':'map_arguments','team_proposal':'propose_topic','artifact_read':'read_file','artifact_write':'write_file','chat_write_block':'write_block','source_read':'read_source','evidence_search':'find_evidence','role_status':'team_status','role_assign':'assign_task','deliver':'deliver_task'}
KINDS={'写作':'writer','审查':'review','搜证':'research','解释':'helper','支持':'support','内审':'audit','框架':'lead','拆解':'lead','摘要':'lead','统筹':'lead'}
LIMITS={kind:set(BUILTINS[key]['tools']) for kind,key in [('执行','writer'),('支持','support'),('验收','review'),('内审','audit')]}
def need(ok,msg):
    if not ok:raise ValueError(msg)
def roster(p):
    need(isinstance(p.get('customRoles',{}),dict) and not set(p.get('customRoles',{}))&set(BUILTINS),'内置角色不可由项目配置覆盖')
    return dict(copy.deepcopy(BUILTINS),**copy.deepcopy(p.get('customRoles',{})))
def member(p,key,active=True):
    r=roster(p).get(key);need(r is not None,'未知项目角色')
    need(not active or r['enabled'],'角色已停用，请交回主 Agent 重新分派')
    return r
def can_block(r,bid):return not r['blocks'] or bid in r['blocks']
def tool(p,key,name,a):
    if name=='deliver_task':
        j=next((j for j in p['jobs'] if j['id']==a.get('id') and j['kind']=='写作'),None)
        if j:
            import writing_suggestions
            writing_suggestions.assignment(p,j,key,a.get('taskRev'))
            return member(p,key,active=False)
    r=member(p,key);need(name in r['tools'],'角色「'+r['name']+'」无权调用 '+name)
    if name in ('write_block','map_arguments'):need(can_block(r,a.get('block')),'超出角色的正文写入范围')
    if name=='write_file':need('*' in r['files'] or a.get('name') in r['files'],'超出角色的项目文件写入范围')
    return r

def guard(p,op,a):
    # Read-only legacy project discovery remains available; mutation needs a trusted role.
    key=a.get('actorRole')
    if op=='role_check':
        tool(p,key,a['tool'],a);return
    if op in ('source_read','evidence_search','artifact_read','role_status') and not key:return
    if op in TOOLS:
        r=tool(p,key,TOOLS[op],a)
        a['actor']=r['name']
    elif key:member(p,key)

def allowed_job(p,key,kind,b=None):
    r=member(p,key);need('deliver_task' in r['tools'],'角色不能交付任务')
    expected={'写作':'执行','审查':'验收','搜证':'支持','解释':'支持','支持':'支持','内审':'内审','框架':'统筹','拆解':'统筹','摘要':'统筹','统筹':'统筹'}
    need(r['kind']==expected.get(kind) or (kind=='写作' and key=='lead'),'角色职责与任务类型冲突')
    if kind=='写作':
        need('write_block' in r['tools'] and b and can_block(r,b['id']),'角色没有此块的写作权限')

    if kind=='审查':
        need(b and key not in b.get('contributors',[]) and b.get('lastWriter')!=key,'执行者不能独立验收自己的交付')

    return r

def validate_custom(p,a):
    key=a.get('id') or 'custom-'+uuid.uuid4().hex[:12]
    need(re.fullmatch(r'custom-[a-f0-9]{12}',key),'内置角色不可修改')
    old=p.get('customRoles',{}).get(key)
    if a.get('id'):need(old,'自建角色不存在')
    need(old or len(p.get('customRoles',{}))<30,'每项目最多 30 个自建角色')
    name=a.get('name','').strip();instruction=a.get('instruction','').strip();kind=a.get('kind')
    need(0<len(name)<=40 and 0<len(instruction)<=3000,'请填写角色名称（40字内）与职责（3000字内）')
    need(all(r['name']!=name for k,r in roster(p).items() if k!=key),'角色名称已使用')
    need(kind in LIMITS and (not old or kind==old['kind']),'角色类型创建后不可切换；请新建独立角色')
    ts=a.get('tools');bs=a.get('blocks',[]);fs=a.get('files',[])
    need(isinstance(ts,list) and all(isinstance(t,str) and t in LIMITS[kind] for t in ts),'工具权限与职责冲突；验收或内审不可拥有写入或分派工具')
    known={x['id'] for x in p['blocks']}|{x['id'] for v in p['versions'] for x in v['blocks']}
    need(isinstance(bs,list) and all(isinstance(b,str) and b in known for b in bs),'正文范围包含不存在的块')
    need(isinstance(fs,list) and len(fs)<=100 and all(isinstance(f,str) and (f=='*' or re.fullmatch(r'[^/\\\x00-\x1f]{1,160}',f) and f not in ('.','..')) for f in fs),'文件范围只接受项目文本文件名或 *')
    enabled=a.get('enabled',True);need(type(enabled)==bool,'启用状态无效')
    if old:
        pending=[j for j in p['jobs'] if j['status']=='待执行' and j.get('role',KINDS.get(j['kind']))==key]
        need(enabled or not pending,'此角色仍有未完任务，请先重新分派')
    return dict(id=key,name=name,kind=kind,instruction=instruction,tools=list(dict.fromkeys(ts)),blocks=list(dict.fromkeys(bs)),files=list(dict.fromkeys(fs)),enabled=enabled,builtin=False,reportsTo='lead')

def status(p):
    return dict(roles=roster(p),roleRev=p.get('roleRev',0),tasks=[dict(id=j['id'],kind=j['kind'],taskRev=j.get('assignmentRev',0),role=j.get('role',KINDS.get(j['kind'])),block=j['block'],status=j['status'],instruction=j['instruction'],result=j.get('result')) for j in p['jobs']],writers=[dict(block=b['id'],title=b['title'],writer=b['writer'],role=b.get('writerRole','writer') if b['writer']=='agent' else None,rev=b['rev']) for b in p['blocks']])
