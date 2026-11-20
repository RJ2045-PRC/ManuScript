"""Small local latent-semantic index; learned from this project's source passages, not a remote model."""
import hashlib,io,re,collections
D=768;ALG='project-lsa-1'
ALIASES={'抗拉强度':'ultimate tensile strength uts','导电率':'electrical conductivity iacs','电导率':'electrical conductivity iacs','重熔':'remelting remelted','时效':'aging ageing aged','致密度':'relative density','机器学习':'machine learning','不确定性':'uncertainty','研究方法':'methods methodology','局限':'limitation limitations'}
STOP=set('and the a an of to from as by in is are were was for that figure fig with this on et al at or it not can which be has have under after into their'.split())
def vector(text,np):
    text=text.lower()
    for k,v in ALIASES.items():
        if k in text:text+=' '+v
    terms=[]
    for s in re.findall(r'[a-z]+[a-z0-9]*|\d+(?:\.\d+)?|[\u3400-\u9fff]+',text):
        if s in STOP:continue
        terms.extend([s] if s[0].isascii() or len(s)<2 else [s[i:i+2] for i in range(len(s)-1)])
    x=np.zeros(D,dtype='float32')
    for s,c in collections.Counter(terms).items():
        h=int.from_bytes(hashlib.blake2s(s.encode(),digest_size=4).digest(),'little')%D
        x[h]+=1+np.log(c)
    return x
def rank(db,editions,query):
    if not editions or not query:return []
    import numpy as np
    shas=sorted(set(editions));fingerprint=hashlib.sha256((ALG+''.join(shas)).encode()).hexdigest();db.execute('create table if not exists evidence_lsa(id text primary key, model blob)')
    cached=db.execute('select model from evidence_lsa where id=?',(fingerprint,)).fetchone()
    if not cached:
        docs=[]
        for s in shas:
            docs.extend(db.execute('select pid,text from evidence_fts where sha=? order by rowid limit 12001',(s,)).fetchall())
            if len(docs)>12000:return []  # lexical index remains available
        if not docs:return []
        xs=np.stack([vector(t,np) for _,t in docs]);idf=(np.log((len(xs)+1)/((xs>0).sum(axis=0)+1))+1).astype('float32')
        xs*=idf;xs/=np.maximum(np.linalg.norm(xs,axis=1,keepdims=True),1e-8)
        k=min(48,max(1,len(xs)//3),D)
        rng=np.random.default_rng(41);G=rng.standard_normal((D,min(k+8,len(xs),D)),dtype='float32');Y=xs@G
        Q=np.linalg.qr(Y,mode='reduced')[0];_,_,vt=np.linalg.svd(Q.T@xs,full_matrices=False);basis=vt[:k].copy();emb=xs@basis.T;emb/=np.maximum(np.linalg.norm(emb,axis=1,keepdims=True),1e-8);ids=np.array([i for i,_ in docs])
        out=io.BytesIO();np.savez_compressed(out,idf=idf,basis=basis,emb=emb,ids=ids);db.execute('insert or replace into evidence_lsa values (?,?)',(fingerprint,out.getvalue()))
    else:
        with np.load(io.BytesIO(cached[0]),allow_pickle=False) as cache:idf,basis,emb,ids=[cache[x] for x in ('idf','basis','emb','ids')]
    q=(vector(query,np)*idf)@basis.T;n=np.linalg.norm(q)
    if n<1e-6:return []
    scores=emb@(q/n)
    return [str(ids[i]) for i in np.argsort(-scores)[:15] if scores[i]>.23]
