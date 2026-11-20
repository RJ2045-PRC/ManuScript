"""Project bibliography, immutable source passages, and versioned manuscript objects."""
import base64, csv, hashlib, io, json, re
from pathlib import Path
from urllib.parse import urlsplit
from PIL import Image
import formats

KEY=r'[A-Za-z][A-Za-z0-9_.:-]{0,63}'
def need(ok,msg):
    if not ok:raise ValueError(msg)
def url(s):
    s=str(s or '').strip();need(not s or (urlsplit(s).scheme in ('https','http') and urlsplit(s).hostname),'需要 http(s) 链接');return s
def clean_doi(s):
    d=re.sub(r'^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)','',str(s or '').strip(),flags=re.I).lower()
    need(not d or re.fullmatch(r'10\.[0-9]{4,9}/[^\s<>"]+',d),'DOI 格式无效');return d
def catalog(p,a):
    refs=p.setdefault('references',{});key=a.get('key') or next('R'+str(n) for n in range(1,len(refs)+2) if 'R'+str(n) not in refs)
    need(re.fullmatch(KEY,key) and str(a.get('title','')).strip(),'需要稳定引用键与题名')
    doi=clean_doi(a.get('doi'));old=refs.get(key)
    need(not any(k!=key and doi and r.get('doi')==doi for k,r in refs.items()),'该 DOI 已有书目，请选择已有条目')
    if old:need(a.get('rev')==old['rev'],'书目已存在或被更新，请刷新后再修改')
    refs[key]={**(old or {}),'key':key,'rev':(old or {}).get('rev',0)+1,'title':a['title'].strip()[:600],'author':str(a.get('author',''))[:2000],'year':str(a.get('year',''))[:30],'doi':doi,'url':url(a.get('url')),'editions':(old or {}).get('editions',[])}
    for field in ('journal','volume','issue','pages','type'):
        if field in a:refs[key][field]=str(a[field] or '')[:500]
    return refs[key]
def import_bib(p,raw,kind):
    entries=json.loads(formats.pandoc(raw,'biblatex','csljson') if kind=='bib' else raw)
    need(isinstance(entries,list) and 0<len(entries)<=2000,'需要 CSL-JSON 书目数组或有效 BibTeX')
    for e in entries:
        key=str(e.get('id',''));doi=clean_doi(e.get('DOI'));title=e.get('title','')
        if any((doi and r['doi']==doi) or (key==r['key'] and title==r['title']) for r in p.get('references',{}).values()):continue
        catalog(p,dict(type=e.get('type'),journal=e.get('container-title',''),volume=e.get('volume',''),issue=e.get('issue',''),pages=e.get('page',''),key=key if re.fullmatch(KEY,key) else '',title=title,doi=doi,url=e.get('URL'),author='; '.join(a.get('literal') or ', '.join(filter(None,[a.get('family'),a.get('given')])) for a in e.get('author',[])),year=next(iter(e.get('issued',{}).get('date-parts',[[]])[0]),'')))
def schema(db):
    db.execute('create virtual table if not exists evidence_fts using fts5(sha UNINDEXED,pid UNINDEXED,page UNINDEXED,offset UNINDEXED,text, tokenize="unicode61")')
    db.execute('create table if not exists indexed_sources(sha text primary key, pages integer)')
def index(db,sha,raw,name):
    schema(db);row=db.execute('select pages from indexed_sources where sha=?',(sha,)).fetchone()
    if row:return row[0]
    pages=formats.PdfReader(io.BytesIO(raw)).pages if name.lower().endswith('.pdf') else [raw.decode('utf-8-sig')]
    for page,item in enumerate(pages,1):
        s=(item if isinstance(item,str) else item.extract_text() or '').replace('\x00','')
        pos=0
        while pos<len(s):
            end=min(pos+1050,len(s))
            if end<len(s):
                split=max(s.rfind('\n',pos+650,end),s.rfind(' ',pos+650,end))
                if split!=-1:end=split+1
            part=s[pos:end]
            pid=hashlib.sha256(f'{sha}:{page}:{pos}:'.encode()+part.encode()).hexdigest()[:24]
            if part.strip():db.execute('insert into evidence_fts values(?,?,?,?,?)',(sha,pid,page,pos,part))
            pos=end
    db.execute('insert into indexed_sources values(?,?)',(sha,len(pages)));return len(pages)
def attach(db,p,a,raw,asset,head):
    ref=p['references'][a['key']];name=Path(a['name']).name;ext=Path(name).suffix.lower()
    need(ext in ('.pdf','.txt','.md') and len(raw)<=50*1024*1024,'可附加 PDF、TXT 或 Markdown，最多 50 MiB')
    sha=hashlib.sha256(raw).hexdigest()
    if any(x['sha']==sha for x in ref['editions']):return
    pages=index(db,sha,raw,name);aa=asset(db,p,name,raw,'文献原件',head)
    p['sources'].append(dict(id=aa['id'],title=name,key=ref['key'],asset=aa['id'],sha=sha,url=ref.get('url',''),version=head))
    ref['editions'].append(dict(asset=aa['id'],sha=sha,name=name,pages=pages));ref['rev']+=1
def lookup(db,p,a,blob):
    schema(db);refs=p.get('references',{});query=a.get('query','').strip()[:300];rows=[];editions={}
    for k,r in refs.items():
        if a.get('key') and k!=a['key']:continue
        # Latest edition for discovery; pinned passages can always reopen an older edition.
        for ed in (r['editions'] if a.get('pid') else r['editions'][-1:]):
            sha=ed['sha'];editions[sha]=(k,ed);cached=db.execute('select 1 from indexed_sources where sha=?',(sha,)).fetchone()
            if not cached:index(db,sha,blob(db,sha),ed['name'])
            params=[sha];sql='select pid,page,offset,text,0 from evidence_fts where sha=?'
            if a.get('pid'):sql+=' and pid=?';params.append(a['pid'])
            elif query:
                terms=re.findall(r'[^\W_]+',query,re.U)[:14]
                if not terms:continue
                sql=sql.replace('text,0','text,bm25(evidence_fts)')+' and evidence_fts match ? order by bm25(evidence_fts)';params.append(' OR '.join('"'+x+'"' for x in terms))
            for pid,page,pos,txt,score in db.execute(sql+' limit 12',params):
                rows.append(dict(key=k,pid=pid,page=int(page),offset=int(pos),text=txt,asset=ed['asset'],sha=sha,score=score))
    rows.sort(key=lambda x:x['score'])
    if query and not a.get('pid') and a.get('mode')!='exact':
        try:
            import semantic
            nearest=semantic.rank(db,editions,query)
        except ImportError:nearest=[]
        merged={r['pid']:{**r,'match':'关键词','rank':1/(42+i)} for i,r in enumerate(rows)}
        for i,pid in enumerate(nearest):
            if pid not in merged:
                h=db.execute('select sha,page,offset,text from evidence_fts where pid=?',(pid,)).fetchone()
                if not h or h[0] not in editions:continue
                sha,page,pos,text=h;k,ed=editions[sha]
                merged[pid]=dict(key=k,pid=pid,page=int(page),offset=int(pos),text=text,asset=ed['asset'],sha=sha,match='主题相似',rank=0)
            else:merged[pid]['match']='关键词 + 主题相似'
            merged[pid]['rank']+=.85/(42+i)
        return sorted(merged.values(),key=lambda x:-x['rank'])[:20]
    return rows[:20]
def object_put(db,p,a,asset,head):
    objs=p.setdefault('exhibits',{});typ=a['kind'];need(typ in ('figure','table'),'未知图表类型');prefix='F' if typ=='figure' else 'T'
    key=a.get('id') or next(prefix+str(i) for i in range(1,len(objs)+2) if prefix+str(i) not in objs);old=objs.get(key)
    need(re.fullmatch(prefix+r'[1-9]\d*',key) and (not old or old['rev']==a.get('rev')),'图表编号或版本冲突')
    caption=str(a['caption']).strip();need(0<len(caption)<=1200,'请填写图题或表题')
    o=dict(id=key,kind=typ,caption=caption,credit=str(a.get('credit',''))[:1200],rev=(old or {}).get('rev',0)+1)
    bid=a.get('block',(old or {}).get('block',''));need(not bid or any(b['id']==bid for b in p['blocks']),'关联章节不存在');o['block']=bid
    original=(old or {}).get('original') or a.get('original','')
    if original:
        if not old:need(any(b['id']==bid and original in b['text'] for b in p['blocks']),'原表已变化')
        o['original']=original
    if typ=='table':
        rows=a['rows'];need(isinstance(rows,list) and 2<=len(rows)<=600 and 1<=len(rows[0])<=50 and all(isinstance(r,list) and len(r)==len(rows[0]) and all(isinstance(c,str) and len(c)<=6000 for c in r) for r in rows),'表格需要表头和等宽的数据行');o['rows']=rows
    elif a.get('data'):
        raw=base64.b64decode(a['data'],validate=True);need(len(raw)<=12*1024*1024,'图片最多 12 MiB')
        im=Image.open(io.BytesIO(raw));need(im.format in ('PNG','JPEG','WEBP') and im.width*im.height<=40000000,'仅支持 PNG、JPEG 或 WebP');im.verify()
        ext={'PNG':'png','JPEG':'jpg','WEBP':'webp'}[im.format]
        aa=asset(db,p,key+'.'+ext,raw,'论文插图',head)
        if a.get('name'):
            from document_figures import assign_filename
            assign_filename(p,aa,Path(str(a['name'])).stem,unique=True)
        o.update(asset=aa['id'],sha=aa['sha'],mime='image/'+('jpeg' if ext=='jpg' else ext))
    else:need(old,'请选择图片');o.update({k:old[k] for k in ('asset','sha','mime')})
    if old and not a.get('data'):
        for field in ('sourceRegion','diagram'):
            if field in old:o[field]=old[field]
    if a.get('diagram'):
        g=a['diagram'];anc=g['anchor'];version=next((v for v in p['versions'] if v['id']==anc['version']),None)
        src=next((b['text'] for b in (version or {}).get('blocks',[]) if b['id']==bid),None)
        need(src is not None and anc['block']==bid and src[anc['start']:anc['end']]==anc['quote'],'所选原句与固定版本不符')
        ns=g['nodes'];ids={n['id'] for n in ns};need(0<len(ns)<=24 and len(ids)==len(ns) and all(n['quote'] and n['quote'] in anc['quote'] and 0<len(n['label'])<=120 for n in ns),'节点没有对应原句')
        need(len(g['edges'])<=64 and all(e['from'] in ids and e['to'] in ids and 0<len(e['label'])<=120 for e in g['edges']),'关系无效');o['diagram']=g
    objs[key]=o;return o

def bib_data(refs):
    def tx(s):return str(s or '').replace('\\',' ').replace('{','(').replace('}',')')
    return ('\n'.join('@'+{'book':'book','chapter':'incollection','paper-conference':'inproceedings','thesis':'phdthesis','report':'techreport','webpage':'misc'}.get(r.get('type'),'article')+'{'+k+',\n'+',\n'.join(f'{field} = {{{tx(value)}}}' for field,value in [('title',r['title']),('author',r.get('author','').replace('; ',' and ')),('year',r.get('year')),('journal',r.get('journal')),('volume',r.get('volume')),('number',r.get('issue')),('pages',r.get('pages')),('doi',r.get('doi')),('url',r.get('url'))] if value)+'\n}' for k,r in refs.items())).encode()
def display_table(o):
    def cell(c):return c.replace('|',r'\|').replace('\n',' ')
    rows=[[cell(c) for c in r] for r in o['rows']]
    rows.insert(1,['---']*len(rows[0]))
    return '\n'.join('| '+' | '.join(r)+' |' for r in rows)

BRACKET_CITATION = r'((?:\[@[^\[\]\n]+\])+|\[[^\[\]\n]{1,250}\])(?!\()'

def keyed_reference(ref):
    return (ref['key']+'. '+ref.get('author','')+' ('+ref.get('year','')+'). '+ref['title']
            +('. DOI: '+ref['doi'] if ref.get('doi') else ''))

def bracket_ref_keys(raw, refs):
    keys = []
    for match in re.finditer(r'\[([^\[\]\n]+)\]', raw):
        members = ref_keys(match[1], refs)
        if not members:
            return []
        keys.extend(members)
    return list(dict.fromkeys(keys))

def export_parts(blocks,fmt,refs,objs,blobfn,formatted=None):
    used={};files={};res=[]; cited=set()
    def display(m):
        cross,key=m.groups();o=objs.get(key)
        if not o:return m[0]
        label=('Fig. ' if o['kind']=='figure' else 'Table ')+key[1:]
        if cross:return label
        used[key]=True;caption=label+' | '+o['caption']+(' — '+o['credit'] if o['credit'] else '')
        if o['kind']=='table':
            return '\n\n'+display_table(o)+'\n\n'+caption+'\n\n'
        name='figures/'+key+'-'+o['sha'][:10]+'.'+o['mime'].split('/')[1];raw=blobfn(o['sha'])
        if fmt in ('md','tex'):files[name]=raw;src=name
        else:src='data:'+o['mime']+';base64,'+base64.b64encode(raw).decode()
        return '\n\n!['+caption.replace(']','')+']('+src+')\n\n'
    def cite(m):
        raw=m[1]; keys=bracket_ref_keys(raw,refs) if raw.startswith('[') else ref_keys(raw,refs)
        if not keys:return m[0]
        cited.update(keys)
        if formatted and (label:=formatted.get('groupMarkdown',formatted['groups']).get(','.join(keys))):return label
        if fmt=='tex':return '[@'+'; @'.join(keys)+']'
        return '['+', '.join('['+k+']('+link+')' if (link:=('https://doi.org/'+refs[k]['doi'] if refs[k].get('doi') else refs[k].get('url'))) else k for k in keys)+']'
    for b in blocks:
        txt=b['text']
        for key,o in objs.items():
            if o.get('markdownOwned') or o.get('block')!=b['id'] or '{{'+key+'}}' in txt:continue
            if o.get('sha') and '](figures/'+o['sha']+'.' in txt:continue
            if o.get('kind')=='table' and display_table(o) in txt:continue
            if o.get('original'):
                if o['original'] in txt:txt=txt.replace(o['original'],'{{'+key+'}}',1)
            else:txt+='\n\n{{'+key+'}}'
        # Native TeX uses standard bibliography keys; expand managed objects through Pandoc.
        show=lambda m:formats.pandoc(display(m).encode(),'markdown','latex').decode().strip() if b['format']=='tex' else display(m)
        txt=re.sub(r'\{\{(ref:)?([FT]\d+)\}\}',show,txt)
        txt=re.sub(BRACKET_CITATION,cite,txt) if b['format']=='md' else txt
        if b['format']=='tex':
            # Do not put a Markdown link inside native TeX. Convert to Markdown for Word/PDF only.
            if fmt=='tex':
                def native(m):
                    keys=ref_keys(m[1],refs)
                    return r'\citep{'+','.join(keys)+'}' if keys else m[0]
                txt=re.sub(r'\[(@[^\[\]\n]+)\]',native,txt)
            else:
                cache={}
                def keep(m):
                    val=cite(m)
                    if val==m[0]:return val
                    k='MANUSCRIPTCITE'+str(len(cache))+'END';cache[k]=val;return k
                txt=re.sub(r'\\cite(?:p|t)?\{([^}]+)\}',keep,txt)
                txt=re.sub(r'\[(@[^\[\]\n]+)\]',keep,txt)
                txt=formats.pandoc(txt.encode(),'latex','markdown').decode().strip()
                for k,val in cache.items():txt=txt.replace(k,val)
                b=dict(b,format='md')
        res.append(dict(b,text=txt))
    if cited and fmt!='tex':
        text='\n\n'.join(keyed_reference(refs[k]) for k in refs if k in cited)
        if formatted:text='\n\n'.join(x.get('md',x['text']) for x in formatted['entries'])
        res.append(dict(id='_bibliography',parent=None,title='References',format='md',text=text))
    return res,files

def ref_keys(s,refs):
    keys=[]
    for part in re.split(r'[,;]\s*',s):
        part=part.strip().lstrip('@').partition('#')[0];ran=re.fullmatch(r'S(\d+)\s*[–-]\s*S?(\d+)',part)
        if ran:
            lo,hi=map(int,ran.groups())
            if not lo<=hi<=lo+99:return []
            keys+=['S'+str(x) for x in range(lo,hi+1)]
        else:keys.append(part)
    return keys if keys and all(k in refs for k in keys) else []
