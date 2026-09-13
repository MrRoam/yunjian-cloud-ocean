import assert from 'node:assert/strict';
import {skyRay,Gusts} from '../src/sky-interaction.mjs';
for(const [w,h] of [[1280,720],[390,844]])for(const yaw of [0,1,-2])for(const pitch of [.3,.8,1.3]){
 const center=skyRay(w/2,h/2,w,h,yaw,pitch,1.3);
 const expected=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
 expected.forEach((v,i)=>assert.ok(Math.abs(v-center[i])<1e-12));
 for(const [x,y] of [[0,0],[w,h],[w*.7,h*.3]]){
  const ray=skyRay(x,y,w,h,yaw,pitch,1.3);assert.ok(Math.abs(Math.hypot(...ray)-1)<1e-12);
  const front=expected,right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
  const dot=a=>a.reduce((sum,v,i)=>sum+v*ray[i],0);
  assert.ok(Math.abs((.5+dot(right)/dot(front)/1.3*h/w)*w-x)<1e-9);
  assert.ok(Math.abs((.5-dot(up)/dot(front)/1.3)*h-y)<1e-9);
 }
}
const gusts=new Gusts();assert.equal(gusts.active,false);for(let i=0;i<12;i++)gusts.add([0,1,0]);assert.equal(gusts.items.length,4);assert.equal(gusts.pack().length,16);gusts.advance(1);assert.equal(gusts.active,true);gusts.advance(8);assert.equal(gusts.active,false);assert.equal(gusts.pack()[3],-1);
console.log('通过：横竖屏、不同视角下点击射线投影一致；连续点击数量有上限，气流到期完整清除。');

