"""Exchange Zotero citation fields, independently of their displayed Word text."""
import base64, copy, hashlib, io, json, re, uuid, zipfile
from collections import Counter, defaultdict
from urllib.parse import urlencode
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler
from lxml import etree as X
import formats, scholar

W=formats.W
VT='{http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes}'
CP='{http://schemas.openxmlformats.org/officeDocument/2006/custom-properties}'
REL='{http://schemas.openxmlformats.org/package/2006/relationships}'
CT='{http://schemas.openxmlformats.org/package/2006/content-types}'
DCT='{http://purl.org/dc/elements/1.1/}'
rx=re.compile(r'\[([^\[\]\n]{1,250})\](?!\()|\\cite(?:p|t)?\{([^}]+)\}')
def must(v,m):
    if not v:raise ValueError(m)
def xml(z,n):return X.fromstring(z.read(n),X.XMLParser(resolve_entities=False,no_network=True))
def enc(e):return X.tostring(e,encoding='utf-8',xml_declaration=True,standalone=True)
def norm(s):return re.sub(r'^https?://(?:dx\.)?doi\.org/','',str(s or '').lower().strip())
def localitems(refs):
    class Local(HTTPRedirectHandler):
        def redirect_request(self,*args):return None
    client=build_opener(ProxyHandler({}),Local());out={}
    for k,r in refs.items():
        doi=norm(r.get('doi'))
        authors=[]
        for name in r.get('author','').split(';'):
            n=name.strip().rsplit(' ',1)
            if 'et al.' in name:authors.append({'literal':name.strip()});continue
            if n[0]:authors.append({'given':n[0],'family':n[1]} if len(n)>1 else {'literal':n[0]})
        data=dict(type='article-journal',title=r['title'],author=authors,DOI=doi)
        if re.fullmatch(r'\d{4}',r.get('year','')):data['issued']={'date-parts':[[int(r['year'])]]}
        # Embedded Zotero items work without the local library. Use real item URIs only on an exact match.
        token=uuid.uuid4().hex;uri='http://zotero.org/users/local/'+token[:8]+'/items/'+token[8:16].upper()
        try:
            base='http://127.0.0.1:23119/api/users/0/items/'
            hits=json.load(client.open(base+'top?'+urlencode({'q':r['title'][:80],'limit':50}),timeout=.9))
            item=next(x for x in hits if doi and norm(x['data'].get('DOI'))==doi)
            found=json.load(client.open(base+item['key']+'?format=csljson',timeout=1));data=found[0] if isinstance(found,list) else found
            uri=item['links']['alternate']['href'].replace('https://www.zotero.org/','http://zotero.org/')
            if item['library']['type']=='user' and item['library']['id']:uri='http://zotero.org/users/'+str(item['library']['id'])+'/items/'+item['key']
        except Exception:pass
        data['id']=uri;out[k]=dict(id=uri,uris=[uri],itemData=data)
    return out
def runtext(tag,value):
    r=X.Element(W+'r');t=X.SubElement(r,W+tag)
    if tag=='fldChar':t.set(W+'fldCharType',value)
    else:t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=value
    return r
def field(code,label):
    return [runtext('fldChar','begin'),runtext('instrText',code),runtext('fldChar','separate'),runtext('t',label),runtext('fldChar','end')]
def fields(root):
    results=[]
    for pi,p in enumerate(root.iter(W+'p')):
        buf='';stack=[];items=[]
        def emit(code,label):
            nonlocal buf
            if 'ZOTERO_ITEM CSL_CITATION' not in code:buf+=label;return
            raw=code.split('ZOTERO_ITEM CSL_CITATION',1)[1].strip();c=json.loads(raw);must(isinstance(c.get('citationItems'),list),'Zotero 引文字段不完整')
            items.append(dict(id=c.get('citationID',''),items=c['citationItems'],display=label,slot=len(items)));buf+='¤'
        for e in p.iter():
            if e.tag==W+'fldSimple' and 'ZOTERO_ITEM' in e.get(W+'instr',''):raise ValueError('请在 Word 中用 Zotero 刷新为动态复杂域后再导回')
            if e.tag==W+'fldChar':
                t=e.get(W+'fldCharType')
                if t=='begin':stack.append(['','',False])
                elif t=='separate' and stack:stack[-1][2]=True
                elif t=='end' and stack:
                    code,label,_=stack.pop();emit(code,label)
            elif e.tag==W+'instrText' and stack:stack[-1][0]+=e.text or ''
            elif e.tag==W+'t':
                if not stack:buf+=e.text or ''
                elif stack[-1][2]:stack[-1][1]+=e.text or ''
        must(not any('ZOTERO_ITEM' in st[0] for st in stack),'Word 引文字段不完整；请刷新并保存');results.extend(dict(i,context=buf.strip(),para=pi) for i in items)
    return results
def sentence(b,m):
    for e in b.get('citationEvidence',[]):
        i=b['text'].find(e['sentence'])
        if i>=0 and i<=m.start()<i+len(e['sentence']):return e['sentence']
    text=b['text'];i=m.start();j=m.end()
    pre=list(re.finditer(r'(?:[.!?。！？]\s+|\n)',text[:i]));post=re.search(r'[.!?。！？](?=\s|$)|\n',text[j:])
    return text[pre[-1].end() if pre else 0:j+(post.end() if post else len(text)-j)].strip()
def export(db,p,blocks,blob):
    token=uuid.uuid4().hex;refs=p.get('references',{});occur={};order={};items=localitems(refs);out=[]
    import researchdesk
    style=p.get('settings',{}).get('citationStyle','keys')
    source,style_id=researchdesk.style_source(p,style,lambda sha:blob(db,sha)) if style!='keys' else (None,None)
    styled=researchdesk.render_cites(p,style,blocks,source=source) if source is not None else None
    for b in blocks:
        def sub(m):
            keys=scholar.ref_keys(m[1] or m[2],refs)
            if not keys:return m[0]
            cid=uuid.uuid4().hex[:16];tag='LXREF'+cid+'END';label='['+', '.join(str(order.setdefault(k,len(order)+1)) for k in keys)+']'
            if styled:label=styled['groups'].get(','.join(keys),label)
            occur[cid]=dict(block=b['id'],start=m.start(),original=m[0],sentence=sentence(b,m),keys=keys,tag=tag,label=label,rev=b['rev'])
            return tag
        out.append(dict(b,text=rx.sub(sub,b['text'])))
    must(occur,'选定正文中没有可识别的项目书目引用')
    parts,_=scholar.export_parts(out,'docx',refs,p.get('exhibits',{}),lambda sha:blob(db,sha))
    import document_figures, equation_numbers
    parts,_=document_figures.project_export(db,p,p,parts,'docx',blob)
    parts=equation_numbers.materialize(parts,'docx',p['blocks'])
    # Managed figure/table content has its own provenance. Exchange only manuscript citation occurrences.
    parts=[v for v in parts if v['id']!='_bibliography']
    parts.append(dict(id='_refs',title='References',parent=None,format='md',text='LXBBLEND'))
    raw=formats.export(parts,'docx');z=zipfile.ZipFile(io.BytesIO(raw));doc=xml(z,'word/document.xml')
    used=set()
    for t in list(doc.iter(W+'t')):
        text=t.text or '';matches=list(re.finditer(r'LXREF([0-9a-f]{16})END|LXBBLEND',text))
        if not matches:continue
        run=t.getparent();parent=run.getparent();idx=parent.index(run);pos=0;new=[]
        for m in matches:
            if m.start()>pos:new.append(runtext('t',text[pos:m.start()]))
            if m[1]:
                cid=m[1];o=occur[cid];used.add(cid);label=o['label']
                c=dict(citationID=cid,properties=dict(formattedCitation=label,plainCitation=label,noteIndex=0),citationItems=[items[k] for k in o['keys']],schema='https://github.com/citation-style-language/schema/raw/master/csl-citation.json')
                new+=field(' ADDIN ZOTERO_ITEM CSL_CITATION '+json.dumps(c,ensure_ascii=False)+' ',label)
            else:new+=field(' ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY ','; '.join(x['text'] for x in styled['entries']) if styled else '; '.join('['+str(n)+'] '+refs[k]['title'] for k,n in order.items()))
            pos=m.end()
        new.append(runtext('t',text[pos:]));parent.remove(run)
        for r in new:parent.insert(idx,r);idx+=1
    must(used==set(occur),'某些引文在排版转换中丢失；未创建交接稿')
    for f in fields(doc):occur[f['id']].update(context=f['context'],slot=f['slot'],para=f['para'])
    props=X.Element(CP+'Properties',nsmap={None:CP[1:-1],'vt':VT[1:-1]})
    pref='<data data-version="3" zotero-version="7"><session id="'+token[:8]+'"/><style id="http://www.zotero.org/styles/ieee" hasBibliography="1" bibliographyStyleHasBeenSet="0"/><prefs><pref name="fieldType" value="Field"/><pref name="storeReferences" value="true"/></prefs></data>'
    if style_id:
        from xml.sax.saxutils import quoteattr
        pref=pref.replace('"http://www.zotero.org/styles/ieee"',quoteattr(style_id))
    for i in range(0,len(pref),200):
        v=X.SubElement(props,CP+'property',fmtid='{D5CDD505-2E9C-101B-9397-08002B2CF9AE}',pid=str(i//200+2),name='ZOTERO_PREF_'+str(i//200+1));X.SubElement(v,VT+'lpwstr').text=pref[i:i+200]
    types=xml(z,'[Content_Types].xml');rels=xml(z,'_rels/.rels');name='docProps/custom.xml'
    if not any(x.get('PartName')=='/'+name for x in types):X.SubElement(types,CT+'Override',PartName='/'+name,ContentType='application/vnd.openxmlformats-officedocument.custom-properties+xml')
    if not any(x.get('Target')==name for x in rels):X.SubElement(rels,REL+'Relationship',Id='rIdLxCustom',Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties',Target=name)
    core=xml(z,'docProps/core.xml');i=core.find(DCT+'identifier')
    if i is None:i=X.SubElement(core,DCT+'identifier')
    i.text='manuscript:'+token
    changes={'word/document.xml':enc(doc),name:enc(props),'_rels/.rels':enc(rels),'[Content_Types].xml':enc(types),'docProps/core.xml':enc(core)}
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as dst:
        for n in z.namelist():dst.writestr(n,changes.pop(n) if n in changes else z.read(n))
        for n,data in changes.items():dst.writestr(n,data)
    db.execute('create table if not exists lx_word(token text primary key,project text,body text)')
    db.execute('insert into lx_word values(?,?,?)',(token,p['id'],json.dumps(dict(occur=occur,uris={v['uris'][0]:k for k,v in items.items()}))))
    return dict(name='Word-Zotero-'+p['versions'][-1]['id']+'.docx',data=base64.b64encode(buf.getvalue()).decode())
def inspect(db,p,raw,apply=False):
    must(len(raw)<=50*1024*1024,'Word 文件过大')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        must(sum(x.file_size for x in z.infolist())<220*1024*1024,'解压后的文件过大')
        token=xml(z,'docProps/core.xml').findtext(DCT+'identifier','').removeprefix('manuscript:').removeprefix('lunxu:')
        must(re.fullmatch('[a-f0-9]{32}',token),'不是本项目导出的 Zotero 交接文件；原稿未改')
        must(db.execute("select 1 from sqlite_master where name='lx_word'").fetchone(),'本机还没有此项目的 Word 引文交接基线')
        row=db.execute('select body from lx_word where token=? and project=?',(token,p['id'])).fetchone()
        must(row,'未找到本项目的交接基线，请从本机原项目导回');base=json.loads(row[0]);incoming=fields(xml(z,'word/document.xml'))
    occur=base['occur'];refs=p.get('references',{});bydoi={norm(r['doi']):k for k,r in refs.items() if r.get('doi')}
    groups=defaultdict(list)
    for f in incoming:groups[f['id']].append(f)
    blocks={b['id']:b for b in p['blocks']};changes=defaultdict(list);rows=[];consumed=set()
    same=styled=0;newrefs={}
    for cid,o in occur.items():
        found=groups[cid]
        if not found: # Zotero may recreate a field on replacement; accept only a uniquely located occurrence.
            found=[f for f in incoming if f['id'] not in occur and f['context']==o['context'] and f['slot']==o['slot'] and f['para']==o['para']]
        f=found[0] if len(found)==1 else None
        if f:consumed.add(id(f))
        b=blocks.get(o['block']);s=o['sentence'];keys=[];why=''
        if not f:why='引文字段已删除、解除链接或重复'
        elif not b or s not in b['text'] or f['context']!=o['context']:why='段落或字段位置已变化，需核对原句'
        else:
            for it in f['items']:
                doi=norm(it.get('itemData',{}).get('DOI'));uri={base['uris'][u] for u in it.get('uris',[]) if u in base['uris']}
                k=bydoi.get(doi) if doi else next(iter(uri)) if len(uri)==1 else None
                data=it.get('itemData',{})
                if not k and not uri and re.fullmatch(r'10\.\d{4,9}/[^\s<>"]+',doi) and isinstance(data.get('title'),str) and data['title'].strip():
                    k='Z'+hashlib.sha256(doi.encode()).hexdigest()[:12]
                    if k in refs and norm(refs[k].get('doi'))!=doi:why='新文献键已占用';break
                    newrefs[k]=dict(key=k,doi=doi,title=data['title'],author='; '.join(x.get('literal') or ' '.join(filter(None,[x.get('given'),x.get('family')])) for x in (data.get('author') or []) if isinstance(x,dict)),year=str((data.get('issued',{}).get('date-parts') or [['']])[0][0]))
                if not k or uri and uri!={k}:why='新文献尚未入库或 DOI 与条目标识不一致';break
                if any(it.get(x) for x in ('locator','prefix','suffix','suppress-author','author-only')):why='定位或引用限定发生变化';break
                keys.append(k)
            if not why and keys==o['keys']:
                if f['display']==o['label']:same+=1
                else:styled+=1
                continue
            if not why and (not keys or b['writer'] not in ('word','author') or b['rev']!=o['rev'] or b['text'][o['start']:o['start']+len(o['original'])]!=o['original']):why='正文版本或执笔权已变化，请人工核对'
        entry=dict(block=o['block'],title=(b or {}).get('title',''),sentence=s,old=o['keys'],new=keys,status=why or '文献已替换 · 待重新绑定',field=cid)
        if any(k in newrefs for k in keys):entry['newTitles']=[newrefs[k]['title'] for k in keys if k in newrefs]
        rows.append(entry)
        if not why:changes[o['block']].append((o,keys,entry))
    for f in incoming:
        if id(f) not in consumed:rows.append(dict(block='',title='Word 新增或重复的字段',sentence=f['context'],old=[],new=[],status='未能唯一关联草稿句',field=f['id']))
    report=dict(same=same,style=styled,rows=rows)
    if not apply:return report
    for bid,updates in changes.items():
        for _,ks,_ in updates:
            for k in ks:
                if k in newrefs and k not in refs:scholar.catalog(p,newrefs[k])
        b=blocks[bid];prior=b['text'];text=prior;affected={}
        for o,keys,entry in sorted(updates,key=lambda u:-u[0]['start']):
            at=o['start'];new=('\\cite{'+','.join(keys)+'}' if o['original'].startswith('\\') else '['+', '.join(keys)+']')
            text=text[:at]+new+text[at+len(o['original']):]
            s=o['sentence'];start=prior.rfind(s,0,at+len(s));offset=at-start
            if start>=0 and s[offset:offset+len(o['original'])]==o['original']:
                current,removed=affected.setdefault(s,(s,set()))
                affected[s]=(current[:offset]+new+current[offset+len(o['original']):],removed|set(o['keys']).difference(keys))
        for s,(new,removed) in affected.items():
            for o,keys,entry in updates:
                if entry['sentence']==s:entry['current']=new
            start=prior.index(s) if prior.count(s)==1 else -1
            # A sentence can now cite the same paper twice. Carry links only for the surviving field occurrence.
            mapped={};before=Counter();after=Counter()
            for m in rx.finditer(s):
                ks=scholar.ref_keys(m[1] or m[2],refs)
                repl=next((ks2 for o,ks2,_ in updates if o['start']==start+m.start()),ks)
                changed=next((row for o,_,row in updates if o['start']==start+m.start()),None)
                if changed:changed['needs']=[dict(key=k,occ=after[k]) for k in repl if k not in ks]
                for k in ks:
                    if k in repl:mapped[(k,before[k])]=after[k]
                    before[k]+=1
                after.update(repl)
            records=[]
            for e in b.get('citationEvidence',[]):
                if e['sentence']!=s:records.append(e);continue
                occ=mapped.get((e['key'],e.get('occ',0)))
                if start>=0 and occ is not None and text.count(new)==1:records.append(dict(e,sentence=new,occ=occ))
            b['citationEvidence']=records
        b.update(text=text,rev=b['rev']+1)
    if rows:p.setdefault('wordReviews',[]).append(dict(token=token,rows=copy.deepcopy(rows)))
    return report
