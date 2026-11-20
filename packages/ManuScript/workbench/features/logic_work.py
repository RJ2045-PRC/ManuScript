"""Version-bound interpretation jobs. Engine owns transactions; no manuscript writes."""
import copy, hashlib, json, re
from project_store import require, save, uid, now

OPERATIONS = ['work_status','work_begin','work_task','work_result','work_check','work_finish','work_stop']
SCHEMA = 2
RELATIONS = ('推进','支持','对照','转折','假设','限制','并列','质疑','归纳','启示')

def digest(v):
    return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def figures(p,b):
    out=[]
    for key,o in p.get('exhibits',{}).items():
        if o.get('block')==b['id'] or '{{'+key+'}}' in b.get('text','') or '{{ref:'+key+'}}' in b.get('text',''):
            asset=next((a for a in p.get('assets',[]) if a['id']==o.get('asset')),None)
            out.append(dict(id=key,caption=o.get('caption',''),asset=o.get('asset'),sha=asset and asset['sha'],rows=o.get('rows')))
    guide=p.get('readingGuide',{});article=guide.get('article',{})
    section=next((s for s in article.get('sections',[]) if s['id']==b.get('sitSection')),None)
    for key in (section or {}).get('figs',[]):
        f=article.get('figures',{}).get(key)
        if not f:continue
        a=next((a for a in p.get('assets',[]) if a['name']=='Sit-2024-Fig-'+key+'.jpg'),None)
        if a and any(x.get('asset')==a['id'] for x in out):continue
        out.append(dict(id='guide:'+key,caption=f.get('original') or f.get('caption',''),asset=a and a['id'],sha=a['sha'] if a else guide.get('sha'),key=guide.get('key'),page=f.get('page'),rect=f.get('rect')))
    return out

def snapshot(p):
    return dict(title=p['title'],blocks=[dict(id=b['id'],title=b['title'],parent=b.get('parent'),text=b.get('text',''),format=b.get('format','md'),prefix=b.get('documentPrefix'),references={k:v for k,v in p.get('references',{}).items() if k in b.get('text','')},purpose=b.get('purpose',''),writingPlan=b.get('writingPlan'),chain=b.get('chain',[]),figures=figures(p,b)) for b in p['blocks']],references=p.get('references',{}),bibliography=[dict(id=s['id'],asset=s.get('asset')) for s in p.get('sources',[]) if s.get('title','').lower().endswith('.bib')])

def parts(b):
    out=[]
    for i,text in enumerate(x for x in re.split(r'\n\s*\n',b['text']) if x.strip()):
        for offset in range(0,len(text),5000):out.append(dict(id=f"{b['id']}:{i}:{offset}",paragraph=i,offset=offset,text=text[offset:offset+5000]))
    return out

def support_kind(b):
    # Only unambiguous back matter headings. Appendices and scientific headings stay analytical.
    title=re.sub(r'^\s*(?:\d+(?:\.\d+)*[.、]?\s+|#+\s*)','',b['title']).strip().lower()
    if re.fullmatch(r'(?:参考文献(?:列表)?|引用文献|references|reference list|list of references|bibliography|works cited)(?:\s*[：:].*)?',title):return '参考文献'
    if re.fullmatch(r'(?:致谢|贡献|资助|数据声明|数据可用性|利益冲突|作者贡献)(?:[、，与及和 /]*(?:致谢|贡献|资助|数据声明|数据可用性|利益冲突|作者贡献))*',title) or title in ('acknowledgments','acknowledgements','author contributions','funding','data availability','conflict of interest','conflicts of interest'):return '声明与致谢'
    return ''

def reference_list_ids(blocks):
    excluded={b['id'] for b in blocks if support_kind(b)=='参考文献'}
    children={}
    for b in blocks:
        children.setdefault(b.get('parent'),[]).append(b['id'])
    pending=list(excluded)
    while pending:
        for child in children.get(pending.pop(),[]):
            if child not in excluded:
                excluded.add(child)
                pending.append(child)
    return excluded

def is_marker(text):
    return bool(re.fullmatch(r'\s*(?:#{1,6}|(?:>\s*)+)\s*',text))

def tasks(snap,prompt_key=''):
    excluded=reference_list_ids(snap['blocks'])
    blocks=[b for b in snap['blocks'] if b['id'] not in excluded]
    outline=[{k:b.get(k) for k in ('id','title','parent','purpose')} for b in blocks]
    out=[]
    for b in blocks:
        if support_kind(b):continue
        pp=[p for p in parts(b) if not is_marker(p['text'])];groups=[];group=[];size=0
        for part in pp:
            if group and (size+len(part['text'])>8000 or len(group)==10):groups.append(group);group=[];size=0
            group.append(part);size+=len(part['text'])
        if group:groups.append(group)
        for i,g in enumerate(groups):
            packet=dict(kind='chapter',schema=SCHEMA,paper=snap['title'],outline=outline,chapter={k:b[k] for k in ('id','title','prefix','references','purpose','writingPlan','chain','figures')},parts=g,previous=groups[i-1][-1]['text'][-800:] if i else '',next=groups[i+1][0]['text'][:800] if i+1<len(groups) else '')
            out.append(dict(id=f"{b['id']}:{i}",block=b['id'],fingerprint=digest([SCHEMA,prompt_key,packet]),packet=packet,status='pending'))
    return out

def chapter_results(run,complete_only=False):
    chapters={}
    excluded=reference_list_ids(run['snapshot']['blocks'])
    for b in run['snapshot']['blocks']:
        if b['id'] in excluded:continue
        ts=[t for t in run['tasks'] if t['block']==b['id']]
        kind=support_kind(b)
        if complete_only and (not ts and not kind or any(t['status']!='done' for t in ts)):continue
        bypara={}
        for t in ts:
            if t['status']!='done':continue
            for part in t['result']['parts']:
                row=bypara.setdefault(str(part['paragraph']),dict(task=[],purpose=[],connection=[],units=[],edges=[],issues=[]))
                for k in ('task','purpose','connection'):
                    if part.get(k) and part[k] not in row[k]:row[k].append(part[k])
                prefix=part['id']+'/'
                units=copy.deepcopy(part['units'])
                if run.get('schema')==2:
                    for u in units:u['id']=prefix+u['id']
                    row['edges'].extend([{**e,'from':prefix+e['from'],'to':prefix+e['to']} for e in part.get('edges',[])])
                row['units'].extend(units);row['issues'].extend(part['issues'])
        chapters[b['id']]=dict(text=b['text'],title=b['title'],basis=digest(b),supportKind=kind,summary='；'.join(t['result']['summary'] for t in ts if t['status']=='done'),paragraphs=bypara,imageEvidence=[e for t in ts if t['status']=='done' for e in t['result'].get('imageEvidence',[])])
    return chapters

def clean_text(v,n=600,empty=False):
    require(isinstance(v,str) and len(v)<=n and (empty or v.strip()),'模型返回的文字为空或过长')
    return v

def validate_structure(result,task):
    """A semantic graph may cite the same exact source more than once."""
    require(isinstance(result,dict),'逻辑结构需要对象')
    summary=clean_text(result.get('summary'),160)
    pp=result.get('parts');expected=task['packet']['parts']
    require(isinstance(pp,list) and len(pp)==len(expected),'未完整整理本批段落')
    rows=[];allowed={f['id'] for f in task['packet']['chapter']['figures']}
    for got,src in zip(pp,expected):
        require(isinstance(got,dict) and got.get('id')==src['id'],'段落身份或顺序错误')
        units=got.get('units');minimum=0 if re.fullmatch(r'\s*#{1,6}\s*',src['text']) else 1
        require(isinstance(units,list) and minimum<=len(units)<=30,'逻辑结构单元数量无效')
        checked=[];ids=set()
        for u in units:
            require(isinstance(u,dict),'逻辑结构单元需要对象')
            key=clean_text(u.get('id'),80);require(key not in ids,'逻辑结构节点编号重复');ids.add(key)
            qq=u.get('quotes');require(isinstance(qq,list) and 1<=len(qq)<=30,'逻辑原句列表为空或过长')
            quotes=[]
            for item in qq:
                require(isinstance(item,dict),'逻辑原句需要对象')
                q=clean_text(item.get('quote'),5000);start=item.get('start')
                if start is None:
                    start=src['text'].find(q);require(start==src['text'].rfind(q),'重复原句需要准确位置')
                require(type(start)==int and start>=0 and src['text'][start:start+len(q)]==q,'逻辑原句不存在或位置错误')
                quotes.append(dict(quote=q,start=start+src['offset']))
            refs=u.get('figures',[]);require(isinstance(refs,list) and all(isinstance(x,str) and x in allowed for x in refs),'模型引用了不存在的图表')
            checked.append(dict(id=key,label=clean_text(u.get('label'),80),role=clean_text(u.get('role'),40),text=clean_text(u.get('text'),300),quotes=quotes,quote=quotes[0]['quote'],start=quotes[0]['start'],figures=refs))
        edges=got.get('edges');require(isinstance(edges,list) and len(edges)<=60,'逻辑结构关系列表无效')
        links=[]
        for e in edges:
            require(isinstance(e,dict) and e.get('from') in ids and e.get('to') in ids and e['from']!=e['to'],'逻辑结构关系指向未知节点')
            require(e.get('type') in RELATIONS,'未知逻辑关系；只能为：'+ '、'.join(RELATIONS))
            links.append(dict(from_=e['from'],to=e['to'],label=clean_text(e.get('label'),60),type=e['type']))
        links=[{'from':e.pop('from_'),**e} for e in links]
        issues=got.get('issues',[]);require(isinstance(issues,list) and len(issues)<=10,'问题列表无效')
        rows.append(dict(id=src['id'],paragraph=src['paragraph'],task=clean_text(got.get('task'),100),purpose=clean_text(got.get('purpose'),200),connection=clean_text(got.get('connection',''),160,True),units=checked,edges=links,issues=[clean_text(x,300) for x in issues]))
    return dict(schema=SCHEMA,summary=summary,parts=rows,imageEvidence=result.get('imageEvidence',[]))

def validate_result(result,task):
    if task['packet'].get('schema')==2:return validate_structure(result,task)
    require(isinstance(result,dict),'模型结果必须是结构化对象')
    summary=clean_text(result.get('summary'),400)
    pp=result.get('parts');expected=task['packet']['parts'];require(isinstance(pp,list) and len(pp)==len(expected),'模型未完整整理本批段落；必须依次返回全部 ID：'+', '.join(x['id'] for x in expected))
    rows=[];allowed={f['id'] for f in task['packet']['chapter']['figures']}
    for got,src in zip(pp,expected):
        require(isinstance(got,dict) and got.get('id')==src['id'],'模型段落身份或顺序错误')
        # An empty Markdown heading is a structural placeholder, not a claim.
        minimum=0 if re.fullmatch(r'\s*#{1,6}\s*',src['text']) else 1
        units=got.get('units');require(isinstance(units,list) and minimum<=len(units)<=30,f'段落 {src["id"]} 需要 {minimum}–30 个逻辑单元')
        checked=[];last=0
        for u in units:
            require(isinstance(u,dict),'无效逻辑单元')
            q=clean_text(u.get('quote'),5000);start=src['text'].find(q,last);require(start>=0,f'逻辑原句不存在或顺序错误（段落 {src["id"]}，单元 {len(checked)+1}，引文 {q[:80]!r}）；优先使用本段 sourceQuotes 的 quoteRef，不得改写或重叠')
            # A repeated quote needs its actual code-point offset; never guess an occurrence.
            if src['text'].find(q)!=src['text'].rfind(q):
                start=u.get('start');require(type(start)==int and start>=last and src['text'][start:start+len(q)]==q,'重复原句需要准确位置')
            last=start+len(q)
            rel=u.get('relation','推进');require(rel in ('起点','推进','支持','对照','转折','假设','限制','并列'),f'未知逻辑关系 {str(rel)[:60]!r}（段落 {src["id"]}）；relation 只能为：起点、推进、支持、对照、转折、假设、限制、并列')
            refs=u.get('figures',[]);require(isinstance(refs,list) and all(isinstance(x,str) and x in allowed for x in refs),'模型引用了不存在的图表')
            checked.append(dict(role=clean_text(u.get('role'),40),text=clean_text(u.get('text'),400),quote=q,start=start+src['offset'],relation=rel,figures=refs))
        issues=got.get('issues',[]);require(isinstance(issues,list) and len(issues)<=10,'问题列表无效')
        rows.append(dict(id=src['id'],paragraph=src['paragraph'],task=clean_text(got.get('task'),300),connection=clean_text(got.get('connection',''),300,True),units=checked,issues=[clean_text(x,300) for x in issues]))
    return dict(summary=summary,parts=rows,imageEvidence=result.get('imageEvidence',[]))

def public(p,run):
    if not run:return dict(status='idle',percent=0)
    ts=run['tasks'];done=sum(t['status']=='done' for t in ts);failed=sum(t['status']=='error' for t in ts)
    blocks={t['block'] for t in ts};chapters=sum(all(t['status']=='done' for t in ts if t['block']==b) for b in blocks)
    stage=run.get('stage','准备全文');status=run['status']
    percent=100 if status=='done' else min(99,int((1+done+(1 if run.get('overview') else 0))/(len(ts)+3)*100))
    current=snapshot(p);changed=digest(current)!=run['fingerprint']
    snapshot_blocks=run['snapshot']['blocks'];excluded=reference_list_ids(snapshot_blocks)
    local_sections=sum(support_kind(b)=='声明与致谢' for b in snapshot_blocks if b['id'] not in excluded)
    return dict(activeChapters=[t['packet']['chapter']['title'] for t in ts if t['status']=='running'],localSections=local_sections,completedSections=chapters,timings=[dict(chapter=t['packet']['chapter']['title'],**t['timing']) for t in ts if t.get('timing')],id=run['id'],schema=run.get('schema',1),status=status,percent=percent,stage=stage,done=done,total=len(ts),failed=failed,pending=sum(t['status'] in ('pending','running') for t in ts),failures=[dict(chapter=t['packet']['chapter']['title'],error=t.get('error','')) for t in ts if t['status']=='error'],chapters=chapters,totalChapters=len(blocks),route=run['route'],changed=changed,error=run.get('error',''),updated=run['updated'],imageMode=run['imageMode'],reused=sum(bool(t.get('reused')) for t in ts),basis=run['version'])

def handle(db,p,role,op,a):
    require(role in ('author','worker'),'仅供作者发起的 work 任务')
    w=p.setdefault('logicWork',dict(runs=[],published=None));run=next((r for r in w['runs'] if r['id']==a.get('id')),None) if a.get('id') else (w['runs'][-1] if w['runs'] else None)
    if op=='work_status':return public(p,run)
    require(role=='worker','整理写入仅由后台任务执行')
    if op=='work_begin':
        require(not run or run['status']!='running','整篇整理正在执行')
        route=a['route'];require(isinstance(route,dict) and route.get('model'),'请选择模型')
        prompt_key=a.get('promptKey','');require(isinstance(prompt_key,str) and len(prompt_key)<=100,'无效生成规范标识')
        snap=snapshot(p);tt=tasks(snap,prompt_key);require(tt,'尚无需要逻辑整理的正文；参考文献、声明与空标题保留原文')
        cache={}
        for prev in w['runs']:
            if prev['route'].get('provider')==route.get('provider') and prev['route']['model']==route['model'] and prev['imageMode']==a['imageMode']:
                cache.update({t['fingerprint']:t for t in prev['tasks'] if t['status']=='done'})
        # Changing model always means a full run, even if an older run used that model.
        if a.get('force') or (run and (run['route'].get('provider'),run['route']['model'])!=(route.get('provider'),route['model'])):cache={}
        for t in tt:
            if t['fingerprint'] in cache:t.update(status='done',result=copy.deepcopy(cache[t['fingerprint']]['result']),reused=True)
        run=dict(id=uid(),schema=SCHEMA,promptKey=prompt_key,status='running',stage='准备全文',route=route,imageMode=a['imageMode'],version=p['versions'][-1]['id'],snapshot=snap,fingerprint=digest(snap),tasks=tt,updated=now(),created=now())
        w['runs'].append(run);save(db,p);return run
    require(run is not None,'整理记录不存在')
    if op=='work_stop':
        if run['status']=='running':run.update(status=a.get('status','cancelled'),stage='整理已停止',error=str(a.get('error',''))[:500],updated=now());save(db,p)
        return public(p,run)
    require(run['status']=='running','任务已停止，迟到结果未写入')
    if op=='work_task' and a.get('stage'):
        run['stage']=str(a['stage'])[:100];run['updated']=now();save(db,p);return public(p,run)
    if op in ('work_task','work_result'):
        task=next((t for t in run['tasks'] if t['id']==a.get('task')),None);require(task is not None,'段落批次不存在')
        if op=='work_task':run['stage']='正在整理 '+task['packet']['chapter']['title'];task['status']='running';task['started']=now()
        elif a.get('error'):task.update(status='error',error=str(a['error'])[:500],errorCode=str(a.get('errorCode',''))[:80],diagnostic=a.get('diagnostic',{}),attempt=a.get('attempt',1))
        else:task.update(status='done',result=validate_result(a['result'],task),attempt=a.get('attempt',1))
        
        if op=='work_result':
            task['finished']=now()
            if isinstance(a.get('timing'),dict):task['timing']={k:v for k,v in a['timing'].items() if k in ('elapsedMs','modelMs','calls') and isinstance(v,(int,float)) and v>=0}
        run['updated']=now();save(db,p);return public(p,run)
    if op=='work_check':
        task=next((t for t in run['tasks'] if t['id']==a.get('task')),None);require(task is not None,'段落批次不存在')
        result=a.get('result');require(isinstance(result,dict),'逻辑结构需要对象')
        clean_text(result.get('summary'),160);got=result.get('parts');require(isinstance(got,list),'未完整整理本批段落')
        expected=task['packet']['parts'];allowed={x['id'] for x in expected}
        require(all(isinstance(x,dict) and x.get('id') in allowed for x in got),'段落身份错误')
        require(len({x['id'] for x in got})==len(got),'段落身份重复')
        valid=[];errors=[]
        for src in expected:
            part=next((p for p in got if p['id']==src['id']),None)
            try:
                require(part is not None,'未完整整理本批段落')
                validate_result({**result,'parts':[part]},{**task,'packet':{**task['packet'],'parts':[src]}})
                valid.append(part)
            except ValueError as e:errors.append(dict(id=src['id'],error=str(e)))
        return dict(validParts=valid,errors=errors)
    if op=='work_finish':
        if any(t['status']!='done' for t in run['tasks']):run.update(status='partial',stage='部分内容未完成',error=str(a.get('error') or '失败部分可重试；原有呈现保留。')[:500],updated=now());save(db,p);return public(p,run)
        overview=a.get('overview');require(isinstance(overview,dict),'缺少全文框架')
        structured=run.get('schema')==2
        raw_groups=overview.get('groups',[])
        overview=dict(summary=clean_text(overview.get('summary'),240 if structured else 900),connections=overview.get('connections',[]),**({k:overview.get(k) for k in ('question','branches')} if structured else {}))
        expected={t['block'] for t in run['tasks']}
        ids=expected if structured else {b['id'] for b in run['snapshot']['blocks']}
        require(isinstance(overview['connections'],list) and len(overview['connections'])<=len(ids)*4,'全文关系过多')
        for c in overview['connections']:
            require(isinstance(c,dict) and c.get('from') in ids and c.get('to') in ids and c['from']!=c['to'],'全文关系指向未知章节')
            c['text']=clean_text(c.get('text'),100 if structured else 250)
        if structured:
            overview['question']=clean_text(overview['question'],100)
            branches=overview['branches'];require(isinstance(branches,list),'全文框架分支需要列表')
            seen=set();checked=[]
            for b in branches:
                require(isinstance(b,dict) and b.get('block') in expected and b['block'] not in seen,'全文框架分支编号错误或重复');seen.add(b['block'])
                checked.append(dict(block=b['block'],label=clean_text(b.get('label'),100),detail=clean_text(b.get('detail'),240),kind=clean_text(b.get('kind'),40)))
            require(seen==expected,'全文框架未完整覆盖已整理章节');overview['branches']=checked
            keys={m.group(1) for b in run['snapshot']['blocks'] if b['id'] in expected and (m:=re.match(r'^\s*(\d+)(?:[.\s　、:：]|$)',b['title']))}
            require(isinstance(raw_groups,list) and len(raw_groups)<=len(keys),'全文分组数量无效')
            seen_groups=set();groups=[]
            for g in raw_groups:
                require(isinstance(g,dict) and g.get('key') in keys and g['key'] not in seen_groups,'全文分组身份错误');seen_groups.add(g['key'])
                groups.append(dict(key=g['key'],title=clean_text(g.get('title'),80),task=clean_text(g.get('task'),160)))
            overview['groups']=groups
        run['overview']=overview
        if digest(snapshot(p))!=run['fingerprint']:
            run.update(status='stale',stage='稿件已变化，结果待更新',updated=now());save(db,p);return public(p,run)
        chapters=chapter_results(run)
        w['published']=dict(id=run['id'],schema=run.get('schema',1),version=run['version'],route=run['route'],imageMode=run['imageMode'],fingerprint=run['fingerprint'],overview=overview,chapters=chapters,time=now())
        run.update(status='done',stage='已完成',updated=now());save(db,p);return public(p,run)
    raise ValueError('Unsupported work operation: '+op)


def mark_current(p):
    w=p.get('logicWork',{});w.pop('preview',None)
    run=w.get('runs',[])[-1] if w.get('runs') else None
    if run and run.get('schema')==2 and run['status'] in ('running','partial','cancelled','interrupted','error') and digest(snapshot(p))==run['fingerprint']:
        chapters=chapter_results(run,complete_only=True)
        if chapters:w['preview']=dict(id=run['id'],schema=2,route=run['route'],imageMode=run['imageMode'],chapters=chapters,overview=None,preview=True,completed=sum(bool(c['paragraphs']) for c in chapters.values()),total=len({t['block'] for t in run['tasks']}))
    published=p.get('logicWork',{}).get('published')
    if published:
        current=snapshot(p);published['stale']=digest(current)!=published['fingerprint']
        published['staleBlocks']=[];published['proseMatchedBlocks']=[]
        # A standalone, unchanged caption/link to a figure already in the reviewed evidence
        # adds no new claim. Reuse only if the *entire* previous chapter fingerprint matches.
        from document_figures import markup
        for b in current['blocks']:
            chapter=published['chapters'].get(b['id'],{})
            if chapter.get('basis')==digest(b):continue
            prose=b['text']
            for f in b['figures']:
                if f['id'].startswith('guide:'):
                    line=markup(f['caption'],'figures/Sit-2024-'+f['id'][6:]+'.png')
                    prose=re.sub(r'\n\n'+re.escape(line)+r'(?=\n\n|\Z)','',prose)
            if prose!=b['text'] and prose==chapter.get('text') and chapter.get('basis')==digest(dict(b,text=prose)):
                published['proseMatchedBlocks'].append(b['id'])
            else:published['staleBlocks'].append(b['id'])
    return {**p,'readingStructureExcludedBlocks':sorted(reference_list_ids(p['blocks']))}
