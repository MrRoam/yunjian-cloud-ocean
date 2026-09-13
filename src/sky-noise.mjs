// 可平铺的三维多尺度噪声。生成一次，随后用于连续的体积云景。
const code=/* wgsl */`
@group(0) @binding(0) var outTex:texture_storage_3d<rgba8unorm,write>;
fn hash3(q:vec3i)->vec3f {
  var a=vec3u(q)*vec3u(1597334677u,3812015801u,2798796415u);
  a=(a^(a.yzx>>vec3u(13u)))*vec3u(2246822519u);
  let n=a.x^a.y^a.z;
  var h=vec3u(n,n^3266489917u,n^668265263u);
  h=(h^(h>>vec3u(16u)))*vec3u(2246822519u);
  h=h^(h>>vec3u(13u));
  return vec3f(h)/4294967295.0;
}
fn periodic(q:vec3i,n:i32)->vec3i{return (q%vec3i(n)+vec3i(n))%vec3i(n);}
fn value(p:vec3f,n:i32)->f32{
  let q=p*f32(n);let b=vec3i(floor(q));let t=fract(q);let f=t*t*t*(t*(t*6.0-15.0)+10.0);
  var result=0.0;
  for(var z=0;z<2;z++){for(var y=0;y<2;y++){for(var x=0;x<2;x++){
    let w=select(1.0-f, f,vec3i(x,y,z)==vec3i(1));
    result+=hash3(periodic(b+vec3i(x,y,z),n)).x*w.x*w.y*w.z;
  }}}
  return result;
}
fn worley(p:vec3f,n:i32)->f32{
  let q=p*f32(n);let b=vec3i(floor(q));let f=fract(q);var d=2.0;
  for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
    let offset=vec3i(x,y,z);let cell=periodic(b+offset,n);
    let r=vec3f(offset)+hash3(cell)-f;d=min(d,dot(r,r));
  }}}
  return clamp(1.0-sqrt(d),0.0,1.0);
}
@compute @workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) id:vec3u){
  let p=(vec3f(id)+0.5)/128.0;
  let v=value(p,4)*0.5+value(p,8)*0.25+value(p,16)*0.15+value(p,32)*0.1;
  let w4=worley(p,4);let w8=worley(p,8);let w16=worley(p,16);let w32=worley(p,32);
  let base=clamp((v*.65+w4*.35-.15)/.65,0.0,1.0);
  textureStore(outTex,vec3i(id),vec4f(base,w8,w16,w32));
}
`;
export async function createSkyNoise(device){
  const texture=device.createTexture({label:'云形 · 三维 Perlin–Worley 多尺度纹理',size:[128,128,128],dimension:'3d',format:'rgba8unorm',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING});
  const module=device.createShaderModule({code});
  const info=await module.getCompilationInfo();
  const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView()}]});
  const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(32,32,32);pass.end();device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();
  return texture;
}
