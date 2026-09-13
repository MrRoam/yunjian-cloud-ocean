// 每类天空改变云的空间结构；随机值只在该结构内变化。
const between=(a,b)=>a+Math.random()*(b-a);
const profiles=[
 // 频率、厚度、横向拉伸、密度；覆盖偏移、分布尺度、高云量。
 [[.22,2.55,1,4.8],[.015,.15,.14]], // 厚积云
 [[.65,.65,1,3.4],[-.095,.25,.035]], // 疏落小云
 [[.38,.72,2.8,3.0],[.015,.22,.12]], // 舒展云带
 [[.42,.55,1.8,.25],[-.23,.18,.85]], // 丝缕高云
 [[.40,.60,1.7,3.6],[.13,.13,.03]], // 层叠云幕
];
export function createScene(kind){
 const [shape,climate]=profiles[kind];
 return {kind,seed:between(.4,80.4),shape:shape.map((v,i)=>v*between(i===2?.88:.9,1.12)),climate:[climate[0]+between(-.012,.012),climate[1]*between(.9,1.1),climate[2]*between(.85,1.15),between(-Math.PI,Math.PI)]};
}
export class SceneSequence{
 constructor(){this.current=1;this.remaining=[3,2,0,4];}
 next(){
  if(!this.remaining.length){
   this.remaining=[0,1,2,3,4];
   for(let i=4;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.remaining[i],this.remaining[j]]=[this.remaining[j],this.remaining[i]];}
   if(this.remaining[0]===this.current)[this.remaining[0],this.remaining[1]]=[this.remaining[1],this.remaining[0]];
  }
  this.current=this.remaining.shift();return createScene(this.current);
 }
}
