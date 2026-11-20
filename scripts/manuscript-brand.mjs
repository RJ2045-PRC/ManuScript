// All renderers share the geometry in assets/mark.svg, including the moving nib.
import {readFile,writeFile} from 'node:fs/promises'
const assets=new URL('../packages/ManuScript/assets/',import.meta.url)
export const mark=(await readFile(new URL('mark.svg',assets),'utf8')).trim()
// React uses camelCase for SVG presentation attributes.
const [root,paths]=mark.slice(0,-6).split(/>([\s\S]*)/,2)
export const reactMark={attrs:Object.fromEntries([...root.matchAll(/([:\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v])),paths}
export const logo='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="ManuScript"><rect width="64" height="64" rx="15" fill="#193F3A"/>'+mark.replace('<svg ', '<svg x="6" y="5" width="52" height="52" color="#FFF5DB" ').replace('class="ms-nib"', 'class="ms-nib" style="color:#E9B967"')+'</svg>'
export const favicon='<link rel="icon" href="data:image/svg+xml,'+encodeURIComponent(logo)+'">'
export const inlineMark=mark.replace('<svg ', '<svg width="1.25em" height="1.25em" aria-hidden="true" style="display:block;flex:none" ')
export const lockup='<b class="ms-lockup" style="display:inline-flex;align-items:center;gap:.32em;white-space:nowrap">'+inlineMark+'ManuScript</b>'
export const brandPage=s=>s.replace('<!--MS_ICON-->',()=>favicon).replace('<!--MS_LOCKUP-->',()=>lockup)
if(process.argv[1] && import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)await writeFile(new URL('logo.svg',assets),logo+'\n')
