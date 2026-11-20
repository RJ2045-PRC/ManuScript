"""Word handoff operations; transaction and role guard belong to engine."""
import base64, hashlib
from project_store import require, get, blob, snapshot, save
OPERATIONS = ["word_export", "word_preview", "word_apply"]

def handle(db, p, role, op, a):
    own = role == "author"
    blocks = p["blocks"]
    B = lambda: get(blocks, a.get("block"))
    head = lambda: p["versions"][-1]["id"]
    if op in ('word_export','word_preview','word_apply'):
        import wordrefs
        require(own,'需作者处理 Word 交接')
        if op=='word_export':return wordrefs.export(db,p,[B()] if a.get('block') else [b for b in blocks if b['text']],blob)
        raw=base64.b64decode(a['data'],validate=True)
        if op=='word_apply':require(a.get('version')==head(),'核对期间项目已变，请重新预览')
        digest=hashlib.sha256(raw).hexdigest();previous=p.get('wordImports',{}).get(digest)
        if previous:return dict(previous,version=head(),applied=True)
        report=wordrefs.inspect(db,p,raw,op=='word_apply')
        if op=='word_apply' and report['rows']:
            p.setdefault('wordImports',{})[digest]=report; snapshot(p,'Word 引文导回：核对受影响的草稿句');save(db,p)
        return dict(report,version=head())
    raise ValueError("Unsupported Word operation: " + op)
