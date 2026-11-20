"""Explicit author Draft checkpoints, separate from internal recovery snapshots."""
import copy, hashlib, json
import draft_context, manuscript_document
from project_store import now, require, save, snapshot

OPERATIONS = ['draft_info', 'draft_author', 'draft_checkpoint']

def fingerprint(p):
    fields = ('id','parent','title','text','format','documentPrefix','refs','purpose','writingPlan')
    data = dict(blocks=[{k:b[k] for k in fields if k in b} for b in p['blocks']],
                references=p.get('references',{}), exhibits=p.get('exhibits',{}),
                author=p.get('settings',{}).get('manuscriptAuthor',''),
                notes=[{**{k:n.get(k) for k in ('quote','message','documentStart','documentEnd','unresolved')},
                        **({'pastedExcerpt':n['pastedExcerpt']} if 'pastedExcerpt' in n else {})}
                       for n in draft_context.notes(p,p['versions'][-1])])
    if p.get('sectionNotes'):data['sectionNotes']=p['sectionNotes']
    return hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def info(p):
    drafts=p.get('manuscriptDrafts',[])
    return dict(author=p['settings'].get('manuscriptAuthor',''), drafts=copy.deepcopy(drafts),
                changed=bool(drafts and drafts[-1]['fingerprint']!=fingerprint(p)),
                documentRev=manuscript_document.read(p['blocks'])['rev'])

def handle(db,p,role,op,a):
    require(role=='author','稿件署名和 Draft 由作者管理')
    if op=='draft_info':return info(p)
    if op=='draft_author':
        name=a.get('name','')
        require(isinstance(name,str) and len(name.strip())<=200,'作者署名最多 200 字')
        require(a.get('base','')==p['settings'].get('manuscriptAuthor',''),'作者署名已变化，请重新打开')
        p['settings']['manuscriptAuthor']=name.strip()
        save(db,p);return info(p)
    if op=='draft_checkpoint':
        require(a.get('rev')==manuscript_document.read(p['blocks'])['rev'],'正文已变化，请先保存并核对当前稿，再保存 Draft')
        drafts=p.setdefault('manuscriptDrafts',[]);key=fingerprint(p)
        if drafts and drafts[-1]['fingerprint']==key:return dict(info(p),created=False)
        label='Draft '+str(len(drafts)+1).zfill(2)
        version=snapshot(p,label,'Draft',True)
        record=dict(id=label,version=version,author=p['settings'].get('manuscriptAuthor',''),time=now(),fingerprint=key)
        drafts.append(record)
        # Notes edit the current head. Keep it separate so the signed checkpoint
        # and its annotation membership remain immutable even before text edits.
        snapshot(p,'继续编辑 · '+label,'工作稿')
        p['events'].append(dict(op=op,actor='author',time=record['time'],version=version))
        save(db,p);return dict(info(p),created=True)
    raise ValueError('Unknown draft operation')
