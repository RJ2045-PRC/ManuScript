import {build} from 'esbuild'
import {readFile,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const result=await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['live-editor.js'],bundle:true,minify:true,format:'iife',metafile:true,outfile:fileURLToPath(new URL('../../packages/ManuScript/workbench/map/vendor/live-editor.js',import.meta.url))})
const legacy=await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['editor-entry.js'],bundle:true,minify:true,format:'iife',metafile:true,outfile:fileURLToPath(new URL('../../packages/ManuScript/workbench/map/vendor/writing-editor.js',import.meta.url))})
const roots=new Set([...Object.keys(result.metafile.inputs),...Object.keys(legacy.metafile.inputs)].map(p=>p.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean)),notices=[]
for(const root of roots){const dir=path.resolve(fileURLToPath(new URL('.',import.meta.url)),root);const meta=JSON.parse(await readFile(path.join(dir,'package.json'),'utf8'));let license;for(const name of ['LICENSE','LICENSE.md','LICENSE.txt'])try{license=await readFile(path.join(dir,name),'utf8');break}catch{};if(!license&&meta.name==='@toast-ui/editor'&&meta.version==='3.2.2')license=await readFile(new URL('./licenses/toast-ui-editor-3.2.2.txt',import.meta.url),'utf8');if(!license)throw Error('Missing bundled license: '+meta.name);notices.push(meta.name+' '+meta.version+'\n'+license)}
await writeFile(new URL('../../packages/ManuScript/workbench/map/vendor/LIVE-EDITOR-NOTICES.txt',import.meta.url),notices.join('\n\n----------------\n\n'))
