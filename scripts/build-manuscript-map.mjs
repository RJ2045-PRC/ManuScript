import {brandPage} from './manuscript-brand.mjs'
import {readFile,writeFile,rename} from 'node:fs/promises'
const root=new URL('../packages/ManuScript/workbench/',import.meta.url)
const read=f=>readFile(new URL(f,root),'utf8')
async function writePage(target,contents){if(contents.includes('\0'))throw Error('Generated page contains a null byte');const temporary=new URL(target.href+'.'+process.pid+'.tmp');await writeFile(temporary,contents);await rename(temporary,target)}
const [base,css,md,ui,js,reading]=await Promise.all(['map/base.html','map/team.css','map/vendor/marked.umd.js','map/conversation.js','map/team.js','map/reading.js'].map(read))
const [scholarBase,lib,style,dark,math]=await Promise.all(['map/scholar-ui.js','map/vendor/writing-editor.js','map/vendor/writing-editor.css','map/vendor/writing-dark.css','map/vendor/math.js'].map(read))
const preferences=await read('editor-preferences.js')
const scholar=preferences+'\n'+(await read('map/section-edits.js'))+'\n'+(await read('map/section-editor.js'))+'\n'+(await read('map/section-map.js'))+'\n'+(await read('map/heading-navigation.js'))+'\n'+(await read('map/floating-toc.js'))+'\n'+(await read('map/draft-context.js'))+'\n'+(await read('map/selection-tools.js'))+'\n'+(await read('map/writing-chrome.js'))+'\n'+(await read('map/writing-plan.js'))+'\n'+(await read('map/full-document.js'))+'\n'+(await read('map/manuscript-equations.js'))+'\n'+(await read('map/manuscript-management.js'))+'\n'+scholarBase
const suggestions=await read('writing-suggestions.js')
const roleSettings=await read('map/role-settings.js')
const contextUI=await read('map/context-reading.js')
const rolesSrc=(await read('reading-roles.mjs')).replace(/^export /gm,'')
if(rolesSrc.includes('export '))throw Error('reading-roles.mjs still has export after inlining')
const aids=(await read('map/reading-aids.js')).replace('/*READING_ROLES*/',()=>rolesSrc).replace('/*MODEL_READING*/',()=>contextUI)
const foldJS=await read('map/writing-fold.js'), foldCSS=await read('map/writing-fold.css')
const guideJS=await read('guide/view.js'), guideCSS=await read('guide/style.css')
const awaitedScaleCase=await read('../cases/sit-2024/guide.json')
const scaleData=(await read('map/scale-data.js')).replace('/*SCALE_CASE*/null',()=>JSON.stringify(JSON.parse(awaitedScaleCase)))
const scaleJS=(await read('map/image-viewer.js'))+'\n'+(await read('map/scale-graph.js'))+'\n'+(await read('map/scale-overview.js'))+'\n'+(await read('map/scale-compare.js'))+'\n'+scaleData+'\n'+await read('map/logic-work.js')+'\n'+(await read('map/scale-translation.js'))+'\n'+await read('map/writing-scales.js')
const flatJS=await read('map/flat-paper.js'),flatCSS=(await read('map/flat-paper.css'))+'\n'+await read('map/writing-scales.css')
const argument=await read("map/argument.js")
const research=await read("map/research-ui.js");
const native=(await read('map/question-notes.js'))+'\n'+(await read('reply-view.js'))+'\n'+(await read('map/recall-panel.js'))+'\n'+(await read('map/native-chat.js'))+'\n'+(await read('map/idea-compare.js'))+'\n'+(await read('map/idea-tools.js'))+'\n'+(await read('map/idea-preview.js'))
const shellJS=await read('map/workspace-shell.js');
const shellCSS=await read('map/workspace-shell.css');
const foundations=await read('ui-foundations.css');
const assistantJS=await read('map/assistant-dock.js');
const ideaCSS=await read('map/idea-preview.css')
// Toast UI 3.2.2 queues a trailing toolbar resize after hide/destroy.
const resizeHook='this.handleResize=bse(function(){'
if(!lib.includes(resizeHook))throw Error('Recheck toolbar resize guard for this editor version')
const liveEditor=await read('map/vendor/live-editor.js')
const editor=lib.replace(resizeHook,resizeHook+'if(!t.refs.el?.isConnected||!t.refs.el.offsetWidth)return;')
const interaction=(await Promise.all(['map/interaction.js','map/drag-feedback.js','map/canvas-media.js','map/canvas-commands.js'].map(read))).join('\n')
const canvasCSS=(await read('map/canvas-commands.css'))+'\n'+(await read('map/writing-chrome.css'))+'\n'+(await read('map/manuscript-management.css'))
const page=brandPage(base).replace('/*MAP_INTERACTION*/',()=>interaction).replace('/*TEAM_STYLE*/',()=>[style,dark,css,foldCSS,guideCSS,flatCSS,ideaCSS,canvasCSS,foundations,shellCSS].join('\n')).replace('/*TEAM_APP*/',()=>[md,ui,math,editor,liveEditor,suggestions,js.replace('/*WORKSPACE_SHELL*/',()=>shellJS+'\n'+assistantJS).replace('/*ROLE_SETTINGS*/',()=>roleSettings).replace('/*NATIVE_CHAT*/',()=>native).replace('/*READING*/',()=>reading.replace('/*FLAT_PAPER*/',()=>flatJS+'\n'+scaleJS).replace('/*READING_AIDS*/',()=>aids).replace('/*SCHOLAR*/',()=>research+'\n'+scholar+'\n'+foldJS+'\n'+guideJS).replace('/*ARGUMENT*/',()=>argument))].join('\n;\n').replace(/<\/script/gi,'<\\/script'))
await Promise.all([new URL('web/project-map.html',root),...(process.argv.includes('--workbench-only')?[]:[new URL('../previews/项目地图-交互原型.html',import.meta.url)])].map(p=>writePage(p,page)))

await writePage(new URL('web/index.html',root),brandPage(await read('web/index.template.html')).replace('/*GUIDE_STYLE*/',()=>guideCSS+'\n'+foundations).replace('/*EDITOR_PREFERENCES*/',()=>preferences).replace('/*GUIDE_JS*/',()=>guideJS))
