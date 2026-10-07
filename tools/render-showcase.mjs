import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {once} from 'node:events';
const root=new URL('../',import.meta.url);
const out=new URL('showcase/',root);await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
page.on('pageerror',e=>console.error(e));
await page.route('**/capture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:black"><canvas id="sky" style="width:1280px;height:720px;display:block"></canvas></body>'}));
await page.goto('http://127.0.0.1:4187/capture.html');
await page.evaluate(async()=>{
 let seed=1409;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const {SkyRenderer}=await import('/src/sky-renderer.mjs');
 const {createScene}=await import('/src/sky-scenes.mjs');
 window.makeScene=(kind,seed)=>{const s=createScene(kind);s.seed=seed;s.climate[3]=.6;return s;};
 window.r=await SkyRenderer.create(document.querySelector('canvas'),{adaptive:false});
 r.device.addEventListener('uncapturederror',e=>{throw e.error;});
});
const clips=[{name:'01-日光海风',kind:1,seed:17.2,duration:12},{name:'02-流云变幻',kind:3,seed:24.7,duration:16},{name:'03-海上日落',kind:1,seed:41.6,duration:18}];
const fps=24;
try{
for(const [index,clip] of clips.entries()){
 await page.evaluate(async({clip,index})=>{
  r.scene=makeScene(clip.kind,clip.seed);r.nextScene=r.scene;r.seed=clip.seed;r.nextSeed=clip.seed;r.transition=0;r.pendingSky=false;r.frame=0;r.lastCamera='';r.yaw=.2;r.pitch=index===2?.065:.13;r.fov=1.15;
  const height=index===2?12:32;r.sunset=(32-height)/37;r.targetSunset=r.sunset;
  for(let i=0;i<16;i++)await r.render(0,0,false);
 },{clip,index});
 const file=new URL(`${clip.name}.mp4`,out);
 const encoder=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',fileURLToPath(file)],{stdio:['pipe','ignore','pipe'],windowsHide:true});
 let errors='';encoder.stderr.on('data',d=>errors+=d);const done=once(encoder,'exit');
 for(let frame=0;frame<clip.duration*fps;frame++){
  const data=await page.evaluate(async({index,frame,fps,duration})=>{
   const t=frame/fps;
   if(index===0)r.yaw=.2;
   if(index===1){
    if(frame===fps*3){r.nextScene=makeScene(2,13.1);r.nextSeed=r.nextScene.seed;r.transition=.0001;}
    if(frame===fps*9){r.nextScene=makeScene(0,29.4);r.nextSeed=r.nextScene.seed;r.transition=.0001;}
   }
   if(index===2){const a=Math.max(0,Math.min(1,(t-1.5)/(duration-3)));const ease=a*a*(3-2*a);r.sunset=(32-(12-16*ease))/37;r.targetSunset=r.sunset;}
   await r.render(t*2,1/fps,false);
   for(let sample=0;sample<5;sample++)await r.render(t*2,0,false);
   return document.querySelector('canvas').toDataURL('image/jpeg',.98).split(',')[1];
  },{index,frame,fps,duration:clip.duration});
  const bytes=Buffer.from(data,'base64');
  if(!encoder.stdin.write(bytes))await once(encoder.stdin,'drain');
  if(frame===0||frame===Math.floor(clip.duration*fps/2)||frame===clip.duration*fps-1)await writeFile(new URL(`${clip.name}-${frame}.jpg`,out),bytes);
  if(frame%(fps*2)===0)console.log(`${clip.name}: ${frame}/${clip.duration*fps}`);
 }
 encoder.stdin.end();const [status]=await done;if(status!==0)throw new Error(errors);
 console.log(`完成 ${clip.name}`);
}
}finally{await browser.close();}
