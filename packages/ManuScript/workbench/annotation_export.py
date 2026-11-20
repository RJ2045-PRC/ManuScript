"""Optional annotation exports; canonical manuscript and old versions stay untouched."""
import copy,io,re,zipfile,tempfile,shutil
from datetime import datetime
from pathlib import Path
from lxml import etree as E
import draft_context,formats
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R='http://schemas.openxmlformats.org/package/2006/relationships'
C='http://schemas.openxmlformats.org/package/2006/content-types'
E.register_namespace('w',W)
def w(name,**attrs):return E.Element('{'+W+'}'+name,{'{'+W+'}'+k:str(v) for k,v in attrs.items()})
def run(text):
 r=w('r');t=w('t');t.set('{http://www.w3.org/XML/1998/namespace}space','preserve');t.text=text;r.append(t);return r

def prepare(p,v,blocks,fmt,include_original=True,writing_notes=()):
 notes=[n for n in draft_context.notes(p,v) if include_original and (fmt!='md' or not n.get('qa'))];doc=draft_context.read(blocks);text=doc['text'];valid=[];events={}
 for n in notes:
  if n.get('unresolved'):continue
  a,z=n['documentStart'],n['documentEnd']
  if text[a:z]!=n['quote']:continue
  idx=len(valid);valid.append(n)
  if fmt=='md':left=right='=='
  elif fmt=='tex':left=r'\underline{';right='}'
  else:left=f'MSANNOTSTART{idx}TOKEN';right=f'MSANNOTEND{idx}TOKEN'
  events.setdefault(a,[]).append((1,left));events.setdefault(z,[]).append((0,right))
 # Merge overlapping highlights for Markdown; comments remain separate in the list.
 if fmt=='md':
  events={};spans=[]
  for n in sorted(valid,key=lambda n:n['documentStart']):
   a,z=n['documentStart'],n['documentEnd']
   if spans and a<=spans[-1][1]:spans[-1][1]=max(spans[-1][1],z)
   else:spans.append([a,z])
  for a,z in spans:events[a]=[(1,'==')];events[z]=[(0,'==')]
 for note in writing_notes:
  at=note['at']+len(note['heading'])
  if text[note['at']:at]!=note['heading']:continue
  lines=note['text'].splitlines()
  if doc.get('format')=='tex':
   escaped=str.maketrans({c:'\\'+c for c in '#$%&{}_'}|{'\\':r'\textbackslash{}','^':r'\textasciicircum{}','~':r'\textasciitilde{}'})
   detail='\n\n\\begin{quote}\n写作备注：'+ '\n\n'.join(line.translate(escaped) for line in lines)+'\n\\end{quote}\n\n'
  else:
   detail='\n\n> 写作备注：'+ '\n> '.join(re.sub(r'([\\`*_{}\[\]<>#!|])',r'\\\1',line) for line in lines)+'\n\n'
  events.setdefault(at,[]).append((3,detail))
 # Place the same source images at the original offsets before adding note markup:
 # even a note spanning only part of "Table 1" must not move or suppress the table.
 import document_figures
 resources,sections=document_figures.catalog(p,v)
 output=copy.deepcopy(blocks)
 for i,(b,span) in enumerate(zip(output,doc['spans'])):
  start,end=span['start'],span['end'];local=text[start:end]
  local_events={k:list(v) for k,v in events.items() if start<=k<end or i==len(output)-1 and k==end}
  for h in document_figures.placements(b,sections,resources):
   local_events.setdefault(span['body']+h['at'],[]).append((2,'\n\n'+h['markdown']+'\n\n'))
  for at in sorted(local_events,reverse=True):
   local=local[:at-start]+''.join(s for _,s in sorted(local_events[at],key=lambda pair:pair[0]))+local[at-start:]
  b.update(documentPrefix='',text=local,_sourceFiguresPlaced=True)
 if fmt in ('md','tex') and notes:
  if fmt=='md':
   appendix='\n\n---\n\n## 批注\n\n'+''.join(f"- **{n['file']}:{n['lineStart']}–{n['lineEnd']} · {n['version']}** · {n.get('updatedAt',n['time'])}"+(' · 原文已修改' if n.get('unresolved') else '')+'\n  - 原文：'+n['quote'].replace('\n',' ')+'\n  - '+(n['message'] or '仅高亮').replace('\n','\n    ')+'\n' for n in notes)
  else:
   appendix='\n\n## 批注\n\n'+''.join(n['quote'].replace('\n',' ')+' — '+(n['message'] or '仅高亮')+' ('+n.get('updatedAt',n['time'])+')\n\n' for n in notes)
  output[-1]['text']+=appendix
 if fmt in ('docx','pdf'):
  lost=[n for n in notes if n.get('unresolved')]
  if lost:output[-1]['text']+='\n\n## 待定位批注\n\n'+''.join('原文：'+n['quote'].replace('\n',' ')+'\n\n'+(n['message'] or '仅高亮')+' · '+n.get('updatedAt',n['time'])+'\n\n' for n in lost)
 return output,valid

def annotate_docx(raw,notes,margin=False):
 with zipfile.ZipFile(io.BytesIO(raw)) as archive:files={k:archive.read(k) for k in archive.namelist()}
 doc=E.fromstring(files['word/document.xml']);comments=E.Element('{'+W+'}comments');active=set();para_notes={}
 # Pandoc preserves marker strings; handle even markers split across adjacent runs.
 for paragraph in doc.iter('{'+W+'}p'):
  for r in list(paragraph.iter('{'+W+'}r')):
   parent=next((p for p in paragraph.iter() if r in list(p)),None)
   if parent is None:continue
   ts=r.findall('{'+W+'}t');text=''.join(t.text or '' for t in ts)
   if not text:continue
   parts=re.split(r'(MSANNOT(?:START|END)\d+TOKEN)',text)
   if len(parts)==1:
    if active:
     props=r.find('{'+W+'}rPr')
     if props is None:props=w('rPr');r.insert(0,props)
     props.append(w('highlight',val='yellow'));para_notes.setdefault(paragraph,set()).update(active)
    continue
   index=list(parent).index(r);parent.remove(r)
   for part in parts:
    marker=re.fullmatch(r'MSANNOT(START|END)(\d+)TOKEN',part)
    if marker:
     kind,num=marker[1],int(marker[2]);para_notes.setdefault(paragraph,set()).add(num)
     el=w('commentRangeStart' if kind=='START' else 'commentRangeEnd',id=num);parent.insert(index,el);index+=1
     if kind=='START':active.add(num)
     else:
      active.discard(num);rr=w('r');rr.append(w('commentReference',id=num));parent.insert(index,rr);index+=1
    elif part:
     rr=run(part);props=r.find('{'+W+'}rPr')
     if props is not None:rr.insert(0,copy.deepcopy(props))
     if active:
      props=rr.find('{'+W+'}rPr')
      if props is None:props=w('rPr');rr.insert(0,props)
      props.append(w('highlight',val='yellow'));para_notes.setdefault(paragraph,set()).update(active)
     parent.insert(index,rr);index+=1
 for i,n in enumerate(notes):
  c=w('comment',id=i,author='作者' if n['actor']=='author' else n['actor'],date=n.get('updatedAt',n['time']));p=w('p');p.append(run(n['message'] or '仅高亮'));c.append(p);comments.append(c)
 if margin:
  # PDF gets visible left margin notes, independent of a PDF viewer's comment support.
  for paragraph,ids in para_notes.items():
   parent=next((p for p in doc.iter() if paragraph in list(p)),None)
   if parent is None or parent.tag!='{'+W+'}body':continue
   table=w('tbl');pr=w('tblPr');pr.append(w('tblW',w='5000',type='pct'));table.append(pr);grid=w('tblGrid');grid.append(w('gridCol',w='2100'));grid.append(w('gridCol',w='6900'));table.append(grid);tr=w('tr');left=w('tc');right=w('tc')
   for num in sorted(ids):
    note=notes[num]
    if not note['message']:continue
    p=w('p');rr=run(note['message']);props=w('rPr');props.append(w('sz',val='18'));rr.insert(0,props);p.append(rr);left.append(p)
    p=w('p');rr=run(datetime.fromisoformat(note.get('updatedAt',note['time'])).astimezone().strftime('%m-%d %H:%M'));props=w('rPr');props.append(w('sz',val='14'));props.append(w('color',val='666666'));rr.insert(0,props);p.append(rr);left.append(p)
   if not len(left):left.append(w('p'))
   index=list(parent).index(paragraph);parent.remove(paragraph);right.append(paragraph);tr.extend([left,right]);table.append(tr);parent.insert(index,table)
 files['word/document.xml']=E.tostring(doc,encoding='utf-8',xml_declaration=True)
 files['word/comments.xml']=E.tostring(comments,encoding='utf-8',xml_declaration=True)
 rels=E.fromstring(files['word/_rels/document.xml.rels'])
 if not any(el.get('Target')=='comments.xml' for el in rels):E.SubElement(rels,'{'+R+'}Relationship',Id='rIdManuscriptComments',Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',Target='comments.xml')
 files['word/_rels/document.xml.rels']=E.tostring(rels)
 types=E.fromstring(files['[Content_Types].xml'])
 if not any(el.get('PartName')=='/word/comments.xml' for el in types):E.SubElement(types,'{'+C+'}Override',PartName='/word/comments.xml',ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml')
 files['[Content_Types].xml']=E.tostring(types)
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
  for name,data in files.items():archive.writestr(name,data)
 return out.getvalue()

def finish(raw,ext,fmt,notes):
 if fmt not in ('docx','pdf'):return raw,ext
 if ext.endswith('.zip'):
  with zipfile.ZipFile(io.BytesIO(raw)) as z:files={k:z.read(k) for k in z.namelist()}
  doc=files.pop('manuscript.docx')
 else:files={};doc=raw
 doc=annotate_docx(doc,notes,margin=fmt=='pdf')
 if fmt=='pdf':
  with tempfile.TemporaryDirectory() as tmp:
   folder=Path(tmp);(folder/'paper.docx').write_bytes(doc)
   formats.cmd([shutil.which('soffice') or '/Applications/LibreOffice.app/Contents/MacOS/soffice','-env:UserInstallation='+(folder/'office').as_uri(),'--headless','--convert-to','pdf','--outdir',tmp,str(folder/'paper.docx')]);doc=(folder/'paper.pdf').read_bytes()
 if files:
  files['manuscript.'+fmt]=doc;out=io.BytesIO()
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
   for name,data in files.items():z.writestr(name,data)
  return out.getvalue(),fmt+'.zip'
 return doc,fmt
