import type { Decoration, RegionView, Vec2, WallView, WorldLayout } from '../contracts';
import { RULES } from './config';
import { boxHit, direction, distance, indices } from './math';

export interface Blocker { id:number; x:number; z:number; width:number; depth:number; active:boolean }
const ROOMS:RegionView[] = [
 {id:0,name:'南部补给站',subtitle:'没有安全的灯光',x:0,z:28,width:28,depth:12,tier:1},
 {id:1,name:'逃生气闸',subtitle:'六组电源 · 三十秒',x:0,z:36.5,width:6,depth:5,tier:1},
 {id:2,name:'南部通廊',subtitle:'甲壳声在门后',x:0,z:18,width:6,depth:8,tier:1},
 {id:3,name:'废弃泵站',subtitle:'积水会导电',x:0,z:6,width:20,depth:16,tier:1},
 {id:4,name:'西侧检修道',subtitle:'黏液来自哪里',x:-14,z:6,width:8,depth:6,tier:1},
 {id:5,name:'排水管网',subtitle:'第一组电池',x:-28,z:6,width:20,depth:20,tier:2},
 {id:6,name:'东侧货运道',subtitle:'不要相信绿色',x:14,z:6,width:8,depth:6,tier:1},
 {id:7,name:'失落货仓',subtitle:'伪装在电池之间',x:28,z:6,width:20,depth:20,tier:2},
 {id:8,name:'隔离通廊',subtitle:'关门也不能停留',x:0,z:-5,width:6,depth:6,tier:2},
 {id:9,name:'中央孵化腔',subtitle:'第三巢母',x:0,z:-16,width:20,depth:16,tier:2},
 {id:10,name:'西部脉络',subtitle:'巢穴仍在呼吸',x:-14,z:-15,width:8,depth:6,tier:2},
 {id:11,name:'西部巢母室',subtitle:'第一巢母',x:-28,z:-15,width:20,depth:18,tier:3},
 {id:12,name:'东部脉络',subtitle:'振翅从黑暗传来',x:14,z:-15,width:8,depth:6,tier:2},
 {id:13,name:'东部巢母室',subtitle:'第二巢母',x:28,z:-15,width:20,depth:18,tier:3},
 {id:14,name:'深井气密桥',subtitle:'地面在震动',x:0,z:-25,width:6,depth:6,tier:3},
 {id:15,name:'原生深井',subtitle:'沙虫与巨蛞蝓',x:0,z:-32.5,width:36,depth:13,tier:3},
];
const DECORATIONS:Decoration[] = [
 {model:'field-console-a92adc',x:6,z:28,angle:Math.PI,scale:1},
 {model:'site-generator-298792',x:10,z:31,angle:0,scale:1},
 {model:'concrete-full-pipe-section-00e1b6',x:-35,z:6,angle:Math.PI/2,scale:1},
 {model:'pipe-run-280a0d',x:-27,z:14,angle:Math.PI/2,scale:1},
 {model:'ant-nest-chamber-6b786b',x:-28,z:-17,angle:0,scale:0.8},
 {model:'ant-nest-chamber-6b786b',x:28,z:-17,angle:0,scale:0.8},
 {model:'ant-nest-chamber-6b786b',x:0,z:-17,angle:0,scale:0.8},
 {model:'orb-web-133aba',x:-32,z:-10,angle:0,scale:1},
 {model:'cobweb-drape-f65d43',x:33,z:-23,angle:0,scale:1},
 {model:'obsidian-fang-rock-67e326',x:-15,z:-36,angle:0,scale:0.7},
 {model:'red-scoria-rock-35bb9c',x:15,z:-36,angle:0,scale:0.8},
 {model:'command-center-e65850',x:-24,z:26,angle:0,scale:1},
 {model:'reactor-block-13fe72',x:24,z:26,angle:0,scale:1},
 {model:'observation-tower-69b692',x:33,z:31,angle:0,scale:0.7},
 {model:'concrete-pillbox-ea855a',x:-8,z:36,angle:0,scale:1},
];
const NEIGHBORS=[{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}] as const;
const CELL_COUNT=RULES.worldSize*RULES.worldSize;
export class World {
  readonly layout:WorldLayout;
  readonly blockers:Blocker[]=[];
  private readonly solid=new Uint8Array(CELL_COUNT).fill(1);
  private readonly costs=new Int16Array(CELL_COUNT);
  private readonly queue=new Int16Array(CELL_COUNT);
  private flowTarget=-1;
  constructor() {
    for(const room of ROOMS) this.carve(room);
    this.layout={width:80,depth:80,spawn:{x:0,z:28},shop:{x:6,z:28},gate:{x:0,z:34},exit:{x:0,z:38},walls:this.buildWalls(),regions:ROOMS,decorations:DECORATIONS};
  }
  private carve(room:RegionView):void {
    for(const row of indices(room.depth)) {
      for(const col of indices(room.width)) {
        const x=Math.floor(room.x-room.width/2+col),z=Math.floor(room.z-room.depth/2+row);
        this.solid[this.index({x,z})]=0;
      }
    }
  }
  private buildWalls():WallView[] {
    const walls:WallView[]=[];
    for(const z of indices(RULES.worldSize)) {
      const cursor={x:0};
      while(cursor.x<RULES.worldSize) {
        if(!this.solid[z*RULES.worldSize+cursor.x]) { cursor.x++; continue; }
        const start=cursor.x;
        while(cursor.x<RULES.worldSize&&this.solid[z*RULES.worldSize+cursor.x]) cursor.x++;
        const width=cursor.x-start;
        const prior=walls.find(w=>w.x===start+width/2-40&&w.width===width&&w.z+w.depth/2===z-40);
        if(prior) { prior.depth++; prior.z+=0.5; }
        else walls.push({x:start+width/2-40,z:z-39.5,width,depth:1,height:3});
      }
    }
    return walls;
  }
  private index(point:Vec2):number { return (Math.floor(point.z)+40)*80+Math.floor(point.x)+40; }
  private cellSolid(point:Vec2):boolean {
    return point.x < -40||point.x>=40||point.z < -40||point.z>=40||this.solid[this.index(point)]!==0;
  }
  collision(point:Vec2,radius:number):number|null {
    const bounds={minX:Math.floor(point.x-radius),maxX:Math.floor(point.x+radius),minZ:Math.floor(point.z-radius),maxZ:Math.floor(point.z+radius)};
    const cursor={x:bounds.minX,z:bounds.minZ};
    while(cursor.z<=bounds.maxZ) {
      cursor.x=bounds.minX;
      while(cursor.x<=bounds.maxX) {
        const x=Math.max(cursor.x,Math.min(cursor.x+1,point.x));
        const z=Math.max(cursor.z,Math.min(cursor.z+1,point.z));
        if(this.cellSolid(cursor)&&Math.hypot(x-point.x,z-point.z)<radius) return -1;
        cursor.x++;
      }
      cursor.z++;
    }
    for(const block of this.blockers) {
      const x=Math.max(block.x-block.width/2,Math.min(block.x+block.width/2,point.x));
      const z=Math.max(block.z-block.depth/2,Math.min(block.z+block.depth/2,point.z));
      if(block.active&&Math.hypot(x-point.x,z-point.z)<radius) return block.id;
    }
    return null;
  }
  move(args:{body:Vec2;delta:Vec2;radius:number}):number|null {
    const {body,delta,radius}=args;
    const steps=Math.max(1,Math.ceil(Math.hypot(delta.x,delta.z)/0.18));
    const cursor={index:0,blocked:null as number|null};
    while(cursor.index++<steps) {
      const x=body.x+delta.x/steps;
      const bx=this.collision({x,z:body.z},radius);
      if(bx===null) body.x=x; else cursor.blocked=bx;
      const z=body.z+delta.z/steps;
      const bz=this.collision({x:body.x,z},radius);
      if(bz===null) body.z=z; else cursor.blocked=bz;
    }
    return cursor.blocked;
  }
  ray(from:Vec2,to:Vec2):{t:number;id:number|null} {
    const result={t:Infinity,id:null as number|null};
    for(const wall of this.layout.walls) {
      const t=boxHit({from,to,...wall});
      if(t<result.t) { result.t=t; result.id=-1; }
    }
    for(const block of this.blockers) {
      const t=block.active?boxHit({from,to,...block}):Infinity;
      if(t<result.t) { result.t=t; result.id=block.id; }
    }
    return result;
  }
  visible(from:Vec2,to:Vec2):boolean { return this.ray(from,to).t>=1; }
  region(point:Vec2):RegionView {
    return ROOMS.find(r=>Math.abs(point.x-r.x)<r.width/2&&Math.abs(point.z-r.z)<r.depth/2)??ROOMS[0]!;
  }
  steer(from:Vec2,to:Vec2):Vec2 {
    if(this.visible(from,to)) return direction(from,to);
    const target=this.index(to);
    if(target!==this.flowTarget) this.buildFlow(to);
    const best={cost:this.costs[this.index(from)]??-1,point:from};
    for(const offset of NEIGHBORS) {
      const point={x:Math.floor(from.x)+0.5+offset.x,z:Math.floor(from.z)+0.5+offset.z};
      const cost=this.costs[this.index(point)]??-1;
      if(!this.cellSolid(point)&&cost>=0&&(best.cost<0||cost<best.cost)) { best.cost=cost; best.point=point; }
    }
    return direction(from,best.point);
  }
  private buildFlow(target:Vec2):void {
    this.costs.fill(-1); this.flowTarget=this.index(target);
    const cursor={head:0,tail:1}; this.queue[0]=this.flowTarget; this.costs[this.flowTarget]=0;
    while(cursor.head<cursor.tail) {
      const index=this.queue[cursor.head++]!;
      const point={x:index%80-40,z:Math.floor(index/80)-40};
      for(const offset of NEIGHBORS) {
        const next={x:point.x+offset.x,z:point.z+offset.z},cell=this.index(next);
        if(!this.cellSolid(next)&&this.costs[cell]===-1) { this.costs[cell]=this.costs[index]!+1; this.queue[cursor.tail++]=cell; }
      }
    }
  }
  nearestFree(point:Vec2,radius=0.5):Vec2 {
    if(this.collision(point,radius)===null) return {...point};
    const cursor={ring:1};
    while(cursor.ring<80) {
      for(const index of indices(24)) {
        const angle=index*Math.PI/12, candidate={x:point.x+Math.sin(angle)*cursor.ring,z:point.z+Math.cos(angle)*cursor.ring};
        if(this.collision(candidate,radius)===null) return candidate;
      }
      cursor.ring++;
    }
    return {...this.layout.spawn};
  }
  pathDistance(from:Vec2,to:Vec2):number {
    this.buildFlow(to);
    return this.costs[this.index(from)]??-1;
  }
  withinExit(point:Vec2):boolean { return distance(point,this.layout.exit)<1.6; }
}
