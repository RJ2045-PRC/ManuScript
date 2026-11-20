"""A revision-local view: source offsets refer to the unmodified manuscript."""
import re
from third_party.textfold.tokens import tokenize_text, split_sentences, plain
from third_party.textfold.local_ladder import local

def paragraphs(text, refs):
    rows = []
    for piece in re.finditer(r'\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|\s*\Z)', text):
        raw = piece[0]
        marks=[]
        def citation(m):
            keys = [s.strip().lstrip('@').split('#', 1)[0] for s in re.split(r'[;,]', (m[1] or m[2]))]
            if all(k in refs for k in keys):
                marks.append(m.start());return ''
            return m[0]
        pattern = r'\[([^\[\]\n]+)\]|\\cite[pt]?\{([^{}]+)\}'
        visible = re.sub(pattern, citation, raw)
        toks = tokenize_text(visible)
        spans = split_sentences(toks)
        lad = local({'toks':toks, 'sents':spans}, {}) if spans else {}
        brief = plain(lad.get('brief', []), {}).strip()
        cited = []
        for pos in marks:
            prefix = re.sub(pattern, lambda m: '' if all(s.strip().lstrip('@').split('#',1)[0] in refs for s in re.split(r'[;,]',m[1] or m[2])) else m[0], raw[:pos])
            n = len(tokenize_text(prefix))
            for s,e in spans:
                if s < n <= e:
                    line=plain(toks[s:e], {}).strip()
                    if line not in cited:cited.append(line)
                    break
        rows.append(dict(cited=cited,offset=piece.start(), raw=raw, brief=brief,
                         sentences=[plain(toks[s:e], {}).strip() for s,e in spans]))
    return rows

def revision_rows(block, project):
    """Compare with this chapter's preceding text, skipping unrelated project saves."""
    from difflib import SequenceMatcher
    refs=project.get('references',{})
    rows=paragraphs(block['text'],refs)
    current=None
    for version in reversed(project['versions']):
        prior=next((b for b in version['blocks'] if b['id']==block['id']),None)
        if not prior:break
        if prior['text']==block['text']:
            current=version['id'];continue
        if not current:break
        old=paragraphs(prior['text'],version.get('references',refs))
        def align(before,after):return SequenceMatcher(None,before,after,autojunk=False).get_opcodes()
        for tag,i,j,k,l in align([r['raw'] for r in old],[r['raw'] for r in rows]):
            if tag=='equal' or k==l:continue
            # Only pair paragraphs one-to-one when their positions are unambiguous.
            for n in range(k,l):
                before=old[i+n-k]['sentences'] if j-i==l-k else []
                after=rows[n]['sentences'];changes=[]
                for op,x,y,u,v in align(before,after):
                    if op=='equal':continue
                    a=' '.join(before[x:y]);b=' '.join(after[u:v])
                    # Bound character-diff work for machine-generated, unbroken text.
                    edits=align(a,b) if len(a)*len(b)<2_000_000 else [('replace',0,len(a),0,len(b))]
                    parts=[[t,a[h:m],b[q:z]] for t,h,m,q,z in edits]
                    changes.append({'line':b,'parts':parts})
                if changes:rows[n]['revision']={'from':version['id'],'to':current,'changes':changes}
        break
    return rows
