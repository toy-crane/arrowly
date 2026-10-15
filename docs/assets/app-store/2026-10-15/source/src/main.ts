import {renderSlide} from './export/export-render';
const slides=[
 {id:'hero',label:'1. 핵심 강조',ko:'전달할 핵심을, 선명하게.',en:'Make your point clear.'},
 {id:'marker',label:'2. 플로팅 마커',ko:'필요한 도구를, 바로 곁에.',en:'Your tools, close at hand.'},
 {id:'shapes',label:'3. 화살표와 도형',ko:'복잡한 흐름도, 한눈에.',en:'Make complex ideas easy to follow.'},
 {id:'blackboard',label:'4. 블랙보드',ko:'새로운 설명이 필요할 때.',en:'Make room for a new idea.'},
 {id:'magnifier',label:'5. 확대',ko:'작은 디테일까지, 또렷하게.',en:'Bring the details into focus.'}
];
const select=document.querySelector<HTMLSelectElement>('#screen')!,locale=document.querySelector<HTMLSelectElement>('#locale')!,status=document.querySelector('#status')!;
const frames=new Map<string,HTMLIFrameElement>();
for(const slide of slides){
 select.add(new Option(slide.label,slide.id));
 const host=document.createElement('div');host.className='scene-host';host.dataset.scene=slide.id;
 const iframe=document.createElement('iframe');iframe.title=slide.label;iframe.src=`/scene.html?scene=${slide.id}`;
 const w=slide.id==='marker'?1000:1200;iframe.width=String(w);iframe.height=String(w*.625);iframe.style.transform=`scale(${1080/w})`;
 host.append(iframe);document.querySelector('#frames')!.append(host);frames.set(slide.id,iframe);
}
function fit(){const scale=Math.min(1,(innerWidth-32)/1440);const vp=document.querySelector<HTMLElement>('#viewport')!;vp.style.width=`${1440*scale}px`;vp.style.height=`${900*scale}px`;document.querySelector<HTMLElement>('#composition')!.style.transform=`scale(${scale})`}
function show(){const slide=slides.find(s=>s.id===select.value)!;document.querySelector('#headline')!.textContent=slide[locale.value as 'ko'|'en'];document.querySelectorAll<HTMLElement>('.scene-host[data-scene]').forEach(el=>el.classList.toggle('hidden',el.dataset.scene!==slide.id));}
select.addEventListener('change',show);locale.addEventListener('change',show);window.addEventListener('resize',fit);fit();show();status.textContent='렌더링 준비 완료';
const pending=new Map<string,{resolve:(bytes:Uint8Array)=>void,reject:(e:Error)=>void}>();
window.addEventListener('message',e=>{
 if(e.origin!==location.origin)return;
 const p=pending.get(e.data?.scene);if(!p)return;
 if(e.data.type==='scene-rendered'){pending.delete(e.data.scene);p.resolve(e.data.bytes)}
 if(e.data.type==='scene-error'){pending.delete(e.data.scene);p.reject(new Error(e.data.error))}
});
function renderScene(id:string){return new Promise<Uint8Array>((resolve,reject)=>{pending.set(id,{resolve,reject});frames.get(id)!.contentWindow!.postMessage({type:'render-scene'},location.origin);setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error(`Scene timeout: ${id}`))}},20000)})}
document.querySelector<HTMLButtonElement>('#export')!.addEventListener('click',async()=>{
 const button=document.querySelector<HTMLButtonElement>('#export')!;button.disabled=true;const output=document.querySelector('#export-stage')!;
 try{
  await document.fonts.ready;
  const images=new Map<string,string>();
  for(const slide of slides){status.textContent=`앱 장면 렌더링: ${slide.label}`;const bytes=await renderScene(slide.id);images.set(slide.id,URL.createObjectURL(new Blob([bytes],{type:'image/png'})))}
  let count=0;
  for(const lang of ['ko','en'] as const){for(const [i,slide] of slides.entries()){
   status.textContent=`PNG 저장 ${++count}/10 · ${lang} · ${slide.label}`;
   const node=document.createElement('div');node.className='copy';node.innerHTML=`<div class="brand"><img src="/icon.svg">Arrowly</div><h1>${slide[lang]}</h1><div class="scene-host"><img src="${images.get(slide.id)}" alt="${slide.id}"></div>`;
   const page=document.createElement('div');page.style.cssText='position:relative;width:2880px;height:1800px;overflow:hidden;background:#f5f5f7';node.style.transform='scale(2)';node.style.transformOrigin='top left';page.append(node);output.replaceChildren(page);await Promise.all(Array.from(node.querySelectorAll('img')).map(image=>image.decode()));
   const rendered=await renderSlide(page,2880,1800,'#f5f5f7');if(rendered.missingImages)throw Error('Missing exported image');
   const png=await rendered.toPng(2880,1800);const name=`${lang}/${String(i+1).padStart(2,'0')}-${slide.id}.png`;
   const response=await fetch(`/export?name=${encodeURIComponent(name)}`,{method:'POST',body:png,headers:{'Content-Type':'image/png'}});if(!response.ok)throw Error(await response.text());
  }}
  images.forEach(url=>URL.revokeObjectURL(url));output.replaceChildren();status.textContent='완료 · PNG 10장 저장됨';
 }catch(e){status.textContent=`내보내기 실패: ${e instanceof Error?e.message:String(e)}`;console.error(e)}finally{button.disabled=false}
});
