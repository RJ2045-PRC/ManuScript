// Render from a restricted set of Markdown tokens. Never insert model HTML or remote images.
const ChatUI=(()=>{
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 function tokens(ts){return (ts||[]).map(t=>{const inside=()=>tokens(t.tokens),body=()=>inside()||esc(t.text)
 switch(t.type){
 case 'heading':return '<h'+t.depth+'>'+inside()+'</h'+t.depth+'>'
 case 'paragraph':return '<p>'+inside()+'</p>'
 case 'strong':case 'em':case 'del':return '<'+t.type+'>'+inside()+'</'+t.type+'>'
 case 'blockquote':return '<blockquote>'+inside()+'</blockquote>'
 case 'codespan':return '<code>'+esc(t.text)+'</code>'
 case 'code':return '<pre><code>'+esc(t.text)+'</code></pre>'
 case 'list':{const tag=t.ordered?'ol':'ul';return '<'+tag+'>'+t.items.map(i=>'<li>'+tokens(i.tokens)+'</li>').join('')+'</'+tag+'>'}
 case 'link':return /^https?:\/\//i.test(t.href)?'<a href="'+esc(t.href)+'" target="_blank" rel="noopener noreferrer">'+body()+'</a>':body()
 case 'br':return '<br>';case 'hr':return '<hr>';case 'space':return ''
 case 'table':return '<div class="tablewrap"><table><thead><tr>'+t.header.map(c=>'<th>'+tokens(c.tokens)+'</th>').join('')+'</tr></thead><tbody>'+t.rows.map(r=>'<tr>'+r.map(c=>'<td>'+tokens(c.tokens)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'
 case 'text':return t.tokens?inside():esc(t.text).replace(/\*\*\s+([^*\n]+?)\s+\*\*/g,'<strong>$1</strong>')
 default:return esc(t.text??t.raw)
 }}).join('')}
 function md(s){try{return tokens(marked.lexer(String(s),{gfm:true,breaks:true}))}catch{return esc(s)}}
 function card(m,answered){const c=m.card;if(!c?.options?.length)return '';const sums=c.options.map(o=>o.scores.reduce((a,b)=>a+b,0)),top=Math.max(...sums)
 return (answered?'<details class="pastcard"><summary>已答 · '+esc(c.question)+'</summary>':'')+'<section class="interview"><small>与主 Agent 商定下一步</small><h3>'+esc(c.question)+'</h3><p>'+esc(c.background)+'</p><p class="eg"><b>举例</b>　'+esc(c.example)+'</p>'+c.options.map((o,i)=>'<div class="choice"><b>'+esc(o.label)+'</b> '+(sums[i]===top?'<span class="pickbadge">'+(sums.filter(v=>v===top).length>1?'并列推荐':'推荐')+' · '+top+'/15</span>':'')+'<p>'+esc(o.effect)+'</p><details><summary>评估依据 · '+sums[i]+'/15</summary><p>'+c.criteria.map((d,j)=>esc(d)+' '+esc(o.scores[j])+'/5').join(' · ')+'</p>'+esc(o.reason)+'</details>'+(sums[i]===top?'<small>推荐理由：'+esc(o.reason)+'</small>':'')+(answered?'':'<button data-choice="'+i+'" data-msg="'+esc(m.id)+'">选这个并回复</button>')+'</div>').join('')+'<small>'+(answered?'已回复此问题':'也可以在下方写自己的答案')+' · 分数为 Agent 按三项等权给出的建议</small></section>'+(answered?'</details>':'')}
 return {md,card}
})()
