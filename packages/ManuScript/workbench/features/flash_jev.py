"""Project opt-in and private recall records. Not part of manuscript snapshots or exports."""
import heapq, json, re, time
from project_store import require

OPERATIONS = ['jev_state', 'jev_toggle', 'jev_claim', 'jev_finish', 'jev_correct', 'jev_search']

def terms(s):
    out=set()
    for word in re.findall(r'[\u3400-\u9fff]+|[a-z0-9]+',s.casefold()):
        if ord(word[0])>=0x3400:
            out.update(word[i:i+2] for i in range(len(word)-1))
        elif len(word)>1: out.add(word)
    return out

def search(db,pid,query,recent):
    q=terms(query)
    rows=db.execute("""select s.sid,s.role,t.seq,t.body,t.correction,t.rowid from ms_jev_turn t
        join lx_session s on s.sid=t.sid where s.project=? and s.ready=1 and t.status='record' order by t.rowid desc""",(pid,))
    def matches():
        for sid,role,seq,body,c,idx in rows:
            b=json.loads(body)
            fields=[(c,4),(b.get('topic',''),3),(b.get('source',{}).get('text',''),2),(b.get('claim',''),1),
                    (' '.join(e['quote'] for e in b.get('evidence',[])),1)]
            overlaps=[q & terms(s) for s,_ in fields]
            hits=len(set().union(*overlaps))
            if not recent and (not hits or (hits<2 and len(q)>1 and not any(w.isascii() or w==query.strip() for w in set().union(*overlaps)))):continue
            score=sum(len(x)*w for x,(_,w) in zip(overlaps,fields)) if not recent else 0
            yield score,idx,dict(**b,sid=sid,role=role,seq=seq,correction=c)
    if recent:
        import itertools
        return [r for _,_,r in itertools.islice(matches(),4)]
    return [r for _,_,r in heapq.nlargest(8,matches())]

def handle(db,p,role,op,a):
    require(role=='binding','仅供 DSH 项目绑定')
    pid=p['id']
    require(db.execute('select 1 from lx_folder where project=?',(pid,)).fetchone(),'项目未绑定')
    db.execute('create table if not exists ms_jev_project(project text primary key,enabled integer,epoch integer,cursors text)')
    db.execute('create table if not exists ms_jev_turn(sid text, seq integer, epoch integer, status text, body text, correction text default "", primary key(sid,seq))')
    enabled,epoch,raw=db.execute('select enabled,epoch,cursors from ms_jev_project where project=?',(pid,)).fetchone() or (0,0,'{}')
    sid=a.get('sid')
    if sid or op in ('jev_correct','jev_claim','jev_finish'):
        require(db.execute('select 1 from lx_session where sid=? and project=? and role=? and ready=1',(sid,pid,a.get('role'))).fetchone(),'回看记录不属于此会话')
    since=json.loads(raw).get(sid,-1)
    if op=='jev_toggle':
        on=a['enabled'];require(type(on) is bool,'缺少开关状态')
        if bool(enabled)!=on:
            cursors=a.get('cursors',{})
            if on:
                existing={s for s, in db.execute('select sid from lx_session where project=? and ready=1',(pid,))}
                require(existing==set(cursors) and all(type(i) is int and i>=-1 for i in cursors.values()),'会话列表已改变，请重新开启')
            db.execute('insert or replace into ms_jev_project values(?,?,?,?)',(pid,int(on),epoch+1,json.dumps(cursors)))
            db.execute("delete from ms_jev_turn where status='pending' and sid in(select sid from lx_session where project=?)",(pid,))
        return on
    if op=='jev_search':
        # A legacy per-session opt-in never grants cross-session access. First explicit project opt-in unlocks old records.
        return dict(enabled=bool(enabled),entries=search(db,pid,str(a.get('query',''))[:2400],a.get('recent') is True) if epoch else [])
    if op=='jev_state':
        last=db.execute('select seq,status,body from ms_jev_turn where sid=? order by seq desc limit 1',(sid,)).fetchone() if sid else None
        return dict(enabled=bool(enabled),since=since,epoch=epoch,latest=_latest(last))
    seq=int(a['seq'])
    if op=='jev_correct':
        text=a['text'].strip();require(epoch and len(text)<=1000,'请先在项目中开启回看，补充限 1000 字')
        require(db.execute("update ms_jev_turn set correction=? where sid=? and seq=? and status='record'",(text,sid,seq)).rowcount==1,'记录不存在')
        return True
    if not enabled or epoch!=a['epoch'] or seq<=since:return False
    if op=='jev_claim':
        return db.execute("insert or ignore into ms_jev_turn(sid,seq,epoch,status,body) values(?,?,?,'pending',?)",(sid,seq,epoch,json.dumps(dict(started=time.time())))).rowcount==1
    if op=='jev_finish':
        require(a['status'] in ('record','skip','failed'),'未知回看状态')
        return db.execute("update ms_jev_turn set status=?,body=? where sid=? and seq=? and epoch=? and status='pending'",(a['status'],json.dumps(a['body'],ensure_ascii=False),sid,seq,epoch)).rowcount==1
    raise ValueError('未知回看操作')

def _latest(row):
    if not row:return None
    seq,status,body=row;body=json.loads(body)
    if status=='pending' and time.time()-body.get('started',0)>300:return dict(seq=seq,status='failed',error='上次回看未完成，可以继续讨论。')
    return dict(seq=seq,status=status,error=body.get('error',''))
