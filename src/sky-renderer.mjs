import {createSkyNoise} from './sky-noise.mjs';
import {createScene,SceneSequence} from './sky-scenes.mjs';
import {skyRay,Gusts} from './sky-interaction.mjs';
import {RenderBudget} from './sky-budget.mjs';
const code=/* wgsl */`
struct Params{ screen:vec4f, view:vec4f, light:vec4f, world:vec4f, previous:vec4f, shapeA:vec4f, climateA:vec4f, shapeB:vec4f, climateB:vec4f, gusts:array<vec4f,4> }
@group(0) @binding(0) var<uniform> u:Params;
@group(0) @binding(1) var shapeTex:texture_3d<f32>;
@group(0) @binding(2) var repeatSampler:sampler;
@group(0) @binding(3) var history:texture_2d<f32>;
@group(0) @binding(4) var clampSampler:sampler;
struct Vertex{@builtin(position) pos:vec4f,@location(0) uv:vec2f}
@vertex fn vs(@builtin(vertex_index) id:u32)->Vertex{
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:Vertex;o.pos=vec4f(p[id],0,1);o.uv=p[id]*.5+.5;return o;
}
fn hash(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
fn tex(p:vec3f)->vec4f{return textureSampleLevel(shapeTex,repeatSampler,p,0.0);}
fn weather(p:vec2f,seed:f32,climate:vec4f)->f32{
 let a=tex(vec3f(p*climate.y+seed,0.371)).x;
 let b=tex(vec3f(p*climate.y*2.31+seed*.73,0.817)).x;
 return clamp((a*.72+b*.28-.50)*2.3+.42+climate.x+.045*sin(u.screen.w*.07+a*9.0),0.0,.95);
}
fn cloudAt(p0:vec3f,seed:f32,shape:vec4f,climate:vec4f,fine:bool)->f32{
 if(p0.y<1.15||p0.y>3.8){return 0.0;}
 let motion=vec3f(u.screen.w*.018,u.screen.w*.0035,u.screen.w*.007);
 let ca=cos(climate.w);let sa=sin(climate.w);
 let q=p0+motion;
 let p=vec3f((q.x*ca-q.z*sa)/shape.z,q.y,q.x*sa+q.z*ca);
 let cover=weather(p.xz,seed,climate);
 if(cover<.12){return 0.0;}
 let bottom=1.25+(tex(p*.55+vec3f(seed)).y-.4)*.17;
 let h=(p0.y-bottom)/shape.y;
 let heightMask=smoothstep(0.0,.075,h)*(1.0-smoothstep(.22+cover*.23,.55+cover*.45,h));
 if(heightMask<=0.0){return 0.0;}
 let warp=(tex(q*.67+vec3f(seed*.31)+vec3f(0,u.screen.w*.006,0)).yzw-vec3f(.5))*.10+sin(q.zxy*1.7+u.screen.w*.10)*.045;
 let n=tex(p*shape.x+warp+vec3f(seed,0,seed*.43));
 let billow=n.x*.80+n.y*.15+n.z*.05+.018;
 var base=clamp((billow*heightMask-(1.0-cover))/max(cover,.001),0.0,1.0);
 if(base<.001){return 0.0;}
 let coarse=n.y*.625+n.z*.25+n.w*.125;
 base=clamp((base-(1.0-coarse)*.16)/.84,0.0,1.0);
 if(fine&&base>0.0){
   let d=tex(q*.92+vec3f(seed*.23,u.screen.w*.004,0));
   let erosion=(1.0-(d.y*.55+d.z*.3+d.w*.15))*.20+(1.0-tex(q*4.1).z)*.045+(1.0-tex(q*13.0).w)*.014;
   base=clamp((base-erosion)/max(1.0-erosion,.01),0.0,1.0);
 }
 return base*shape.w;
}
// 在世界空间弯曲云体；光照采样也经过相同变形。
fn disturb(p:vec3f)->vec4f{
 if(u.world.w<.5){return vec4f(p,1.0);}
 var shifted=p;var keep=1.0;
 let fromEye=p-vec3f(0,.10,0);
 for(var i=0;i<4;i++){
  let gust=u.gusts[i];let age=gust.w;
  if(age<0.0){continue;}
  let depth=dot(fromEye,gust.xyz);
  if(depth<=0.0){continue;}
  let delta=fromEye-gust.xyz*depth;
  let radius=depth*(.075+.022*age);
  let r2=dot(delta,delta)/(radius*radius);
  let life=(1.0-exp(-age*7.0))*exp(-age*.42)*(1.0-smoothstep(7.0,9.0,age));
  let weight=exp(-r2*1.5)*life;
  shifted-=weight*(delta*1.8+cross(gust.xyz,delta)*2.4);
  keep*=1.0-.98*weight;
 }
 return vec4f(shifted,keep);
}
fn density(p:vec3f,fine:bool)->f32{
 let gust=disturb(p);
 let cloudPoint=gust.xyz;
 let a=cloudAt(cloudPoint,u.world.x,u.shapeA,u.climateA,fine);
 if(u.world.z<.001){return a*gust.w;}
 return mix(a,cloudAt(cloudPoint,u.world.y,u.shapeB,u.climateB,fine),u.world.z)*gust.w;
}
fn shadow(p:vec3f,jitter:f32)->f32{
 var tau=0.0;var t=.025+jitter*.025;
 for(var k=0;k<8;k++){
   let stride=.045+.026*f32(k);
   tau+=density(p+u.light.xyz*t,k<3)*stride*23.0;t+=stride;
 }
 return tau;
}
fn hg(mu:f32,g:f32)->f32{return (1.0-g*g)/(12.56637*pow(1.0+g*g-2.0*g*mu,1.5));}
fn daylight()->f32{return smoothstep(-.055,.025,u.light.y);}
fn sky(ray:vec3f,solarDisk:bool)->vec3f{
 let h=clamp(ray.y,0.0,1.0);let sunset=u.light.w;
 let zenith=mix(vec3f(.065,.20,.41),vec3f(.07,.09,.17),sunset);
 let horizon=mix(vec3f(.39,.56,.73),vec3f(.96,.34,.12),sunset);
 // 有限斜率避免地平线两侧出现突兀的亮色细带。
 let gradient=(pow(h+.018,.42)-pow(.018,.42))/(pow(1.018,.42)-pow(.018,.42));
 var color=mix(horizon,zenith,gradient);
 let mu=max(0.0,dot(ray,u.light.xyz));
 let sunColor=mix(vec3f(1.0,.92,.75),vec3f(1.0,.46,.16),sunset);
 color+=sunColor*(pow(mu,14.0)*.10+pow(mu,150.0)*.24+select(0.0,smoothstep(.99968,.99987,mu)*12.0,solarDisk));
 let dusk=1.0-smoothstep(-.09,.015,u.light.y);
 return mix(color,vec3f(.025,.038,.075)+color*.12,dusk);
}
fn highCloud(ray:vec3f,seed:f32,climate:vec4f)->f32{
 if(ray.y<.025||climate.z<.001){return 0.0;}
 let gust=disturb(vec3f(0,.10,0)+ray*(5.8/ray.y));
 let point=gust.xz+vec2f(u.screen.w*.025,0);
 let ca=cos(climate.w+.7);let sa=sin(climate.w+.7);
 var q=vec2f(point.x*ca-point.y*sa,point.x*sa+point.y*ca);
 let bend=tex(vec3f(q*.043,seed)).x;
 q.y+=(bend-.5)*1.8;
 let envelope=tex(vec3f(q*.083,seed+.7)).x;
 let fibers=tex(vec3f(q.x*.072,q.y*.31,seed+u.screen.w*.0008));
 let feather=tex(vec3f(q.x*.19,q.y*.87,seed+.23)).x;
 let v=smoothstep(.30,.68,envelope)*smoothstep(.28,.76,fibers.x*.66+feather*.34);
 return (1.0-exp(-v*climate.z*1.7))*gust.w;
}
fn aces(c:vec3f)->vec3f{return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),vec3f(0),vec3f(1));}
fn atmosphere(ray:vec3f,jitter:f32)->vec4f{
 let eye=vec3f(0,.10,0);let aerial=sky(ray,false);var bg=aerial;
 var high=highCloud(ray,u.world.x,u.climateA);
 if(u.world.z>=.001){high=mix(high,highCloud(ray,u.world.y,u.climateB),u.world.z);}
 let highColor=mix(vec3f(.86,.91,1.0),vec3f(1.05,.49,.26),u.light.w);
 bg=mix(bg,highColor*mix(.12,1.0,daylight()),high);
 var color=vec3f(0);var trans=1.0;

 if(ray.y>.015){
   let top=max(u.shapeA.y,u.shapeB.y)*.9775+1.352;
   let ceiling=select(min(top,3.8),3.8,u.world.w>.5);
   let start=1.05/ray.y;let end=min((ceiling-eye.y)/ray.y,96.0);
   // 保留原有采样间距，只裁掉已知不含云的上层空间。
   let stride=max(.018,(min(3.7/ray.y,96.0)-start)/112.0);
   var t=start+jitter*stride;
   let mu=dot(ray,u.light.xyz);let phase=max(hg(mu,.65),hg(mu,-.25));
   let sunColor=mix(vec3f(1.0,.97,.90),vec3f(1.0,.44,.17),u.light.w);
   for(var k=0;k<120;k++){
     if(t>end||trans<.006){break;}
     let p=eye+ray*t;let d=density(p,true);
     if(d>.002){
       var tau=0.0;
       if(daylight()>0.0){tau=shadow(p,jitter);}
       let scatter=exp(-tau)+.48*exp(-tau*.22)+.13*exp(-tau*.08);
       let powder=1.0-exp(-d*4.0);
       let altitude=clamp((p.y-1.25)/2.55,0.0,1.0);
       let ambient=mix(vec3f(.075,.11,.17),vec3f(.24,.31,.40),altitude)*mix(1.0,.4,u.light.w);
       let sunlight=sunColor*scatter*(.8+phase*3.0)*mix(.8,1.0,powder)*daylight();
       let alpha=1.0-exp(-d*23.0*stride);
       let fog=1.0-exp(-t*.038);
       color+=trans*alpha*mix(ambient+sunlight,aerial,fog);
       trans*=1.0-alpha;
     }
     t+=stride;
   }
 }
 let horizon=sky(normalize(vec3f(ray.x,0,ray.z)),false);
 let visibility=smoothstep(0.0,.045,ray.y);
 let disk=smoothstep(.99994,.99998,dot(ray,u.light.xyz))*12.0;
 let sunColor=mix(vec3f(1.0,.92,.75),vec3f(1.0,.31,.08),u.light.w);
 // 日轮独立于地平线雾化，才能连续沉入海面；仍受云层遮挡。
 let direct=sunColor*disk*trans*(1.0-high)*smoothstep(-.012,.004,u.light.y);
 return vec4f(mix(horizon,color+bg*trans,visibility)+direct,mix(1.0,trans,visibility));
}
// 米制海面，与天空共用世界方向、太阳和时间。远处波纹自然收敛。
fn ocean(ray:vec3f,jitter:f32)->vec3f{
 let distance=3.5/max(-ray.y,.00001);
 let p=ray.xz*distance;
 let time=u.screen.w;
 var slope=vec2f(0);
 for(var i=0;i<7;i++){
  let f=f32(i);
  let angle=.45+f*2.399;
  let direction=vec2f(cos(angle),sin(angle));
  let frequency=.24*pow(1.9,f);
  // 斜视海面时，一个像素沿水面覆盖的距离远大于屏幕投影宽度。
  let footprint=distance*u.view.z/(u.screen.y*max(-ray.y,.008));
  let attenuation=exp(-frequency*footprint*1.5);
  let phase=dot(p,direction)*frequency-time*sqrt(9.81*frequency)+f*1.7;
  slope+=direction*cos(phase)*(.065*pow(.78,f))*attenuation;
 }
 let normal=normalize(vec3f(-slope.x,1,-slope.y));
 var reflected=reflect(ray,normal);
 reflected.y=max(.002,reflected.y);
 reflected=normalize(reflected);
 let reflection=atmosphere(reflected,jitter).rgb;
 let facing=clamp(dot(-ray,normal),0.0,1.0);
 let fresnel=.025+.975*pow(1.0-facing,5.0);
 let water=mix(vec3f(.012,.075,.105),vec3f(.018,.032,.044),u.light.w);
 var color=mix(water,reflection,fresnel);
 let glint=pow(max(0.0,dot(reflected,u.light.xyz)),650.0);
 let sunTint=mix(vec3f(1.0,.92,.72),vec3f(1.0,.43,.13),u.light.w);
 color+=sunTint*glint*.65*daylight();
 let haze=1.0-exp(-distance*.00065);
 let horizon=sky(normalize(vec3f(ray.x,0,ray.z)),false);
 let visibility=smoothstep(0.0,.045,-ray.y)*(1.0-haze);
 return mix(horizon,color,visibility);
}
@fragment fn clouds(input:Vertex)->@location(0) vec4f{
 let uv=vec2f(input.uv.x,1.0-input.uv.y);
 let front=vec3f(sin(u.view.x)*cos(u.view.y),sin(u.view.y),cos(u.view.x)*cos(u.view.y));
 let right=normalize(cross(vec3f(0,1,0),front));let up=cross(front,right);
 let screen=vec2f((uv.x-.5)*u.screen.x/u.screen.y,.5-uv.y)*u.view.z;
 let ray=normalize(front+screen.x*right+screen.y*up);
 let jitter=fract(hash(vec3f(input.pos.xy,9.7))+u.screen.z*.61803398875);
 var sample=vec4f(0);
 if(ray.y<0.0){sample=vec4f(ocean(ray,jitter),0);}else{sample=atmosphere(ray,jitter);}
 let current=pow(aces(sample.rgb*.87),vec3f(1.0/2.2));
 let old=textureSampleLevel(history,clampSampler,uv,0.0);
 return mix(old,vec4f(current,sample.a),u.previous.x);
}
@fragment fn display(input:Vertex)->@location(0) vec4f{
 let uv=vec2f(input.uv.x,1.0-input.uv.y);
 let value=textureSampleLevel(history,clampSampler,uv,0.0);
 let front=vec3f(sin(u.view.x)*cos(u.view.y),sin(u.view.y),cos(u.view.x)*cos(u.view.y));
 let right=normalize(cross(vec3f(0,1,0),front));let up=cross(front,right);
 let mu=dot(u.light.xyz,front);
 var color=value.rgb;
 if(mu>.3){
   let sunUV=vec2f(.5)+vec2f(dot(u.light.xyz,right)*u.screen.y/u.screen.x,-dot(u.light.xyz,up))/(mu*u.view.z);
   let delta=(sunUV-uv)*.65/16.0;
   var sampleUV=uv;var beam=0.0;var weight=1.0;
   for(var i=0;i<16;i++){
     sampleUV+=delta;
     if(all(sampleUV>vec2f(0))&&all(sampleUV<vec2f(1))){beam+=textureSampleLevel(history,clampSampler,sampleUV,0.0).a*weight;}
     weight*=.94;
   }
   let distance=length((sunUV-uv)*vec2f(u.screen.x/u.screen.y,1));
   let sunTint=mix(vec3f(1.0,.97,.86),vec3f(1.0,.62,.32),u.light.w);
   color+=sunTint*beam*.005*exp(-distance*1.3)*daylight();
 }
 return vec4f(color,1);
}
`;

export class SkyRenderer{
 static async create(canvas,options={}){
  const unavailable=()=>Object.assign(new Error('当前浏览器无法使用实时图形渲染。'),{code:'WEBGPU_UNAVAILABLE'});
  if(!navigator.gpu)throw unavailable();
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter||adapter.info?.isFallbackAdapter)throw unavailable();
  let device;try{device=await adapter.requestDevice();}catch{throw unavailable();}
  const self=new SkyRenderer(device,canvas,options);
  self.noise=await createSkyNoise(device);
  const module=device.createShaderModule({code});const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(e=>`${e.lineNum}: ${e.message}`).join('\n'));
  self.pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'clouds',targets:[{format:'rgba16float'}]}});
  self.displayPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'display',targets:[{format:self.format}]}});
  self.resize();return self;
 }
 constructor(device,canvas,options={}){
  this.device=device;this.canvas=canvas;this.context=canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device,format:this.format,alphaMode:'opaque'});
  this.uniform=device.createBuffer({size:208,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.repeat=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'repeat',addressModeV:'repeat',addressModeW:'repeat'});this.clamp=device.createSampler({magFilter:'linear',minFilter:'linear'});
  this.yaw=0;this.pitch=.12;this.fov=1.30;this.frame=0;this.sequence=new SceneSequence();this.scene=createScene(1);this.nextScene=this.scene;this.seed=this.scene.seed;this.nextSeed=this.seed;this.pendingSky=false;this.transition=0;this.sunset=0;this.targetSunset=0;this.dirty=12;this.textures=[];this.lastCamera='';
  this.gusts=new Gusts();
  this.budget=new RenderBudget({...options,coarse:matchMedia('(pointer:coarse)').matches,maxDimension:device.limits.maxTextureDimension2D});
  this.pending=null;
  let pointer=null;
  canvas.addEventListener('pointerdown',e=>{
   if(!e.isPrimary||e.button!==0||pointer)return;
   pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};
   canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',e=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   if(!pointer.dragged&&Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>6){pointer.dragged=true;canvas.classList.add('dragging');}
   if(pointer.dragged){this.yaw-=(e.clientX-pointer.x)*.003;this.pitch=Math.max(-.45,Math.min(1.15,this.pitch+(e.clientY-pointer.y)*.0025));this.dirty=12;}
   pointer.x=e.clientX;pointer.y=e.clientY;
  });
  const stop=e=>{if(pointer&&pointer.id===e.pointerId){pointer=null;canvas.classList.remove('dragging');}};
  canvas.addEventListener('pointerup',e=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   if(!pointer.dragged){const rect=canvas.getBoundingClientRect();this.stir(e.clientX-rect.left,e.clientY-rect.top);}
   stop(e);
  });
  canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
  canvas.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.repeat){e.preventDefault();this.stir(canvas.clientWidth/2,canvas.clientHeight/2);}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();this.fov=Math.max(.55,Math.min(1.6,this.fov*Math.exp(e.deltaY*.0007)));this.dirty=12;},{passive:false});
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')this.yaw-=.05;else if(e.key==='ArrowRight')this.yaw+=.05;else if(e.key==='ArrowUp')this.pitch=Math.min(1.15,this.pitch+.04);else if(e.key==='ArrowDown')this.pitch=Math.max(-.45,this.pitch-.04);else return;e.preventDefault();this.dirty=12;});
 }
 stir(x,y){
  if(this.canStir&&!this.canStir(x,y))return;
  const ray=skyRay(x,y,this.canvas.clientWidth,this.canvas.clientHeight,this.yaw,this.pitch,this.fov);
  if(ray[1]<=.025)return;
  this.gusts.add(ray);this.dirty=12;
  this.canvas.dispatchEvent(new CustomEvent('sky-stir',{detail:{x,y}}));
 }
 resize(){
  const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
  const [w,h]=this.budget.dimensions(width,height,devicePixelRatio);
  if(this.canvas.width===w&&this.canvas.height===h&&this.textures.length)return;
  for(const t of this.textures)t.destroy();this.canvas.width=w;this.canvas.height=h;
  this.textures=[0,1].map(()=>this.device.createTexture({size:[w,h],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING}));
  this.groups=this.textures.map(t=>this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.noise.createView()},{binding:2,resource:this.repeat},{binding:3,resource:t.createView()},{binding:4,resource:this.clamp}]}));
  this.displayGroups=this.textures.map(t=>this.device.createBindGroup({layout:this.displayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:3,resource:t.createView()},{binding:4,resource:this.clamp}]}));
  this.frame=0;this.dirty=12;
 }
 newSky(){if(this.transition>0){this.pendingSky=true;return;}this.nextScene=this.sequence.next();this.nextSeed=this.nextScene.seed;this.transition=.0001;this.dirty=12;}
 async render(time,dt,paused,{waitForGPU=true}={}){
  if(this.submissionError)throw this.submissionError;
  if(this.pending){if(!waitForGPU)return false;await this.pending;}
  this.resize();
  const hadGust=this.gusts.active;this.gusts.advance(dt);if(hadGust)this.dirty=12;
  const changing=this.gusts.active||this.transition>0||Math.abs(this.sunset-this.targetSunset)>.0002;
  if(paused&&!changing&&this.dirty<=0)return;
  if(this.transition>0){this.transition=Math.min(1,this.transition+dt/3.5);if(this.transition===1){this.seed=this.nextSeed;this.scene=this.nextScene;this.transition=0;if(this.pendingSky){this.pendingSky=false;this.newSky();}}}
  this.sunset+=(this.targetSunset-this.sunset)*Math.min(1,dt*2.0);
  const elev=(32-this.sunset*37)*Math.PI/180;
  const warmth=Math.max(0,Math.min(1,(.40-elev)/.36));
  const azimuth=.2;
  const sun=[Math.sin(azimuth)*Math.cos(elev),Math.sin(elev),Math.cos(azimuth)*Math.cos(elev)];
  const camera=[this.yaw,this.pitch,this.fov].join(',');const reset=camera!==this.lastCamera||this.frame===0;this.lastCamera=camera;
  const blend=reset?1:paused&&!changing?.12:.20;
  const data=new Float32Array([this.canvas.width,this.canvas.height,this.frame,time,this.yaw,this.pitch,this.fov,0,...sun,warmth,this.seed,this.nextSeed,this.transition,this.gusts.active?1:0,blend,0,0,0,...this.scene.shape,...this.scene.climate,...this.nextScene.shape,...this.nextScene.climate,...this.gusts.pack()]);
  this.device.queue.writeBuffer(this.uniform,0,data);
  const source=this.frame%2,dest=1-source,e=this.device.createCommandEncoder();
  const pass=e.beginRenderPass({colorAttachments:[{view:this.textures[dest].createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.groups[source]);pass.draw(3);pass.end();
  const display=e.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});display.setPipeline(this.displayPipeline);display.setBindGroup(0,this.displayGroups[dest]);display.draw(3);display.end();this.device.queue.submit([e.finish()]);
  this.frame++;this.dirty--;
  const started=performance.now();
  this.pending=this.device.queue.onSubmittedWorkDone().then(()=>{
   this.budget.record(performance.now()-started,performance.now());this.pending=null;
  },error=>{
   this.pending=null;this.submissionError=error;
  });
  if(waitForGPU){await this.pending;if(this.submissionError)throw this.submissionError;}
  return true;
 }
}
