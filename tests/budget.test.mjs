import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderBudget} from '../src/sky-budget.mjs';

test('持续慢帧降低像素预算，手机仍保留至少 75% CSS 尺寸',()=>{
 const budget=new RenderBudget({coarse:true});
 const initial=budget.dimensions(390,844,3);
 for(let i=0;i<450;i++)budget.record(85,i*40);
 const small=budget.dimensions(390,844,3);
 assert.ok(small[0]*small[1]<initial[0]*initial[1]);
 assert.ok(small[0]>=Math.floor(390*.75));assert.ok(small[1]>=Math.floor(844*.75));
 const portrait=budget.dimensions(844,390,3);
 assert.ok(Math.abs(portrait[0]/portrait[1]-844/390)<.01);
});
test('设备纹理尺寸限制与离线固定画质不被自适应突破',()=>{
 const budget=new RenderBudget({adaptive:false,maxDimension:512});
 for(let i=0;i<100;i++)budget.record(80,i*100);
 assert.equal(budget.pixels,1050000);
 assert.ok(budget.dimensions(1920,1080,3).every(n=>n<=512));
 assert.ok(budget.dimensions(0,0,0).every(n=>n>=1));
});
test('短暂尖峰和无效测量不会立即调整尺寸，稳定余量才逐步恢复',()=>{
 const budget=new RenderBudget({coarse:true});
 for(const ms of [NaN,Infinity,0,700])budget.record(ms,10000);
 assert.equal(budget.samples,0);assert.equal(budget.pixels,1050000);
 for(let i=0;i<80;i++)budget.record(50,i*40);
 const low=budget.pixels;assert.ok(low<1050000);
 for(let i=80;i<500;i++)budget.record(5,i*40);
 assert.ok(budget.pixels>low);assert.ok(budget.pixels<=1050000);
});
