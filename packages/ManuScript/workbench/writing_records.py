"""Author's chosen cards and brief, retained with the manuscript revision."""
import copy,json

def prepare(db,p,raw):
    if not isinstance(raw,dict) or not isinstance(raw.get('steps'),list) or len(raw['steps'])>60 or not isinstance(raw.get('brief'),str) or len(raw['brief'])>12000:
        raise ValueError('写作计划格式无效')
    row=db.execute('select body from teamspace where id=?',(p['id'],)).fetchone()
    import outline
    nodes=(json.loads(row[0]).get('map') if row else None) or outline.seed(p)
    by={n['id']:n for n in nodes};steps=[];seen=set()
    for step in raw['steps']:
        if not isinstance(step,dict) or not isinstance(step.get('id'),str) or step['id'] not in by or step['id'] in seen or not isinstance(step.get('reason'),str) or len(step['reason'])>2000:
            raise ValueError('卡片已移除、重复或连接理由无效；请重新核对')
        seen.add(step['id']);steps.append(dict(id=step['id'],reason=step['reason'],node=copy.deepcopy(by[step['id']])))
    return dict(steps=steps,brief=raw['brief'])

def markdown(p,b):
    v=p['versions'][-1]['id'];plan=b['writingPlan']
    lines=['# '+b['title']+' · 写作记录','',f'稿件版本：{v}；正文块：{b["id"]}；块修订：{b["rev"]}。',
           '','## 当时选用的卡片','']
    for step in plan['steps']:
        n=step['node'];lines.extend(['### '+n['t'],f'节点：{n["id"]}；父节点：{n.get("p") or "无"}','',n.get('detail',''),''])
        if n.get('anchor'):lines.extend(['原句定位：'+json.dumps(n['anchor'],ensure_ascii=False),''])
    lines+=['## 逻辑链条','']
    for i,step in enumerate(plan['steps'],1):lines.extend([f'{i}. {step["node"]["t"]}', '   '+(step['reason'] or '尚未填写连接理由')])
    lines+=['','## 作者简述','',plan['brief'] or '尚未填写。','','## Draft 正文','',b['text'] or '尚未起草。','',
            '## 本版书目','',json.dumps(p.get('references',{}),ensure_ascii=False,indent=2),'']
    return '\n'.join(lines).encode()
