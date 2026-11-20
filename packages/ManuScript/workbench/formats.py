"""Manuscripts and review files. Uploaded originals never pass through a conversion."""
import io, os, sys, re, subprocess, tempfile, shutil, zipfile
from pathlib import Path
from lxml import etree as E
from docx import Document
from pypdf import PdfReader
import pdfplumber

W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def cmd(argv,data=None):
    env=None
    if 'soffice' in Path(argv[0]).name and sys.platform=='darwin' and not os.environ.get('FONTCONFIG_FILE'):
        config=Path('/opt/homebrew/etc/fonts/fonts.conf')
        if config.exists():env={**os.environ,'FONTCONFIG_FILE':str(config)}
    p=subprocess.run(argv,input=data,capture_output=True,timeout=75,env=env)
    if p.returncode: raise ValueError(p.stderr.decode(errors='replace')[-900:] or '转换失败')
    return p.stdout
def pandoc(data,src,dst):
    return cmd([shutil.which('pandoc') or '/opt/homebrew/bin/pandoc','--sandbox','--wrap=none','-f',src,'-t',dst],data)
def chunks(name,data):
    ext=Path(name).suffix.lower()
    if ext=='.pdf':
        pages=[]
        for i,page in enumerate(PdfReader(io.BytesIO(data)).pages,1):
            layout=page.extract_text(extraction_mode='layout') or page.extract_text() or ''
            raw='\n\n'.join(re.sub(r'\s+',' ',s).strip() for s in re.split(r'\n[ \t]*\n',layout.strip()) if s.strip())
            if raw:pages.append(dict(title=f'{Path(name).stem} · 第 {i} 页',text=raw,depth=1,format='md'))
        if not pages:raise ValueError('未找到可提取的 PDF 文字；扫描件请先 OCR')
        return pages
    if ext=='.docx':
        text=pandoc(data,'docx','markdown').decode()
        ext='.md'
    else: text=data.decode('utf-8-sig')
    if ext not in ('.md','.markdown','.tex'):raise ValueError('主稿支持 Word、LaTeX、Markdown')
    if ext=='.tex':
        body=text.partition(r'\begin{document}')[2] if r'\begin{document}' in text else text
        body=body.partition(r'\end{document}')[0];body=re.sub(r'(?m)^\\bibliograph(?:ystyle|y)\{[^{}]*\}\s*$', '',body)
        pattern=r'(?m)^\s*\\(section|subsection|subsubsection)\*?\{([^{}]+)\}\s*'
    else:body=text;pattern=r'(?m)^(#{1,6})[ \t]+([^\n]+)\n?'
    matches=list(re.finditer(pattern,body));result=[]
    def add(title,content,depth): result.append({'title':title.strip(),'text':content.strip(),'depth':depth,'format':'tex' if ext=='.tex' else 'md'})
    if not matches: add(Path(name).stem,body,1)
    else:
        if body[:matches[0].start()].strip():add('前言',body[:matches[0].start()],1)
        for i,m in enumerate(matches):
            depth=({'section':1,'subsection':2,'subsubsection':3}[m[1]] if ext=='.tex' else len(m[1]))
            add(m[2],body[m.end():matches[i+1].start() if i+1<len(matches) else None],depth)
    return result

def feedback(name,data):
    ext=Path(name).suffix.lower()
    if ext=='.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist())>120_000_000:raise ValueError('Word 解压内容过大')
            parse=lambda f:E.fromstring(z.read(f),parser=E.XMLParser(resolve_entities=False,no_network=True))
            doc=parse('word/document.xml')
            comment_nodes=parse('word/comments.xml') if 'word/comments.xml' in z.namelist() else []
            comments={c.get(W+'id'):{'kind':'Word 批注','author':c.get(W+'author') or '', 'message':''.join(c.itertext(W+'t')),'quote':'','changes':[]} for c in comment_nodes}
            active=set();loose=[]
            for el in doc.iter():
                k=E.QName(el).localname
                if k=='commentRangeStart':active.add(el.get(W+'id'))
                if k=='commentRangeEnd':active.discard(el.get(W+'id'))
                if k in ('ins','del'):
                    txt=''.join(el.itertext(W+('t' if k=='ins' else 'delText')))
                    rev={'type':k,'author':el.get(W+'author') or '', 'text':txt}
                    owners=active & comments.keys()
                    for cid in owners:comments[cid]['changes'].append(rev)
                    if not owners:loose.append({'kind':'Word 修订','author':rev['author'],'message':('插入：' if k=='ins' else '删除：')+txt,'quote':txt if k=='del' else '', 'changes':[rev]})
                if k in ('t','delText') and not any(x.tag==W+'ins' for x in el.iterancestors()):
                    for cid in active & comments.keys():comments[cid]['quote']+=el.text or ''
            return list(comments.values())+loose
    if ext=='.pdf':
        result=[]
        with pdfplumber.open(io.BytesIO(data)) as layout:
            for i,p in enumerate(PdfReader(io.BytesIO(data)).pages):
                for ref in p.get('/Annots',[]):
                    a=ref.get_object()
                    if a.get('/Subtype') not in ('/Highlight','/Text','/Underline','/StrikeOut'):continue
                    pts=list(map(float,a.get('/QuadPoints',[])));spans=[]
                    for j in range(0,len(pts)-7,8):
                        xs,ys=pts[j:j+8:2],pts[j+1:j+8:2]
                        chars=[c for c in layout.pages[i].chars if min(xs)<=(c['x0']+c['x1'])/2<=max(xs) and min(ys)<=(c['y0']+c['y1'])/2<=max(ys)]
                        spans.append(''.join(c['text'] for c in sorted(chars,key=lambda c:c['x0'])))
                    result.append({'kind':'PDF 批注','author':str(a.get('/T','')),'message':str(a.get('/Contents','')),'quote':' '.join(spans),'page':i+1,'quads':pts})
            if not result:
                for i,p in enumerate(layout.pages):
                    text=p.extract_text() or ''
                    pts=list(re.finditer(r'(?m)^\s*(\d+)[.)、]\s+(.+?)(?=^\s*\d+[.)、]\s+|\Z)',text,re.S|re.M))
                    if pts:
                        result.extend(dict(kind='编号意见',author='',message=m[2].strip(),quote='',page=i+1,number=m[1]) for m in pts)
                    elif text.strip():result.append(dict(kind='待拆解原文',author='',message=text,quote='',page=i+1))
        return result
    text=data.decode('utf-8-sig').strip()
    return [dict(kind='待拆解原文',author='',message=text,quote='')] if text else []
def markdown(blocks):
    if any('documentPrefix' in b for b in blocks):
        import manuscript_document
        converted=[dict(b,text=b['text'] if b['format']=='md' else pandoc(b['text'].encode(),'latex','markdown').decode().strip()) for b in blocks]
        return ''.join(manuscript_document.prefix(b,blocks,i)+converted[i]['text'] for i,b in enumerate(blocks))
    parts=[]
    for b in blocks:
        level=1; par=b.get('parent'); seen=set()
        while par and par not in seen:
            seen.add(par);level+=1;par=next((x.get('parent') for x in blocks if x['id']==par),None)
        body=b['text'] if b['format']=='md' else pandoc(b['text'].encode(),'latex','markdown').decode().strip()
        parts.append('#'*min(6,level)+' '+b['title']+'\n\n'+body)
    return '\n\n'.join(parts)+'\n'
def export(blocks,fmt,bib=None):
    if fmt=='tex':
        parts=[r'\documentclass{article}',r'\usepackage{amsmath}',r'\begin{document}']
        if any('documentPrefix' in b for b in blocks) and all(b['format']=='md' for b in blocks):
            parts.append(pandoc(markdown(blocks).encode(),'markdown','latex').decode())
            if bib:parts.extend([r'\bibliographystyle{plain}',r'\bibliography{references}'])
            return ('\n\n'.join(parts)+'\n\\end{document}\n').encode()
        for b in blocks:
            if 'documentPrefix' in b and b['format']=='tex':
                parts.append(b['documentPrefix']+b['text']);continue
            title=''.join({'&':r'\&','%':r'\%','#':r'\#','_':r'\_','{':r'\{','}':r'\}','$':r'\$'}.get(c,c) for c in b['title'])
            parts.extend([('\\subsection' if b.get('parent') else '\\section')+'{'+title+'}',b['text'] if b['format']=='tex' else pandoc(b['text'].encode(),'markdown','latex').decode().strip()])
        if bib:parts.extend([r'\bibliographystyle{plain}',r'\bibliography{references}'])
        return ('\n\n'.join(parts)+'\n\\end{document}\n').encode()
    md=markdown(blocks).encode()
    if fmt=='md': return md
    if fmt not in ('docx','pdf'):raise ValueError('不支持的导出格式')
    if bib:
        with tempfile.TemporaryDirectory() as tmp:
            ref=Path(tmp)/'references.bib';ref.write_bytes(bib)
            doc=cmd([shutil.which('pandoc') or '/opt/homebrew/bin/pandoc','--sandbox','--citeproc','--bibliography',str(ref),'-f','markdown','-t','docx'],md)
    else:doc=pandoc(md,'markdown','docx')
    if fmt=='docx':return doc
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);(p/'paper.docx').write_bytes(doc)
        soffice=shutil.which('soffice') or '/Applications/LibreOffice.app/Contents/MacOS/soffice'
        cmd([soffice,'-env:UserInstallation='+ (p/'office').as_uri(),'--headless','--convert-to','pdf','--outdir',d,str(p/'paper.docx')])
        return (p/'paper.pdf').read_bytes()
