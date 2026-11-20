"""Resolve ManuScript equation markers on an export copy of the saved draft."""
import re


AUTO = 'manuscript:auto'
_TAG = re.compile(r'\\tag(\*)?\s*\{([^{}\n]*)\}')
_TAIL = re.compile(r'[ \t]+\(([0-9]+[A-Za-z]?(?:[.-][0-9]+)*)\)[ \t]*(?=\r?\n|$)')
_FENCE = re.compile(r'(?m)^ {0,3}(?P<mark>\x60{3,}|~{3,})[^\n]*(?:\n|$)')
_CODE = re.compile(r'(?<!\x60)(\x60+)(?!\x60)[\s\S]*?(?<!\x60)\1(?!\x60)')
_COMMENT = re.compile(r'\\[\s\S]|%[^\r\n]*')
_TEX_LITERAL = re.compile(
    r'\\(?:begin\{(verbatim\*?|lstlisting|minted)\}[\s\S]*?\\end\{\1\}'
    r'|verb\*?([^a-zA-Z\s])[^\n]*?\2|[\s\S])|%[^\r\n]*'
)
_MD_DISPLAY = re.compile(r'\$\$|(?<!\$)\$(?!\$)')
_TEX_DISPLAY = re.compile(r'\\begin\{(equation\*?|displaymath|math)\}|\\[\[(]|\$\$|(?<!\$)\$(?!\$)')


def _blank(value):
    return re.sub(r'[^\r\n]', ' ', value)


def _escaped(text, offset):
    start = offset
    while start and text[start - 1] == '\\':
        start -= 1
    return (offset - start) % 2 == 1


def _markdown_segments(text):
    """Keep fenced blocks and code spans out of the equation scan."""
    offset = 0
    while opening := _FENCE.search(text, offset):
        mark = opening['mark']
        closing = re.compile(r'(?m)^ {0,3}' + mark[0] + '{' + str(len(mark)) + r',}[ \t]*(?:\r?$)')
        end = closing.search(text, opening.end())
        yield offset, opening.start()
        offset = end.end() if end else len(text)
    yield offset, len(text)


def _equations(text, latex):
    if latex:
        masked = _TEX_LITERAL.sub(lambda m: _blank(m[0]) if m[1] or m[2] or m[0].startswith('%') else m[0], text)
        segments = [(0, masked)]
    else:
        segments = [(start, _CODE.sub(lambda m: _blank(m[0]), text[start:end]))
                    for start, end in _markdown_segments(text)]
    for start, segment in segments:
        pattern = _TEX_DISPLAY if latex else _MD_DISPLAY
        offset = 0
        while opening := pattern.search(segment, offset):
            offset = opening.end()
            left = opening[0]
            if _escaped(segment, opening.start()) or (left.startswith('$') and opening.start() and segment[opening.start()-1] == '$'):
                continue
            env = opening[1] if latex else None
            close = '\\end{' + env + '}' if env else {'\\[': '\\]', '\\(': '\\)'}.get(left, left)
            inline = left in ('$', '\\(') or env == 'math'
            end = segment.find(close, offset)
            while end >= 0 and (_escaped(segment, end) or (close == '$' and (
                    segment[end-1] == '$' or segment[end+1:end+2] == '$'))):
                end = segment.find(close, end+1)
            if end == -1 or (left == '$' and '\n' in segment[offset:end]) or not segment[offset:end].strip():
                continue
            body = text[start+offset:start+end]
            body_at = start+offset
            offset = end+len(close)
            if inline:
                continue
            masked_body = _COMMENT.sub(lambda m: _blank(m[0]) if m[0].startswith('%') else m[0], body)
            tag = next((m for m in _TAG.finditer(masked_body) if not _escaped(masked_body, m.start())), None)
            tail = _TAIL.match(text, start+offset) if tag is None else None
            number = tag[2].strip() if tag else tail[1] if tail else ''
            if tag and not tag[1] and number == AUTO:
                yield body_at+tag.start(), body_at+tag.end(), None
            elif re.fullmatch(r'[0-9]+', number) and len(number.lstrip('0')) < 16:
                yield None, None, int(number)
            elif env == 'equation' and not tag and not re.search(r'\\(?:notag|nonumber)(?![a-zA-Z])', masked_body):
                yield None, None, None


def materialize(blocks, fmt, version_blocks):
    if not any(AUTO in block['text'] for block in blocks):
        return blocks
    basis = {block['id']: list(_equations(block['text'], block['format'] == 'tex')) for block in version_blocks}
    fixed = {number for equations in basis.values() for _, _, number in equations if number is not None}
    native_count = sum(row == (None, None, None) for equations in basis.values() for row in equations)
    fixed.update(range(1, native_count+1))
    assigned = {}
    number = 1
    for block_id, equations in basis.items():
        assigned[block_id] = []
        for start, _, _ in equations:
            if start is None:
                continue
            while number in fixed:
                number += 1
            assigned[block_id].append(number)
            number += 1
    result = []
    for block in blocks:
        text = block['text']
        if AUTO in text:
            slots = [(start, end) for start, end, _ in _equations(text, block['format'] == 'tex') if start is not None]
            for (start, end), number in reversed(list(zip(slots, assigned.get(block['id'], [])))):
                # Word's math converter drops \tag, so include the number in the math run.
                tag = r'\qquad\text{(' + str(number) + ')}' if fmt in ('docx', 'pdf') else r'\tag{' + str(number) + '}'
                text = text[:start] + tag + text[end:]
        result.append({**block, 'text': text})
    return result
