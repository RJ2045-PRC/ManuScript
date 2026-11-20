// Shared by the manuscript and project settings page. Preferences never edit a draft.
window.ManuscriptScaleSettings={
 defaults:{logicStyle:'symbols'},
 options:[['symbols','文字＋符号简图'],['visual','文字＋可视简图']],
 label:value=>value==='visual'?'文字＋可视简图':'文字＋符号简图'
};
window.ManuscriptFigureSettings=(()=>{
 const labels={zh:'图',fig:'Fig.',figure:'Figure'};
 const label=(style,number)=>(Object.hasOwn(labels,style)?labels[style]:labels.zh)+' '+number;
 return {style:value=>Object.hasOwn(labels,value)?value:'zh',label,options:Object.keys(labels).map(key=>[key,label(key,1)])};
})();
window.ManuscriptTocSettings=(()=>{
 const defaults={enabled:true,side:'left',maxDepth:6,collapseDepth:2,pinned:false,hover:false,tooltip:true,wrap:false,hideFirst:false,progress:true,barWidth:32};
 const bool=[['true','开启'],['false','关闭']],depth=Array.from({length:6},(_,i)=>[String(i+1),'H'+(i+1)]);
 const definitions=[['enabled','正文目录',bool],['maxDepth','目录列表显示到哪一级',depth],['collapseDepth','初始展开到哪一级',depth],['tooltip','显示标题提示',bool],['wrap','长标题换行',bool],['hideFirst','隐藏首个一级标题',bool]];
 return {defaults,fields:values=>definitions.map(([key,label,options])=>[key,label,'select',String(({...defaults,...values})[key]),options]),read:values=>Object.fromEntries(definitions.map(([key])=>[key,typeof defaults[key]==='boolean'?values[key]==='true':typeof defaults[key]==='number'?Number(values[key]):values[key]]))}
})();
