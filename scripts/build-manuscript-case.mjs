import {reactMark} from './manuscript-brand.mjs'
import {readFile, writeFile} from 'node:fs/promises'
const base=new URL('../packages/ManuScript/',import.meta.url)
const read=(f)=>readFile(new URL(f,base),'utf8')
const data=JSON.parse(await read('cases/a-lab/case.json'))
const replyView=await read('workbench/reply-view.js')
const css=await read('library.css');const tpl=(await read('client.template.js')).replace('/* REPLY_VIEW */',()=>replyView).replace("/* MS_MARK */''",()=>JSON.stringify(reactMark)).replace("/* LIBRARY_CSS */''",()=>JSON.stringify(css))
await writeFile(new URL('client.js',base),tpl.replace('/* A_LAB_DATA */null',()=>JSON.stringify(data)))
for(const version of ['old','current']){
 const lines=['% ManuScript educational reconstruction; NOT an author manuscript.','% Szymanski et al., https://doi.org/10.1038/s41586-023-06734-w','% Correction: https://doi.org/10.1038/s41586-025-09992-y','% Source texts: CC BY 4.0 https://creativecommons.org/licenses/by/4.0/','\\documentclass{article}','\\begin{document}',version==='old'?'\\section*{Practice draft: contains intentional errors}':'\\section*{Revised practice draft}']
 for(const b of data.blocks) if(b[version]) lines.push('% block: '+b.id,b[version],'')
 lines.push('\\end{document}','')
 await writeFile(new URL('cases/a-lab/'+version+'.tex',base),lines.join('\n'))
}
