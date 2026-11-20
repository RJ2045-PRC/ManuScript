// Shared read-only view; all manuscript content enters text nodes, never HTML.
function renderReplyChanges(root,entries){
 root.replaceChildren()
 function add(parent,tag,text){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el}
 if(!entries.length){add(root,'p','没有找到这条回复的改动记录。');return}
 for(const entry of entries){
  const section=add(root,'section','')
  add(section,'h3',entry.title||'导图变化')
  add(section,'small',[entry.version&&'原稿 '+entry.version,entry.status].filter(Boolean).join(' · '))
  if(!entry.rows.length)add(section,'p','建议与原文相同。')
  for(const row of entry.rows){
   const item=add(section,'div','');item.style.cssText='margin:12px 0;padding-inline-start:10px;border-inline-start:2px solid GrayText;white-space:pre-wrap;overflow-wrap:anywhere'
   if(row.line)add(item,'small','原稿第 '+row.line+' 行')
   let left=row.before,right=row.after,common=0,end=0
   if(entry.kind==='draft'&&left&&right){
    while(common<Math.min(left.length,right.length)&&left[common]===right[common])common++
    while(end<Math.min(left.length,right.length)-common&&left[left.length-1-end]===right[right.length-1-end])end++
   }
   for(const [isOld,text] of [[true,left],[false,right]]){
    if(text==null)continue
    const label=entry.kind==='draft'?(isOld?'原文':'建议'):(left==null?'新增':right==null?'移除':isOld?'修改前':'修改后')
    const p=add(item,'p','');p.style.margin='4px 0';add(p,'strong',label+'：')
    if(common||end){p.append(text.slice(0,common));add(p,isOld?'del':'ins',text.slice(common,text.length-end));p.append(text.slice(text.length-end))}
    else p.append(text)
   }
  }
 }
}
