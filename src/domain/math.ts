import type { Vec2 } from '../contracts';
export const TAU = Math.PI*2;
export const clamp = (value:number,max=1):number => Math.max(0,Math.min(max,value));
export const distance = (a:Vec2,b:Vec2):number => Math.hypot(a.x-b.x,a.z-b.z);
export const angleTo = (a:Vec2,b:Vec2):number => Math.atan2(b.x-a.x,b.z-a.z);
export const angleDelta = (a:number,b:number):number => Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const indices = (count:number):number[] => Array.from({length:count},(_,index)=>index);
export function retain<T>(items:T[],keep:(item:T)=>boolean):void {
  const cursor={write:0};
  for(const item of items) { if(keep(item)) items[cursor.write++]=item; }
  items.length=cursor.write;
}
export function direction(a:Vec2,b:Vec2):Vec2 {
  const length=distance(a,b);
  return length>0 ? {x:(b.x-a.x)/length,z:(b.z-a.z)/length} : {x:0,z:0};
}
export function circleHit(args:{from:Vec2;to:Vec2;center:Vec2;radius:number}):number {
  const {from,to,center,radius}=args;
  const dx=to.x-from.x, dz=to.z-from.z;
  const ox=from.x-center.x, oz=from.z-center.z;
  const aa=dx*dx+dz*dz, bb=2*(ox*dx+oz*dz), cc=ox*ox+oz*oz-radius*radius;
  if(cc<=0) return 0;
  const discriminant=bb*bb-4*aa*cc;
  if(discriminant<0||aa===0) return Infinity;
  const t=(-bb-Math.sqrt(discriminant))/(2*aa);
  return t>=0&&t<=1?t:Infinity;
}
export function boxHit(args:{from:Vec2;to:Vec2;x:number;z:number;width:number;depth:number}):number {
  const {from,to,x,z,width,depth}=args;
  const state={near:0,far:1};
  for(const axis of ['x','z'] as const) {
    const center=axis==='x'?x:z, half=(axis==='x'?width:depth)/2;
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-9) {
      if(from[axis]<center-half||from[axis]>center+half) return Infinity;
    } else {
      const a=(center-half-from[axis])/delta,b=(center+half-from[axis])/delta;
      state.near=Math.max(state.near,Math.min(a,b)); state.far=Math.min(state.far,Math.max(a,b));
      if(state.near>state.far) return Infinity;
    }
  }
  return state.near;
}
export class Random {
  private state:number;
  constructor(seed:number) { this.state=seed>>>0; }
  next():number {
    this.state=(this.state+0x6D2B79F5)|0;
    const bits={value:Math.imul(this.state^(this.state>>>15),1|this.state)};
    bits.value^=bits.value+Math.imul(bits.value^(bits.value>>>7),61|bits.value);
    return ((bits.value^(bits.value>>>14))>>>0)/4294967296;
  }
  between(min:number,max:number):number { return min+(max-min)*this.next(); }
  pick<T>(values:readonly T[]):T { return values[Math.floor(this.next()*values.length)]!; }
  integer(min:number,max:number):number { return Math.floor(this.between(min,max+1)); }
}
