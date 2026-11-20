"""suggestions operations. Caller owns authorization gate and transaction commit."""
import difflib
import writing_suggestions
from project_store import now, require, get, snapshot, asset, save

OPERATIONS = ["writing_suggestions","writing_suggestion_resolve"]

def handle(db, p, role, op, a):
    own = role == "author"
    blocks = p["blocks"]
    if op=='writing_suggestions':
        require(own,'建议核对只供作者使用')
        if a.get('diff') and a.get('id'):
            s=writing_suggestions.detail(p,a['id'])['suggestion']
            left=s['base']['text'].splitlines(keepends=True);right=s['text'].splitlines(keepends=True)
            rows=[dict(line=i+1,before=''.join(left[i:j]) or None,after=''.join(right[k:l]) or None)
                  for tag,i,j,k,l in difflib.SequenceMatcher(None,left,right).get_opcodes() if tag!='equal']
            return dict(kind='draft',title=s['title'],status=s['status'],version=s['base']['version'],rows=rows)
        return writing_suggestions.detail(p,a['id']) if a.get('id') else writing_suggestions.listing(p,a.get('block'))
    if op=='writing_suggestion_resolve':
        require(own,'只有作者能决定如何采用建议')
        info=writing_suggestions.detail(p,a['id']);sugg=next(s for s in p['writingSuggestions'] if s['id']==a['id'])
        require(sugg['status']!='已采纳','这份建议已经采纳；原始建议仍保留')
        require(a.get('decision') in ('apply','keep'),'未知的核对操作')
        if a['decision']=='apply':
            b=get(blocks,sugg['block']);require(a.get('rev')==b['rev'],'正文又有变化。请更新对照后再保存；核对稿仍保留')
            require(isinstance(a.get('text'),str) and len(a['text'])<=100000,'核对稿过大')
            if a['text']==b['text']:
                sugg.update(status='已保留',resolved=now());p['seq']+=1;p['events'].append(dict(op=op,actor='author',id=sugg['id'],time=now(),decision='keep',reason='正文未变化'));save(db,p);return p
            b.update(text=a['text'],rev=b['rev']+1,writer='author',status='待审查',lastWriter=sugg['actorRole']);b.pop('writerRole',None)
            b['contributors']=list(dict.fromkeys(b.get('contributors',[])+[sugg['actorRole']]))
            ver=snapshot(p,'作者核对 Agent 建议：'+b['title'],origin='作者核对 '+sugg['actor'])
            if b.get('writingPlan') is not None:
                import writing_records
                asset(db,p,'写作记录-'+b['id']+'-'+ver+'.md',writing_records.markdown(p,b),'写作留档',ver)
            sugg.update(status='已采纳',resolved=now(),appliedVersion=ver,appliedText=a['text'])
        else:sugg.update(status='已保留',resolved=now())
        p['seq']+=1;p['events'].append(dict(op=op,actor='author',id=sugg['id'],time=now(),decision=a['decision']))
        save(db,p);return p
    raise ValueError("Unsupported suggestions operation: " + op)
