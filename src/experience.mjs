import {SkyRenderer} from './sky-renderer.mjs';
const $=id=>document.getElementById(id);
let renderer,fallback,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0,lastRendered=0,stopped=false,frameId=0;
$('sky').addEventListener('sky-stir',e=>{
 const mark=document.createElement('span');mark.className='gust-mark';mark.setAttribute('aria-hidden','true');
 mark.style.left=`${e.detail.x}px`;mark.style.top=`${e.detail.y}px`;document.body.append(mark);
 const marks=document.querySelectorAll('.gust-mark');if(marks.length>4)marks[0].remove();
 setTimeout(()=>mark.remove(),800);
});
$('new-sky').addEventListener('click',()=>fallback?fallback.next():renderer?.newSky());
function setSun(value){
 if(!renderer&&!fallback)return;
 const height=Number(value);
 if(fallback)fallback.setHeight(height);else{renderer.targetSunset=(32-height)/37;renderer.dirty=12;}
 updateSunLabel(height);
}
function updateSunLabel(height){
 $('sun-height').value=height;
 const label=height>12?'日光':height>2?'夕照':height>=0?'日落':'暮色';
 $('day-label').textContent=label;
 $('sun-height').setAttribute('aria-valuetext',`${label}，太阳高度 ${height} 度`);
}
$('sun-height').addEventListener('input',e=>setSun(e.target.value));

document.addEventListener('keydown',e=>{if(e.code==='Space'&&['BODY','CANVAS','VIDEO'].includes(document.activeElement.tagName)){e.preventDefault();paused=!paused;if(renderer)renderer.dirty=12;fallback?.setPaused(paused);}});
function fail(error){stopped=true;console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent=error.message||String(error);for(const button of document.querySelectorAll('button, input'))button.disabled=true;}
async function frame(now){
 if(stopped)return;
 const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 try{
  if(!document.hidden){
   if(!paused)elapsed+=dt;
   const active=renderer.dirty>0||renderer.gusts.active||renderer.transition>0||Math.abs(renderer.sunset-renderer.targetSunset)>.0002;
   const fps=active?60:renderer.budget.idleFPS;
   if(!lastRendered||now-lastRendered>=1000/fps-1){
    const step=lastRendered?Math.min((now-lastRendered)/1000,.2):dt;
    if(await renderer.render(elapsed,step,paused,{waitForGPU:false}))lastRendered=now;
   }
  }
  frameId=requestAnimationFrame(frame);
 }catch(e){fail(e);}
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){cancelAnimationFrame(frameId);fallback?.setPaused(true);}
 else if(!stopped){last=0;lastRendered=0;if(renderer)frameId=requestAnimationFrame(frame);fallback?.setPaused(paused);}
});
try{
 renderer=await SkyRenderer.create($('sky'));
 renderer.device.addEventListener('uncapturederror',e=>fail(e.error));renderer.device.lost.then(info=>{if(info.reason!=='destroyed')fail(new Error('图形连接已中断，刷新即可重新打开天空。'));});
 for(let i=0;i<12;i++)await renderer.render(0,1/60,false);
 $('loading').classList.add('done');setTimeout(()=>{$('loading').hidden=true;},850);
 for(const button of document.querySelectorAll('button, input'))button.disabled=false;
 frameId=requestAnimationFrame(frame);setTimeout(()=>$('gesture').classList.add('fade'),9000);
}catch(e){
 if(e.code==='WEBGPU_UNAVAILABLE'){
  try{
   const {VideoScene}=await import('./video-scene.mjs');
   fallback=new VideoScene($('sky'),paused,updateSunLabel);
   $('gesture').textContent='换一片海天 · 拖动太阳看日落';
   $('loading').hidden=true;
   for(const control of document.querySelectorAll('button, input'))control.disabled=false;
  }catch(error){fail(error);}
 }else fail(e);
}
