"""Desktop opens are restricted to a PDF edition already attached to this project."""
import hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path
from urllib import request, parse
from urllib.error import URLError

def _zotero(parent, digest, page):
    if not re.fullmatch(r'[A-Z0-9]{8}', parent or ''):
        raise ValueError('此书目未关联个人 Zotero 库。')
    class NoRedirect(request.HTTPRedirectHandler):
        def redirect_request(self,*args): return None
    local=request.build_opener(request.ProxyHandler({}),NoRedirect())
    def read(s):
        req=request.Request('http://127.0.0.1:23119/api/users/0/items/'+s,headers={'Zotero-API-Version':'3'})
        with local.open(req,timeout=3) as response:return response.read()
    try:
        for start in range(0,500,50):
            children=json.loads(read(f'{parent}/children?itemType=attachment&limit=50&start={start}'))
            for child in children:
                data=child['data'];key=child['key']
                if data.get('parentItem')!=parent or data.get('contentType')!='application/pdf' or not re.fullmatch(r'[A-Z0-9]{8}',key):continue
                try:
                    uri=parse.urlsplit(read(key+'/file/view/url').decode().strip())
                    if uri.scheme!='file' or uri.netloc not in ('','localhost'):continue
                    path=Path(parse.unquote(uri.path))
                    if not path.is_file() or path.stat().st_size>50*1024*1024:continue
                    if hashlib.sha256(path.read_bytes()).hexdigest()==digest:
                        return f'zotero://open-pdf/library/items/{key}?page={page}'
                except (OSError,URLError):continue
            if len(children)<50:break
    except (OSError,URLError) as error:raise ValueError('无法读取本机 Zotero。请打开 Zotero 并启用本机 API，或选择本机 PDF 阅读器。') from error
    raise ValueError('Zotero 里未找到与固定原文完全一致的本地 PDF，请使用本机 PDF 阅读器。')

def open_edition(p,a,read_blob,cache,launch=None):
    ref=p.get('references',{}).get(a.get('key'),{})
    ed=next((ed for ed in ref.get('editions',[]) if ed['asset']==a.get('asset')),None)
    page=a.get('page');target=a.get('target','system')
    if not ed or not ed['name'].lower().endswith('.pdf') or type(page)!=int or not 1<=page<=ed['pages'] or target not in ('system','zotero'):
        raise ValueError('未找到对应的 PDF 版本或页码')
    asset=next((v for v in p['assets'] if v['id']==ed['asset'] and v['sha']==ed['sha']),None)
    if not asset or not re.fullmatch('[a-f0-9]{64}',ed['sha']):raise ValueError('附件版本不匹配')
    if target=='zotero':
        dest=_zotero(ref.get('zoteroKey'),ed['sha'],page)
    else:
        raw=read_blob(ed['sha'])
        if hashlib.sha256(raw).hexdigest()!=ed['sha'] or b'%PDF-' not in raw[:1024]:raise ValueError('原件校验失败')
        directory=cache/ed['sha'];directory.mkdir(mode=0o700,parents=True,exist_ok=True)
        clean=re.sub(r'[^\w .()\-]','_',Path(ed['name']).stem)[:70].strip(' .') or '文献'
        dest=directory/(clean+'.pdf')
        # Atomic replacement also restores a copy that an external editor changed.
        with tempfile.NamedTemporaryFile(dir=directory,delete=False) as f:
            tmp=Path(f.name)
            try:f.write(raw);f.flush();os.chmod(tmp,0o400);os.replace(tmp,dest)
            finally:tmp.unlink(missing_ok=True)
    if launch:launch(str(dest))
    elif sys.platform=='darwin':subprocess.run(['/usr/bin/open',str(dest)],check=True,timeout=12)
    elif os.name=='nt':os.startfile(str(dest))
    else:subprocess.run(['xdg-open',str(dest)],check=True,timeout=12)
    return {'target':target,'page':page}
