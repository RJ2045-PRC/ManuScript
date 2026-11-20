"""Read a specific revision of the manuscript for structure reading translation."""
import re

from project_store import get, require

OPERATIONS = ('translation_source',)


def handle(db, p, role, op, args):
    require(role == 'author', '翻译仅供作者从结构阅读发起')
    block = get(p['blocks'], args.get('block'))
    version = p['versions'][-1]['id']
    require(args.get('version') == version and args.get('rev') == block['rev'],
            '正文已更新，请重开结构阅读后再翻译')
    text = block['text']
    selection = args.get('selection')
    if selection is not None:
        require(isinstance(selection, dict), '选区无法读取，请重新选择原文')
        start, end = selection.get('start'), selection.get('end')
        require(type(start) is int and type(end) is int and 0 <= start < end <= len(text)
                and text[start:end] == selection.get('quote'), '原句位置已变化，请重新选择原文')
        text = text[start:end]
    parts = [part.strip() for part in re.split(r'\n\s*\n', text) if part.strip()
             and not re.fullmatch(r'!\[[^\n]*\]\([^\n]*\)|#{1,6}|(?:>\s*)+', part.strip())]
    require(parts, '这部分没有可翻译的正文')
    require(sum(map(len, parts)) <= 6500 and len(parts) <= 40,
            '这章超过单次翻译范围，请在正文对照里选一段原文翻译')
    return dict(title=block['title'], version=version, rev=block['rev'], parts=parts)
