import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Marker} from './app-source/overlay/marker';
import {MagnifierLayer} from './app-source/overlay/magnifier-layer';
import {drawMark,fontString,type Mark} from './app-source/shared/drawing';
import {strokeWidthPx} from './app-source/shared/constants';
import {renderSlide} from './export/export-render';

const scene=new URLSearchParams(location.search).get('scene')||'hero';
const W=innerWidth,H=innerHeight,DPR=2;
const background=document.querySelector<HTMLImageElement>('#background')!;
background.src=`/backgrounds/${scene}.svg`;
const canvas=document.querySelector<HTMLCanvasElement>('#marks')!;
canvas.width=W*DPR;canvas.height=H*DPR;
const ctx=canvas.getContext('2d')!;ctx.scale(DPR,DPR);
const Y='#FFD400',P='#FF2D95',O='#FF7A00';
const width=strokeWidthPx('thick',H),thin=strokeWidthPx('medium',H);
const marks:Mark[]=[];
function ellipse(cx:number,cy:number,rx:number,ry:number,color:string,w=width){marks.push({kind:'shape',shape:'ellipse',geometry:{cx,cy,rx,ry},color,width:w})}
function arrow(x:number,y:number,x2:number,y2:number,color:string,w=width){marks.push({kind:'shape',shape:'line',geometry:{from:{x,y},to:{x:x2,y:y2}},arrowhead:'end',color,width:w})}
function text(x:number,y:number,value:string,color:string,sizeKey:any='small',center=false){if(center){ctx.font=fontString(sizeKey);x-=ctx.measureText(value).width/2}marks.push({kind:'text',x,y,text:value,color,sizeKey})}
if(scene==='hero'){
 ellipse(1057,248,55,27,Y);arrow(855,197,993,225,P);text(751,155,'+61%',P);
}
if(scene==='shapes'){
 marks.push({kind:'shape',shape:'rect',geometry:{x:718,y:333,w:194,h:204},color:P,width});
 arrow(679,435,710,435,P);arrow(915,435,951,435,P);
 marks.push({kind:'pen',points:[{x:795,y:478},{x:805,y:480},{x:815,y:481},{x:825,y:480},{x:835,y:478}],color:Y,width});
}
if(scene==='blackboard'){
 text(100,115,'Why it worked.',O,'medium');
 for(const [x,label] of [[230,'Focus'],[600,'Simplify'],[970,'Repeat']] as const){ellipse(x,365,143,96,O,thin);text(x,346,label,x===600?Y:O,'small',true)}
 arrow(385,365,438,365,O,thin);arrow(756,365,808,365,O,thin);
}
if(scene==='magnifier'){
 marks.push({kind:'pen',points:[{x:550,y:404},{x:566,y:406},{x:585,y:405},{x:604,y:404}],color:Y,width:thin});
}
for(const mark of marks)drawMark(ctx,mark);
function App(){
 const [color,setColor]=useState<any>(scene==='blackboard'?O:P);
 const [line,setLine]=useState<any>('thick'),[size,setSize]=useState<any>('small');
 const [tool,setTool]=useState<any>(scene==='magnifier'?'magnifier':'freehand');
 const [drawing,setDrawing]=useState<any>('freehand');
 const [board,setBoard]=useState(scene==='blackboard');
 return <><Marker color={color} widthKey={line} textSizeKey={size} tool={tool} drawingTool={drawing} board={board}
   onColorChange={setColor} onWidthChange={setLine} onTextSizeChange={setSize} onBoardToggle={()=>setBoard(!board)}
   onToolChange={t=>{setTool(t);if(['freehand','arrow','rect','ellipse','triangle'].includes(t))setDrawing(t)}}/>
   {scene==='magnifier'&&<MagnifierLayer board={false} drawMarks={(target,source,zoom)=>target.drawImage(canvas,source.x*DPR,source.y*DPR,source.width*DPR,source.height*DPR,0,0,source.width*zoom,source.height*zoom)} onCaptureError={e=>parent.postMessage({type:'scene-error',scene,error:e},location.origin)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
window.addEventListener('message',async e=>{
 if(e.origin!==location.origin||e.data?.type!=='render-scene')return;
 try{
  await document.fonts.ready;await background.decode();
  const node=document.getElementById('scene')!;const wrapper=document.createElement('div');wrapper.style.cssText=`position:relative;width:${W*2}px;height:${H*2}px;overflow:hidden`;node.before(wrapper);wrapper.append(node);node.style.transform='scale(2)';node.style.transformOrigin='top left';const result=await renderSlide(wrapper,W*2,H*2,scene==='marker'?'#ffffff':'#151517');wrapper.before(node);wrapper.remove();node.style.transform='';
  if(result.missingImages)throw Error(`${result.missingImages} missing images`);
  const bytes=await result.toPng(W*2,H*2);
  parent.postMessage({type:'scene-rendered',scene,bytes},location.origin);
 }catch(error){parent.postMessage({type:'scene-error',scene,error:String(error)},location.origin)}
});
