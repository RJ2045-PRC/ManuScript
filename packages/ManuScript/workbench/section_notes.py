"""Per-heading writing notes, stored beside the manuscript in each version."""
import re
from bisect import bisect_right
from difflib import SequenceMatcher
from itertools import accumulate

from draft_context import read


def matches_heading(source, at, heading):
    if type(at) is not int or not isinstance(heading, str) or not heading or not 0 <= at < len(source):
        return False
    prefix = source[source.rfind('\n', 0, at)+1:at]
    end=at+len(heading)
    return (prefix in ('', ' ', '  ', '   ') and source.startswith(heading, at)
            and (end==len(source) or source[end:end+1] in ('\r','\n') or heading.startswith('\\')))


def save_note(notes, edit, source):
    at, heading = edit['at'], edit['heading']
    if not matches_heading(source, at, heading):
        raise ValueError('章节位置已变化，请核对当前稿')
    current = next((n for n in notes if n['at'] == at), None)
    if (current['text'] if current else '') != edit['before']:
        raise ValueError('写作备注已在其他位置变化，请保留输入并核对最新备注')
    value = edit['text']
    if not isinstance(value, str):
        raise ValueError('写作备注必须是文本')
    if current:
        notes.remove(current)
    if value.strip():
        notes.append(dict(at=at, heading=heading, text=value))
    notes.sort(key=lambda n:n['at'])


def relocate(notes, old, new, positions=None):
    if not notes or old == new and positions is None:
        return notes
    if positions is None:
        lines, changed = old.splitlines(True), new.splitlines(True)
        offsets = list(accumulate(map(len, lines), initial=0))
        dest = list(accumulate(map(len, changed), initial=0))
        positions = {}
        wanted = {bisect_right(offsets,n['at'])-1:n for n in notes}
        for tag,a,b,c,d in SequenceMatcher(None, lines, changed, autojunk=False).get_opcodes():
            if tag not in ('equal','replace'):
                continue
            for j in range(a,b):
                n=wanted.get(j)
                if not n or j-a >= d-c:
                    continue
                k=c+j-a
                indent=n['at']-offsets[j]
                at=dest[k]+indent
                heading=n['heading']
                if matches_heading(new,at,heading):
                    positions[n['at']]=(at,heading)
                elif tag=='replace' and (b-a==d-c or b-a==1):
                    line=changed[k].rstrip('\r\n')
                    heading=line.lstrip(' ')
                    at=dest[k]+len(line)-len(heading)
                    if re.match(r'#{1,6}(?:[ \t]|$)|\\(?:sub)*section\*?\{',heading):
                        positions[n['at']]=(at,heading)
                    elif '\n' in n['heading'] and k+1<len(changed) and re.fullmatch(r' {0,3}(?:=+|-+)[ \t]*',changed[k+1].rstrip('\r\n')):
                        positions[n['at']]=(at,(changed[k].lstrip(' ')+changed[k+1]).rstrip('\r\n'))
        # A cut/pasted heading with unique source text can be reattached exactly.
        for n in notes:
            if n['at'] in positions:
                continue
            heading=n['heading']
            if old.count(heading)==1 and new.count(heading)==1:
                at=new.index(heading)
                if matches_heading(new,at,heading):
                    positions[n['at']]=(at,heading)
    else:
        positions = {p['from']:(p['at'],p['heading']) for p in positions}
    result = []
    for n in notes:
        if n['at'] in positions:
            at, heading = positions[n['at']]
            if matches_heading(new,at,heading):
                result.append(dict(n,at=at,heading=heading))
    return sorted(result,key=lambda n:n['at'])


def carry(p, version, positions):
    notes=p.get('sectionNotes',[])
    if notes and p['versions']:
        notes=relocate(notes,read(p['versions'][-1]['blocks'])['text'],read(version['blocks'])['text'],positions)
    if notes or 'sectionNotes' in p:
        p['sectionNotes']=notes
        version['sectionNotes']=notes.copy()
