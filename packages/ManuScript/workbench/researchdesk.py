"""Project-scoped discovery, reading notes and citeproc display. Keys are never display labels."""
import json,re,hashlib,tempfile
from pathlib import Path
from html import unescape
from lxml import etree, html
import formats,scholar,semantic

def index_report(db,p,rebuild,blob):
    scholar.schema(db);db.execute('create table if not exists evidence_lsa(id text primary key, model blob)')
    db.execute('create table if not exists lx_index_fault(project text,sha text,error text,primary key(project,sha))')
    rows=[];latest=set();seen=set()
    for k,r in p.get('references',{}).items():
        eds=r.get('editions',[])
        if not eds:rows.append(dict(key=k,name='仅书目',pages=0,covered=0,chunks=0,status='缺原件'));continue
        latest.add(eds[-1]['sha'])
        for ed in eds:
            sha=ed['sha'];saved=db.execute('select error from lx_index_fault where project=? and sha=?',(p['id'],sha)).fetchone();error=saved[0] if saved else ''
            if rebuild and sha not in seen:
                error='';db.execute('savepoint lxsource')
                try:
                    raw=blob(db,sha)
                    if hashlib.sha256(raw).hexdigest()!=sha:raise ValueError('原件哈希不符')
                    previous={x[0] for x in db.execute('select pid from evidence_fts where sha=?',(sha,))}
                    db.execute('delete from indexed_sources where sha=?',(sha,));db.execute('delete from evidence_fts where sha=?',(sha,));scholar.index(db,sha,raw,ed['name'])
                    if previous-{x[0] for x in db.execute('select pid from evidence_fts where sha=?',(sha,))}:raise ValueError('提取方式改变，已保留旧索引及证据锚点')
                    seen.add(sha)
                except Exception as e:
                    db.execute('rollback to lxsource');error=str(e)
                finally:db.execute('release lxsource')
                if error:db.execute('insert or replace into lx_index_fault values(?,?,?)',(p['id'],sha,error))
                else:db.execute('delete from lx_index_fault where project=? and sha=?',(p['id'],sha))
            c,n=db.execute('select count(*),count(distinct page) from evidence_fts where sha=?',(sha,)).fetchone()
            rows.append(dict(key=k,name=ed['name'],sha=sha,pages=ed['pages'],covered=n,chunks=c,status=error or ('已索引' if n==ed['pages'] and n else '部分页面无文字' if n else '需 OCR 或重建')))
    fp=hashlib.sha256((semantic.ALG+''.join(sorted(latest))).encode()).hexdigest()
    error=''
    if rebuild and latest:
        db.execute('savepoint lxtopics')
        try:
            db.execute('delete from evidence_lsa where id=?',(fp,));semantic.rank(db,latest,'index')
        except Exception as e:db.execute('rollback to lxtopics');error=str(e)
        finally:db.execute('release lxtopics')
    ready=bool(db.execute('select 1 from evidence_lsa where id=?',(fp,)).fetchone())
    return dict(rows=rows,model=semantic.ALG,ready=ready,error=error,limit=12000)

def sync_notes(p,a):
    refs=p.setdefault('references',{});key=a['key'];item=a['item'];doi=scholar.clean_doi(item.get('DOI'))
    matches=[k for k,r in refs.items() if (doi and r.get('doi')==doi) or r.get('zoteroKey')==key]
    if not matches:matches=[k for k,r in refs.items() if not (doi and r.get('doi')) and r['title']==item.get('title')]
    if len(matches)>1:raise ValueError('多个书目与该 Zotero 条目匹配，请核对 DOI')
    if matches:r=refs[matches[0]]
    else:
        c=dict(item,id=key);scholar.import_bib(p,json.dumps([c]).encode(),'json');r=next(x for x in refs.values() if x.get('doi')==doi and doi or x['title']==item['title'])
    if r.get('zoteroKey') not in (None,key):raise ValueError('此书目已关联另一个 Zotero 条目')
    if doi and r.get('doi') and doi!=r['doi']:raise ValueError('Zotero 条目 DOI 已变，请先核对书目身份')
    r.update(zoteroKey=key,csl=item)
    notes=r.setdefault('readingNotes',{})
    for n in notes.values():n['removed']=True
    for n in a['notes']:
        if n['kind']=='note':
            try:n['text']=html.fromstring(n['text']).text_content().strip() if n['text'] else ''
            except ValueError:n['text']=unescape(n['text'])
        notes[n['key']]={**n,'removed':False}
    return dict(key=r['key'],count=sum(not n['removed'] for n in notes.values()))

def ref_data(r):
    authors=[]
    for x in r.get('author','').split(';'):
        s=x.strip()
        if not s:continue
        if ',' in s:family,_,given=s.partition(',');authors.append(dict(family=family.strip(),given=given.strip()))
        elif 'et al' in s:authors.append(dict(literal=s))
        elif ' ' in s:given,family=s.rsplit(' ',1);authors.append(dict(family=family,given=given))
        else:authors.append(dict(literal=s))
    d=dict(id=r['key'],type=r.get('type') or 'article-journal',title=r['title'],author=authors)
    for k,f in [('journal','container-title'),('pages','page'),('doi','DOI'),('url','URL'),('volume','volume'),('issue','issue')]:
        if r.get(k):d[f]=r[k]
    if r.get('year','').isdigit():d['issued']={'date-parts':[[int(r['year'])]]}
    return {**r.get('csl',{}),**d}

STYLE_DIR=Path(__file__).parent/'styles'
CSL='{http://purl.org/net/xbiblio/csl}'
CSL_LIMIT=512*1024

def custom_style(raw):
    if not raw or len(raw)>CSL_LIMIT:raise ValueError('CSL 文件大小须在 512 KB 以内')
    try:
        root=etree.fromstring(raw,etree.XMLParser(resolve_entities=False,no_network=True))
    except etree.XMLSyntaxError as error:
        raise ValueError('无法读取 CSL XML：'+str(error)) from error
    if root.getroottree().docinfo.doctype or root.tag!=CSL+'style':
        raise ValueError('请选择有效的 CSL 样式文件')
    if root.find(f"{CSL}info/{CSL}link[@rel='independent-parent']") is not None:
        raise ValueError('请选择该样式的独立父样式，或导入含有完整排版规则的 CSL')
    if root.get('class')!='in-text' or any(root.find(f'{CSL}{part}/{CSL}layout') is None for part in ('citation','bibliography')):
        raise ValueError('CSL 必须包含文内引文和参考文献两套规则')
    title=(root.findtext(f'{CSL}info/{CSL}title') or '').strip()
    csl_id=(root.findtext(f'{CSL}info/{CSL}id') or '').strip()
    if not title or len(title)>200 or not csl_id or len(csl_id)>500:
        raise ValueError('CSL 需要有效的标题和样式 ID')
    return 'custom-'+hashlib.sha256(csl_id.encode()).hexdigest()[:24],dict(title=title,id=csl_id)

def style_source(p,style,read_blob=None):
    if isinstance(style,str) and re.fullmatch('[a-z0-9-]+',style):
        record=p.get('settings',{}).get('citationStyles',{}).get(style)
        if record and read_blob and re.fullmatch('custom-[a-f0-9]{24}',style):
            raw=read_blob(record['sha'])
            key,metadata=custom_style(raw)
            if key==style:return raw,metadata['id']
        path=STYLE_DIR/(style+'.csl')
        if path.is_file():
            return path,etree.parse(str(path)).findtext(f'{CSL}info/{CSL}id')
    raise ValueError('未知 CSL 样式')

def citation_groups(p,blocks):
    groups={};refs=p.get('references',{})
    if not refs:return []
    from document_figures import CODE
    for b in p['blocks'] if blocks is None else blocks:
        text=b['text'];objects=p.get('exhibits',{})
        for key,o in objects.items():
            tag='{{'+key+'}}'
            if o.get('block')==b.get('id') and tag not in text:
                original=o.get('original')
                if original:text=text.replace(original,tag)
                else:text+='\n'+tag
        def cells(m):
            return '\n'.join(str(c) for row in objects.get(m[1],{}).get('rows',[]) for c in row)
        text=re.sub(r'\{\{([FT]\d+)\}\}',cells,text)
        if b.get('format')!='tex':text=CODE.sub('\n',text)
        for m in re.finditer(scholar.BRACKET_CITATION+r'|\\cite(?:t|p)?\{([^}]+)\}',text):
            keys=scholar.bracket_ref_keys(m[1],refs) if m[1] else list(dict.fromkeys(scholar.ref_keys(m[2],refs)))
            if keys:groups.setdefault(tuple(keys),None)
    return list(groups)

def render_cites(p,style,blocks=None,read_blob=None,source=None):
    if style!='keys' and source is None:source=style_source(p,style,read_blob)[0]
    groups=citation_groups(p,blocks)
    refs=p.get('references',{})
    if not groups:return dict(groups={},entries=[])
    if style=='keys':
        cited={key for cluster in groups for key in cluster}
        return dict(groups={},entries=[dict(key=k,text=scholar.keyed_reference(refs[k])) for k in refs if k in cited])
    cited=dict.fromkeys(key for cluster in groups for key in cluster)
    singles={(key,) for key in cited}
    singles.difference_update(groups)
    groups.extend((key,) for key in cited if (key,) in singles)
    return run_citeproc(source,groups,[ref_data(refs[k]) for k in cited])

def run_citeproc(source,groups,items):
    # Each group is a separate paragraph, but citeproc processes the entire manuscript once.
    with tempfile.TemporaryDirectory() as tmp:
        f=Path(tmp)/'refs.json';f.write_text(json.dumps(items))
        if isinstance(source,bytes):
            custom=Path(tmp)/'custom.csl';custom.write_bytes(source);source=custom
        ast=formats.cmd(['pandoc','--sandbox','-f','markdown','-t','json','--citeproc','--bibliography',str(f),'--csl',str(source),'-M','link-citations=true'],('\n\n'.join('['+'; '.join('@'+k for k in keys)+']' for keys in groups)).encode())
        doc=json.loads(ast);bs=doc['blocks']
        def plain(n):
            if isinstance(n,list):return ''.join(map(plain,n))
            if not isinstance(n,dict):return ''
            t=n['t'];v=n.get('c')
            if t=='Str':return v
            if t in ('Space','SoftBreak','LineBreak'):return ' '
            if t in ('Span','Link','Cite','Div'):return plain(v[1])
            return plain(v)
        def marked(n):
            if isinstance(n,list):return ''.join(map(marked,n))
            if not isinstance(n,dict):return ''
            t=n['t'];v=n.get('c')
            if t=='Emph':return '*'+marked(v)+'*'
            if t=='Strong':return '**'+marked(v)+'**'
            if t in ('Underline','SmallCaps'):
                css='underline' if t=='Underline' else 'smallcaps'
                return '['+marked(v)+']{.'+css+'}'
            if t in ('Superscript','Subscript'):
                mark='^' if t=='Superscript' else '~'
                return mark+marked(v).replace(' ',r'\ ')+mark
            if t in ('Span','Link','Div'):return marked(v[1])
            if t in ('Para','Plain'):return marked(v)
            return plain(n).replace('*',r'\*')
        def rich(n,flags=None):
            if isinstance(n,list):return [v for child in n for v in rich(child,flags)]
            if not isinstance(n,dict):return []
            t=n['t'];v=n.get('c')
            flags=flags or {}
            if t in ('Div','Link','Span','Cite'):return rich(v[1],flags)
            mark={'Emph':'i','Strong':'b','Superscript':'sup','Subscript':'sub','SmallCaps':'sc','Underline':'u'}.get(t)
            if mark:return rich(v,{**flags,mark:True})
            if t in ('Para','Plain'):return rich(v,flags)
            return [dict(text=plain(n),**flags)]
        def ref_entry(d):return dict(key=d['c'][0][0][4:],text=plain(d),md=marked(d),runs=rich(d))
        clusters=[(','.join(k),b['c'][0]['c'][1]) for k,b in zip(groups,bs)]
        return dict(groups={k:plain(v) for k,v in clusters},groupRuns={k:rich(v) for k,v in clusters},
                    groupMarkdown={k:marked(v) for k,v in clusters},
                    entries=[ref_entry(d) for d in bs[-1]['c'][1]] if bs[-1]['t']=='Div' else [])

def source_page(p,a,db,blob,crop=False):
    from io import BytesIO
    from PIL import Image
    import base64,math
    ed=next((e for e in p['references'][a['key']]['editions'] if e['sha']==a['sha'] and e['name'].lower().endswith('.pdf')),None)
    page=a['page'];scholar.need(ed and type(page)==int and 1<=page<=ed['pages'],'原件或页码无效')
    with tempfile.TemporaryDirectory() as t:
        out=Path(t)/'page';formats.cmd(['pdftoppm','-f',str(page),'-l',str(page),'-scale-to','1500','-singlefile','-png','-',str(out)],blob(db,ed['sha']))
        raw=out.with_suffix('.png').read_bytes()
    if crop:
        box=a['box'];scholar.need(len(box)==4 and all(type(v) in (int,float) and math.isfinite(v) and v>=0 for v in box),'无效区域');x,y,w,h=box;scholar.need(w>=1 and h>=1 and x+w<=100.001 and y+h<=100.001,'所选区域太小或越界')
        im=Image.open(BytesIO(raw));b=BytesIO();im.crop((int(x*im.width/100),int(y*im.height/100),int((x+w)*im.width/100),int((y+h)*im.height/100))).save(b,'PNG');raw=b.getvalue()
    return base64.b64encode(raw).decode()
