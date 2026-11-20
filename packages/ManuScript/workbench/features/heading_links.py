"""Author links from current idea cards to exact manuscript heading ranges."""

import re

import map_versions
import manuscript_document
import outline
from project_store import require, uid


OPERATIONS = ('heading_link',)


def context(text, at, before):
    return text[max(0, at - 160):at] if before else text[at:at + 160]


def handle(db, project, role, op, args):
    require(role == 'author', '构思卡关联需要作者本人操作')
    team = map_versions.team(db, project)
    node_id = args.get('node')
    nodes = team.get('map') or outline.seed(project)
    require(any(n['id'] == node_id and node_id != 'root' and not n.get('ghost') for n in nodes), '构思卡已移除')
    links = team.setdefault('headingLinks', {})
    previous = links.get(node_id)
    target = args.get('target')
    if target is not None:
        link = prepare_link(project, target)
        if previous and all(previous[key] == link[key] for key in ('rev', 'from', 'quote')):
            return {'headingLinks': links, 'headingLinksRev': team.get('headingLinksRev', 0)}
    else:
        link = None

    if previous or link:
        require((previous or {}).get('id') == args.get('base'), '关联已变化，请重新打开构思卡')
        if link:
            links[node_id] = link
        else:
            del links[node_id]
        team['headingLinksRev'] = team.get('headingLinksRev', 0) + 1
        map_versions.store(db, project, team)
    return {'headingLinks': links, 'headingLinksRev': team.get('headingLinksRev', 0)}


def prepare_link(project, target):
    doc = manuscript_document.read(project['blocks'])
    require(isinstance(target, dict) and target.get('rev') == doc['rev'], '正文已变化，请重新选择小标题')
    start, end, quote = target.get('start'), target.get('end'), target.get('quote')
    text = doc['text']
    require(type(start) is int and type(end) is int and 0 <= start < end <= len(text)
            and isinstance(quote, str) and text[start:end] == quote, '小标题与当前正文位置不符')
    title = target.get('title')
    require(isinstance(title, str) and title.strip(), '请选择小标题')
    if doc['format'] == 'tex':
        heading = re.fullmatch(r'\\(?:section|subsection|subsubsection)\*?\{[^}\n]+\}', quote)
    else:
        heading = re.match(r' {0,3}#{1,6}(?:[ \t]|$)', quote) or re.search(r'\n {0,3}(?:=+|-+)[ \t\r]*$', quote)
    require(heading, '请选择正文中的 Markdown 或 LaTeX 标题')
    offset = len(text[:start].encode('utf-16-le', 'surrogatepass')) // 2
    return dict(id=uid(), rev=doc['rev'], **{'from': offset}, quote=quote, title=title[:240], unique=text.count(quote) == 1,
                before=context(text, start, True), after=context(text, end, False),
                atStart=start == 0, atEnd=end == len(text))
