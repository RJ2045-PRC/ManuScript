"""reading operations. Caller owns authorization gate and transaction commit."""
from pathlib import Path
from project_store import require, get, blob

OPERATIONS = ["open_reference_pdf","writing_fold","reading_context"]

def handle(db, p, role, op, a):
    own = role == "author"
    blocks = p["blocks"]
    B = lambda: get(blocks, a.get("block"))
    head = lambda: p["versions"][-1]["id"]
    if op=='open_reference_pdf':
        require(own,'仅供作者打开本机阅读器')
        from pdf_reader import open_edition
        cache=Path(db.execute('pragma database_list').fetchone()[2]).parent/'reader-cache'
        return open_edition(p,a,lambda sha:blob(db,sha),cache)
    if op=='writing_fold':
        from writing_fold import revision_rows
        b=B();require(own and b['rev']==a['rev'],'正文版本已变化，请重新打开本章')
        return revision_rows(b,p)
    if op=='reading_context':
        b=B();require(own and b['rev']==a['rev'],'正文版本已变化，请重新打开本章')
        return dict(paper=p['title'],chapter=b['title'])
    raise ValueError("Unsupported reading operation: " + op)
