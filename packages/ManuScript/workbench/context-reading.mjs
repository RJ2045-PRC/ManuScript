// A reading annotation is an interpretation of the supplied paragraph, not a verified paper fact.
export {readingInstructions,validateReading,readingKinds,classifyRules,roleView} from './reading-roles.mjs'
import {readingInstructions,validateReading} from './reading-roles.mjs'
export async function analyzeReading(model,route,packet){
 if(typeof packet.target!=='string'||!packet.target.trim()||packet.target.length>24000)throw Error('段落为空或超过 24000 字符；请按自然段拆分')
 for(const k of ['previous','next'])if(typeof packet[k]!=='string'||packet[k].length>1400)throw Error('相邻段落上下文过长')
 const raw=await model(JSON.stringify(packet),route,readingInstructions)
 return {...validateReading(raw,packet.target),model:route?.name||route?.model||'Codex 宿主模型'}
}
