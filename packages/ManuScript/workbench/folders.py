"""Local bindings never travel in exported projects or manuscript revisions."""
from pathlib import Path
import uuid,json,os
def dispatch(db,op,a,make):
    db.execute('create table if not exists lx_folder(project text primary key,path text unique not null)')
    db.execute('create table if not exists lx_session(project text,workspace text,role text,sid text unique,ready integer default 0,primary key(project,workspace,role))')
    db.execute('create table if not exists lx_card(project text primary key,category text,description text,hidden integer default 0)')
    db.execute('create table if not exists lx_request(sid text,requestId text,body text,primary key(sid,requestId))')
    if op=='request_save':
        db.execute('insert or replace into lx_request values(?,?,?)',(a['sid'],a['requestId'],json.dumps(a['body'])));return True
    if op=='request_read':
        r=db.execute('select body from lx_request where sid=? and requestId=?',(a['sid'],a['requestId'])).fetchone()
        return json.loads(r[0]) if r else None
    if op=='request_list':return {k:json.loads(v) for k,v in db.execute('select requestId,body from lx_request where sid=?',(a['sid'],))}
    pid=a.get('project')
    if op=='removed':return [dict(id=i,title=t,path=f) for i,t,f in db.execute('select p.id,p.title,f.path from projects p join lx_card m on m.project=p.id left join lx_folder f on f.project=p.id where m.hidden=1')]
    if op=='restore_card':
        db.execute('update lx_card set hidden=0 where project=?',(pid,));return True
    if op=='library':
        rows=[]
        for i,t,f,c,d,purpose,first in db.execute("""select p.id,p.title,f.path,m.category,m.description,
          json_extract(p.body,'$.blocks[0].purpose'),json_extract(p.body,'$.blocks[0].title')
          from projects p left join lx_folder f on f.project=p.id left join lx_card m on m.project=p.id
          where coalesce(m.hidden,0)=0 order by p.rowid desc"""):
            group=c or ('Paper-review' if '综述' in t or 'review' in t.lower() else '其他')
            rows.append(dict(id=i,title=t,path=f,category=group,description=d or purpose or first or '尚未填写项目简述'))
        return rows
    if op in ('metadata','remove'):
        if not db.execute('select 1 from projects where id=?',(pid,)).fetchone():raise ValueError('项目不存在')
        if op=='remove':
            if a.get('confirmed')!=pid:raise ValueError('请确认从项目库移除')
            db.execute('insert into lx_card(project,hidden) values(?,1) on conflict(project) do update set hidden=1',(pid,));return True
        c=str(a.get('category','')).strip();d=str(a.get('description','')).strip()
        if not (0<len(c)<=50 and len(d)<=500):raise ValueError('类别限 50 字，简介限 500 字')
        db.execute('insert into lx_card(project,category,description) values(?,?,?) on conflict(project) do update set category=excluded.category,description=excluded.description',(pid,c,d));return True
    if op=='bind':
        raw=a['path'].strip(); folder=Path(raw).expanduser()
        if not folder.is_absolute():raise ValueError('请输入本地文件夹的绝对路径')
        folder=folder.resolve()
        if folder==Path(folder.anchor):raise ValueError('请选择项目专用的文件夹')
        row=db.execute('select project from lx_folder where path=?',(str(folder),)).fetchone()
        old=db.execute('select path from lx_folder where project=?',(pid,)).fetchone()
        if old and old[0]!=str(folder) or row and pid and row[0]!=pid:raise ValueError('这个文件夹或项目已经存在其他绑定')
        if row:pid=row[0]
        p=db.execute('select title,body from projects where id=?',(pid,)).fetchone()
        if pid and not p:raise ValueError('原项目不存在')
        if a.get('create') and not folder.exists():folder.mkdir(mode=0o700)
        if not folder.is_dir():raise ValueError('找不到项目文件夹；请检查它是否已移动')
        if not pid:pid=make(a.get('title','').strip() or folder.name)['id']
        db.execute('insert or ignore into lx_folder values(?,?)',(pid,str(folder)))
        # A read-only starting point for the host Agent. Never overwrite user files.
        if not row:
            data=json.loads(p[1]) if p else {'title':a.get('title') or folder.name,'blocks':[]}
            snap=folder/('ManuScript-'+pid+'-建档快照.md')
            try:
                with snap.open('x') as f:
                    f.write('# '+data['title']+'\n\n建档时的正文快照。当前稿及版本请在 ManuScript 中查看。\n')
                    for b in data['blocks']:f.write('\n## '+b['title']+'\n\n'+b['text']+'\n')
                snap.chmod(0o400)
            except FileExistsError:pass
        db.execute('update lx_card set hidden=0 where project=?',(pid,))
        return dict(id=pid,path=str(folder),reused=bool(row))
    if op=='bindings':return [dict(workspace=w,role=r,sid=s) for w,r,s in db.execute('select workspace,role,sid from lx_session where project=? and ready=1',(pid,))]
    if op=='reply_previews':
        row=db.execute('select project from lx_session where sid=? and ready=1',(a['sid'],)).fetchone()
        if not row:return None
        keys=[]
        if db.execute("select 1 from sqlite_master where type='table' and name='idea_replies'").fetchone():
            prefix=a['sid']+':'
            keys=[int(k[len(prefix):]) for k, in db.execute('select key from idea_replies where project=? and key glob ?', (row[0],prefix+'*')) if k[len(prefix):].isdigit()]
        questions=[k for k, in db.execute("select requestId from lx_request where sid=? and json_extract(body,'$.question') is not null",(a['sid'],))]
        return dict(project=row[0],keys=keys,questions=questions)
    if op=='lookup':
        r=db.execute('select project,role from lx_session where sid=? and ready=1',(a['sid'],)).fetchone()
        return dict(project=r[0],role=r[1]) if r else None
    bound=db.execute('select path from lx_folder where project=?',(pid,)).fetchone()
    if not bound:raise ValueError('项目尚未绑定本地文件夹')
    if op=='folder':return bound[0]
    key=(pid,a['workspace'],a['role'])
    if op=='reserve':
        db.execute('insert or ignore into lx_session(project,workspace,role,sid) values(?,?,?,?)',(*key,'session-'+str(uuid.uuid4())))
    elif op=='ready':db.execute('update lx_session set ready=1 where project=? and workspace=? and role=? and sid=?',(*key,a['sid']))
    else:raise ValueError('未知的绑定操作')
    sid,ready=db.execute('select sid,ready from lx_session where project=? and workspace=? and role=?',key).fetchone()
    return dict(sid=sid,ready=bool(ready))
