"""Author-confirmed idea maps. Notes and model turns never pass through the commit operation."""
import copy, hashlib, json, re
import outline

def fingerprint(nodes):
    return hashlib.sha256(json.dumps(nodes,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

def team(db,p):
    row=db.execute('select body from teamspace where id=?',(p['id'],)).fetchone()
    return json.loads(row[0]) if row else dict(pins=[],routes={},rooms={},map=None)

def store(db,p,t):
    db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)))

def freeze(p,t,nodes,source_nodes,summary,now,**fields):
    """Pair immutable manuscript ID and notes with this map in the caller's transaction."""
    log=t.setdefault('ideaHistory',[])
    latest=p['versions'][-1]
    number=len(log)+1
    source_hash=fingerprint(source_nodes)
    refs={'base:'+source_hash,'v'+str(number)}
    inherited=set()
    if log and fingerprint(log[-1]['map'])==source_hash:
        refs.add('v'+str(number-1))
        inherited={c['key'] for c in log[-1].get('mapNotes',[])}
    targets={n['id']:n for n in nodes}
    comments=[c for c in t.get('ideaComments',[]) if c['id'] in targets
              and (c['kind']=='node' or c['parent']==targets[c['id']].get('p'))
              and not c.get('onHistory')
              and (c['key'] in inherited or c['ref'] in refs or c.get('confirmedRef') in refs)]
    # Freeze the exact annotation revisions displayed for this Draft.
    import draft_context
    manuscript_notes=[n['id'] for n in draft_context.notes(p,latest)]
    version=dict(number=number,time=now(),summary=summary,map=nodes,draftVersion=latest['id'],
                 mapNotes=copy.deepcopy(comments),manuscriptNotes=manuscript_notes,**fields)
    log.append(version)
    return version

def paired_checkpoint(db,p,label,now):
    t=team(db,p);nodes=t.get('map') or outline.seed(p)
    freeze(p,t,nodes,nodes,label,now)
    store(db,p,t)

def node_record(p,v,key):
    n=next((n for n in v['map'] if n['id']==key),None)
    if n is None:raise ValueError('这版导图没有该节点')
    d=next((d for d in p['versions'] if d['id']==v.get('draftVersion')),None)
    if not d:return dict(paired=False)
    ids={(n.get('anchor') or {}).get('block'),key,*n.get('assets',[])}
    keys=set(v['manuscriptNotes'])
    blocks=[dict(id=b['id'],title=b['title'],text=b['text'],rev=b['rev'],
                 notes=[note for note in p['notes'] if note['id'] in keys and note['block']==b['id']])
            for b in d['blocks'] if b['id'] in ids]
    return dict(paired=True,draft=d['id'],label=v['summary'],blocks=blocks,
                comments=[c for c in v['mapNotes'] if c['id']==key])

def dispatch(db,p,t,op,a,check,now):
    nodes=t.get('map') or outline.seed(p)
    log=t.get('ideaHistory',[])
    def index():
        return [{k:v[k] for k in ('number','time','summary')} for v in reversed(log)]
    if op=='idea_history':return index()
    if op in ('idea_version','idea_node_record'):
        number=a['number']
        if type(number)!=int or not 1<=number<=len(log):raise ValueError('找不到该版导图')
        v=log[number-1]
        return node_record(p,v,a['node']) if op=='idea_node_record' else v
    if op in ('idea_context','idea_reply','idea_record_reply'):
        db.execute("create table if not exists idea_replies (project text, key text, body text not null, primary key(project,key))")
        def reply_index():
            return [r[0] for r in db.execute("select key from idea_replies where project=? order by rowid",(p['id'],))]
        if op=='idea_reply':
            row=db.execute("select body from idea_replies where project=? and key=?",(p['id'],a['key'])).fetchone()
            if not row:raise ValueError('没有找到这轮导图差异')
            return json.loads(row[0])
        if op=='idea_record_reply':
            v=a['snapshot']
            if not isinstance(v,dict) or not all(isinstance(v.get(k),list) for k in ('before','after')) or not isinstance(a.get('key'),str) or len(a['key'])>200:raise ValueError('无效的导图预览')
            db.execute("insert into idea_replies values (?,?,?)",(p['id'],a['key'],json.dumps(v,ensure_ascii=False)))
            op='idea_sent'
    if op=='idea_context':
        same=bool(log) and fingerprint(nodes)==fingerprint(log[-1]['map'])
        return dict(map=nodes,base=fingerprint(nodes),history=index(),currentVersion=len(log) if same else None,currentNoteKeys=[c['key'] for c in log[-1].get('mapNotes',[])] if same else [],replies=reply_index(),comments=t.get('ideaComments',[]))
    if op in ('idea_annotate','idea_unannotate','idea_sent'):
        comments=t.setdefault('ideaComments',[])
        if op=='idea_annotate':
            v=a['comment']
            limits=dict(key=64,id=160,parent=160,side=8,ref=128,version=100,kind=8,intent=8,target=500,text=2000)
            if not all(isinstance(v.get(k),str) and len(v[k])<=n for k,n in limits.items()) or not v['text'].strip() or not v['key'] or v['kind'] not in ('node','edge') or v['intent'] not in ('批注','提问','请求修改') or v['side'] not in ('left','right'):raise ValueError('批注格式无效')
            if not any(c['key']==v['key'] for c in comments):comments.append(dict(**{k:v[k] for k in limits},time=now(),sent=False,onHistory=v.get('onHistory') is True))
        else:
            keys=set(a['keys'])
            if op=='idea_unannotate':comments[:]=[c for c in comments if c['sent'] or c['key'] not in keys]
            else:
                for c in comments:
                    if c['key'] in keys:c['sent']=True
        db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)))
        return comments
    if op not in ('idea_prepare','idea_confirm'):raise ValueError('未知导图操作')
    if a['base']!=fingerprint(nodes):raise ValueError('项目导图已变化，本次未写入。请关闭预览，重新打开并核对。')
    anchor=a['anchor']; before={n['id']:n for n in nodes}
    if anchor not in before:raise ValueError('所选主题已移除')
    after=copy.deepcopy(before); changes=a['changes'];removed=a['removed']; summary=a.get('summary','')
    if op=='idea_confirm' and (not isinstance(summary,str) or not 0<len(summary.strip())<=300):raise ValueError('缺少简要更新说明')
    if not isinstance(changes,list) or not isinstance(removed,list) or not 0<len(changes)+len(removed)<=100:raise ValueError('没有可确认的变化或改动过多')
    def inside(key,tree):
        seen=set()
        while key in tree and key not in seen:
            if key==anchor:return True
            seen.add(key);key=tree[key].get('p')
        return False
    seen=set(); diff=[]
    for v in changes:
        k=v['id'];parent=v['p'];title=v['t'];rel=v['rel']
        if k in seen or k==anchor or not all(isinstance(x,str) for x in (k,parent,title,rel)) or not 0<len(title.strip())<=120 or len(rel)>80:raise ValueError('导图改动无效')
        old=before.get(k)
        if old and (not inside(k,before) or old.get('group') or old.get('ghost') or old.get('anchor')):raise ValueError('不能替换其他分支或带原文定位的节点')
        if not old and not re.fullmatch('idea-[0-9a-f-]{36}',k):raise ValueError('新节点标识无效')
        seen.add(k);n=after.setdefault(k,dict(id=k,origin='agent'));n.update(p=parent,t=title.strip(),relation=rel.strip())
        if not old or any(n[f]!=old.get(f,'') for f in ('p','t','relation')):
            diff.append(dict(id=k,before=[old.get(f,'') for f in ('p','t','relation')] if old else None,after=[n[f] for f in ('p','t','relation')]))
    for k in removed:
        if k in seen or k==anchor or k not in before or not inside(k,before) or not k.startswith('idea-'):raise ValueError('只能移除本分支的构思节点')
        seen.add(k);diff.append(dict(id=k,before=[before[k].get(f,'') for f in ('p','t','relation')],after=None));del after[k]
    if not diff:raise ValueError('导图没有变化')
    if not all(inside(v['id'],after) for v in changes):raise ValueError('不能将预览移出讨论分支')
    checked=check(list(after.values()))
    for n in after['root'].get('summaries',[]):
        if any(k in removed for k in n.get('members',[])):raise ValueError('节点仍有关联概要')
    previous={n['id']:n for n in log[-1]['map']} if log else before
    def values(n,tree):
        if n is None:return None
        return dict(title=n['t'],parent=tree.get(n.get('p'),{}).get('t'),relation=n.get('relation',''))
    def structure(n):
        return None if n is None else (n.get('p'),n['t'],n.get('relation',''))
    facts=[dict(before=values(previous.get(k),previous),after=values(after.get(k),after))
           for k in dict.fromkeys([*after,*previous]) if structure(previous.get(k))!=structure(after.get(k))]
    if op=='idea_prepare':return dict(previous=len(log),total=len(facts),facts=facts)
    t['map']=checked;t['mapRev']=t.get('mapRev',0)+1
    number=len(log)+1
    if isinstance(a.get('draftId'),str):
        for c in t.get('ideaComments',[]):
            if c['ref'].startswith('draft:'+a['draftId']+':'):
                c['confirmedRef']='v'+str(number)
    freeze(p,t,checked,nodes,summary.strip(),now,changes=diff,versionChanges=facts)
    store(db,p,t)
    return dict(number=number,map=checked,mapRev=t['mapRev'])
