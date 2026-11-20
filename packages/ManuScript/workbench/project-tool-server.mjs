import {createInterface} from 'node:readline'
import http from 'node:http'
import {projectTools} from './project-tools.mjs'
const call=c=>new Promise((ok,no)=>{const q=http.request({method:'POST',socketPath:process.argv[2],path:'/'},res=>{const bs=[];res.on('data',b=>bs.push(b));res.on('end',()=>{try{const v=JSON.parse(Buffer.concat(bs));v.error?no(Error(v.error)):ok(v.result)}catch(e){no(e)}})});q.on('error',no);q.end(JSON.stringify(c))})
for await(const line of createInterface({input:process.stdin})){
 let m;try{m=JSON.parse(line)}catch{continue}if(m.id==null)continue;let result,error
 if(m.method==='initialize')result={protocolVersion:m.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'manuscript_project',version:'1'}}
 else if(m.method==='tools/list')result={tools:projectTools.map(({name,description,parameters})=>({name,description,inputSchema:parameters}))}
 else if(m.method==='tools/call'){try{const r=await call({...m.params.arguments,tool:m.params.name});result={content:[{type:'text',text:JSON.stringify(r)}]}}catch(e){result={isError:true,content:[{type:'text',text:e.message}]}}}
 else if(m.method==='ping')result={};else error={code:-32601,message:'Unknown method'}
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,...(error?{error}:{result})})+'\n')
}
