from pathlib import Path
import base64, copy, datetime, difflib, hashlib, json, os, re, sqlite3, sys, uuid
import formats, outline, scholar, role_policy, writing_suggestions, manuscript_backup
from editor_preferences import TOC_DEFAULTS, validate_toc, LOGIC_STYLE_DEFAULT, validate_logic_style, FIGURE_LABEL_DEFAULT, validate_figure_label
from project_store import now, uid, require, get, block, snapshot, project, put_blob, blob, asset, bibliography, export_manuscript, align, feedback_items, newjob, validate_refs, check_team_map, artifact_folder, save, record_change
from features import HANDLERS

def dispatch(db,host,role,op,a):
    own=role=='author'; agent=role=='agent'
    if op.startswith('native_'):
        require(host=='dsh' and role=='binding','仅供 DSH 本机绑定服务')
        import folders
        return folders.dispatch(db,op[7:],a,lambda title:dispatch(db,host,'author','create',{'title':title}))
    if op=='preferences':
        row=db.execute('select body from prefs where id=1').fetchone();return json.loads(row[0]) if row else project('preferences')['settings']
    if op=='list':return [dict(id=i,title=t) for i,t in db.execute('select id,title from projects order by rowid desc')]
    if op=='lessons':return [json.loads(r[0]) for r in db.execute('select body from lessons order by rowid desc')]
    if op=='create':
        require(own,'请由作者创建项目');p=project(a['title']);p['settings'].update(dispatch(db,host,role,'preferences',{}))
        mode=a.get('outline',p['settings']['outline']);require(mode in ('Agent 先提案','作者先搭建'),'未知建稿方式');p['settings']['outline']=mode
        if a.get('idea') and mode=='Agent 先提案':newjob(p,'框架',None,a['idea'],{})
        if a.get('idea') and mode=='作者先搭建':
            p['blocks'].append(block(a['idea']));snapshot(p,'作者搭建首块','里程碑',True)
        save(db,p);return p
    if op=='restore_package':
        import io,zipfile
        require(own,'需作者导入项目');payload=base64.b64decode(a['data'],validate=True)
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            require(sum(i.file_size for i in z.infolist())<=150*1024*1024,'项目展开后过大')
            pack=json.loads(z.read('manifest.json'));require(pack['format'] in ('manuscript-project-1','lunxu-project-1'),'不是 ManuScript 项目文件')
            p=pack['project'];require(isinstance(p['blocks'],list) and p['versions'] and len(p['blocks'])<=2000,'损坏的项目')
            ids={b['id']:b for b in p['blocks']};require(len(ids)==len(p['blocks']),'重复块 ID')
            for b in p['blocks']:
                seen=set();cur=b
                while cur.get('parent'):
                    require(cur['id'] not in seen and cur['parent'] in ids,'无效的父子结构');seen.add(cur['id']);cur=ids[cur['parent']]
            for f in p['assets']:
                key=f['sha'];require(re.fullmatch('[a-f0-9]{64}',key),'无效的文件标识')
                require(put_blob(db,z.read('files/'+key))==key,'项目文件校验失败')
            for key,r in list(p.get('customRoles',{}).items()):p['customRoles'][key]=role_policy.validate_custom(p,dict(r,id=key))
            p['id']=uid();p['title']+='（恢复副本）';save(db,p)
            for name,rec in p.get('teamFiles',{}).items():
                folder=artifact_folder(db,p,name);folder.mkdir(mode=0o700,parents=True,exist_ok=True)
                aa=get(p['assets'],rec['asset']);require(aa['name']==name and aa['sha']==rec['sha'],'项目文件版本不匹配')
                with (folder/name).open('xb') as f:f.write(blob(db,aa['sha']))
            if 'team' in pack:
                t=pack['team'];require(isinstance(t.get('rooms'),dict) and isinstance(t.get('pins'),list) and isinstance(t.get('routes'),dict),'团队记录损坏')
                if t.get('map') is not None:check_team_map(t['map'])
                if pack.get('teamHost')!=host:t['routes']={}
                for entries in t['rooms'].values():
                    for msg in entries:
                        for r in msg.get('receipts',[]):
                            if 'path' in r:
                                name=r.get('name');r['path']=str(artifact_folder(db,p,name)/name) if name in p.get('teamFiles',{}) else ''
                db.execute('insert into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)))
            return p
    if op=='example':
        require(own,'请由作者导入样例')
        payload=(Path(__file__).parent/'example.zip').read_bytes()
        return dispatch(db,host,role,'restore_package',{'data':base64.b64encode(payload).decode()})
    row=db.execute('select body from projects where id=?',(a.get('project'),)).fetchone();require(row,'请先选择项目')
    p=json.loads(row[0]); blocks=p['blocks']; B=lambda:get(blocks,a.get('block')); head=lambda:p['versions'][-1]['id']
    p['settings'].setdefault('floatingToc',dict(TOC_DEFAULTS))
    p['settings'].setdefault('logicStyle',LOGIC_STYLE_DEFAULT)
    p['settings'].setdefault('figureLabelStyle',FIGURE_LABEL_DEFAULT)
    if agent:role_policy.guard(p,op,a)
    handler = HANDLERS.get(op)
    if handler is not None:
        return handler(db, p, role, op, a)
    if op=='role_check':return role_policy.tool(p,a.get('actorRole'),a['tool'],a)
    if op in ('artifact_read','artifact_write','chat_write_block'):
        require(role in ('author','agent'),'需要项目身份')
        if op=='chat_write_block':
            require(agent,'仅限项目 Agent')
            base=writing_suggestions.baseline(p,a.get('block'),a.get('rev'))
            receipt=writing_suggestions.receive(p,a['actorRole'],a['actor'],base,dict(text=a['text']),now())
            save(db,p);return receipt
        name=a['name'];folder=artifact_folder(db,p,name)
        if op=='artifact_write':folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        dest=folder/name
        require(not dest.is_symlink(),'不修改符号链接');files=p.setdefault('teamFiles',{});prior=files.get(name)
        raw=dest.read_bytes() if dest.exists() and dest.stat().st_size<=512000 else None
        require(not dest.exists() or raw is not None,'文件过大')
        if raw is None and prior:raw=blob(db,prior['sha'])
        sha=hashlib.sha256(raw).hexdigest() if raw is not None else None
        if op=='artifact_read':
            require(raw is not None,'未找到文件');return dict(name=name,text=raw.decode('utf8'),sha=sha)
        require(agent and a.get('base')==sha,'文件已存在或已变化，请先读取当前版本')
        require(isinstance(a['text'],str) and 0<len(a['text'])<=100000,'文件长度无效');data=a['text'].encode()
        ver=snapshot(p,'保存文件：'+name,actor='Agent',origin=a['actor']);saved=asset(db,p,name,data,'Agent 项目文件',ver)
        tmp=folder/('.'+uid()+'.tmp')
        try:
            with tmp.open('xb') as f:f.write(data)
            os.replace(tmp,dest)
        finally:tmp.unlink(missing_ok=True)
        rec=dict(name=name,asset=saved['id'],sha=saved['sha'],version=ver,actor=a['actor']);files[name]=rec;save(db,p);return dict(**rec,path=str(dest))
    if op.startswith('idea_'):
        require(own,'导图确认和历史只由作者工作台操作')
        import map_versions
        t=map_versions.team(db,p)
        return map_versions.dispatch(db,p,t,op,a,check_team_map,now)
    if op.startswith('team_'):
        require(own or (agent and op in ('team_arguments','team_outline','team_proposal','team_interview_answer')),'团队空间仅供作者工作台使用')
        row=db.execute('select body from teamspace where id=?',(p['id'],)).fetchone()
        t=json.loads(row[0]) if row else dict(pins=[],routes={},rooms={},map=None)
        if op=='team_state':return dict({k:v for k,v in t.items() if k not in ('ideaHistory','ideaComments')},**role_policy.status(p),headingLinks=t.get('headingLinks',{}),headingLinksRev=t.get('headingLinksRev',0))
        if op in ('team_outline','team_arguments'):
            require(agent,'仅限项目 Agent');r=outline.arguments(p,t,a,uid,check_team_map,snapshot) if op=='team_arguments' else outline.put(p,t,a,block,check_team_map,snapshot)
            if r['count']:
                save(db,p);db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)))
            return r
        if op=='team_interview_answer':
            require(agent,'只从已记录答复提取');hist=t['rooms'].get(a['room'],[])
            msg=next(x for x in reversed(hist) if x['id']==a['turn'] and x['from']=='user')
            q=next(x for x in hist if x['id']==msg.get('replyTo') and x['from']=='agent' and x.get('card'))
            nodes=t.get('map') or outline.seed(p);n=next((x for x in nodes if x['id']==q['node']['id']),None)
            if n is None:return t.get('mapRev',0)
            journal=n.setdefault('discussions',[])
            if not any(v['turn']==msg['id'] for v in journal):journal.append(dict(turn=msg['id'],question=q['card']['question'],answer=msg['text'],time=msg['time']))
            t['map']=nodes;t['mapRev']=t.get('mapRev',0)+1
            db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)));return t['mapRev']
        if op=='team_proposal':
            require(agent,'仅限项目 Agent');nodes=t.get('map') or outline.seed(p);v=a['proposal']
            n=get(nodes,v['node']);require(n['t']==v['base'],'所选主题已变化')
            require(not n.get('proposal') or n['proposal']==v,'此主题已有待审核建议');n['proposal']=v;n['closed']=False
            t['map']=check_team_map(nodes);t['mapRev']=t.get('mapRev',0)+1
            db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)))
            return dict(**v,mapRev=t['mapRev'])
        if op=='team_follow':
            require(type(a.get('follow'))==bool and (not a['follow'] or t['routes'].get('lead')),'请先为主 Agent 选择模型');t['followLead']=a['follow']
        elif op=='team_route':
            role_policy.member(p,a['role'])
            require(not t.get('followLead') or a['role']=='lead' and a.get('route'),'跟随模式下请调整主 Agent 的模型')
            if a.get('route'):t['routes'][a['role']]=a['route']
            else:t['routes'].pop(a['role'],None)
        elif op=='team_pins':
            require(isinstance(a.get('pins'),list),'固定角色无效')
            for k in a['pins']:role_policy.member(p,k)
            t['pins']=list(dict.fromkeys(a['pins']))
        elif op=='team_map':
            nodes=check_team_map(a['map'])
            if 'before' in a and t.get('map') is not None:
                nodes=outline.merge(check_team_map(a['before']),nodes,t['map'])
            elif 'base' in a and a['base']!=t.get('mapRev',0):raise ValueError('地图有新分支，请重新载入并合并修改')
            prior={n['id']:n for n in (t.get('map') or outline.seed(p))};bs={b['id']:b for b in p['blocks']};changed=False
            for n in nodes:
                nid=n['id'];old=prior.get(nid)
                if nid=='root':continue
                if not old and not n.get('assets') and nid not in bs and n.get('ideaOnly') is not True:
                    b=block(n['t'],parent=n['p'] if n['p'] in bs else None);b['id']=nid;b['purpose']=n.get('detail','');bs[nid]=b;p['blocks'].append(b);n['assets']=[nid];changed=True
                elif old and nid in bs and nid not in t.get('headingLinks',{}) and (n['t']!=old['t'] or n.get('detail')!=old.get('detail')):
                    b=bs[nid];b['writer']='author';b.pop('writerRole',None);b['title']=n['t'];b['purpose']=n.get('detail',b['purpose']);b['rev']+=1;changed=True
            if changed:snapshot(p,'更新地图主题');save(db,p)
            t['map']=check_team_map(nodes);t['mapRev']=t.get('mapRev',0)+1
        elif op=='team_record':
            e=a['entry'];t['rooms'].setdefault(a['room'],[]).append(e)
            if e['from'] in ('agent','error'):t.setdefault('unread',{}).setdefault(a['room'],[]).append(e['id'])
        elif op=='team_read':
            ids=t.setdefault('unread',{}).get(a['room'],[])
            if a['id'] in ids:t['unread'][a['room']]=ids[ids.index(a['id'])+1:]
        else:raise ValueError('未知团队操作')
        db.execute('insert or replace into teamspace values (?,?)',(p['id'],json.dumps(t,ensure_ascii=False)));return dict(map=t['map'],mapRev=t['mapRev']) if op=='team_map' and 'before' in a else t['mapRev'] if op=='team_map' else True
    if op=='state':
        from features.logic_work import mark_current
        return mark_current(p)
    if op=='queue':return [j for j in p['jobs'] if j['status']=='待执行']
    if op=='diff':
        left=get(p['versions'],a['from']);right=get(p['versions'],a['to']);out=[]
        for k in dict.fromkeys(x['id'] for x in left['blocks']+right['blocks']):
            x=next((b for b in left['blocks'] if b['id']==k),None);y=next((b for b in right['blocks'] if b['id']==k),None)
            if x==y:continue
            old=x['text'] if x else '';new=y['text'] if y else '';d=difflib.SequenceMatcher(None,old,new,autojunk=False)
            out.append(dict(block=k,title=(y or x)['title'],before=old,after=new,metadata={field:[x and x.get(field),y and y.get(field)] for field in ('title','parent','status','refs') if (x and x.get(field))!=(y and y.get(field))},parts=[[tag,old[i:j],new[m:n]] for tag,i,j,m,n in d.get_opcodes()]))
        return out
    if op=='map_image':
        require(own,'仅作者可插入节点图片')
        raw=base64.b64decode(a['data'],validate=True)
        sig={'image/png':b'\x89PNG\r\n\x1a\n','image/jpeg':b'\xff\xd8\xff','image/webp':b'RIFF'}.get(a.get('mime'))
        require(sig and 0<len(raw)<=8*1024*1024 and raw.startswith(sig) and (sig!=b'RIFF' or raw[8:12]==b'WEBP'),'图片格式或大小无效')
        result=asset(db,p,Path(a['name']).name,raw,'导图图片',head());save(db,p);return dict(id=result['id'])
    if op=='file':
        s=get(p['assets'],a['asset']);return dict(name=s['name'],data=base64.b64encode(blob(db,s['sha'])).decode())
    if op=='source_read':
        s=get(p['sources'],a['source']);aa=get(p['assets'],s['asset']);raw=blob(db,aa['sha']);page=int(a.get('page',1))
        if aa['name'].lower().endswith('.pdf'):
            import io
            pages=formats.PdfReader(io.BytesIO(raw)).pages;require(1<=page<=len(pages),'页码超出范围');txt=pages[page-1].extract_text() or ''
        elif aa['name'].lower().endswith('.zip'):
            import io,zipfile
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                txt='归档目录（未读取其中的数据）：\n'+'\n'.join(z.namelist()[:600])
        elif aa['name'].lower().endswith('.docx'):
            txt='\n'.join(i['text'] for i in formats.chunks(aa['name'],raw))
        else:txt=raw.decode('utf8',errors='replace')
        return dict(source=s['id'],title=s['title'],page=page,sha=aa['sha'],text=txt[:22000])
    if op=='package':
        import io,zipfile
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
            manifest={'format':'manuscript-project-1','project':p}
            tr=db.execute('select body from teamspace where id=?',(p['id'],)).fetchone()
            if tr:manifest.update(team=json.loads(tr[0]),teamHost=host)
            z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False))
            for key in sorted({x['sha'] for x in p['assets']}):z.writestr('files/'+key,blob(db,key))
        return dict(name='ManuScript-'+p['id']+'.zip',data=base64.b64encode(buf.getvalue()).decode())
    if op=='export':
        v=get(p['versions'],a.get('version') or head());fmt=a['format'];items=[get(v['blocks'],a['block'])] if a.get('block') else v['blocks']
        if a.get('includeNotes') or a.get('includeWritingNotes'):
            require(not a.get('block'),'批注导出请使用全文导出')
            import annotation_export
            items,annotations=annotation_export.prepare(p,v,items,fmt,include_original=bool(a.get('includeNotes')),writing_notes=v.get('sectionNotes',[]) if a.get('includeWritingNotes') else [])
            raw,ext=export_manuscript(db,p,v,items,'docx' if fmt=='pdf' and a.get('includeNotes') else fmt)
            if a.get('includeNotes'):raw,ext=annotation_export.finish(raw,ext,fmt,annotations)
        else:raw,ext=export_manuscript(db,p,v,items,fmt)
        return dict(name=v['id']+'.'+ext,data=base64.b64encode(raw).decode())
    require(own or (agent and op=='deliver'),'该操作需要作者本人')
    if op=='add':
        par=a.get('parent') or None
        if par:get(blocks,par)
        b=block(a['title'],a.get('text',''),a.get('format','md'),par);b.update(purpose=a.get('purpose',''),chain=a.get('chain',[]));blocks.append(b);snapshot(p,'添加：'+b['title'])
    elif op=='start_writing':
        import map_versions
        t=map_versions.team(db,p);nodes=t.get('map') or outline.seed(p)
        n=next((n for n in nodes if n['id']==a['node']),None)
        require(n and n['id']!='root' and not n.get('group') and not n.get('ghost') and not n.get('anchor'),'该节点不能作为新章节')
        existing={b['id']:b for b in blocks}
        require(not any(k in existing for k in n.get('assets',[])) and n['id'] not in existing and n['id'] not in t.get('headingLinks',{}),'已有正文，请重新打开节点')
        b=block(n['t'],parent=n['p'] if n['p'] in existing else None);b.update(id=n['id'],purpose=n.get('detail',''))
        blocks.append(b);n.pop('ideaOnly',None);n['assets']=[b['id']];t['map']=nodes;t['mapRev']=t.get('mapRev',0)+1;map_versions.store(db,p,t)
        snapshot(p,'从卡片起草：'+b['title'])
    elif op in ('edit','layout','split','handoff','review_ok','accept'):
        b=B();require(a.get('rev')==b['rev'],'该块已经变化，请重新载入后核对')
        if op=='edit':
            b['writer']='author';b.pop('writerRole',None)
            part=a.get('passage')
            if part:
                old=part['old'];new=part['text'];start=part['offset']
                require(isinstance(start,int) and start>=0 and old and b['text'][start:start+len(old)]==old,'原段已变化')
                require(a['text']==b['text'][:start]+new+b['text'][start+len(old):],'段落编辑不能改动其他段落')
                row=db.execute('select body from teamspace where id=?',(p['id'],)).fetchone()
                if row:
                    t=json.loads(row[0]);n=next((n for n in t.get('map') or [] if n['id']==part.get('node')),None)
                    anchor=(n or {}).get('anchor',{});q=anchor.get('quote')
                    if q and anchor['block']==b['id'] and q in old and q not in new and new.strip() and a['text'].count(new.strip())==1:
                        n['anchor']=dict(block=b['id'],rev=b['rev']+1,quote=new.strip(),version='v'+str(len(p['versions'])+1))
                        if n.get('detail')==q:n['detail']=new.strip()
                        t['mapRev']=t.get('mapRev',0)+1;db.execute('update teamspace set body=? where id=?',(json.dumps(t,ensure_ascii=False),p['id']))
            if 'writingPlan' in a:
                require(not part,'段落摘句编辑不能修改整节写作计划')
                import writing_records
                b['writingPlan']=writing_records.prepare(db,p,a['writingPlan'])
            b['text']=a['text'];b['status']='撰写中' 
        elif op=='layout':
            b['writer']='author';b.pop('writerRole',None)
            par=a.get('parent'); node=par
            while node:require(node!=b['id'],'不能将块移动到自己的子树');node=get(blocks,node)['parent']
            if 'parent' in a:b['parent']=par
            for k in ('title','purpose','chain','start','due'):
                if k in a:b[k]=a[k]
            require(b['title'].strip(),'标题不能为空')
            require(not b['start'] or not b['due'] or b['start']<=b['due'],'结束日期早于开始日期')
        elif op=='split':
            b['writer']='author';b.pop('writerRole',None);n=int(a['offset']);require(0<n<len(b['text']),'请选择块内拆分位置')
            child=block(a['title'],b['text'][n:],b['format'],b['parent']);child['origin']=dict(block=b['id'],version=head(),offset=n);blocks.insert(blocks.index(b)+1,child);b['text']=b['text'][:n];b['status']='撰写中'
        elif op=='handoff':
            require(a['writer'] in ('author','agent','word'),'未知执笔方')
            if a['writer']=='agent':
                who=a.get('assignee','writer');r=role_policy.tool(p,who,'write_block',dict(block=b['id']))
                require(b['writer']!='agent' or b.get('writerRole','writer')==who,'请先交回作者，再交给另一角色')
                b['writerRole']=who
            else:b.pop('writerRole',None)
            # A changed handoff invalidates outstanding writing jobs, which can be reassigned explicitly.
            b['writer']=a['writer'];b['status']='撰写中'
            p['handoffs'].append(dict(block=b['id'],writer=b['writer'],version=head(),time=now()))
        elif op=='review_ok':raise ValueError('请派发审查任务，由审查 Agent 提交有依据的验收结果')
        elif op=='accept':
            require(b['status']=='AI 已核验' and b['writer']=='author','请先完成有依据的审查并交回作者');b['status']='作者已确认'
        b['rev']+=1;snapshot(p,a.get('label') or {'edit':'修改正文','layout':'调整框架','split':'拆分论文块','handoff':'交接执笔','accept':'作者确认'}[op]+'：'+b['title'],important=op=='accept',origin=a.get('origin','作者'))
        if op=='edit' and b.get('writingPlan') is not None:
            import writing_records
            asset(db,p,'写作记录-'+b['id']+'-'+head()+'.md',writing_records.markdown(p,b),'写作留档',head())
        if op=='handoff' and b['writer']=='word':
            asset(db,p,b['id']+'-'+head()+'.docx',export_manuscript(db,p,p['versions'][-1],[b],'docx')[0],'Word 单块交接',head())
    elif op=='archive':
        b=B();require(b['writer']=='author' and b['rev']==a['rev'],'块正在交接或版本已变化');require(not any(c['parent']==b['id'] for c in blocks),'请先移动下级块')
        blocks.remove(b);snapshot(p,'移除：'+b['title'],'结构调整',True)
    elif op=='restore_version':
        require(all(b['writer']=='author' for b in blocks),'请先结束其他执笔任务')
        old=get(p['versions'],a['version']);restored=copy.deepcopy(old['blocks'])
        for b in restored:
            b['rev']=max([c['rev'] for v in p['versions'] for c in v['blocks'] if c['id']==b['id']]+[0])+1
            b['writer']='author';b['status']='待审查' if b['text'] else '构思'
        for k in ('references','exhibits'):
            if k in p:p[k]=copy.deepcopy(old.get(k,{}))
        p['blocks']=restored;snapshot(p,'恢复 '+old['id']+' 为新版本','恢复',True)
        p['sectionNotes']=p['versions'][-1]['sectionNotes']=old.get('sectionNotes',[]).copy()
    elif op=='checkpoint':
        import map_versions
        label=a['label'].strip();require(label,'请输入版本说明')
        snapshot(p,label,a.get('kind','手动'),a.get('important',True),origin=a.get('origin','作者'))
        map_versions.paired_checkpoint(db,p,label,now)
    elif op=='send':
        require(a['kind'] in ('送导师','投稿'),'未知送出类型');v=snapshot(p,a['kind'],a['kind'],True)
        for fmt in a.get('formats',['docx','pdf']):
            raw,ext=export_manuscript(db,p,p['versions'][-1],blocks,fmt);asset(db,p,v+'.'+ext,raw,'送出副本',v)
    elif op=='upload':
        raw=base64.b64decode(a['data'],validate=True);require(len(raw)<=50*1024*1024,'文件超过 50 MiB');name=Path(a['name']).name;intent=a['intent'];basis=a.get('basis') or head();get(p['versions'],basis)
        aa=asset(db,p,name,raw,intent,basis)
        if intent=='参考资料':
            if name.lower().endswith('.bib'):
                scholar.import_bib(p,raw,'bib');snapshot(p,'导入书目：'+name)
            p['sources'].append(dict(id=uid(),title=name,asset=aa['id'],key=a.get('key',''),url=a.get('url',''),sha=aa['sha'],version=basis))
        elif intent=='对旧版的反馈':
            items=formats.feedback(name,raw);require(items,'没有找到可读取的意见；扫描件请粘贴原文');feedback_items(p,items,aa['id'],basis,a.get('origin','审稿人'))
        elif intent=='作者新稿':
            parsed=formats.chunks(name,raw)
            if a.get('block'):
                b=B();require(b['writer'] in ('author','word') and b['rev']==a.get('rev'),'块仍在写作或版本已变化');require(len(parsed)==1,'仅能整块交接；请返回单块文件');b.update(text=parsed[0]['text'],format=parsed[0]['format'],status='撰写中',writer='author',rev=b['rev']+1)
            else:
                parents={}
                for x in parsed:
                    depth=x['depth'];par=next((parents[d] for d in sorted(parents,reverse=True) if d<depth),None)
                    b=block(x['title'],x['text'],x['format'],par);blocks.append(b);parents={d:i for d,i in parents.items() if d<depth};parents[depth]=b['id']
            aa['version']=snapshot(p,'接入：'+name,'接入原稿',True)
        else:raise ValueError('文件用途不明')
    elif op=='feedback':
        feedback_items(p,[dict(kind='粘贴原话',author=a.get('author',''),message=a['message'],quote=a.get('quote',''))],None,a['basis'],a.get('origin','导师'))
    elif op=='locate':
        f=get(p['feedback'],a['id']);b=B();f['block']=b['id'];f['alignment']='作者定位';f['mappingReason']=a.get('reason','')
    elif op=='decide':
        f=get(p['feedback'],a['id']);v=get(p['versions'],a['version']);status=a['status'];reason=a.get('reason','').strip()
        require(status in ('采纳','部分采纳','已解决','不改','待定位'),'未知处置')
        if status in ('采纳','部分采纳','已解决'):require(any(b['id']==f.get('block') and b['text'].strip() for b in v['blocks']),'没有该版正文，请先定位或记录不改理由')
        require(reason,'请记录改在哪里或为什么不改')
        f['status']=status;f['decisions'].append(dict(status=status,version=v['id'],reason=reason,time=now(),actor='author'))
    elif op in ('note','ask'):
        v=get(p['versions'],a['version']);b=get(v['blocks'],a['block']);i=int(a['start']);n=int(a['end'])
        require(0<=i<n<=len(b['text']) and b['text'][i:n]==a['quote'],'选区与该版正文不一致')
        rec=dict(id=uid(),block=b['id'],version=v['id'],start=i,end=n,quote=a['quote'],message=a['message'],actor='author',time=now())
        require(rec['message'].strip(),'内容不能为空')
        if op=='note':
            p['notes'].append(rec)
            if 'draftNotes' in v:v['draftNotes'].append(rec['id'])
        else:p['questions'].append(rec);newjob(p,'解释',b['id'],rec['message'],dict(question=rec['id'],quote=rec['quote'],version=v['id'],pages=a.get('pages',{})))
    elif op=='promote':
        q=get(p['questions'],a['id']);require(q.get('answer') and not q.get('promoted'),'尚无答案或已收录')
        p['notes'].append(dict(**{k:q[k] for k in ('block','version','start','end','quote')},id=uid(),actor='解释 Agent',message=q['answer'],question=q['id'],userQuestion=q['message'],refs=q['refs'],time=now()));q['promoted']=True
        v=get(p['versions'],q['version'])
        if 'draftNotes' in v:v['draftNotes'].append(p['notes'][-1]['id'])
    elif op=='job':
        kind=a['kind'];ctx=a.get('context',{});bid=a.get('block') or None
        if kind in ('写作','审查','搜证'):require(bid,'请选择论文块')
        if kind=='写作':require(not any(j['status']=='待执行' and j['kind']=='写作' and j['block']==bid for j in p['jobs']),'此块已有待执行写作任务')
        if kind in ('写作','审查'):role_policy.allowed_job(p,a.get('assignee',role_policy.KINDS[kind]),kind,get(blocks,bid))
        if kind=='拆解':get(p['feedback'],ctx['feedback'])
        if kind=='摘要':get(p['versions'],ctx['from']);get(p['versions'],ctx['to'])
        require(kind!='解释','请从选区询问')
        j=newjob(p,kind,bid,a['instruction'],ctx);j['role']=a.get('assignee',role_policy.KINDS[kind]);role_policy.allowed_job(p,j['role'],kind,get(blocks,bid) if bid else None);writing_suggestions.remember(p,j)
    elif op=='deliver':
        require(agent,'请由宿主 Agent 交付');j=get(p['jobs'],a['id'])
        if j['kind']=='写作':
            r=a.get('result');require(isinstance(r,dict),'交付内容必须是对象')
            assigned=writing_suggestions.assignment(p,j,a['actorRole'],a.get('taskRev'))
            receipt=writing_suggestions.receive(p,a['actorRole'],a['actor'],assigned['base'],r,now(),j,a.get('taskRev'))
            save(db,p);return dict(p,delivery=receipt)
        require(j['status']=='待执行','任务已交付')
        r=a['result'];require(isinstance(r,dict),'交付内容必须是对象');kind=j['kind'];b=get(blocks,j['block']) if j['block'] else None
        require(j.get('role',role_policy.KINDS[kind])==a.get('actorRole'),'不能代其他角色交付任务')
        require(a.get('taskRev')==j.get('assignmentRev',0),'任务已重新分派或缺少任务修订号，请重新领取')
        role_policy.allowed_job(p,a['actorRole'],kind,b)
        refs=r.get('refs',[]);validate_refs(p,refs)
        if kind=='解释' or (kind=='审查' and r.get('passed') is True):
            for ref in refs:
                require(type(ref.get('page'))==int and ref['page']>=1 and len(ref.get('quote','').strip())>=8,'解释或通过审查须附原文短引和实际页码')
                src=dispatch(db,host,role,'source_read',dict(project=p['id'],source=ref['source'],page=ref['page']))
                norm=lambda txt:''.join(txt.casefold().split())
                require(norm(ref['quote']) in norm(src['text']),'原文短引未在所引页找到')
        if kind=='审查':require(j['rev']==b['rev'],'正文已变化，需要重新派发')
        if kind=='审查':
            require(r.get('detail'),'请给出核验理由');require(r.get('passed') is not True or (refs and b['text'].strip()),'通过需正文及定位证据')
            b.update(status='AI 已核验' if r.get('passed') is True else '需返工',refs=refs,rev=b['rev']+1);snapshot(p,'审查：'+b['title'],actor='Agent',origin='审查 Agent')
        elif kind=='解释':
            require(refs and r.get('text'),'解释需要答案及出处');q=get(p['questions'],j['context']['question']);q.update(answer=r['text'],refs=refs,answered=now())
        elif kind=='搜证':require(refs,'搜证需提供资料定位')
        elif kind in ('支持','内审'):require(isinstance(r.get('text'),str) and r['text'].strip(),'需要交付说明及未完成事项')
        elif kind=='框架':require(isinstance(r.get('blocks'),list) and 0<len(r['blocks'])<=150 and all(isinstance(x.get('title'),str) and x['title'].strip() for x in r['blocks']),'框架需包含有标题的块')
        elif kind=='拆解':require(isinstance(r.get('items'),list) and r['items'] and all(x.get('message','') in get(p['feedback'],j['context']['feedback'])['message'] and x.get('message','').strip() for x in r['items']),'拆解须保留原话')
        elif kind=='摘要':
            require(r.get('text'),'请给出版本差异摘要');p['summaries'].append(dict(**j['context'],text=r['text'],actor='Agent'))
        j.update(status='已交付',result=r,delivered=now())
    elif op=='apply':
        j=get(p['jobs'],a['id']);require(j['status']=='已交付' and j['kind'] in ('框架','拆解','统筹'),'没有待采用的提案')
        if j['kind']=='框架':
            for x in a.get('blocks',j['result']['blocks']):
                par=x.get('parent');par=get(blocks,par)['id'] if par else None
                b=block(x['title'],parent=par);b.update(purpose=x.get('purpose',''),chain=x.get('chain',[]));blocks.append(b)
            snapshot(p,'作者采用框架提案','里程碑',True)
        elif j['kind']=='统筹':
            for t in a.get('tasks',j['result'].get('tasks',[])):
                require(t['kind'] in ('搜证','写作','审查'),'统筹只可分派搜证、写作或审查')
                target=get(blocks,t['block'])
                role_policy.allowed_job(p,role_policy.KINDS[t['kind']],t['kind'],target)
                newjob(p,t['kind'],target['id'],t['instruction'],{})
            snapshot(p,'作者确认分工','里程碑',True)
        else:
            f=get(p['feedback'],j['context']['feedback'])
            for x in a.get('items',j['result']['items']):
                require(x['message'] and x['message'] in f['message'],'原话必须保留')
                feedback_items(p,[dict(kind='拆解意见',author=f['author'],message=x['message'],quote=x.get('quote',''),parent=f['id'])],f['asset'],f['basis'],f['origin'])
                if x.get('block'):p['feedback'][-1].update(block=get(blocks,x['block'])['id'],alignment='作者确认关联')
            f['status']='已拆解'
        j['status']='已采用'
    elif op=='settings':
        for k,v in a['values'].items():
            require(k in p['settings'],'未知设置')
            if k=='floatingToc':v=validate_toc(v)
            elif k=='logicStyle':v=validate_logic_style(v)
            elif k=='figureLabelStyle':v=validate_figure_label(v)
            elif k=='saveSeconds':require(type(v)==int and 5<=v<=3600,'保存间隔为 5–3600 秒')
            elif k=='outline':require(v in ('Agent 先提案','作者先搭建'),'未知偏好')
            else:require(type(v)==bool,'需要布尔值')
            p['settings'][k]=v
        if a.get('asDefault'):
            defaults={k:v for k,v in p['settings'].items() if k not in ('citationStyles','figureLabelStyle')}
            if str(defaults.get('citationStyle') or '').startswith('custom-'):
                defaults.pop('citationStyle')
            if set(a['values'])=={'logicStyle'}:
                defaults={**dispatch(db,host,role,'preferences',{}),'logicStyle':p['settings']['logicStyle']}
            db.execute('insert or replace into prefs values (1,?)',(json.dumps(defaults),))
    elif op=='lesson':
        require(a['text'].strip(),'经验不能为空');v=get(p['versions'],a['version']);item=dict(id=uid(),project=p['id'],title=p['title'],version=v['id'],text=a['text'],condition=a.get('condition',''),time=now());db.execute('insert into lessons values (?,?)',(item['id'],json.dumps(item)))
    else:raise ValueError('未知操作：'+op)
    record_change(db,p,role,op,a)
    return p
def run(path,role,op,args):
    path=Path(path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    db=sqlite3.connect(path,timeout=30)
    try:
        db.executescript('create table if not exists projects(id text primary key,title text,body text);create table if not exists blobs(id text primary key,bytes blob);create table if not exists lessons(id text primary key,body text);create table if not exists teamspace(id text primary key,body text);create table if not exists prefs(id integer primary key,body text);' + manuscript_backup.SCHEMA)
        db.execute('begin' if op in ('list','state','translation_source','document_read','document_copy','document_import_preview','source_read','diff','export','file','open_reference_pdf','writing_fold','lessons','queue','citation_format') else 'begin immediate')
        before = db.total_changes
        result=dispatch(db,path.parent.name,role,op,args)
        project_id = args.get('project')
        if op == 'native_bind':
            project_id = result['id']
            row = db.execute('select body from projects where id=?', (project_id,)).fetchone()
            manuscript_backup.enqueue(db, json.loads(row[0]))
        changed = db.total_changes != before
        db.commit()
        if isinstance(project_id, str) and (changed or op in ('document_backup_status', 'native_bind')) and manuscript_backup.folder(db, project_id):
            try:
                db.execute('begin immediate')
                status = manuscript_backup.flush(db, project_id)
                db.commit()
            except sqlite3.Error:
                db.rollback()
                status = {'state': 'pending', 'error': '未能确认本地备份，打开正文后重试'}
            if op == 'document_backup_status':
                return status
            if (isinstance(result, dict) and result.get('id') == project_id and 'blocks' in result) or op == 'native_bind':
                result['manuscriptBackup'] = status
        return result if op != 'document_backup_status' else {'state': 'unbound'}
    finally:db.close()
if __name__=='__main__':
    try:
        os.umask(0o077);q=json.load(sys.stdin);r=run(sys.argv[1],q['role'],q['op'],q.get('args',{}));print(json.dumps({'ok':True,'result':r},ensure_ascii=False))
    except Exception as e:print(json.dumps({'ok':False,'error':str(e)},ensure_ascii=False))
