// Formatting is a text edit plus a selection, shared by CodeMirror and the source textarea.
export const commands=[['bold','加粗','Mod+B','**'],['italic','斜体','Mod+I','*'],['both','粗斜体','Mod+Shift+I','***'],['strike','删除线','Mod+Shift+X','~~'],['highlight','高亮','Mod+Shift+H','=='],['code','行内代码','Mod+Backquote','`'],['link','链接','Mod+K'],...Array.from({length:6},(_,i)=>['h'+(i+1),(i+1)+' 级标题','Mod+Alt+'+(i+1)]),['paragraph','取消标题','Mod+Alt+0'],['bullet','无序列表','Mod+Shift+8'],['ordered','有序列表','Mod+Shift+7'],['task','任务列表','Mod+Alt+T'],['quote','引用段落','Mod+Shift+9']];
export function edit(id,doc,a,z){
 const selected=doc.slice(a,z),command=commands.find(c=>c[0]===id);if(!command)return null;
 const change=(from,to,insert,anchor,head=anchor)=>({from,to,insert,anchor,head});
 if(command[3]){
  if(['bold','italic','both'].includes(id)){
   // * and ** share delimiters: applying italic to **word** must produce ***word***.
   const left=Math.min(3,(doc.slice(Math.max(0,a-3),a).match(/\*+$/)||[''])[0].length);
   const right=Math.min(3,(doc.slice(z,z+3).match(/^\*+/)||[''])[0].length);
   const old=Math.min(left,right),flag={bold:2,italic:1,both:3}[id],num=flag===3?(old===3?0:3):old^flag;
   const mark='*'.repeat(num),at=a-old;
   return change(at,z+old,mark+selected+mark,at+num,at+num+selected.length);
  }
  let mark=command[3];if(id==='code'&&selected.includes('`'))mark='`'.repeat(1+Math.max(...[...selected.matchAll(/`+/g)].map(m=>m[0].length)));
  const pad=id==='code'&&(/^`|`$/.test(selected))?' ':'';const l=mark+pad,r=pad+mark;
  if(a>=l.length&&doc.slice(a-l.length,a)===l&&doc.slice(z,z+r.length)===r)return change(a-l.length,z+r.length,selected,a-l.length,z-l.length);
  return change(a,z,l+selected+r,a+l.length,z+l.length);
 }
 if(id==='link'){
  const label=selected.replace(/([\\\[\]])/g,'\\$1')||'文字';const link='['+label+'](地址)';return selected?change(a,z,link,a+link.length-3,a+link.length-1):change(a,z,link,a+1,a+1+label.length);
 }
 const start=a===0?0:doc.lastIndexOf('\n',a-1)+1,until=z>a&&doc[z-1]==='\n'?z-1:z,next=doc.indexOf('\n',until),end=next<0?doc.length:next;
 const lines=doc.slice(start,end).split('\n'),heading=/^h[1-6]$/.test(id),pattern=heading||id==='paragraph'?/^#{1,6}(?:[ \t]+|$)/:id==='quote'?/^> ?/:/^(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;
 const prefix=i=>heading?'#'.repeat(+id[1])+' ':({paragraph:'',quote:'> ',bullet:'- ',ordered:(i+1)+'. ',task:'- [ ] '})[id];
 const undo=id!=='paragraph'&&lines.every((line,i)=>{const stripped=line.trimStart();return id==='ordered'?/^\d+[.)] /.test(stripped):id==='bullet'?/^[-*+] (?!\[[ xX]\] )/.test(stripped):id==='task'?/^[-*+] \[[ xX]\] /.test(stripped):stripped.startsWith(prefix(i))});
 let old=start,offset=0,anchor=a,head=z;const rendered=lines.map((line,i)=>{
  const indent=line.match(/^[ \t]*/)[0],rest=line.slice(indent.length),before=rest.match(pattern)?.[0]||'',after=undo?'':prefix(i),at=old+indent.length;
  const map=p=>p<at?p+offset:p+offset+after.length-Math.min(before.length,Math.max(0,p-at));
  if(a>=old&&a<=old+line.length)anchor=map(a);if(z>=old&&z<=old+line.length)head=map(z);
  offset+=after.length-before.length;old+=line.length+1;return indent+after+rest.slice(before.length);
 });if(z>end)head=z+offset;return change(start,end,rendered.join('\n'),anchor,head);
}
const apple=()=>/Mac|iPhone|iPad/.test(navigator.platform);
export function chord(e){if(e.isComposing||e.keyCode===229||!(apple()?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey)||e.getModifierState?.('AltGraph'))return '';const key=/^Key[A-Z]$/.test(e.code)?e.code.slice(3):/^Digit\d$/.test(e.code)?e.code.slice(5):e.code==='Backquote'?'Backquote':'';return key&&['Mod',...(e.altKey?['Alt']:[]),...(e.shiftKey?['Shift']:[]),key].join('+')}
export const display=k=>k.replace('Mod',apple()?'⌘':'Ctrl').replace('Alt',apple()?'⌥':'Alt').replace('Backquote','`');
export const reserved=new Set('A C F G L N O P Q R S T V W X Y Z Shift+Z Shift+V Shift+T Shift+W Alt+I'.split(' ').map(k=>'Mod+'+k));
export const tokens=['h1','h2','h3','h4','h5','h6','bold','italic','code','link','quote','marker','highlight'];
const shades=[['#174c7d','#a7cdfa'],['#653e81','#d8b5eb'],['#286453','#98d7c1'],['#79501d','#e4bc86'],['#635575','#c9bfd7'],['#485a6b','#b4c3d2'],['#893d47','#ffb3ba'],['#61518a','#d4bff7'],['#82512d','#efbc91'],['#195e87','#93d3ff'],['#486259','#b0cabe'],['#586778','#a9bace'],['#f3df95','#594c22']];
// Inspired by the named Obsidian palettes; ink tones adapted to DSH's own paper colors.
export const presets={
 minimal:{label:'Minimal · 简洁',description:'克制的蓝绿与紫灰，适合长篇写作。',colors:[
  ['#245b7b','#91c5e8'],['#596180','#b6bedb'],['#32665b','#a2cfbf'],['#675775','#c6b6d5'],['#655e50','#c8c0ad'],['#536170','#aebdcb'],['#334e69','#b0ccec'],['#675775','#c6b6d5'],['#756038','#d6c090'],['#245b7b','#91c5e8'],['#536170','#aebdcb'],['#616b76','#acb5c0'],['#e7e0b8','#49472f']]},
 catppuccin:{label:'Catppuccin · 柔彩',description:'浅色 Latte、深色 Mocha 风格，柔和而层次分明。',colors:[
  ['#8839ef','#cba6f7'],['#1e66f5','#89b4fa'],['#397c12','#a6e3a1'],['#a75500','#fab387'],['#a32f88','#f5c2e7'],['#657083','#bac2de'],['#d20f39','#f38ba8'],['#8839ef','#cba6f7'],['#956500','#f9e2af'],['#17637d','#89dceb'],['#326b77','#94e2d5'],['#657083','#bac2de'],['#f3e0aa','#54452e']]},
 gruvbox:{label:'Gruvbox · 复古',description:'暖棕、橄榄绿与砖红，带一点纸墨感。',colors:[
  ['#9d2826','#fb9586'],['#386b70','#83c5c2'],['#657000','#b8bb26'],['#936100','#fabd2f'],['#8f3f71','#d8a0c2'],['#4e6a46','#a6b990'],['#9d2826','#fb9586'],['#8f3f71','#d8a0c2'],['#9b4c08','#feaa54'],['#386b70','#83c5c2'],['#675d50','#c3b69e'],['#706354','#bdae93'],['#f1dcab','#554425']]},
 rosepine:{label:'Rosé Pine · 松玫',description:'浅色 Dawn、深色 Pine 风格，玫红搭配松绿。',colors:[
  ['#985574','#ebbcba'],['#286983','#9ccfd8'],['#6c5695','#c4a7e7'],['#986315','#f6c177'],['#a2375b','#eb6f92'],['#686478','#b9b5ca'],['#a2375b','#eb6f92'],['#6c5695','#c4a7e7'],['#986315','#f6c177'],['#286983','#9ccfd8'],['#686478','#b9b5ca'],['#716b80','#b9b5ca'],['#f0daca','#524047']]}
};
export const template=[':root','.theme-dark'].map((selector,i)=>selector+' {\n'+tokens.map((t,j)=>'  --ms-'+t+': '+shades[j][i]+';').join('\n')+'\n}').join('\n\n')+'\n';
const aliases={...Object.fromEntries(tokens.slice(0,6).map(t=>[t+'-color',t])),'bold-color':'bold','italic-color':'italic','code-normal':'code','link-color':'link','blockquote-color':'quote','text-muted':'marker','text-highlight-bg':'highlight'};
export function parsePalette(css){
 if(css.length>131072)throw Error('请选择 128 KB 以内的配色 CSS。');const sheet=new CSSStyleSheet();sheet.replaceSync(css);const result={light:{},dark:{}};
 for(const rule of sheet.cssRules){if(!rule.selectorText||!rule.style)continue;for(const sel of rule.selectorText.split(',').map(s=>s.trim())){const modes=sel===':root'?['light','dark']:sel==='.theme-light'?['light']:sel==='.theme-dark'?['dark']:[];
 for(const prop of rule.style){const t=prop.startsWith('--ms-')?prop.slice(5):aliases[prop.slice(2)];if(!tokens.includes(t))continue;const v=rule.style.getPropertyValue(prop).trim();if(!/^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d.,%+\-/\s]+\))$/i.test(v)||!CSS.supports('color',v)||/^(?:transparent|inherit|initial|unset|revert|currentcolor)$/i.test(v))continue;for(const mode of modes)result[mode][t]=v;}}}
 if(!Object.keys(result.light).length&&!Object.keys(result.dark).length)throw Error('没有读到支持的颜色变量。可下载样板后修改。');return result;
}
const prefKey='manuscript:markdown-writing:v1';
export function readPrefs(){try{const p=JSON.parse(localStorage.getItem(prefKey));if(p&&['ink','plain','custom',...Object.keys(presets)].includes(p.mode))return p}catch{}return {mode:'ink',keys:{}}}
export function storePrefs(p){localStorage.setItem(prefKey,JSON.stringify(p))}
export function applyPalette(el,p){el.dataset.mdPalette=p.mode;for(const [i,t] of tokens.entries()){
 const pair=(presets[p.mode]?.colors[i]||shades[i]).map((v,j)=>p.mode==='plain'?(t==='highlight'?v:'var(--text)'):p.mode==='custom'?(p.palette?.[j?'dark':'light']?.[t]||v):v);
 el.style.setProperty('--ms-'+t,'light-dark('+pair.join(',')+')');}}
