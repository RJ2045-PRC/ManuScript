"""references operations. Caller owns authorization gate and transaction commit."""
import base64, copy, hashlib, re
from pathlib import Path
import scholar
from project_store import require, get, blob, snapshot, save, asset

OPERATIONS = ["source_page","source_figure","index_status","index_policy","index_rebuild","zotero_sync_notes","citation_format","citation_style","parse_table","evidence_search","citation_bind","bib_export","ref_save","ref_attach","ref_import","exhibit_save","exhibit_remove"]

def remove_exhibit(db, p, a):
    from document_figures import image_path, rewrite_paths
    from manuscript_document import read
    exhibits=p.get('exhibits',{})
    key=a.get('id')
    exhibit=exhibits.get(key)
    require(exhibit and exhibit['kind']=='figure' and exhibit['rev']==a.get('rev'),'图表已变化，请重新打开后重试')
    require(read(p['blocks'])['rev']==a.get('documentRev'),'正文已变化，请重新打开后重试')
    image=get(p['assets'],exhibit['asset'])
    paths={path for path,id in p.get('figureAliases',{}).items() if id==image['id']}
    paths.update((image_path(image),'figures/'+image['sha']+Path(image['name']).suffix.lower()))
    token=re.compile(r'\{\{(?:ref:)?'+re.escape(key)+r'\}\}')
    require(not exhibit.get('block') and not any(
        token.search(b['text']) or rewrite_paths(b['text'],paths,'__probe__')!=b['text'] or
        (b['format']=='tex' and any(path in b['text'] for path in paths)) for b in p['blocks']
    ),'当前稿仍使用此图片，请先处理正文中的链接或章节关联')
    del exhibits[key]
    # Saved drafts, source aliases and packages may still read the original asset.
    snapshot(p,'从附件库移除图片：'+image['name'])
    save(db,p)
    return {'id':key}

def handle(db, p, role, op, a):
    own = role == "author"
    blocks = p["blocks"]
    B = lambda: get(blocks, a.get("block"))
    head = lambda: p["versions"][-1]["id"]
    if op in ('source_page','source_figure'):
        import researchdesk
        require(own,'仅供作者');img=researchdesk.source_page(p,a,db,blob,op=='source_figure')
        if op=='source_page':return img
        require(a['label'].strip() and a['license'].strip(),'请输入出版图号和许可说明')
        rec=scholar.object_put(db,p,dict(kind='figure',caption=a['caption'],credit=a['license'],block=a['block'],data=img),asset,head())
        rec['sourceRegion']={k:a[k] for k in ('key','sha','page','box','label','license')}
        snapshot(p,'引用出版原图：'+a['label']);save(db,p);return rec
    if op in ('index_status','index_policy','index_rebuild','zotero_sync_notes','citation_format','citation_style'):
        import researchdesk
        require(own,'仅供作者工作台')
        if op=='index_policy':
            require(a.get('mode') in ('hybrid','exact'),'未知索引方案');p['settings']['indexMode']=a['mode'];save(db,p);return True
        if op.startswith('index_'):return researchdesk.index_report(db,p,op=='index_rebuild',blob)
        if op=='zotero_sync_notes':
            old=copy.deepcopy(p.get('references',{}));result=researchdesk.sync_notes(p,a);k=result['key']
            if old.get(k)!=p['references'][k]:
                p['references'][k]['rev']=(old.get(k) or {}).get('rev',0)+1;snapshot(p,'同步 Zotero 阅读记录：'+k);save(db,p)
            return result
        draft=None
        if 'text' in a:
            require(isinstance(a['text'],str) and a.get('format','md') in ('md','tex'),'引用排版需要 Markdown 或 LaTeX 文本')
            draft=[dict(id='__document__',text=a['text'],format=a.get('format','md'))]
        settings=p['settings']
        style=a.get('style','ieee')
        if op=='citation_style':require('style' in a or 'csl' in a,'请选择引用样式')
        raw=record=None
        if op=='citation_style' and 'csl' in a:
            require(isinstance(a['csl'],str),'请输入 CSL 样式')
            # File.text() decodes using UTF-8. Parse Unicode even if the XML declares an older encoding.
            xml=re.sub(r'^\s*<\?xml\s[^?]*\?>','',a['csl'].lstrip('\ufeff'),count=1)
            raw=xml.encode()
            style,record=researchdesk.custom_style(raw)
            demo=researchdesk.run_citeproc(raw,[('sample',)],[dict(id='sample',type='article-journal',title='Sample article',
                author=[dict(family='Chen',given='Lina')],issued={'date-parts':[[2024]]})])
            require(demo['groups'].get('sample') and demo['entries'],'CSL 未能生成示例引文和参考文献')
        result=researchdesk.render_cites(p,style,draft,lambda sha:blob(db,sha),source=raw)
        if op=='citation_style':
            if record is not None:
                custom=settings.setdefault('citationStyles',{})
                prior=custom.get(style)
                sha=hashlib.sha256(raw).hexdigest()
                if not prior or prior['sha']!=sha:
                    require(prior or len(custom)<60,'当前项目的自定义 CSL 样式已达上限')
                    stored=asset(db,p,record['title']+'.csl',raw,'引用样式',head())
                    custom[style]={**record,'sha':stored['sha'],'asset':stored['id']}
                    if prior:p['assets']=[item for item in p['assets'] if item['id']!=prior['asset']]
            settings['citationStyle']=style
            save(db,p)
            result.update(style=style,styles=settings.get('citationStyles',{}))
        return result
    if op=='parse_table':
        import csv,io
        require(len(a['text'])<=2000000 and a['sep'] in (',','\t'),'无效数据文件');return list(csv.reader(io.StringIO(a['text'].lstrip('\ufeff')),delimiter=a['sep']))
    if op=='evidence_search':
        return scholar.lookup(db,p,{'mode':p['settings'].get('indexMode','hybrid'),**a},blob)
    if op=='citation_bind':
        require(own,'仅作者可确认引用依据');b=B()
        require(b['rev']==a.get('rev'),'正文已变，请重新打开这处引用')
        sentence=a.get('sentence','');key=a.get('key','');reason=a.get('reason','').strip()
        require(isinstance(sentence,str) and 0<len(sentence)<=12000 and b['text'].count(sentence)==1,'草稿句已经改变或不唯一，需重新定位')
        refs=p.get('references',{})
        marks=re.findall(r'\[([^\[\]\n]+)\]|\\cite(?:t|p)?\{([^}]+)\}',sentence)
        require(key in refs and any(key in scholar.ref_keys(x or y,refs) for x,y in marks),'所选文献并非这句话的引用')
        require(0<len(reason)<=4000,'请说明这段原文具体支持什么')
        pid=a.get('pid');require(isinstance(pid,str) and re.fullmatch('[0-9a-f]{24}',pid),'需要固定的原文片段')
        hits=scholar.lookup(db,p,dict(key=key,pid=pid),blob);require(hits,'原文片段与书目不匹配')
        occ=a.get('occ',0);require(isinstance(occ,int) and 0<=occ<sum(scholar.ref_keys(x or y,refs).count(key) for x,y in marks),'引文位置已变化')
        items=b.setdefault('citationEvidence',[]);old=next((i for i in items if i['sentence']==sentence and i['key']==key and i.get('occ',0)==occ),None)
        item=dict(sentence=sentence,key=key,occ=occ,pid=pid,sha=hits[0]['sha'],page=hits[0]['page'],reason=reason)
        if old==item:return p
        if old:items.remove(old)
        items.append(item);b['rev']+=1;snapshot(p,'绑定引用依据：'+key);save(db,p);return p
    if op=='bib_export':return dict(name='references.bib',data=base64.b64encode(scholar.bib_data(p.get('references',{}))).decode())
    if op=='exhibit_remove':
        require(own,'需作者操作')
        return remove_exhibit(db,p,a)
    if op in ('ref_save','ref_attach','ref_import','exhibit_save'):
        require(own,'需作者操作')
        if op=='ref_save':rec=scholar.catalog(p,a)
        elif op=='ref_attach':
            scholar.attach(db,p,a,base64.b64decode(a['data'],validate=True),asset,head());rec=p['references'][a['key']]
        elif op=='ref_import':
            raw=base64.b64decode(a['data'],validate=True);scholar.import_bib(p,raw,a['kind']);asset(db,p,Path(a['name']).name,raw,'书目导入',head());rec={}
        else:
            rec=scholar.object_put(db,p,a,asset,head())
            if 'rename' in a:
                from document_figures import image_path, assign_filename, rewrite_paths, record_markdown_ownership
                from manuscript_document import read
                require(rec['kind']=='figure' and not a.get('data'),'请单独重命名现有图片')
                require(read(p['blocks'])['rev']==a.get('documentRev'),'正文已变化，请重新打开图片后重试')
                image=get(p['assets'],rec['asset'])
                old=image_path(image)
                new=assign_filename(p,image,a['rename'])
                if new!=old:
                    # Keep old paths resolvable for saved Drafts and previous links.
                    p['figureAliases'].setdefault(old,image['id'])
                    old_paths={path for path,key in p['figureAliases'].items() if key==image['id'] and path!=new}
                    old_revs={b['id']:b['rev'] for b in p['blocks']}
                    for b in p['blocks']:
                        if b['format']!='md':continue
                        text=rewrite_paths(b['text'],old_paths,new)
                        if text!=b['text']:
                            b['text']=text
                            b['rev']+=1
                    record_markdown_ownership(p,p['blocks'],old_revs)
                    rec=dict(rec,renamed=True)
        snapshot(p,dict(ref_save='更新书目',ref_attach='附加文献原件',ref_import='导入书目',exhibit_save='保存论文图表')[op]+'：'+str(rec.get('key') or rec.get('id') or a.get('name','')))
        save(db,p);return rec
    raise ValueError("Unsupported references operation: " + op)
