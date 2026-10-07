// 先启动 node server.mjs；需要 Playwright，CHROME_PATH 可指定浏览器。
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage();
 await page.route('**/export-noise.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html>'}));
 await page.goto('http://127.0.0.1:4187/export-noise.html');
 const base64=await page.evaluate(async()=>{
  const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice();
  const {createSkyNoise}=await import('/src/sky-noise.mjs');
  const texture=await createSkyNoise(device,{precomputed:false});
  const buffer=device.createBuffer({size:8388608,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=device.createCommandEncoder();
  encoder.copyTextureToBuffer({texture},{buffer,bytesPerRow:512,rowsPerImage:128},[128,128,128]);
  device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
  let text='';const bytes=new Uint8Array(buffer.getMappedRange());
  for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
 });
 const raw=Buffer.from(base64,'base64'),packed=new Uint8Array(raw.length),voxels=raw.length/4;
 for(let channel=0;channel<4;channel++){
  let previous=0;
  for(let i=0;i<voxels;i++){const value=raw[i*4+channel];packed[channel*voxels+i]=(value-previous)&255;previous=value;}
 }
 const assets=new URL('../assets/',import.meta.url);await mkdir(assets,{recursive:true});
 await writeFile(new URL('sky-noise-v1.bin.gz',assets),gzipSync(packed,{level:9}));
}finally{await browser.close();}
