// Offsets refer to this revision, never to a title (titles can repeat).
function sectionDraft(doc, headings) {
 const text=doc.text;
 let points=0,units=0;
 function toUTF16(offset){
  while(points<offset){units+=text.codePointAt(units)>0xffff?2:1;points++}
  return units;
 }
 const spans=doc.spans.map(s=>({block:s.block,start:toUTF16(s.start),end:toUTF16(s.end)}));
 let lastFrom=0,point=0;
 const rows=headings.map((h,i)=>{
  point+=[...text.slice(lastFrom,h.from)].length;lastFrom=h.from;
  return {...h,point,raw:text.slice(h.from,h.to),body:text.slice(h.to,headings[i+1]?.from??text.length)};
 });
 const intro={raw:'',body:text.slice(0,headings[0]?.from??text.length)};
 // A legacy block owns its first heading, including headings rendered from a block prefix.
 const markers=[];let index=-1;
 for(const s of spans){
  const lead=text.slice(s.start,s.end).match(/^[\r\n]*/)[0].length;
  const at=s.start+lead;
  while(index+1<rows.length&&rows[index+1].from<=at)index++;
  const row=rows[index]||intro;
  const offset=at-(row.from||0);
  markers.push({block:s.block,row,offset,atEnd:s.start===s.end});
  if(row!==intro&&row.from===at&&s.end>s.start)row.block=s.block;
 }
 return {doc,intro,rows,markers,eol:text.includes('\r\n')?'\r\n':'\n'};
}
function sectionEnd(rows,index){
 let end=index+1;
 while(end<rows.length&&rows[end].level>rows[index].level)end++;
 return end;
}
function moveSectionRows(rows,index,targetIndex,where,setLevel){
  const h=rows[index],end=sectionEnd(rows,index);
  const target=rows[targetIndex];
  if(!target&&targetIndex!==-1||targetIndex>=index&&targetIndex<end)throw Error('不能将章节移入自身或其子节。');
  const delta=(target?target.level+(where==='inside'?1:0):1)-h.level;
  const dest=!target?rows.length:where==='before'?targetIndex:sectionEnd(rows,targetIndex);
  const moving=rows.slice(index,end);
  if(delta)for(const row of moving)setLevel(row,row.level+delta);
  rows.splice(index,moving.length);
  rows.splice(dest>index?dest-moving.length:dest,0,...moving);
}
function changeSection(d,op){
 const {rows,eol,doc}=d,tex=doc.format==='tex',max=tex?3:6;
 const h=rows[op.index],end=h?sectionEnd(rows,op.index):rows.length;
 const setHeading=(row,level,title=row.title.replace(/\r?\n/g,' '))=>{
  if(level<1||level>max)throw Error('此位置会超出稿件支持的标题层级。');
  if(!title.trim()||/[\r\n]/.test(title)||tex&&/[{}]/.test(title))throw Error('请输入有效的单行小标题。');
  const raw=tex?'\\'+['section','subsection','subsubsection'][level-1]+(row.raw?.includes('*{')?'*':'')+'{'+title+'}':'#'.repeat(level)+' '+title;
  Object.assign(row,{raw,title,level});
 };
 if(op.kind==='add'){
  const row={raw:'',body:eol+eol};
  setHeading(row,h?h.level+(op.child?1:0):1,op.title);
  rows.splice(end,0,row);
 }else if(!h)throw Error('小标题已变化，请重新选择。');
 else if(op.kind==='move'){
  moveSectionRows(rows,op.index,op.target,op.where,setHeading);
 }else if(op.kind==='remove'){
  if(op.whole)rows.splice(op.index,end-op.index);
  else{
   for(const row of rows.slice(op.index+1,end))setHeading(row,row.level-1);
   h.raw=''; // Keep its body (including quotation details) at the original position.
  }
 }else if(op.kind==='edit'){
  if(op.title!==h.title)setHeading(h,h.level,op.title);
 }
 let text='',starts=new Map();
 for(const row of [d.intro,...rows]){
  if(row.raw&&text&&!text.endsWith('\n'))text+=eol+eol;
  starts.set(row,text.length);
  text+=row.raw+row.body;
 }
 const layout=d.markers.map(m=>{
  const row=m.row;
  const at=m.atEnd||!starts.has(row)?text.length:starts.get(row)+Math.min(m.offset,(row.raw+row.body).length);
  return {block:m.block,at};
 }).sort((a,b)=>a.at-b.at);
 // Boundary separators belong to the following block's prefix when available.
 for(let i=0;i<layout.length;i++){
  const item=layout[i];let at=item.at;
  if(i===0)at=0;
  else if(at<text.length){while(at>layout[i-1].at&&/[\r\n]/.test(text[at-1]))at--}
  item.at=at;
 }
 let utf=0,codepoint=0;
 for(const cut of layout){codepoint+=[...text.slice(utf,cut.at)].length;utf=cut.at;cut.start=codepoint;delete cut.at}
 const positions=[];
 let lastStart=0,newPoint=0;
 for(const row of rows){
  if(row.from==null||!row.raw)continue;
  const at=starts.get(row);newPoint+=[...text.slice(lastStart,at)].length;lastStart=at;
  positions.push({from:row.point,at:newPoint,heading:row.raw});
 }
 return {text,layout,positions};
}
