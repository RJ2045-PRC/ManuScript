"""Project-owned images: relative Markdown paths for exchange, immutable sources for pixels."""
import base64, io, json, re
import unicodedata
from pathlib import Path
from urllib.parse import quote, unquote
from PIL import Image
from functools import lru_cache
from editor_preferences import FIGURE_LABELS, FIGURE_LABEL_DEFAULT

@lru_cache(maxsize=1)
def sit_source():
    root=Path(__file__).resolve().parents[1]/'cases/sit-2024'
    return json.loads((root/'guide.json').read_text())['sha'],json.loads((root/'full-article.json').read_text())

def catalog(p,v):
    out={}
    for a in p.get('assets',[]):
        ext=Path(a['name']).suffix.lower().lstrip('.')
        if ext in ('png','jpg','jpeg','webp') and re.fullmatch('[0-9a-f]{64}',a['sha']):
            path='figures/'+a['sha']+'.'+ext
            out[path]=dict(path=path,asset=a['id'],sha=a['sha'],mime='image/'+('jpeg' if ext=='jpg' else ext))
    by_id={a['id']:a for a in p.get('assets',[])}
    for path,asset_id in p.get('figureAliases',{}).items():
        a=by_id.get(asset_id)
        ext=Path(a['name']).suffix.lower() if a else ''
        if ext in ('.png','.jpg','.jpeg','.webp') and MEDIA_PATH.fullmatch(path) and '/' not in unquote(path[8:]) and '\\' not in unquote(path[8:]):
            out[path]=dict(path=path,asset=asset_id,sha=a['sha'],mime='image/'+('jpeg' if ext in ('.jpg','.jpeg') else ext[1:]))
    guide=p.get('readingGuide') or {}
    if not guide:return out,{}
    sha,article=sit_source();key=guide.get('key')
    if guide.get('sha')!=sha or not any(e.get('sha')==sha for e in v.get('references',{}).get(key,{}).get('editions',[])):return out,{}
    for num,f in article['figures'].items():
        path=f'figures/Sit-2024-{num}.png'
        out[path]=dict(path=path,key=key,sha=sha,page=f['page'],rect=f['rect'],caption=f['original'],mime='image/png')
    return out,{s['id']:s['figs'] for s in article['sections']}

def markup(alt,path):
    alt=re.sub(r'([\\\[\]])',r'\\\1',' '.join(alt.split()))
    return f'![{alt}]({path})'

CODE=re.compile(r'(?ms)^ {0,3}(`{3,})[^`\n]*\n.*?(?:^ {0,3}\1`*[ \t]*$|\Z)'
                r'|^ {0,3}(~{3,})[^\n]*\n.*?(?:^ {0,3}\2~*[ \t]*$|\Z)'
                r'|(?<!`)(`+)(?!`).*?(?<!`)\3(?!`)')
MEDIA_PATH=re.compile(r'figures/[\w.%-]+')
DESTINATION=r'(?:<[^<>\n]+>|[^()\s]+)'
TITLE=r'''(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?'''
LINK_DEST=r'\((?P<dest>'+DESTINATION+r')'+TITLE+r'\)'
IMAGE=r'!\[(?:\\.|[^\]\\\n])*\]'+LINK_DEST
FIGURE=re.compile(r'^ {0,3}(?P<image>'+IMAGE+r')[ \t]+<a id="(?P<id>fig-[a-f0-9]{16})"></a>[ \t]*$',re.M)
NUMBERED_LABEL=r'(?:图|Fig\.|Figure) \d+'
CAPTION=re.compile(r'\n[ \t]*\n(?P<mark>\*\*(?:图注|'+NUMBERED_LABEL+r'\.)\*\*)[ \t]*')
REFERENCE=re.compile(r'(?<![!\\])\[(?:图|'+NUMBERED_LABEL+r'|图号待确认)\]\(#(?P<id>fig-[a-f0-9]{16})\)')
IMAGE_LINK=re.compile(IMAGE)
PLAIN_LINK=re.compile(r'(?<![!\\])\[(?:\\.|[^\]\\\n])*\]'+LINK_DEST)
LINK_DEFINITION=re.compile(r'^ {0,3}\[[^\[\]\n]+\]:[ \t]+(?P<dest>'+DESTINATION+r')'+TITLE+r'[ \t]*$',re.M)

def image_path(a):
    return a.get('figurePath') or 'figures/'+a['sha']+Path(a['name']).suffix.lower()

def assign_filename(p,a,name,*,unique=False):
    from project_store import require
    ext=Path(a['name']).suffix.lower()
    require(isinstance(name,str),'请填写有效的图片文件名')
    invalid=r'[/\\:*?"<>|\x00-\x1f\x7f]'
    if unique:name=re.sub(invalid,'-',name)[:110].strip(' .') or '图片'
    require(0<len(name.strip())<=120,'文件名须为 1–120 个字符')
    require(not re.search(invalid,name),'文件名含有无效字符')
    stem=unicodedata.normalize('NFC',name.strip()).rstrip('.')
    if stem.lower().endswith(ext):stem=stem[:-len(ext)].rstrip(' .')
    require(bool(stem) and not stem.startswith('.'),'请填写有效的图片文件名')
    if re.fullmatch(r'(?i:CON|PRN|AUX|NUL|(?:COM|LPT)[1-9])',stem.split('.')[0]):
        require(unique,'请换一个文件名，避免系统保留名称')
        stem='图片-'+stem
    aliases=p.setdefault('figureAliases',{})
    reserved={unquote(path).casefold():ref for path,ref in aliases.items()}
    reserved.update({('figures/'+item['sha']+Path(item['name']).suffix.lower()).casefold():item['id'] for item in p['assets']})
    if stem.lower().startswith('sit-2024-'):
        require(unique,'此文件名前缀用于固定来源图片')
        stem='图片-'+stem
    def available(value):return reserved.get(('figures/'+value+ext).casefold(),a['id'])==a['id']
    if unique:
        base=stem
        count=1
        while not available(stem):
            count+=1
            stem=f'{base}-{count}'
    require(available(stem),'该文件名已在图表库使用，请换一个名称')
    path='figures/'+quote(stem+ext,safe='-._')
    aliases[path]=a['id']
    a.update(name=stem+ext,figurePath=path)
    return path

def path_from(dest):
    path=dest.removeprefix('<').removesuffix('>').removeprefix('./')
    if path.startswith('figures/') and '/' not in path[8:]:
        return 'figures/'+quote(unquote(path[8:]),safe='-._')
    return path

def rewrite_paths(text,old_paths,new):
    protected=[m.span() for m in CODE.finditer(text)]
    replacements=[]
    for matcher in (IMAGE_LINK,PLAIN_LINK,LINK_DEFINITION):
        for m in matcher.finditer(text):
            if path_from(m['dest']) in old_paths and not any(start<=m.start()<end for start,end in protected):
                replacements.append((*m.span('dest'),new))
    for start,end,value in sorted(replacements,reverse=True):
        text=text[:start]+value+text[end:]
    return text

def figure_matches(text):
    protected=[m.span() for m in CODE.finditer(text)]
    return [m for m in FIGURE.finditer(text) if not any(start<=m.start()<end for start,end in protected)]

def figure_numbers(blocks):
    numbers={}
    sequence=0
    for block in blocks:
        if block['format']!='md':continue
        for m in figure_matches(block['text']):
            sequence+=1
            numbers[m['id']]=None if m['id'] in numbers else sequence
    return numbers

def materialize(text,numbers,fmt,style=FIGURE_LABEL_DEFAULT):
    if 'fig-' not in text:return text
    prefix=FIGURE_LABELS.get(style if isinstance(style,str) else FIGURE_LABEL_DEFAULT,FIGURE_LABELS[FIGURE_LABEL_DEFAULT])
    changes=[]
    for m in figure_matches(text):
        number=numbers.get(m['id'])
        label=f'{prefix} {number}.' if number else '图号待确认'
        caption=CAPTION.match(text,m.end())
        if caption:changes.append((*caption.span('mark'),'**'+label+'**'))
        else:changes.append((m.end(),m.end(),'\n\n**'+label+'**'))
        if fmt!='md':
            # Native Pandoc bookmark. The second inline also keeps the alt text from becoming a caption.
            changes.append((m.end('image'),m.end(),f' [\u200b]{{#{m["id"]}}}' if number else ' [\u200b]'))
    protected=[m.span() for m in CODE.finditer(text)]
    for m in REFERENCE.finditer(text):
        if any(start<=m.start()<end for start,end in protected):continue
        number=numbers.get(m['id'])
        changes.append((m.start(),m.end(),f'[{prefix} {number}](#{m["id"]})' if number else '**图号待确认**'))
    for start,end,value in sorted(changes,reverse=True):
        text=text[:start]+value+text[end:]
    return text

def record_markdown_ownership(p,blocks,old_revs):
    """Once inserted as Markdown, an author's later move or deletion takes precedence over legacy attachments."""
    exhibits=p.get('exhibits',{})
    if not exhibits and not p.get('readingGuide'):return
    import scholar
    resources,sections=catalog(p,p)
    for b in blocks:
        if b['rev']==old_revs.get(b['id']) or b.get('format')!='md':continue
        body=CODE.sub('',b['text'])
        if b.get('sitSection') in sections:
            owned=set(b.get('markdownSourceFigures',[]))
            owned.update(path for path in resources if path.startswith('figures/Sit-2024-') and ']('+path+')' in body)
            if owned:b['markdownSourceFigures']=sorted(owned)
        used={resources.get(path_from(m['dest']),{}).get('asset') for m in IMAGE_LINK.finditer(body)}
        used.discard(None)
        for o in exhibits.values():
            if o.get('block') and not o.get('markdownOwned'):
                if o.get('asset') in used or (o.get('rows') and scholar.display_table(o) in body):
                    o['markdownOwned']=True

def placements(b,sections,resources):
    if b.get('format')!='md' or b.get('_sourceFiguresPlaced'):return []
    text=b['text'];out=[]
    # A paragraph quoting source code is not a figure citation.
    masked=CODE.sub(lambda m:' '*len(m[0]),text)
    for num in sections.get(b.get('sitSection'),[]):
        path=f'figures/Sit-2024-{num}.png';f=resources[path]
        if path in b.get('markdownSourceFigures',[]) or ']('+path+')' in masked:continue
        label=('表' if num.startswith('T') else '图')+num
        prefix=r'(?:\bTables?\.?|表)' if num.startswith('T') else r'(?:\bFig(?:ure)?s?\.?|图)'
        pattern=prefix+r'\s*'+re.escape(num.removeprefix('T'))+r'(?![a-z0-9])'
        m=re.search(pattern,masked,re.I)
        if not m:continue
        end=re.search(r'\n[ \t]*\n',text[m.end():]);at=m.end()+end.start() if end else len(text.rstrip())
        out.append(dict(block=b['id'],pattern=pattern,at=at,start=m.start(),quote=m[0],label=label,path=path,markdown=markup(f['caption'],path)))
    return out

def pixels(db,version,resources,path,blob,pages):
    f=resources[path]
    if 'asset' in f:return blob(db,f['sha'])
    import researchdesk
    key=(f['sha'],f['page'])
    if key not in pages:
        page=researchdesk.source_page(version,f,db,blob)
        pages[key]=base64.b64decode(page)
    im=Image.open(io.BytesIO(pages[key]));x,y,w,h=f['rect'];buf=io.BytesIO()
    im.crop((round(x*im.width),round(y*im.height),round((x+w)*im.width),round((y+h)*im.height))).save(buf,'PNG')
    return buf.getvalue()

def project_export(db,p,v,blocks,fmt,blob):
    resources,sections=catalog(p,v);files={};pages={};items=[]
    numbers=figure_numbers(v['blocks'])
    style=p.get('settings',{}).get('figureLabelStyle')
    for b in blocks:
        t=b['text']
        for h in reversed(sorted(placements(b,sections,resources),key=lambda h:h['at'])):
            t=t[:h['at']]+'\n\n'+h['markdown']+t[h['at']:]
        # Resolve only managed relative image destinations (not arbitrary filesystem paths).
        def resolve(m):
            path=path_from(m['dest'])
            if code and any(start<=m.start()<end for start,end in code):return m[0]
            if path not in resources:return m[0]
            name=unquote(path)
            if name not in files:files[name]=pixels(db,v,resources,path,blob,pages)
            if fmt in ('md','tex'):return m[0]
            return (m[0][:m.start('dest')-m.start()]+'data:'+resources[path]['mime']+';base64,'
                    +base64.b64encode(files[name]).decode()+m[0][m.end('dest')-m.start():])
        if b['format']=='md':
            t=materialize(t,numbers,fmt,style)
            code=[m.span() for m in CODE.finditer(t)]
            t=IMAGE_LINK.sub(resolve,t)
        items.append(dict(b,text=t))
    return items,files if fmt in ('md','tex') else {}
