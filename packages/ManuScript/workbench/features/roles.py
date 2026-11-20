"""roles operations. Caller owns authorization gate and transaction commit."""
import copy
import role_policy, writing_suggestions
from project_store import now, require, get, newjob, save

OPERATIONS = ["role_status","role_save","role_assign"]

def handle(db, p, role, op, a):
    own = role == "author"
    agent = role == "agent"
    blocks = p["blocks"]
    if op=='role_status':return role_policy.status(p)
    if op=='role_save':
        require(own,'角色配置只由作者修改')
        require(a.get('base')==p.get('roleRev',0),'角色配置已变化，请重新打开设置')
        r=role_policy.validate_custom(p,a);p.setdefault('customRoles',{})[r['id']]=r;p['roleRev']=p.get('roleRev',0)+1
        p['events'].append(dict(op=op,actor='author',time=now(),role=r['id'],revision=p['roleRev'],definition=copy.deepcopy(r)))
        save(db,p);return role_policy.status(p)
    if op=='role_assign':
        require(own or agent,'需要作者或主 Agent')
        old=get(p['jobs'],a['id']) if a.get('id') else None
        require(not old or old['status']=='待执行','只能重新分派未完任务')
        if old:require(a.get('fromRole')==old.get('role',role_policy.KINDS[old['kind']]) and a.get('taskRev')==old.get('assignmentRev',0),'任务分工已变化，请重新读取')
        require(old or a.get('kind') in ('写作','搜证','审查','支持','内审'),'新分派任务类型无效')
        kind=old['kind'] if old else a['kind'];bid=old['block'] if old else a.get('block');b=get(blocks,bid) if bid else None
        who=a['assignee'];role_policy.allowed_job(p,who,kind,b)
        instruction=a.get('instruction','').strip();require(instruction and len(instruction)<=8000,'需要明确的任务要求')
        require(not (kind=='写作' and any(j['status']=='待执行' and j['kind']=='写作' and j['block']==bid and j is not old for j in p['jobs'])),'此块已有待执行写作任务')
        if old:writing_suggestions.remember(p,old)
        j=old or newjob(p,kind,bid,instruction,{})
        j.update(role=who,instruction=instruction,rev=b['rev'] if b else None,assignmentRev=j.get('assignmentRev',0)+1)
        writing_suggestions.remember(p,j)
        p['events'].append(dict(op=op,actor=a.get('actorRole','author'),time=now(),task=j['id'],assignee=who))
        save(db,p);return j

    raise ValueError("Unsupported roles operation: " + op)
