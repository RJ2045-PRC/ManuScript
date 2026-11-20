"""A continuous author document projected onto stable legacy block identities.

Prefixes preserve the exact editable headings/separators. No ID markers enter Markdown.
Cross-boundary edits retain old block records (including now-empty ones) for history;
new headings are manuscript text, not automatic changes to the author's mind map.
"""
import difflib, hashlib, json, re
from itertools import accumulate


def prefix(block, blocks, index):
    if 'documentPrefix' in block:
        return block['documentPrefix']
    level, parent, seen = 1, block.get('parent'), set()
    while parent and parent not in seen:
        seen.add(parent)
        level += 1
        parent = next((b.get('parent') for b in blocks if b['id'] == parent), None)
    heading = '#' * min(level, 6) + ' ' + block['title'] + '\n\n'
    if block['format'] == 'tex':
        heading = ('\\subsection' if level > 1 else '\\section') + '{' + block['title'] + '}\n\n'
    return ('\n\n' if index else '') + heading


def read(blocks):
    formats = {b['format'] for b in blocks}
    if len(formats) > 1:
        raise ValueError('混合 Markdown / LaTeX 稿件需要先统一格式，未自动转换原文')
    text, spans = '', []
    for i, b in enumerate(blocks):
        pre = prefix(b, blocks, i)
        start = len(text)
        text += pre + b['text']
        spans.append(dict(block=b['id'], start=start, body=start+len(pre), end=len(text)))
    basis = hashlib.sha256(json.dumps(blocks, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return dict(text=text, rev=basis, spans=spans, format=next(iter(formats), 'md'))


def write(blocks, text, rev, make_block, layout=None):
    old = read(blocks)
    if rev != old['rev']:
        raise ValueError('正文已在其他位置变化，请保留草稿并核对最新稿件后再保存')
    if not isinstance(text, str):
        raise ValueError('正文必须是文本')
    if text == old['text']:
        return False
    if not blocks:
        blocks.append(make_block('正文', text))
        blocks[0]['documentPrefix'] = ''
        blocks[0]['rev'] += 1
        return True
    # Equal regions pin boundaries. A replaced/deleted boundary collapses to its
    # left edge, rather than guessing a new heading/ID from duplicate titles.
    if layout is not None:
        # The outline editor knows which exact ranges moved. Diffing repeated
        # passages would attach block-scoped notes and assets to the wrong text.
        indexed = {b['id']: b for b in blocks}
        ids = [c['block'] for c in layout]
        cuts = [c['start'] for c in layout]
        if (len(ids) != len(blocks) or set(ids) != set(indexed) or
                not all(type(n) is int and 0 <= n <= len(text) for n in cuts) or
                cuts != sorted(cuts) or cuts[0] != 0):
            raise ValueError('章节边界已变化，请重新打开导图')
        for i, b in enumerate(blocks):
            b['documentPrefix'] = prefix(b, blocks, i)
        blocks[:] = [indexed[k] for k in ids]
    else:
        old_lines, new_lines = old['text'].splitlines(keepends=True), text.splitlines(keepends=True)
        old_offsets, new_offsets = list(accumulate(map(len, old_lines), initial=0)), list(accumulate(map(len, new_lines), initial=0))
        ops = [(tag,old_offsets[a],old_offsets[z],new_offsets[c],new_offsets[d])
               for tag,a,z,c,d in difflib.SequenceMatcher(None,old_lines,new_lines,autojunk=False).get_opcodes()]
        def project(pos):
            for tag, a, z, c, d in ops:
                if a <= pos < z:
                    if tag == 'equal':return c + pos-a
                    if tag == 'replace' and max(z-a,d-c)<20000:
                        for kind,x,y,u,v in difflib.SequenceMatcher(None,old['text'][a:z],text[c:d],autojunk=False).get_opcodes():
                            if x<=pos-a<y:return c+u+(pos-a-x if kind=='equal' else 0)
                    return c
            return len(text)
        cuts = [0]
        for i,s in enumerate(old['spans'][1:],1):
            pre=prefix(blocks[i],blocks,i)
            leading=pre[:len(pre)-len(pre.lstrip('\r\n'))]
            at=project(s['start']+len(leading))
            if leading and at>=len(leading) and text[at-len(leading):at]==leading:at-=len(leading)
            cuts.append(max(cuts[-1],at))
    cuts.append(len(text))
    for i, b in enumerate(blocks):
        piece = text[cuts[i]:cuts[i+1]]
        heading = re.match(r'\A(\s*#{1,6}[ \t]+([^\n]+)\n(?:\n)?|\s*\\(?:sub)*section\{([^}\n]+)\}\n(?:\n)?)', piece)
        pre = heading[0] if heading else ''
        title = (heading[2] or heading[3]).strip() if heading else b['title']
        if layout is not None and 'body' in layout[i]:
            offset = layout[i]['body']
            if type(offset) is not int or not cuts[i] <= offset <= cuts[i+1]:
                raise ValueError('章节正文范围无效')
            pre = piece[:offset-cuts[i]]
            title = layout[i].get('title') or title
        body = piece[len(pre):]
        if pre != prefix(b, blocks, i) or body != b['text'] or title != b['title']:
            b.update(documentPrefix=pre, text=body, title=title, rev=b['rev']+1, writer='author', status='撰写中')
            b.pop('writerRole', None)
        else:
            b['documentPrefix'] = pre
    if read(blocks)['text'] != text:
        raise ValueError('全文拆分校验未通过，未保存任何修改')
    return True
