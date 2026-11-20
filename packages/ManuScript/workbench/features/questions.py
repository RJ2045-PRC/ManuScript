"""Reply-linked notes live with manuscript annotations, never in a block's text."""
import copy
import draft_context as drafts
from project_store import now,uid,require,save

OPERATIONS=['question_record','question_excerpt']

def new_note(p,ref):
    ref=drafts.anchor(p,ref)
    if ref['version']==p['versions'][-1]['id']:
        return dict(ref,id=uid(),actor='author',message='',time=now(),originReference=ref)
    # A draft may advance while a question is queued. Only relocate an exact,
    # unique quotation in its original block; otherwise retain the source.
    head=p['versions'][-1];doc=drafts.read(head['blocks'])
    span=next((s for s in doc['spans'] if s['block']==ref['block']),None)
    if span:
        body=doc['text'][span['start']:span['end']]
        if body.count(ref['quote'])==1:
            start=span['start']+body.index(ref['quote'])
            return dict(drafts.anchor(p,dict(version=head['id'],documentStart=start,documentEnd=start+len(ref['quote']),quote=ref['quote'])),id=uid(),actor='author',message='',time=now(),originReference=ref)
    return dict(ref,id=uid(),actor='author',message='',time=now(),unresolved=True,originReference=ref)

def handle(db,p,role,op,a):
    require(role=='binding','追问只能关联已绑定的 DSH 回复')
    head=p['versions'][-1];current=drafts.notes(p,head)
    sid=a['sid'];rid=a.get('request');changed=False
    existing={n['qa']['key']:n for n in current if n.get('qa') and n['qa']['sid']==sid}
    ids=[n['id'] for n in current]
    if op=='question_excerpt':
        rows=[(a['key'],None)]
    else:
        rows=[(r.get('thread') or rid+':'+str(i),r) for i,r in enumerate(a['refs'])]
    for key,ref in rows:
        old=existing.get(key)
        if not old:
            if op=='question_excerpt':raise ValueError('这条旁注不在当前稿或当前会话中')
            if ref.get('thread') or any(n.get('qa',{}).get('key')==key for n in p['notes']):continue # removed, never recreate
            n=new_note(p,ref);n['qa']=dict(key=key,sid=sid,role=a['role'],question=a['question'],turns=[],excerpt='',source=None)
        else:n=copy.deepcopy(old)
        q=n['qa']
        if op=='question_excerpt':
            require(any(t.get('seq')==a['seq'] for t in q['turns']) or a.get('selectedTarget') is True,'请选择这段摘录所属的旁注')
            q.update(excerpt=a['excerpt'],source=a['seq'],manual=True)
        else:
            turn=next((t for t in q['turns'] if t['request']==rid),None)
            if not turn:
                turn=dict(request=rid,question=a['question'],status='等待回复');q['turns'].append(turn)
            if a.get('ended'):
                turn.update(status='已回答' if a.get('seq') is not None else '未取得完整回复',seq=a.get('seq'))
                if not q['excerpt'] and a.get('excerpt'):q.update(excerpt=a['excerpt'],source=a['seq'])
        if old and old['qa']==q:continue
        if old:
            n.update(id=uid(),supersedes=old['id'],updatedAt=now());ids[ids.index(old['id'])]=n['id']
        else:ids.append(n['id'])
        p['notes'].append(n);changed=True
    if changed:head['draftNotes']=ids;save(db,p)
    return changed
