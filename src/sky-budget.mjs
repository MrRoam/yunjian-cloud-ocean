// 按实际完成耗时调节像素数量，云形、光照和采样间距不变。
export class RenderBudget{
 constructor({adaptive=true,coarse=false,maxDimension=8192}={}){
  this.adaptive=adaptive;this.maxDimension=maxDimension;this.pixels=1050000;
  this.targetMs=coarse?28:15;this.average=0;this.samples=0;this.lastChange=0;
  this.idleFPS=coarse?30:60;
 }
 dimensions(width,height,dpr=1){
  const area=Math.max(1,width*height);
  const floor=Math.min(1050000,area*.75*.75);
  const budget=Math.max(floor,this.pixels);
  const scale=Math.min(dpr,1.4,Math.sqrt(budget/area),this.maxDimension/Math.max(width,height,1));
  return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];
 }
 record(ms,now){
  if(!this.adaptive||!Number.isFinite(ms)||ms<=0||ms>250)return;
  this.average=this.average?this.average*.9+ms*.1:ms;this.samples++;
  if(this.samples<24||now-this.lastChange<1600)return;
  if(this.average>this.targetMs*1.18){
   this.pixels=Math.max(90000,this.pixels*Math.max(.72,this.targetMs/this.average));this.lastChange=now;
  }else if(this.average<this.targetMs*.65&&now-this.lastChange>5000){
   this.pixels=Math.min(1050000,this.pixels*1.12);this.lastChange=now;
  }
 }
}
