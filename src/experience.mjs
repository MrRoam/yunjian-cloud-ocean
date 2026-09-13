import {SkyRenderer} from './sky-renderer.mjs';
const $=id=>document.getElementById(id);
let renderer,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,elapsed=0,last=0,stopped=false;
$('sky').addEventListener('sky-stir',e=>{
 const mark=document.createElement('span');mark.className='gust-mark';mark.setAttribute('aria-hidden','true');
 mark.style.left=`${e.detail.x}px`;mark.style.top=`${e.detail.y}px`;document.body.append(mark);
 const marks=document.querySelectorAll('.gust-mark');if(marks.length>4)marks[0].remove();
 setTimeout(()=>mark.remove(),800);
});
$('new-sky').addEventListener('click',()=>renderer?.newSky());
function setSun(value){
 if(!renderer)return;
 const height=Number(value);
 renderer.targetSunset=(32-height)/37;renderer.dirty=12;
 $('sun-height').value=height;
 const label=height>12?'日光':height>2?'夕照':height>=0?'日落':'暮色';
 $('day-label').textContent=label;
 $('sun-height').setAttribute('aria-valuetext',`${label}，太阳高度 ${height} 度`);
}
$('sun-height').addEventListener('input',e=>setSun(e.target.value));

document.addEventListener('keydown',e=>{if(e.code==='Space'&&['BODY','CANVAS'].includes(document.activeElement.tagName)){e.preventDefault();paused=!paused;if(renderer)renderer.dirty=12;}});
function fail(error){stopped=true;console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error').textContent=error.message||String(error);for(const button of document.querySelectorAll('button, input'))button.disabled=true;}
async function frame(now){
 if(stopped)return;
 const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 try{if(!document.hidden){if(!paused)elapsed+=dt;await renderer.render(elapsed,dt,paused);}requestAnimationFrame(frame);}catch(e){fail(e);}
}
try{
 renderer=await SkyRenderer.create($('sky'));
 renderer.device.addEventListener('uncapturederror',e=>fail(e.error));renderer.device.lost.then(info=>{if(info.reason!=='destroyed')fail(new Error('图形连接已中断，刷新即可重新打开天空。'));});
 for(let i=0;i<12;i++)await renderer.render(0,1/60,false);
 $('loading').classList.add('done');setTimeout(()=>{$('loading').hidden=true;},850);
 for(const button of document.querySelectorAll('button, input'))button.disabled=false;
 requestAnimationFrame(frame);setTimeout(()=>$('gesture').classList.add('fade'),9000);
}catch(e){fail(e);}
