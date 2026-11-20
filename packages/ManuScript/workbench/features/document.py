"""Whole-manuscript editing, local backup and reviewed external import."""

import base64
import difflib
import hashlib
import io
from pathlib import Path
import zipfile

import manuscript_backup
import manuscript_document
from project_store import asset, block, get, record_change, require, snapshot

OPERATIONS = (
    'document_read', 'document_edit', 'document_backup_status', 'document_copy',
    'document_import_preview', 'document_import_apply',
)


def document_projection(p,include_figures=True):
    doc=manuscript_document.read(p['blocks'])
    doc['sectionNotes']=p.get('sectionNotes',[])
    if include_figures:
        import document_figures
        resources,sections=document_figures.catalog(p,p)
        if resources:
            hints=[dict(h,at=s['body']+h['at'],start=s['body']+h['start'])
                   for b,s in zip(p['blocks'],doc['spans'])
                   for h in document_figures.placements(b,sections,resources)]
            doc.update(imageResources=resources,imageHints=hints)
    return doc

def edit(db, p, a, *, imported=False):
    blocks=p['blocks']
    old_revs={b['id']:b['rev'] for b in blocks}
    evidence=a.get('captionEvidence')
    if evidence is not None:
        from features.annotations import caption_change, attach_excerpt
        target=caption_change(p,evidence,a['text'])
    if a.get('undoSectionVersion'):
        require(a.get('expectedSectionNotes')==p.get('sectionNotes',[]),'章节备注已变化，无法撤销此前的操作')
    positions=a.get('sectionPositions')
    note=a.get('writingNote')
    if note is not None:
        from section_notes import save_note
        save_note(p.setdefault('sectionNotes',[]),note,manuscript_document.read(blocks)['text'])
    changed=manuscript_document.write(blocks,a['text'],a.get('rev'),block,a.get('sectionLayout'))
    if not changed and evidence is None and note is None and not positions and not a.get('undoSectionVersion'):
        doc=document_projection(p,bool(a.get('returnDocument')))
        return dict(p,documentRev=doc['rev'],**({'document':doc} if a.get('returnDocument') else {}))
    if changed:
        import document_figures
        document_figures.record_markdown_ownership(p,blocks,old_revs)
    if changed or note is not None or positions or a.get('undoSectionVersion'):
        if imported:
            positions = external_section_positions(p, blocks)
        snapshot(p, '导入外部正文' if imported else ('编辑全文' if changed else '编辑写作备注'),
                 section_positions=positions, exact_notes=imported)
        if a.get('undoSectionVersion'):
            previous=get(p['versions'],a['undoSectionVersion'])
            require(manuscript_document.read(previous['blocks'])['text']==a['text'],'撤销章节基线已变化')
            p['sectionNotes']=p['versions'][-1]['sectionNotes']=previous.get('sectionNotes',[]).copy()
    if evidence is not None:attach_excerpt(p,target,evidence['excerpt'])
    import writing_records
    for b in blocks:
        if b.get('writingPlan') is not None and b['rev']!=old_revs.get(b['id']):
            version = p['versions'][-1]['id']
            asset(db,p,'写作记录-'+b['id']+'-'+version+'.md',writing_records.markdown(p,b),'写作留档',version)
    record_change(db,p,'author','document_import_apply' if imported else 'document_edit',a)
    doc=document_projection(p,bool(a.get('returnDocument')))
    return dict(p,documentRev=doc['rev'],**({'document':doc} if a.get('returnDocument') else {}))

def external_section_positions(p, blocks):
    before = manuscript_document.read(p['versions'][-1]['blocks'])['text']
    after = manuscript_document.read(blocks)['text']
    positions = []
    for note in p.get('sectionNotes', []):
        heading = note['heading']
        if before.count(heading) == after.count(heading) == 1:
            positions.append({'from': note['at'], 'at': after.index(heading), 'heading': heading})
    return positions


def external_text(args, doc):
    ext = Path(args.get('name', '')).suffix.lower()
    require(ext in (('.md', '.markdown') if doc['format'] == 'md' else ('.tex',)),
            '请选择与当前稿件格式一致的 Markdown 或 LaTeX 文件')
    data = args.get('data')
    require(isinstance(data, str) and len(data) <= 4 * ((50 * 1024 * 1024 + 2) // 3), '文件超过 50 MiB 或内容无效')
    try:
        raw = base64.b64decode(data, validate=True)
        text = raw.decode('utf-8-sig')
    except ValueError as error:
        raise ValueError('请选择 UTF-8 编码的正文文件') from error
    require(len(raw) <= 50 * 1024 * 1024 and '\0' not in text, '文件超过 50 MiB 或含有无效字符')
    return text


def preview(doc, text):
    before = doc['text'].splitlines(keepends=True)
    after = text.splitlines(keepends=True)
    groups = difflib.SequenceMatcher(None, before, after).get_grouped_opcodes(3)
    return [
        {'before': group[0][1] + 1, 'after': group[0][3] + 1,
         'parts': [[tag, ''.join(before[i:j]), ''.join(after[k:l])] for tag, i, j, k, l in group]}
        for group in groups
    ]


def editable_copy(db, project):
    files = manuscript_backup.bundle(db, project, project['versions'][-1])
    if len(files) == 1:
        name, data = next(iter(files.items()))
        name = 'manuscript-copy' + Path(name).suffix
    else:
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        name, data = 'manuscript-copy.zip', out.getvalue()
    return {'name': name, 'data': base64.b64encode(data).decode()}


def handle(db, p, role, op, a):
    if op == 'document_read':
        return document_projection(p)
    require(role == 'author', '该操作需要作者本人')
    if op == 'document_edit':
        return edit(db, p, a)
    if op == 'document_backup_status':
        manuscript_backup.enqueue(db, p)
        return {}
    if op == 'document_copy':
        return editable_copy(db, p)
    doc = manuscript_document.read(p['blocks'])
    text = external_text(a, doc)
    digest = hashlib.sha256((p['id'] + doc['rev'] + text).encode()).hexdigest()
    if op == 'document_import_preview':
        return {'rev': doc['rev'], 'digest': digest, 'groups': preview(doc, text)}
    require(a.get('rev') == doc['rev'] and a.get('digest') == digest,
            '当前稿或所选文件已变化，请刷新差异后再确认')
    return edit(db, p, {'text': text, 'rev': doc['rev']}, imported=True)
