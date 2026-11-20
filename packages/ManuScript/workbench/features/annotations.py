"""annotations operations. Caller owns authorization gate and transaction commit."""
from project_store import now, uid, require, save

OPERATIONS = ["draft_context","draft_note","draft_note_delete"]

def handle(db, p, role, op, a):
    own = role == "author"
    if op in ('draft_context','draft_note','draft_note_delete'):
        import draft_context
        if op=='draft_context':return draft_context.context(p,a)
        require(own,'批注只由作者修改')
        draft_context.delete_note(p,a) if op=='draft_note_delete' else draft_context.save_note(p,a,uid,now);save(db,p);return draft_context.context(p,{'version':a['version']})
    raise ValueError("Unsupported annotations operation: " + op)


def caption_change(p, evidence, new_text):
    """Verify a single selected replacement against the head, including duplicate captions."""
    import draft_context
    require(isinstance(evidence,dict) and evidence.get('version')==p['versions'][-1]['id'],
            '所据稿件已变化，请保留摘录并重新选择图注')
    excerpt=evidence.get('excerpt'); caption=evidence.get('caption')
    require(isinstance(excerpt,str) and excerpt.strip() and len(excerpt)<=8000,'请粘贴 1 至 8000 字的实验表摘录')
    require(isinstance(caption,str) and caption.strip(),'图注不能为空')
    ref=draft_context.anchor(p,evidence)
    old=draft_context.read(p['blocks'])['text']; start=ref['documentStart']
    require(new_text==old[:start]+caption+old[ref['documentEnd']:],'图注之外的正文有变化，请重新核对')
    return dict(documentStart=start,documentEnd=start+len(caption),quote=caption)

def attach_excerpt(p,target,excerpt):
    import draft_context
    rec=draft_context.save_note(p,dict(target,version=p['versions'][-1]['id']),uid,now)
    rec['pastedExcerpt']=excerpt
