import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const address='http://127.0.0.1:4187/';
async function ready(){
 try{const response=await fetch(address,{signal:AbortSignal.timeout(1000)});return response.ok&&(await response.text()).includes('云间 · 看一会儿天空');}catch{return false;}
}
if(!await ready()){
 const child=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url))],{
  detached:true,stdio:'ignore',windowsHide:true,env:{...process.env,PORT:'4187'},
 });
 child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.unref();
 for(let attempt=0;attempt<25&&!await ready();attempt++)await new Promise(resolve=>setTimeout(resolve,200));
}
if(!await ready()){console.error('云间未能启动，请检查 4187 端口是否被其他程序占用。');process.exitCode=1;}
else{
 console.log(`云间已就绪：${address}`);
 if(!process.argv.includes('--no-browser')){
  const child=spawn('cmd.exe',['/c','start','',address],{stdio:'ignore',windowsHide:true});
  child.on('error',()=>console.log('请在浏览器中打开上面的地址。'));
 }
}
