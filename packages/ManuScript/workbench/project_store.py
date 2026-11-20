"""Shared project primitives; no transaction ownership and no dispatcher imports."""
from pathlib import Path
import base64, copy, datetime, difflib, hashlib, json, os, re, sqlite3, sys, uuid
import formats, scholar, role_policy
from editor_preferences import TOC_DEFAULTS, LOGIC_STYLE_DEFAULT
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
def uid():return uuid.uuid4().hex[:16]
def require(x,msg):
    if not x:raise ValueError(msg)
def get(items,key):
    r=next((x for x in items if x['id']==key),None);require(r is not None,'记录不存在：'+str(key));return r
def block(title,text='',fmt='md',parent=None):
    require(title.strip() and fmt in ('md','tex'),'标题或格式无效')
    return dict(id=uid(),title=title.strip(),text=text,format=fmt,parent=parent,purpose='',chain=[],writer='author',status='构思',rev=0,refs=[],start='',due='',origin=None)
def snapshot(p,label,kind='日常',important=False,actor='author',origin='作者',section_positions=None,exact_notes=False):
    v=dict(id='v'+str(len(p['versions'])+1),label=label,kind=kind,important=bool(important),actor=actor,origin=origin,time=now(),blocks=copy.deepcopy(p['blocks']),bibliography=[s['id'] for s in p['sources'] if s['title'].lower().endswith('.bib')])
    for k in ('references','exhibits'):
        if k in p:v[k]=copy.deepcopy(p[k])
    import draft_context
    from section_notes import carry
    carry(p,v,section_positions)
    draft_context.carry(p,v,uid,section_change=section_positions is not None,exact=exact_notes)
    p['versions'].append(v);return v['id']
def project(title):
    require(title.strip(),'项目名称不能为空')
    p=dict(id=uid(),title=title.strip(),seq=0,blocks=[],versions=[],assets=[],sources=[],notes=[],questions=[],feedback=[],jobs=[],events=[],settings=dict(outline='Agent 先提案',allVersions=False,ganttVersions=False,saveSeconds=60,external=False),summaries=[],handoffs=[])
    p['settings']['floatingToc']=dict(TOC_DEFAULTS)
    p['settings']['logicStyle']=LOGIC_STYLE_DEFAULT
    snapshot(p,'建立项目','里程碑',True);return p
def put_blob(db,data):
    key=hashlib.sha256(data).hexdigest();db.execute('insert or ignore into blobs values (?,?)',(key,data));return key
def blob(db,key):
    row=db.execute('select bytes from blobs where id=?',(key,)).fetchone();require(row,'文件内容不可用');return row[0]
def asset(db,p,name,data,role,ver):
    a=dict(id=uid(),name=Path(name).name,sha=put_blob(db,data),role=role,version=ver,time=now());p['assets'].append(a);return a
def bibliography(db,p,version=None):
    return b'\n'.join(blob(db,get(p['assets'],s['asset'])['sha']) for s in p['sources'] if s['title'].lower().endswith('.bib') and (version is None or s['id'] in version.get('bibliography',[s['id']])) )
def export_manuscript(db,p,v,blocks,fmt):
    refs=v.get('references',{});objs=v.get('exhibits',{})
    import document_figures, equation_numbers
    style=p.get('settings',{}).get('citationStyle','keys')
    formatted=None
    if refs and fmt!='tex' and style!='keys':
        import researchdesk
        formatted=researchdesk.render_cites({**p,'references':refs,'exhibits':objs},style,blocks,lambda sha:blob(db,sha))
    items,files=scholar.export_parts(blocks,fmt,refs,objs,lambda k:blob(db,k),formatted) if refs or objs else (blocks,{})
    items,media=document_figures.project_export(db,p,v,items,fmt,blob)
    items=equation_numbers.materialize(items,fmt,v['blocks'])
    if not files and not media and not refs and not objs:return formats.export(items,fmt,bibliography(db,p,v)),fmt
    files.update(media)
    bib=bibliography(db,p,v)
    if fmt=='tex' and refs:bib=scholar.bib_data(refs)
    if fmt=='tex':
        import manuscript_document
        parts=[]
        for i,b in enumerate(items):
            section=manuscript_document.prefix(b,items,i)+b['text']
            parts.append(section if b['format']=='md' else '\n\n```{=latex}\n'+section+'\n```\n\n')
        md=''.join(parts)
        raw=formats.cmd(['pandoc','--sandbox','-s','-f','markdown','-t','latex','--wrap=none','--natbib',*(['-V','biblio-files=references.bib'] if bib else [])],md.encode())
        if bib and b'\\bibliography{' not in raw:
            raw=raw.replace(b'\\end{document}',b'\\bibliographystyle{plainnat}\n\\bibliography{references}\n\\end{document}')
    else:raw=formats.export(items,fmt,bib)
    if fmt=='tex' and bib:files['references.bib']=bib
    if files:
        import io,zipfile
        out=io.BytesIO()
        with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('manuscript.'+fmt,raw)
            for name,data in files.items():z.writestr(name,data)
        return out.getvalue(),fmt+'.zip'
    return raw,fmt
def align(p,f):
    old=get(p['versions'],f['basis']); q=f.get('quote','')
    hits=[b for b in old['blocks'] if q and q in b['text']]
    oldid=hits[0]['id'] if len(hits)==1 and hits[0]['text'].count(q)==1 else None
    cur=next((b for b in p['blocks'] if b['id']==oldid),None)
    return oldid,('原句仍在' if cur and q in cur['text'] else '同块已改写' if cur and cur['text'].strip() else '待定位')
def feedback_items(p,items,aid,basis,origin):
    get(p['versions'],basis)
    for f in items:
        f.update(id=uid(),basis=basis,asset=aid,origin=origin,status='待讨论',decisions=[])
        f['block'],f['alignment']=align(p,f);f['originalBlock']=f['block'];p['feedback'].append(f)
def newjob(p,kind,bid,prompt,context):
    require(kind in ('框架','搜证','写作','审查','解释','拆解','摘要','统筹','支持','内审'),'未知任务')
    b=get(p['blocks'],bid) if bid else None
    j=dict(id=uid(),kind=kind,block=bid,instruction=prompt,context=context,rev=b['rev'] if b else None,status='待执行',time=now(),result=None)
    j['role']=role_policy.KINDS[kind];j['assignmentRev']=0
    p['jobs'].append(j);return j
def validate_refs(p,refs):
    for r in refs:
        s=get(p['sources'],r['source']);require(str(r.get('locator','')).strip(),'请注明页、节或表');require(s['title'],'缺少来源')
def check_team_map(nodes):
    require(isinstance(nodes,list) and 0<len(nodes)<=2500,'地图节点数无效')
    ids={n['id']:n for n in nodes}
    require(len(ids)==len(nodes) and 'root' in ids and ids['root'].get('p') is None,'无效的地图根节点')
    for n in nodes:
        require(isinstance(n.get('t'),str) and isinstance(n['id'],str),'无效的地图主题')
        path=set();k=n['id']
        while k!='root':
            require(k in ids and k not in path and len(path)<300,'无效的地图层级');path.add(k);k=ids[k].get('p')
    return nodes
def artifact_folder(db,p,name):
    require(isinstance(name,str) and len(name)<=120 and not name.startswith('.') and not re.search(r'[/\\:\x00-\x1f]',name) and Path(name).suffix.lower() in ('.md','.txt','.tex','.csv','.tsv','.bib','.json','.yaml','.yml','.py','.js','.css','.html'),'仅支持项目内的命名文本文件')
    root=Path(db.execute('pragma database_list').fetchone()[2]).parent
    folder=root/'project-files'/p['id'];require(folder.resolve()==folder,'项目目录路径异常')
    return folder
def save(db,p):
    db.execute('insert or replace into projects values (?,?,?)',(p['id'],p['title'],json.dumps(p,ensure_ascii=False)))
    import manuscript_backup
    manuscript_backup.enqueue(db, p)


def record_change(db,p,role,op,args):
    for feedback in p['feedback']:
        if feedback.get('alignment') not in ('作者定位','作者确认关联'):
            feedback['block'],feedback['alignment']=align(p,feedback)
    p['seq']+=1
    p['events'].append(dict(op=op,actor=role,time=now(),version=p['versions'][-1]['id'],
                            block=args.get('block'),id=args.get('id')))
    save(db,p)
