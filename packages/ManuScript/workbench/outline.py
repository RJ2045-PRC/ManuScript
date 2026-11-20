"""Append editable branches in one project transaction. Never replace an author's tree."""
def seed(p):
    return [dict(id='root',p=None,t=p['title'],origin='user')]+[dict(id=b['id'],p=b.get('parent') or 'root',t=b['title'],assets=[b['id']],origin='unknown') for b in p['blocks']]

def put(p,t,a,block,check,snapshot):
    nodes=t.get('map') or seed(p)
    by={n['id']:n for n in nodes}; known={b['id'] for b in p['blocks']}; parent=a.get('parent') or 'root'
    if parent not in by:raise ValueError('所选主题已移除，请重新选择')
    if a.get('onlyEmpty') and len(nodes)>1:raise ValueError('已有地图，未覆盖')
    rows=a['rows']
    if not isinstance(rows,list) or not 1<=len(rows)<=120:raise ValueError('每次需要 1–120 个主题路径')
    made=[];matched=[]
    for row in rows:
        path=row['path']
        if not isinstance(path,list) or not 1<=len(path)<=6 or not all(isinstance(x,str) and 0<len(x.strip())<=120 for x in path):raise ValueError('主题路径无效')
        pid=parent
        for i,s in enumerate(path):
            title=s.strip();old=next((n for n in nodes if n['p']==pid and n['t']==title),None)
            if old:pid=old['id'];continue
            detail=str(row.get('detail',''))[:1800] if i==len(path)-1 else ''
            b=block(title,parent=pid if pid in known else None);b['purpose']=detail;b['origin']={'actor':'Agent','turn':a.get('turn')};p['blocks'].append(b);known.add(b['id'])
            n=dict(id=b['id'],t=title,p=pid,detail=detail,origin='agent',assets=[b['id']],turn=a.get('turn'),closed=False)
            if a.get('source'):n['source']=a['source']
            nodes.append(n);by[n['id']]=n;made.append(n['id']);pid=n['id']
        matched.append(pid)
    # First-level overview: show the chapters at a readable scale, expand for subtopics.
    if len(made)>10:
        for k in made:
            if by[k]['p']==parent and any(n['p']==k for n in nodes):by[k]['closed']=True
    if made:
        by[parent]['closed']=False;t['map']=check(nodes);t['mapRev']=t.get('mapRev',0)+1
        snapshot(p,'Agent 搭建框架：'+str(len(made))+' 个主题',actor='Agent',origin='统筹 Agent')
    return dict(count=len(made),ids=matched,added=[by[by[k]['p']]['t']+' → '+by[k]['t'] for k in made],version=p['versions'][-1]['id'],mapRev=t.get('mapRev',0),parent=parent)

def merge(before,local,remote):
    """Apply only the author's changed fields to the latest tree, preserving concurrent branches."""
    import copy
    old={n['id']:n for n in before};new={n['id']:n for n in local};cur={n['id']:copy.deepcopy(n) for n in remote}
    if len(new)!=len(local):raise ValueError('重复节点')
    for k,n in old.items():
        if k not in new:
            if k in cur and cur[k]!=n:raise ValueError('将删除的主题已有更新，请重新载入')
            cur.pop(k,None)
    for k,n in new.items():
        if k not in old:
            if k in cur and cur[k]!=n:raise ValueError('主题标识冲突')
            cur[k]=copy.deepcopy(n);continue
        if n==old[k]:continue
        if k not in cur:raise ValueError('所编辑主题已移除')
        unset=object()
        for f in set(n)|set(old[k]):
            a=old[k].get(f,unset);b=n.get(f,unset);c=cur[k].get(f,unset)
            if a==b:continue
            if c!=a and c!=b:raise ValueError('同一主题已被修改，请重新载入核对')
            if b is unset:cur[k].pop(f,None)
            else:cur[k][f]=b
    return [cur[n['id']] for n in local if n['id'] in cur]+[n for k,n in cur.items() if k not in new]

def arguments(p,t,a,uid,check,snapshot):
    """Append traceable argument nodes without making manuscript sections out of quotations."""
    nodes=t.get('map') or seed(p); b=next((b for b in p['blocks'] if b['id']==a['block']),None)
    if not b or b['rev']!=a.get('rev'):raise ValueError('正文已变化，请重读后标注')
    parent=next((n for n in nodes if n['id']==b['id']),None)
    if not parent:raise ValueError('章节已从地图移除')
    rows=a.get('points')
    if not isinstance(rows,list) or not 1<=len(rows)<=12:raise ValueError('每章需要 1–12 个论证节点')
    out=[]; version=p['versions'][-1]['id']
    for r in rows:
        title=r['title'].strip(); quote=r['quote'];kind=r['kind']
        if not 0<len(title)<=110 or kind not in ('主张','依据','限制','下一步') or not 5<=len(quote)<=1500 or b['text'].count(quote)!=1:raise ValueError('每条需要短标题、类型和正文中唯一的连续原文')
        if any(n['p']==parent['id'] and n.get('anchor',{}).get('quote')==quote and n.get('kind')==kind for n in nodes):continue
        n=dict(id=uid(),p=parent['id'],t=title,origin='agent',kind=kind,assets=[b['id']],anchor=dict(block=b['id'],rev=b['rev'],version=version,quote=quote),detail=quote)
        nodes.append(n);out.append(n['id'])
    if out:
        t['map']=check(nodes);t['mapRev']=t.get('mapRev',0)+1
        snapshot(p,'提取正文论证：'+b['title'],actor='Agent',origin='正文论证')
    added_ids=set(out)
    added=[parent['t']+' → '+n['t'] for n in nodes if n['id'] in added_ids]
    return dict(count=len(out),ids=out,added=added,mapRev=t.get('mapRev',0),version=p['versions'][-1]['id'])
