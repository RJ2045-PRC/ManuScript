// Images in hosted projects use the existing project asset store, not a system file path.
const mapImageCache=new Map()
function mapURL(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function mapMath(tex){return window.katex.renderToString(tex,{output:'mathml',throwOnError:true,trust:false,maxExpand:500,maxSize:20})}
function mapMediaHTML(n){
 const m=n.media;if(!m)return '';let out=''
 if(m.image){const i=m.image;out+='<img class="topicImage" draggable="false" width="'+Math.max(1,Math.min(170,Number(i.w)||120))+'" height="'+Math.max(1,Math.min(104,Number(i.h)||84))+'" alt="'+E(i.name||'节点图片')+'" data-map-image="'+E(i.asset||'')+'">'}
 if(m.link&&mapURL(m.link))out+='<a class="topicLink" href="'+E(mapURL(m.link))+'" title="'+E(m.link)+'" target="_blank" rel="noopener noreferrer">↗ '+E(new URL(m.link).hostname)+'</a>'
 if(m.tex){try{out+='<span class="topicMath" title="'+E(m.tex)+'">'+mapMath(m.tex)+'</span>'}catch{out+='<code>'+E(m.tex)+'</code>'}}
 return out
}
function hydrateMapImages(){for(const el of W.querySelectorAll('[data-map-image]')){const id=proj,i=by(el.closest('.topic').dataset.id)?.media?.image;if(!i)continue
 if(!i.asset){if(/^data:image\/(png|jpeg|webp);base64,/.test(i.preview||''))el.src=i.preview;continue}
 const key=id+'/'+i.asset
 if(!mapImageCache.has(key)&&window.mapAssetAPI)mapImageCache.set(key,window.mapAssetAPI('file',{project:id,asset:i.asset}).then(f=>'data:'+i.mime+';base64,'+f.data).catch(()=>{mapImageCache.delete(key);return ''}))
 mapImageCache.get(key)?.then(src=>{if(el.isConnected&&id===proj&&src)el.src=src})
}}
function mediaDialog(kind,id){
 const node=by(id),project=proj,old=node.media?.[kind],d=document.createElement('dialog'),form=document.createElement('form')
 const name={image:'图片',link:'链接',tex:'LaTeX 公式'}[kind]
 d.className='canvasMedia';form.innerHTML='<h3>'+name+' · '+E(node.t)+'</h3><label>'+(kind==='image'?'选择本地图片<input type="file" accept="image/png,image/jpeg,image/webp">':kind==='link'?'网址<input type="url" placeholder="https://…" required>':'公式源码<textarea required rows="3" placeholder="E=mc^2"></textarea>')+'</label><div class="mediaPreview"></div><small role="status"></small><div class="mediaButtons">'+(old?'<button type="button" data-remove>移除'+name+'</button>':'')+'<button type="button" data-close>取消</button><button type="submit">保存</button></div>'
 d.append(form);document.body.append(d);const field=form.querySelector('input,textarea'),preview=form.querySelector('.mediaPreview'),error=form.querySelector('[role=status]')
 if(kind!=='image')field.value=old||''
 function check(){error.textContent='';if(kind!=='tex')return;try{preview.innerHTML=mapMath(field.value)}catch{preview.textContent='';error.textContent='公式未解析，请检查 LaTeX 语法。'}}
 field.oninput=check;check();d.onclose=()=>{d.remove();vp.focus({preventScroll:true})};form.querySelector('[data-close]').onclick=()=>d.close()
 function set(value){if(project!==proj||!by(id)||!d.open)return;record();const n=by(id);n.media={...n.media};if(value)n.media[kind]=value;else delete n.media[kind];save();draw();d.close()}
 if(old)form.querySelector('[data-remove]').onclick=()=>set(null)
 form.onsubmit=async e=>{e.preventDefault();error.textContent='';const b=form.querySelector('[type=submit]');b.disabled=true
 try{if(kind==='link'){const u=mapURL(field.value.trim());if(!u)throw Error('请输入 http 或 https 网址。');set(u)}
  else if(kind==='tex'){const t=field.value.trim();if(!t||t.length>2000)throw Error('请输入不超过 2000 字的公式。');mapMath(t);set(t)}
  else {const f=field.files[0];if(!f||!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024)throw Error('请选择 8 MiB 以内的 PNG、JPEG 或 WebP 图片。')
   const bmp=await createImageBitmap(f),scale=Math.min(1,170/bmp.width,104/bmp.height),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale))
   const img={name:f.name,mime:f.type,w,h};if(window.mapAssetAPI){const data=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result.split(',')[1]);r.onerror=no;r.readAsDataURL(f)});if(!d.open||project!==proj){bmp.close();return}
    const a=await window.mapAssetAPI('map_image',{project,name:f.name,data,mime:f.type});img.asset=a.id
   }else{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(bmp,0,0,w,h);img.preview=c.toDataURL('image/png')}
   bmp.close();set(img)}
 }catch(err){error.textContent=kind==='tex'?'公式未解析，请检查 LaTeX 语法。':err.message}finally{b.disabled=false}}
 d.showModal();field.focus()
}
