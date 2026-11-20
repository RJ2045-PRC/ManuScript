import {connect} from './markdown-preferences.js'
window.manuscriptMarkdownWriting=connect
import {EditorState, EditorSelection, StateField, StateEffect} from '@codemirror/state'
import {EditorView, Decoration, WidgetType, keymap, drawSelection, highlightActiveLine, placeholder} from '@codemirror/view'
import {history, historyKeymap, defaultKeymap, indentWithTab} from '@codemirror/commands'
import {markdown, markdownKeymap, markdownLanguage} from '@codemirror/lang-markdown'
import {syntaxTree, syntaxHighlighting, defaultHighlightStyle} from '@codemirror/language'
import katex from 'katex'

const repaintPreview=StateEffect.define()
const setNotes=StateEffect.define(), notesField=StateField.define({create:()=>Decoration.none,update(value,tr){value=value.map(tr.changes);for(const e of tr.effects)if(e.is(setNotes))value=Decoration.set(e.value.map(n=>Decoration.mark({class:'ms-note-highlight',attributes:{'data-note-id':n.id,'data-note-kind':n.kind||'highlight',...(n.active?{'data-note-active':''}:{})}}).range(n.start,n.end)),true);return value},provide:f=>EditorView.decorations.from(f)})
class Preview extends WidgetType {
 constructor(source,kind,renderer){super();this.source=source;this.kind=kind;this.renderer=renderer}
 eq(other){return other.source===this.source&&other.kind===this.kind}
 toDOM(){
  const el=document.createElement('span');el.className='ms-preview ms-'+this.kind;
  if(this.kind==='scholar')this.renderer(el,this.source);
  else if(this.kind==='math'){
   const display=this.source.startsWith('$$'),delimiter=display?2:1,tex=this.source.slice(delimiter,-delimiter);
   try{el.innerHTML=window.manuscriptEquationPreview?.(tex,display)??katex.renderToString(tex,{displayMode:display,trust:false,output:'mathml'})}
   catch{el.textContent=this.source}
  }else el.innerHTML=window.manuscriptRenderMarkdown(this.source,this.kind==='inline');
  for(const a of el.querySelectorAll('a[href]')){a.target='_blank';a.rel='noopener noreferrer'}
  return el;
 }
 ignoreEvent(){return false}
}
class FigureThumb extends WidgetType {
 constructor(image,render){super();this.image=image;this.render=render}
 eq(other){return other.image.path===this.image.path&&other.image.label===this.image.label
  &&other.image.figure?.id===this.image.figure?.id&&other.image.figure?.label===this.image.figure?.label
  &&other.image.figure?.body===this.image.figure?.body}
 toDOM(){return this.render(this.image)}
 destroy(dom){dom.disposePreview?.()}
 ignoreEvent(){return true}
}
class FigureLabel extends WidgetType {
 constructor(label,activate){super();this.label=label;this.activate=activate}
 eq(other){return other.label===this.label&&other.activate?.id===this.activate?.id}
 toDOM(){
  const el=document.createElement(this.activate?'a':'span');
  el.className=this.activate?'msFigureReference':'msFigureNumber';el.textContent=this.label;
  if(this.activate){el.href='#'+this.activate.id;el.onclick=e=>{e.preventDefault();this.activate.jump(this.activate.id)}}
  return el;
 }
}
class EditorFooter extends WidgetType {
 constructor(element){super();this.element=element}
 toDOM(){return this.element}
}
function preview(state,renderToken,figures,equationContext){
 const doc=state.doc,text=doc.toString(),selection=state.selection.main,activeFrom=doc.lineAt(selection.from).from,activeTo=doc.lineAt(selection.to).to,ds=[],covered=[],atomic=[];
 const figureSyntax=figures?.scan(text);
 const active=(from,to)=>from<=activeTo&&to>=activeFrom;
 const add=(from,to,spec)=>{if(to>from)ds.push(spec.range(from,to))};
 syntaxTree(state).iterate({enter(n){const name=n.name,from=n.from,to=n.to,raw=doc.sliceString(from,to);
  if(covered.some(([a,b])=>from>=a&&to<=b))return false;
  if(/^(FencedCode|Table|HorizontalRule)$/.test(name)&&!active(from,to)){add(from,to,Decoration.replace({widget:new Preview(raw,'block'),block:true}));covered.push([from,to]);return false}
  if(name==='Image'&&figures){
   const url=n.node.getChild('URL'),path=url&&doc.sliceString(url.from,url.to).replace(/^<(.*)>$/,'$1');
   const row=figureSyntax.images.get(from),image=path&&figures.lookup(path);
   if(image||row){
    const mark=n.node.getChildren('LinkMark')[1];
    const label=mark&&doc.sliceString(from+2,mark.from).replace(/\\([\\\[\]])/g,'$1');
    const widget=new FigureThumb({...image,path,label:label||image?.label||row?.label,figure:row},figures.render);
    const end=row?.end??to,range=Decoration.replace({widget}).range(from,end);ds.push(range);atomic.push(range);
    if(row)ds.push(Decoration.line({class:'msBodyFigure'}).range(doc.lineAt(from).from));
    covered.push([from,end]);return false}
  }
  const caption=figureSyntax?.captions.get(from);
  if(name==='StrongEmphasis'&&caption&&caption.to===to){
   const range=Decoration.replace({widget:new FigureLabel(caption.row.label+'.')}).range(from,to);
   ds.push(range,Decoration.line({class:'msFigureCaption'}).range(doc.lineAt(from).from));atomic.push(range);
   covered.push([from,to]);return false;
  }
  const ref=figureSyntax?.references.get(from);
  if(name==='Link'&&ref&&ref.to===to){
   const jump=figureSyntax.ids.get(ref.id)?{id:ref.id,jump:figures.jump}:null;
   const range=Decoration.replace({widget:new FigureLabel(ref.label,jump)}).range(from,to);
   ds.push(range);atomic.push(range);covered.push([from,to]);return false;
  }
  // Markdown parses bare bracketed citation keys as shortcut links.
  if(name==='Link'&&renderToken?.(null,raw)){
   const range=Decoration.replace({widget:new Preview(raw,'scholar',renderToken)}).range(from,to);
   ds.push(range);atomic.push(range);
   covered.push([from,to]);return false;
  }
  if(/^(Link|Image)$/.test(name)&&!active(from,to)){add(from,to,Decoration.replace({widget:new Preview(raw,'inline')}));covered.push([from,to]);return false}
  if(/^ATXHeading/.test(name)){const level=Number(name.slice(-1));ds.push(Decoration.line({class:'ms-heading ms-h'+level}).range(doc.lineAt(from).from))}
  if(name==='Blockquote')ds.push(Decoration.line({class:'ms-quote'}).range(doc.lineAt(from).from));
  if(/^(?:HeaderMark|EmphasisMark|ListMark|QuoteMark|CodeMark|LinkMark|TaskMarker)$/.test(name))add(from,to,Decoration.mark({class:'ms-marker'}));
  const classes={StrongEmphasis:'ms-strong',Emphasis:'ms-emphasis',Strikethrough:'ms-strike',InlineCode:'ms-code',Link:'ms-link'};if(classes[name])add(from,to,Decoration.mark({class:classes[name]}));
  if(!active(from,to)&&/^(HeaderMark|EmphasisMark|StrikethroughMark|CodeMark|QuoteMark|LinkMark)$/.test(name))add(from,to,Decoration.replace({}));
 }});
 // Dollar math and Obsidian highlights are extensions, never interpreted inside code.
 const equations=window.manuscriptEquationProjections?.(text,'md',equationContext);
 for(const m of text.matchAll(/\$\$[\s\S]+?\$\$|(?<![\\$])\$[^$\n]+?\$(?!\$)|==[^\n]+?==/g)){
  const from=m.index,to=from+m[0].length;if(covered.some(([a,b])=>from<b&&to>a))continue;
  let node=syntaxTree(state).resolveInner(from,1),code=false;for(;node;node=node.parent)if(/Code/.test(node.name))code=true;if(code)continue;
  if(m[0].startsWith('==')){add(from,to,Decoration.mark({class:'ms-markdown-highlight ms-note-highlight'}));if(!active(from,to)){add(from,from+2,Decoration.replace({}));add(to-2,to,Decoration.replace({}))}}
  else if(!active(from,to)){
   const equation=equations?.get(from);
   add(from,to,Decoration.replace({widget:new Preview(equation?'$$'+equation.tex+'$$':m[0],'math')}));
  }
 }
 if(renderToken)for(const m of text.matchAll(/\{\{(?:ref:)?[FT]\d+\}\}/g)){const from=m.index,to=from+m[0].length;if(!active(from,to)&&!covered.some(([a,b])=>from<b&&to>a)&&renderToken(null,m[0]))add(from,to,Decoration.replace({widget:new Preview(m[0],'scholar',renderToken)}))}
 if(figures)for(const h of figures.hints(text))ds.push(Decoration.widget({widget:new FigureThumb(h,figures.render),side:1}).range(h.at));
 return {decorations:Decoration.set(ds,true),atomic:Decoration.set(atomic,true)};
}
export class LiveEditor {
 constructor({el,initialValue,onChange,onSelection,renderToken,figures,equationContext,label='正文编辑',emptyHint,footer}){
  const footerWidget=footer&&Decoration.widget({widget:new EditorFooter(footer),block:true,side:1});
  const footerExtension=footerWidget?EditorView.decorations.compute(['doc'],state=>Decoration.set([footerWidget.range(state.doc.length)])):[];
  this.previewField=StateField.define({
   create:s=>preview(s,renderToken,figures,equationContext),
   update:(v,tr)=>tr.docChanged||tr.selection||tr.effects.some(effect=>effect.is(repaintPreview))||syntaxTree(tr.state)!==syntaxTree(tr.startState)?preview(tr.state,renderToken,figures,equationContext):v,
   provide:f=>[EditorView.decorations.from(f,value=>value.decorations),EditorView.atomicRanges.of(view=>view.state.field(f).atomic)]
  });
  this.live=true;this.onChange=onChange;this.view=new EditorView({parent:el,state:EditorState.create({doc:initialValue,extensions:[markdown({base:markdownLanguage}),syntaxHighlighting(defaultHighlightStyle),history(),drawSelection(),highlightActiveLine(),EditorView.lineWrapping,notesField,footerExtension,this.previewField,keymap.of([...markdownKeymap,...historyKeymap,...defaultKeymap,indentWithTab]),EditorView.contentAttributes.of({'aria-label':label,spellcheck:'true'}),emptyHint?placeholder(emptyHint):[],EditorView.updateListener.of(u=>{if(u.docChanged){this.revision=(this.revision||0)+1;this.onChange?.();}if(u.selectionSet||u.docChanged||u.viewportChanged)onSelection?.()})]})});
 }
 getMarkdown(){return this.view.state.doc.toString()}
 setMarkdown(text){if(text!==this.getMarkdown())this.view.dispatch({changes:{from:0,to:this.view.state.doc.length,insert:text}})}
 getSelection(){const s=this.view.state.selection.main;return [s.from,s.to]}
 atomicBoundary(at,side=1){
  let boundary=at;
  this.view.state.field(this.previewField).atomic.between(at,at,(from,to)=>{if(from<at&&at<to)boundary=side<0?from:to});
  return boundary;
 }
 atomicSelection(a,b){
  const size=this.view.state.doc.length;
  return EditorSelection.range(this.atomicBoundary(Math.min(a,size),a<b?-1:1),this.atomicBoundary(Math.min(b,size),b<a?-1:1));
 }
 setSelection(a,b=a){this.view.dispatch({selection:EditorSelection.create([this.atomicSelection(a,b)]),scrollIntoView:true})}
 focus(){this.view.focus()}
 insertText(text,caret=text.length){const {from,to}=this.view.state.selection.main;this.view.dispatch({changes:{from,to,insert:text},selection:{anchor:from+caret},scrollIntoView:true,userEvent:'input'});this.focus()}
 getScrollTop(){return this.view.scrollDOM.scrollTop}
 setScrollTop(n){this.view.scrollDOM.scrollTop=n}
 notes(rows){this.view.dispatch({effects:setNotes.of(rows.filter(n=>n.start>=0&&n.end>n.start&&n.end<=this.view.state.doc.length))})}
 coords(at){return this.view.coordsAtPos(Math.min(at,this.view.state.doc.length))}
 viewport(){const el=this.view.scrollDOM;return {from:this.view.lineBlockAtHeight(el.scrollTop+28).from,top:el.scrollTop,max:Math.max(0,el.scrollHeight-el.clientHeight)}}
 noteBounds(start,end){
  const view=this.view,limit=view.state.doc.length;
  start=Math.min(start,limit);end=Math.min(end,limit);
  // The height map still describes lines outside CodeMirror's rendered viewport.
  const top=view.coordsAtPos(start,1)?.top??view.documentTop+view.lineBlockAt(start).top;
  const bottom=view.coordsAtPos(end,-1)?.bottom??view.documentTop+view.lineBlockAt(Math.max(start,end-1)).bottom;
  return {top,bottom};
 }
 reveal(at,moveCaret=true){at=Math.max(0,Math.min(at,this.view.state.doc.length));this.view.dispatch({selection:moveCaret?{anchor:this.atomicBoundary(at)}:undefined,effects:EditorView.scrollIntoView(at,{y:'start',yMargin:24})})}
 revealCentered(from,to){
  const range=this.atomicSelection(from,to);
  this.view.dispatch({selection:EditorSelection.create([range]),effects:EditorView.scrollIntoView(range,{y:'center'})});
 }
 refreshPreview(){this.view.dispatch({effects:repaintPreview.of(null)})}
 on(event,fn){if(event==='change')this.onChange=fn}
 destroy(){this.view.destroy()}
}
window.ManuScriptLiveEditor=LiveEditor
window.manuscriptLiteralRanges=text=>{
 const ranges=[];
 markdownLanguage.parser.parse(text).iterate({enter(node){
  if(!/^(FencedCode|CodeBlock|InlineCode|URL|HTMLBlock|HTMLTag|CommentBlock|Comment)$/.test(node.name))return;
  ranges.push({from:node.from,to:node.to});
  return false;
 }});
 return ranges;
}
window.manuscriptLinkAt=(text,position)=>{
 const tree=markdownLanguage.parser.parse(text);
 for(const side of [-1,1]){
  for(let node=tree.resolveInner(position,side);node;node=node.parent){
   if(node.name==='Link')return {from:node.from,to:node.to};
  }
 }
 return null;
}
window.manuscriptHeadings=(text,topLevel=false)=>{const rows=[];markdownLanguage.parser.parse(text).iterate({enter(n){if((!topLevel||n.node.parent?.name==='Document')&&/^(ATXHeading|SetextHeading)[1-6]$/.test(n.name)){const level=Number(n.name.slice(-1)),raw=text.slice(n.from,n.to),title=raw.replace(/^ {0,3}#{1,6}[ \t]+/,'').replace(/[ \t]+#+[ \t]*$/,'').replace(/\n {0,3}(?:=+|-+)\s*$/,'').trim();rows.push({from:n.from,to:n.to,level,title})}}});return rows}
window.manuscriptQuotes=text=>{
 const quotes=[];
 markdownLanguage.parser.parse(text).iterate({enter(node){
  if(node.name!=='Blockquote')return;
  const raw=text.slice(node.from,node.to);
  const content=raw.split(/\r?\n/).map(line=>line.replace(/^[ \t]*> ?/,'')).join('\n');
  if(content.trim())quotes.push({from:node.from,to:node.to,text:content});
  return false;
 }});
 return quotes;
}
let manuscriptParser
window.manuscriptRenderMarkdown=(text,inline=false)=>{
 manuscriptParser??=new window.marked.Marked({gfm:true,extensions:[{name:'highlight',level:'inline',start:src=>src.indexOf('=='),tokenizer(src){const m=/^==([^\n]+?)==/.exec(src);if(m)return {type:'highlight',raw:m[0],tokens:this.lexer.inlineTokens(m[1])}},renderer(token){return '<mark>'+this.parser.parseInline(token.tokens)+'</mark>'}}]})
 return window.manuscriptSanitize(inline?manuscriptParser.parseInline(text):manuscriptParser.parse(text))
}
