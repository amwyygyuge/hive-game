import type { HazardView, PropView, Vec2 } from '../contracts';
import type { Run } from './Run';
import type { Enemy } from './entities';
import { RULES } from './config';
import { distance, retain } from './math';

const PROP = { barrelHp: 24, crateHp: 18, electricHp: 40, doorHp: 220, doorWidth: 5.6, doorDepth: 0.6, useRange: 2.4, gold: 100 } as const;
const HAZARD = { poolRadius: 2.2, flameRadius: 3, fireScale: 0.5, waterDuration: Infinity, hitInterval: 0.5 } as const;
const BARRELS: Vec2[] = [{x:-5,z:8},{x:5,z:2},{x:-23,z:4},{x:25,z:10},{x:-23,z:-12},{x:23,z:-19},{x:8,z:-31}];
const CRATES: Vec2[] = [{x:-8,z:28},{x:-30,z:11},{x:31,z:11},{x:-33,z:-18},{x:33,z:-18},{x:9,z:-20}];

export class Environment {
  private damageTimer = 0;
  private readonly recharges = new Map<number, number>();
  constructor(private readonly run: Run) {}

  populate(): void {
    for (const point of BARRELS) this.addProp({ ...point,kind:'barrel',hp:PROP.barrelHp });
    for (const point of CRATES) this.addProp({ ...point,kind:'crate',hp:PROP.crateHp });
    this.addProp({x:-3,z:5,kind:'electric',hp:PROP.electricHp});
    this.addProp({x:28,z:2,kind:'electric',hp:PROP.electricHp});
    this.addProp({x:0,z:17,kind:'door',hp:PROP.doorHp});
    this.addProp({x:0,z:-5,kind:'door',hp:PROP.doorHp});
    this.addHazard({x:0,z:6,kind:'water',radius:5,remaining:HAZARD.waterDuration});
    this.addHazard({x:28,z:4,kind:'water',radius:4,remaining:HAZARD.waterDuration});
    this.addHazard({x:-29,z:9,kind:'slime',radius:3,remaining:HAZARD.waterDuration});
  }

  private addProp(args: {x:number;z:number;kind:PropView['kind'];hp:number}): void {
    const prop: PropView = {...args,id:this.run.nextId(),maxHp:args.hp,isActive:false,angle:0};
    this.run.props.push(prop);
    if (args.kind === 'door') this.run.world.blockers.push({id:prop.id,x:prop.x,z:prop.z,width:PROP.doorWidth,depth:PROP.doorDepth,active:false});
  }

  addHazard(args: Omit<HazardView,'id'>): HazardView {
    const hazard = {...args,id:this.run.nextId()};
    this.run.hazards.push(hazard);
    return hazard;
  }

  step(dt:number): void {
    for (const [id,time] of this.recharges) this.recharges.set(id,Math.max(0,time-dt));
    for (const hazard of this.run.hazards) hazard.remaining-=dt;
    retain(this.run.hazards,hazard=>hazard.remaining>0);
    this.damageTimer-=dt;
    if (this.damageTimer>0) return;
    this.damageTimer=HAZARD.hitInterval;
    for (const hazard of this.run.hazards) this.damagePool(hazard);
  }

  private damagePool(hazard:HazardView): void {
    if (hazard.kind!=='acid'&&hazard.kind!=='fire') return;
    const damage=(hazard.kind==='acid'?RULES.acidDamage:RULES.fireDamage)*HAZARD.hitInterval;
    if (distance(hazard,this.run.player)<hazard.radius) this.run.combat.damage.hurtPlayer({amount:damage,from:hazard});
    if (hazard.kind!=='fire') return;
    for (const enemy of this.run.enemies) {
      if (!enemy.isDead&&distance(hazard,enemy)<hazard.radius) this.run.combat.damage.hit({enemy,amount:damage,point:hazard,ignoresArmor:true});
    }
  }

  hitProp(prop:PropView,damage:number): void {
    if (prop.hp<=0) return;
    prop.hp=Math.max(0,prop.hp-damage);
    if (prop.kind==='electric') { this.electrify(prop);return; }
    if (prop.hp>0) return;
    switch(prop.kind) {
      case 'barrel': this.explode({...prop,radius:RULES.barrelRadius,enemy:RULES.barrelDamage,player:RULES.barrelDamage/2}); break;
      case 'crate': this.run.progression.drop({...prop,kind:'coin',value:PROP.gold}); break;
      case 'door': this.setDoor(prop,false);break;
      default:break;
    }
  }

  explode(args:Vec2 & {radius:number;enemy:number;player:number}):void {
    this.run.emit({type:'explosion',x:args.x,z:args.z,value:args.radius});
    const targets=this.run.enemies.filter(enemy=>!enemy.isDead&&distance(enemy,args)<=args.radius+enemy.radius);
    for (const enemy of targets) {
      if (this.run.world.visible(args,enemy)) this.run.combat.damage.hit({enemy,amount:args.enemy,point:args,ignoresArmor:true});
    }
    if (distance(this.run.player,args)<=args.radius&&this.run.world.visible(args,this.run.player)) this.run.combat.damage.hurtPlayer({amount:args.player,from:args});
    for (const prop of this.run.props) {
      if (prop.hp>0&&distance(prop,args)<args.radius) this.hitProp(prop,args.enemy);
    }
    this.ignite(args,args.radius);
  }

  acidExplosion(enemy:Enemy):void {
    this.run.emit({type:'explosion',x:enemy.x,z:enemy.z,kind:'aphid',value:1.8});
    if (distance(enemy,this.run.player)<1.8) this.run.combat.damage.hurtPlayer({amount:enemy.damage,from:enemy});
    this.addHazard({x:enemy.x,z:enemy.z,kind:'acid',radius:HAZARD.poolRadius,remaining:RULES.acidDuration});
  }

  private ignite(point:Vec2,radius:number):void {
    for (const hazard of this.run.hazards) {
      if (hazard.kind==='acid'&&distance(hazard,point)<radius+hazard.radius) { hazard.kind='fire';hazard.remaining=RULES.fireDuration; }
    }
  }

  private electrify(prop:PropView):void {
    if ((this.recharges.get(prop.id)??0)>0) return;
    this.recharges.set(prop.id,RULES.electricRecharge);
    prop.hp=Math.max(1,prop.hp);prop.isActive=true;
    const frontier:Vec2[]=[prop];
    const struck=new Set<number>();
    for (const point of frontier) {
      const range=point===prop?RULES.electricRange:RULES.electricChain;
      const targets=this.run.enemies.filter(enemy=>!enemy.isDead&&!struck.has(enemy.id)&&distance(point,enemy)<range&&this.isWet(enemy));
      for (const enemy of targets) {
        struck.add(enemy.id);frontier.push(enemy);enemy.stun=RULES.electricStun;
        this.run.combat.damage.hit({enemy,amount:RULES.electricDamage,point:prop,ignoresArmor:true});
        this.run.emit({type:'hit',x:enemy.x,z:enemy.z,kind:'jellyfish',value:RULES.electricDamage});
      }
    }
    this.ignite(prop,RULES.electricRange);
    this.run.emit({type:'enemyCue',x:prop.x,z:prop.z,kind:'jellyfish'});
  }

  private isWet(point:Vec2):boolean {
    return this.run.hazards.some(h=>(h.kind==='water'||h.kind==='slime')&&distance(h,point)<h.radius);
  }

  interactDoor():boolean {
    const door=this.run.props.find(prop=>prop.kind==='door'&&prop.hp>0&&distance(prop,this.run.player)<PROP.useRange);
    if (!door) return false;
    const isOccupied=this.run.enemies.some(enemy=>!enemy.isDead&&Math.abs(enemy.z-door.z)<enemy.radius+PROP.doorDepth&&Math.abs(enemy.x-door.x)<PROP.doorWidth/2);
    if (!door.isActive&&isOccupied) {this.run.message('门框内有虫群，无法关闭。');return true;}
    this.setDoor(door,!door.isActive);
    this.run.message(door.isActive?'防火门已关闭。虫群会持续破门。':'防火门已打开。');
    return true;
  }

  private setDoor(door:PropView,isClosed:boolean):void {
    door.isActive=isClosed;
    const blocker=this.run.world.blockers.find(block=>block.id===door.id);
    if (blocker) blocker.active=isClosed;
  }
}
