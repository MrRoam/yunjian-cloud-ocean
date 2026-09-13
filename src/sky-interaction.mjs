// 与着色器使用相同的相机基向量，点击位置随视角和画幅正确落入天空。
export function skyRay(x,y,width,height,yaw,pitch,fov){
 const sx=(x/width-.5)*width/height*fov,sy=(.5-y/height)*fov;
 const cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sn=Math.sin(yaw);
 const ray=[sn*cp+sx*cy-sy*sn*sp,sp+sy*cp,cy*cp-sx*sn-sy*cy*sp];
 const length=Math.hypot(...ray);return ray.map(v=>v/length);
}
export class Gusts{
 constructor(){this.items=[];}
 add(ray){if(this.items.length===4)this.items.shift();this.items.push({ray,age:0});}
 advance(dt){for(const item of this.items)item.age+=dt;this.items=this.items.filter(item=>item.age<9);}
 get active(){return this.items.length>0;}
 pack(){const result=new Float32Array(16);for(let i=0;i<4;i++){const item=this.items[i];result.set(item?[...item.ray,item.age]:[0,1,0,-1],i*4);}return result;}
}
