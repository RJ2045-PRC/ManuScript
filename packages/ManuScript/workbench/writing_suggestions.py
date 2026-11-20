"""Immutable Agent manuscript candidates; only the author resolves them into a draft."""
import copy,hashlib,json,uuid

def need(ok,msg):
    if not ok:raise ValueError(msg)
def baseline(p,bid,rev):
    need(type(rev)==int and rev>=0,'需要有效的正文基线修订号')
    for v in reversed(p['versions']):
        b=next((b for b in v['blocks'] if b['id']==bid and b['rev']==rev),None)
        if b:return dict(block=bid,rev=rev,version=v['id'],title=b['title'],text=b['text'],format=b['format'])
    need(False,'找不到该块的基线版本，请先读取正文')
def remember(p,j):
    if j['kind']!='写作':return
    role=j.get('role','writer');token=j.get('assignmentRev',0)
    history=j.setdefault('assignments',[])
    if not any(x['role']==role and x['taskRev']==token for x in history):
        history.append(dict(role=role,taskRev=token,base=baseline(p,j['block'],j['rev'])))
def assignment(p,j,role,token):
    need(type(token)==int,'需要领取任务时的任务修订号')
    current=j.get('role','writer')==role and j.get('assignmentRev',0)==token
    if current:
        return dict(role=role,taskRev=token,base=baseline(p,j['block'],j['rev']))
    saved=next((x for x in j.get('assignments',[]) if x['role']==role and x['taskRev']==token),None)
    need(saved is not None,'不能代其他角色交付，或任务修订号不存在')
    return saved

def receive(p,role,name,base,result,now,job=None,token=None):
    text=result.get('text');need(isinstance(text,str) and 0<len(text)<=100000,'候选正文长度须为 1–100000 字符')
    # Keep the full result, including unverified references, instead of throwing it away.
    raw=json.dumps(result,ensure_ascii=False,sort_keys=True);need(len(raw)<=300000,'交付内容过大，请拆分候选稿')
    key=hashlib.sha256(json.dumps([role,base['block'],base['rev'],job and job['id'],token,raw],ensure_ascii=False).encode()).hexdigest()
    rows=p.setdefault('writingSuggestions',[]);old=next((s for s in rows if s['key']==key),None)
    if old:return receipt(old)
    b=next((b for b in p['blocks'] if b['id']==base['block']),None)
    reasons=[]
    if not b:reasons.append('原正文已移出当前稿')
    elif b['rev']!=base['rev']:reasons.append('正文已更新')
    if job and (job.get('role','writer')!=role or job.get('assignmentRev',0)!=token):reasons.append('任务已重新分派')
    row=dict(id=uuid.uuid4().hex[:16],key=key,block=base['block'],title=base['title'],format=base['format'],actorRole=role,actor=name,base=copy.deepcopy(base),result=copy.deepcopy(result),text=text,status='待核对',reasons=reasons,received=now,receivedVersion=p['versions'][-1]['id'],receivedRev=b['rev'] if b else None,task=job['id'] if job else None,taskRev=token)
    rows.append(row)
    if job:
        job.setdefault('suggestions',[]).append(row['id'])
        if job['status']=='待执行' and job.get('role','writer')==role and job.get('assignmentRev',0)==token:
            job.update(status='已交付',result=copy.deepcopy(result),delivered=now)
    p['seq']+=1;p['events'].append(dict(op='writing_suggestion',actor=role,id=row['id'],block=row['block'],time=now))
    return receipt(row)
def receipt(row):
    return dict(suggestion=row['id'],changed=row['base']['text']!=row['text'],block=row['block'],title=row['title'],status=row['status'],conflicts=row['reasons'],applied=False,message='完整候选稿已保存，等待作者核对；当前正文未改变')
def listing(p,bid=None):
    return [dict(id=s['id'],block=s['block'],title=s['title'],actor=s['actor'],status=s['status'],reasons=s['reasons'],received=s['received']) for s in reversed(p.get('writingSuggestions',[])) if not bid or s['block']==bid]
def detail(p,sid):
    s=next((s for s in p.get('writingSuggestions',[]) if s['id']==sid),None);need(s,'建议不存在')
    b=next((b for b in p['blocks'] if b['id']==s['block']),None)
    return dict(suggestion=copy.deepcopy(s),current=copy.deepcopy(b),version=p['versions'][-1]['id'])
