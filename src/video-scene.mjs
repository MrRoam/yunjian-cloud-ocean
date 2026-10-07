// 旧版 Safari 无 WebGPU 时，使用同源海天影像，保留换景与日落浏览。
const clips=['day','clouds','sunset'];
export class VideoScene{
 constructor(canvas,paused=false,onHeight=()=>{}){
  this.index=0;this.paused=paused;this.seekHeight=null;this.onHeight=onHeight;
  this.video=document.createElement('video');
  this.video.id='sea-video';this.video.muted=true;this.video.playsInline=true;this.video.loop=true;
  this.video.preload='metadata';this.video.tabIndex=0;this.video.setAttribute('aria-label','海天影像，可换景或拖动太阳高度查看日落');
  canvas.hidden=true;canvas.after(this.video);
  this.video.addEventListener('loadedmetadata',()=>this.applyHeight());
  this.video.addEventListener('timeupdate',()=>{
   if(this.index!==2||this.seekHeight!==null)return;
   const t=Math.max(0,Math.min(1,(this.video.currentTime-1.5)/15));
   this.onHeight(12-16*t*t*(3-2*t));
  });
  this.video.addEventListener('error',()=>{
   document.getElementById('error').textContent='海天影像暂时无法载入，刷新后重试。';
   document.getElementById('error').hidden=false;
  });
  this.video.addEventListener('pointerup',()=>{if(this.seekHeight===null&&!this.paused)this.play();});
  this.show(0);
 }
 show(index){
  if(index===this.index&&this.video.getAttribute('src'))return;
  this.index=index;
  if(this.seekHeight===null)this.onHeight(index===2?12:32);
  this.video.poster=new URL(`../assets/${clips[index]}.jpg`,import.meta.url).href;
  this.video.src=new URL(`../assets/${clips[index]}.mp4`,import.meta.url).href;
  if(!this.paused&&this.seekHeight===null)this.play();
 }
 play(){this.video.play().catch(()=>{/* 浏览器允许用户轻触后开始播放。 */});}
 setPaused(value){this.paused=value;if(value||this.seekHeight!==null)this.video.pause();else this.play();}
 next(){this.seekHeight=null;this.show((this.index+1)%clips.length);}
 setHeight(height){
  if(height>12){this.seekHeight=null;this.show(0);if(!this.paused)this.play();return;}
  this.seekHeight=Math.max(-4,height);this.show(2);this.video.pause();this.applyHeight();
 }
 applyHeight(){
  if(this.seekHeight===null||this.index!==2||!Number.isFinite(this.video.duration))return;
  const target=(12-this.seekHeight)/16;
  let low=0,high=1;
  for(let i=0;i<20;i++){const mid=(low+high)/2;if(mid*mid*(3-2*mid)<target)low=mid;else high=mid;}
  this.video.currentTime=Math.min(this.video.duration-.05,1.5+15*(low+high)/2);
 }
}
