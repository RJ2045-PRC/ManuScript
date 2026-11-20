"""Version-bound document references and copy-on-write manuscript annotations."""
import copy, difflib
from manuscript_document import read as read_document, prefix

def read(blocks):
    # Legacy per-chapter projects may mix formats; note carry must not block their saves.
    if len({b["format"] for b in blocks})<=1:return read_document(blocks)
    text="";spans=[]
    for i,b in enumerate(blocks):
        pre=prefix(b,blocks,i);start=len(text);text+=pre+b["text"]
        spans.append(dict(block=b["id"],start=start,body=start+len(pre),end=len(text)))
    return dict(text=text,spans=spans,format="md")

def version(p, key=None):
    return next(v for v in p['versions'] if v['id']==(key or p['versions'][-1]['id']))

def notes(p, v):
    if not p['notes']:return []
    doc=read(v['blocks']);out=[];keys=set(v.get('draftNotes',[]))
    for n in p['notes']:
        if 'draftNotes' in v:
            if n['id'] not in keys:continue
        else:
            old=version(p,n['version']);b=next((b for b in old['blocks'] if b['id']==n['block']),None)
            cur=next((b for b in v['blocks'] if b['id']==n['block']),None)
            if p['versions'].index(old)>p['versions'].index(v) or not b or not cur or b['rev']!=cur['rev']:continue
        item=copy.deepcopy(n);item['project']=p['id'];item['version']=v['id']
        if item.get('originReference'):item['originReference']['project']=p['id']
        if 'documentStart' not in item:
            span=next((s for s in doc['spans'] if s['block']==n['block']),None)
            if not span:continue
            item.update(documentStart=span['body']+n['start'],documentEnd=span['body']+n['end'])
        item.setdefault('file','draft.tex' if doc['format']=='tex' else 'draft.md')
        item.setdefault('lineStart',doc['text'][:item['documentStart']].count('\n')+1)
        item.setdefault('lineEnd',doc['text'][:item['documentEnd']].count('\n')+1)
        out.append(item)
    return out

def anchor(p, a):
    v=version(p,a['version']); doc=read(v['blocks']); i=a['documentStart']; j=a['documentEnd']
    if type(i)!=int or type(j)!=int or not 0<=i<j<=len(doc['text']) or doc['text'][i:j]!=a['quote']:
        raise ValueError('选区与所据 Draft 不一致，请重新选择原文')
    span=next(s for s in doc['spans'] if s['start']<=i<s['end'])
    return dict(project=p['id'],version=v['id'],block=span['block'],documentStart=i,documentEnd=j,
                start=i-span['body'],end=j-span['body'],quote=a['quote'],
                lineStart=doc['text'][:i].count('\n')+1,lineEnd=doc['text'][:j].count('\n')+1,
                file='draft.tex' if doc['format']=='tex' else 'draft.md')

def context(p,a):
    v=version(p,a.get('version'));doc=read(v['blocks'])
    out=dict(project=p['id'],title=p['title'],version=v['id'],currentVersion=p['versions'][-1]['id'],
             text=doc['text'],spans=doc['spans'],notes=notes(p,v),references=v.get('references',{}))
    if 'documentStart' in a:out['selection']=anchor(p,a)
    if a.get('block') and 'documentStart' not in a:
        b=next(b for b in v['blocks'] if b['id']==a['block'])
        out.update(block=b['id'],title=b['title'],text=b['text'],rev=b['rev'],writer=b['writer'],
                   notes=[n for n in out['notes'] if n['block']==b['id']])
    return out

def text_changes(before,after,section_change):
    if section_change:
        start=0
        for left,right in zip(before,after):
            if left!=right:break
            start+=1
        old_end,new_end=len(before),len(after)
        while min(old_end,new_end)>start and before[old_end-1]==after[new_end-1]:
            old_end-=1
            new_end-=1
        # A title edit or insertion only changes a small region. Pin the exact
        # surrounding text so repeated prose does not add to the diff cost.
        if max(old_end,new_end)-start<=512:
            ops=[('equal',0,start,0,start)] if start else []
            ops.extend((tag,a+start,b+start,c+start,d+start)
                       for tag,a,b,c,d in difflib.SequenceMatcher(
                           None,before[start:old_end],after[start:new_end],autojunk=False).get_opcodes())
            if old_end<len(before):ops.append(('equal',old_end,len(before),new_end,len(after)))
            return ops
    return difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes()


def carry(p,v,uid,section_change=False,exact=False):
    if not p['versions']:v['draftNotes']=[];return
    old=p['versions'][-1]
    # Freeze the legacy membership before making the next version.
    previous=notes(p,old);old['draftNotes']=[n['id'] for n in previous]
    if not previous:v['draftNotes']=[];return
    doc=read(v['blocks'])
    before=read(old['blocks'])['text'];after=doc['text']
    ops=text_changes(before,after,section_change)
    spans=[difflib.Match(a,c,b-a) for tag,a,b,c,_ in ops if tag=='equal']
    v['draftNotes']=[]
    for n in previous:
        item=copy.deepcopy(n);item.update(id=uid(),version=v['id'],inheritedFrom=n['id'])
        i=n.get('documentStart');j=n.get('documentEnd')
        match=next((s for s in spans if i is not None and s.a<=i<j<=s.a+s.size),None)
        overlap=sum(max(0,min(j,s.a+s.size)-max(i,s.a)) for s in spans)>(j-i)/2
        def position(at,bias):
            for tag,a,b,c,d in ops:
                if a==b==at:return d if bias=='start' else c
                if a<=at<b:return c+at-a if tag=='equal' else (d if bias=='start' else c)
                if at==b and bias=='end':return d
            return len(after)
        start=match.b+i-match.a if match else position(i,'start')
        end=match.b+j-match.a if match else position(j,'end')
        anchored = match or (overlap and not n.get('pastedExcerpt') and not n.get('qa'))
        if exact:
            quote = n['quote']
            anchored = (match and before.count(quote) == after.count(quote) == 1
                        and after[start:end] == quote
                        and any(s['block'] == n['block'] and s['start'] <= start < end <= s['end'] for s in doc['spans']))
        if anchored and start<end and not n.get('unresolved'):
            item.update(documentStart=start,documentEnd=end,quote=after[start:end])
            item.pop('unresolved',None)
            span=next(s for s in doc['spans'] if s['start']<=item['documentStart']<s['end'])
            item.update(block=span['block'],start=item['documentStart']-span['body'],end=item['documentEnd']-span['body'],lineStart=after[:item['documentStart']].count('\n')+1,lineEnd=after[:item['documentEnd']].count('\n')+1)
        else:
            item['unresolved']=True
            item.setdefault('originReference',{k:n[k] for k in ('project','version','block','documentStart','documentEnd','quote','file','lineStart','lineEnd')})
        p['notes'].append(item);v['draftNotes'].append(item['id'])

def save_note(p,a,uid,now):
    v=version(p,a['version'])
    if v is not p['versions'][-1]:raise ValueError('稿件版本已变化，保留批注输入，请重新核对当前稿')
    current=notes(p,v);message=a.get('message','').strip()
    if len(message)>8000:raise ValueError('批注不能超过 8000 字')
    if a.get('id'):
        old=next((n for n in current if n['id']==a['id']),None)
        if not old:raise ValueError('批注已被修改，请重新打开；本次输入未覆盖')
        rec=dict(old,id=uid(),message=message,updatedAt=now(),supersedes=old['id'])
        current=[n for n in current if n['id']!=old['id']]
    else:
        rec=dict(anchor(p,a),id=uid(),message=message,actor='author',time=now())
    p['notes'].append(rec);v['draftNotes']=[n['id'] for n in current]+[rec['id']]
    return rec


def delete_note(p,a):
    v=version(p,a['version'])
    if v is not p['versions'][-1]:raise ValueError('稿件版本已变化，请核对当前批注')
    current=notes(p,v)
    if not any(n['id']==a['id'] for n in current):raise ValueError('批注已被修改，请重新打开')
    v['draftNotes']=[n['id'] for n in current if n['id']!=a['id']]
