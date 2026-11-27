import type { BatteryView, Vec2 } from '../contracts';
import type { Run } from './Run';
import { RULES } from './config';
import { distance } from './math';

const GATE_BLOCKER_ID=-2;
const ARENA_BLOCKER_ID=-3;
const GUARDIANS:Vec2[]=[{x:-28,z:-17},{x:28,z:-17},{x:0,z:-19}];
const FREE_BATTERIES:Vec2[]=[{x:-29,z:10},{x:31,z:12}];
const GATE={width:6,depth:0.7,arenaZ:-28} as const;

export class Objectives {
  private waveTime=0;
  private waveCount=0;
  private hasSpawnedElite=false;
  constructor(private readonly run:Run) {}

  populate():void {
    for(const point of FREE_BATTERIES) this.addBattery({...point,guardianId:null,isAvailable:true});
    for(const point of GUARDIANS) {
      const guardian=this.run.creatures.spawn({...point,kind:'queen',elite:true,tier:this.run.world.region(point).tier});
      if(!guardian) throw new Error('无法生成电池守卫');
      this.addBattery({x:point.x+2,z:point.z,guardianId:guardian.id,isAvailable:false});
      for(const side of [-1,1]) this.run.creatures.spawn({x:point.x+side*2,z:point.z+2,kind:'cocoon',owner:guardian.id,tier:guardian.tier});
    }
    const worm=this.run.enemies.find(enemy=>enemy.kind==='worm');
    if(!worm) throw new Error('缺少沙虫目标');
    this.addBattery({x:worm.x,z:worm.z,guardianId:worm.id,isAvailable:false});
    this.run.world.blockers.push({id:GATE_BLOCKER_ID,...this.run.world.layout.gate,width:GATE.width,depth:GATE.depth,active:true});
    this.run.world.blockers.push({id:ARENA_BLOCKER_ID,x:0,z:GATE.arenaZ,width:GATE.width,depth:GATE.depth,active:true});
  }

  private addBattery(args:Vec2 & {guardianId:number|null;isAvailable:boolean}):void {
    const battery:BatteryView={...args,id:this.run.nextId(),isCollected:false,label:`供能电池 ${this.run.batteries.length+1}`};
    this.run.batteries.push(battery);
  }

  step(dt:number):void {
    this.unlockGuardians();
    if(this.run.snapshot.phase!=='playing') return;
    switch(this.run.snapshot.gatePhase) {
      case 'opening':this.advanceGate(dt);break;
      case 'open':this.checkExit();break;
      default:break;
    }
  }

  private unlockGuardians():void {
    const slug=this.run.enemies.find(enemy=>enemy.kind==='slug');
    const barrier=this.run.world.blockers.find(block=>block.id===ARENA_BLOCKER_ID);
    if(barrier) barrier.active=!slug?.isDead;
    for(const battery of this.run.batteries) {
      const guardian=this.run.enemies.find(enemy=>enemy.id===battery.guardianId);
      if(!guardian?.isDead||battery.isAvailable) continue;
      const isBoss=guardian.kind==='worm';
      battery.isAvailable=!isBoss||Boolean(slug?.isDead);
      if(isBoss) {const point=this.run.world.nearestFree(guardian);battery.x=point.x;battery.z=point.z;}
    }
  }

  interact():void {
    const p=this.run.player;
    if(this.run.creatures.revealMimic()) return;
    const battery=this.run.batteries.find(item=>!item.isCollected&&item.isAvailable&&distance(item,p)<=RULES.interactionRange);
    if(battery) {this.collect(battery);return;}
    if(distance(p,this.run.world.layout.shop)<=RULES.shopRange) {
      this.run.snapshot.isShopOpen=!this.run.snapshot.isShopOpen;this.run.shopDismissed=!this.run.snapshot.isShopOpen;return;
    }
    if(distance(p,this.run.world.layout.gate)<=RULES.shopRange) {this.install();return;}
    this.run.environment.interactDoor();
  }

  private collect(battery:BatteryView):void {
    battery.isCollected=true;this.run.snapshot.batteriesCollected++;
    this.run.emit({type:'battery',x:battery.x,z:battery.z,value:this.run.snapshot.batteriesCollected});
    this.run.message(`已回收 ${this.run.snapshot.batteriesCollected} / ${RULES.batteries} 电池。巢穴电网继续衰减。`);
  }

  private install():void {
    const snapshot=this.run.snapshot;
    if(snapshot.batteriesCollected<RULES.batteries) {this.run.message('需要六块供能电池才能打开大门。');return;}
    if(snapshot.gatePhase!=='locked') return;
    snapshot.gatePhase='opening';snapshot.gateRemaining=RULES.gateDuration;
    snapshot.isShopOpen=false;this.waveTime=0;this.waveCount=0;
    this.run.message('电池已安装！守住最后三十秒，再穿过南侧出口。');
    this.run.emit({type:'gate',...this.run.world.layout.gate,value:RULES.gateDuration});
  }

  private advanceGate(dt:number):void {
    const snapshot=this.run.snapshot;
    snapshot.gateRemaining=Math.max(0,snapshot.gateRemaining-dt);this.waveTime-=dt;
    if(this.waveTime<=0) {
      const isElite=!this.hasSpawnedElite&&snapshot.gateRemaining<=RULES.waveEliteAt;
      this.run.director.gateWave({isElite,sequence:this.waveCount++});
      this.hasSpawnedElite=this.hasSpawnedElite||isElite;this.waveTime=RULES.waveInterval;
    }
    if(snapshot.gateRemaining>0) return;
    snapshot.gatePhase='open';
    const blocker=this.run.world.blockers.find(item=>item.id===GATE_BLOCKER_ID);
    if(blocker) blocker.active=false;
    this.run.message('大门已开启！向南穿过气闸出口。');
    this.run.emit({type:'gate',...this.run.world.layout.gate,value:0});
  }

  private checkExit():void {
    if(!this.run.world.withinExit(this.run.player)) return;
    this.run.snapshot.phase='won';this.run.snapshot.isShopOpen=false;
    this.run.emit({type:'win',x:this.run.player.x,z:this.run.player.z,value:this.run.snapshot.elapsed});
  }
}
