import type { EnemyKind, Vec2 } from '../contracts';
import { Enemy, type EnemyInit } from './entities';
import type { Run } from './Run';
import { RULES } from './config';
import { angleDelta, angleTo, direction, distance } from './math';

const AI = { notice:10, meleeCooldown:1, leapWarning:0.2, leapDuration:0.45, leapSpeed:11, chargeWarning:0.8, chargeSpeed:9, chargeDuration:1.6, wallStun:2, nestInterval:6, hatchRange:2.5, wingRange:7, stingerInterval:2.4, wormWait:5, wormWarning:2, wormExposed:3, wormRange:20, eelRange:5, eelWarning:0.35, eelStrike:0.4, eelHide:2.5, corpseWait:2, mimicRange:1.8, auraRange:2.8 } as const;
type Behavior = (enemy:Enemy,dt:number)=>void;

export class Enemies {
  private readonly behaviors:Record<EnemyKind,Behavior>;
  constructor(private readonly run:Run) {
    const chase=this.chase.bind(this),spider=this.spider.bind(this);
    this.behaviors={bug:chase,aphid:this.aphid.bind(this),parasite:this.parasite.bind(this),centipede:this.centipede.bind(this),queen:this.queen.bind(this),cocoon:this.cocoon.bind(this),spider,corpseSpider:this.corpseSpider.bind(this),wasp:this.wasp.bind(this),bat:chase,mantis:this.mantis.bind(this),crab:this.crab.bind(this),beetle:this.beetle.bind(this),raptor:this.raptor.bind(this),moth:this.moth.bind(this),ghoul:this.ghoul.bind(this),jellyfish:this.jellyfish.bind(this),mimic:this.mimic.bind(this),eel:this.eel.bind(this),worm:this.worm.bind(this),slug:this.slug.bind(this)};
  }

  spawn(args:Omit<EnemyInit,'id'>):Enemy|null {
    const cap=this.run.snapshot.gatePhase==='opening'?RULES.gateEnemyCap:RULES.enemyCap;
    if (this.run.enemies.filter(e=>!e.isDead).length>=cap) return null;
    const position=this.run.world.nearestFree(args,0.8);
    const enemy=new Enemy({...args,...position,id:this.run.nextId(),batteries:this.run.snapshot.batteriesCollected});
    this.run.enemies.push(enemy);
    return enemy;
  }

  step(dt:number):void {
    const alive=this.run.enemies.filter(enemy=>!enemy.isDead);
    for(const enemy of alive) this.update(enemy,dt);
  }

  private update(enemy:Enemy,dt:number):void {
    enemy.stateTime+=dt;enemy.clock+=dt;enemy.cooldown=Math.max(0,enemy.cooldown-dt);
    if (enemy.stun>0&&enemy.kind!=='slug') {enemy.stun=Math.max(0,enemy.stun-dt);return;}
    this.perceive(enemy);
    this.behaviors[enemy.kind](enemy,dt);
  }

  private perceive(enemy:Enemy):void {
    const p=this.run.player;
    const special:Partial<Record<EnemyKind,boolean>>={ghoul:true,moth:true,mimic:true,corpseSpider:true,eel:true,worm:true,mantis:true};
    if (special[enemy.kind]||enemy.aggro) return;
    const stepNoise=p.isMoving?RULES.footstepNoise*Math.pow(0.7,p.stacks.quiet):0;
    const sight=distance(enemy,p)<RULES.baseVision&&this.run.world.visible(enemy,p);
    enemy.aggro=sight||distance(enemy,p)<stepNoise||(enemy.patrol&&this.run.snapshot.batteriesCollected>=3);
    if(enemy.aggro) this.cue(enemy);
  }

  hear(radius:number):void {
    for (const enemy of this.run.enemies) {
      if (enemy.isDead||distance(enemy,this.run.player)>radius) continue;
      enemy.aggro=true;enemy.target={...this.run.lastGun};enemy.lastSeen=5;
    }
  }

  detachParasites():void {
    for(const enemy of this.run.enemies) {
      if(enemy.kind==='parasite'&&enemy.state==='latched') {enemy.enter('chase');enemy.stun=1;enemy.x-=1;}
    }
    this.run.player.isParasitized=false;
  }

  private cue(enemy:Enemy):void {this.run.emit({type:'enemyCue',x:enemy.x,z:enemy.z,kind:enemy.kind});}

  private move(enemy:Enemy,args:{dt:number;target?:Vec2;scale?:number;vector?:Vec2}):number|null {
    const target=args.target??this.run.player;
    const move=args.vector??this.run.world.steer(enemy,target);
    const speed=enemy.speed*(args.scale??1)*(1+Math.min(0.1,this.run.snapshot.batteriesCollected*0.02))*(enemy.isExecutable?0.6:1);
    const blocked=this.run.world.move({body:enemy,delta:{x:move.x*speed*args.dt,z:move.z*speed*args.dt},radius:enemy.radius});
    enemy.angle=Math.atan2(move.x,move.z);
    this.scratchDoor(enemy,blocked);
    return blocked;
  }

  private scratchDoor(enemy:Enemy,id:number|null):void {
    if (id===null||id<0||enemy.cooldown>0) return;
    const door=this.run.props.find(prop=>prop.id===id&&prop.kind==='door');
    if (!door) return;
    this.run.environment.hitProp(door,enemy.damage);enemy.cooldown=AI.meleeCooldown;
  }

  private chase(enemy:Enemy,dt:number):void {
    if (!enemy.aggro) return;
    enemy.state='chase';this.move(enemy,{dt});this.run.combat.damage.contact(enemy);
  }

  private aphid(enemy:Enemy,dt:number):void {
    if(enemy.state==='swelling') {
      if(enemy.stateTime>=0.5) this.run.combat.damage.kill(enemy);
      return;
    }
    if(enemy.aggro&&distance(enemy,this.run.player)<1.8) {enemy.enter('swelling');this.cue(enemy);return;}
    this.chase(enemy,dt);
  }

  private parasite(enemy:Enemy,dt:number):void {
    if(enemy.state==='latched') {
      enemy.x=this.run.player.x;enemy.z=this.run.player.z;this.run.player.isParasitized=true;
      this.run.combat.damage.hurtPlayer({amount:2*dt,from:enemy,ignoresGrace:true});return;
    }
    if(enemy.aggro&&distance(enemy,this.run.player)<1) {enemy.enter('latched');return;}
    this.chase(enemy,dt);
  }

  private centipede(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    const forward=this.run.world.steer(enemy,this.run.player),wave=Math.sin(enemy.clock*4)*0.7;
    this.move(enemy,{dt,vector:{x:forward.x+forward.z*wave,z:forward.z-forward.x*wave}});
    this.run.combat.damage.contact(enemy);
  }

  private queen(enemy:Enemy,_dt:number):void {
    if(!enemy.aggro||enemy.cooldown>0) return;
    const count=this.run.enemies.filter(child=>child.owner===enemy.id&&!child.isDead).length;
    enemy.cooldown=AI.nestInterval;
    if(count>=RULES.nestCap) return;
    const offset=this.run.random.between(-Math.PI,Math.PI);
    this.spawn({kind:'cocoon',x:enemy.x+Math.sin(offset)*2,z:enemy.z+Math.cos(offset)*2,owner:enemy.id,tier:enemy.tier});
    this.cue(enemy);
  }

  private cocoon(enemy:Enemy,_dt:number):void {
    if(!enemy.aggro&&distance(enemy,this.run.player)>AI.hatchRange) return;
    if(enemy.state!=='hatching') {enemy.enter('hatching');this.cue(enemy);return;}
    if(enemy.stateTime<1) return;
    const child=this.spawn({kind:'bug',x:enemy.x,z:enemy.z,owner:enemy.owner,tier:enemy.tier});
    if(!child) return;
    child.aggro=true;enemy.isDead=true;enemy.hp=0;enemy.enter('hatched');
  }

  private spider(enemy:Enemy,dt:number):void {
    if (!enemy.aggro) return;
    switch(enemy.state) {
      case 'leapWarning':
        if(enemy.stateTime>=AI.leapWarning) {enemy.direction=direction(enemy,this.run.player);enemy.enter('leaping');}
        return;
      case 'leaping':
        this.move(enemy,{dt,vector:enemy.direction,scale:AI.leapSpeed/enemy.speed});this.run.combat.damage.contact(enemy);
        if(enemy.stateTime>=AI.leapDuration) {enemy.enter('chase');enemy.aux=3;}
        return;
      default:
        enemy.aux=Math.max(0,enemy.aux-dt);
        if(!enemy.isSevered&&enemy.aux===0&&distance(enemy,this.run.player)<6) {enemy.enter('leapWarning');this.cue(enemy);return;}
        this.chase(enemy,dt);
    }
  }

  private corpseSpider(enemy:Enemy,dt:number):void {
    if(enemy.state!=='feigning') {this.spider(enemy,dt);return;}
    const p=this.run.player,behind=Math.abs(angleDelta(p.angle,angleTo(p,enemy)))>Math.PI/2;
    enemy.aux=behind&&distance(p,enemy)<10?enemy.aux+dt:0;
    if(enemy.aux<AI.corpseWait&&!enemy.aggro) return;
    enemy.aggro=true;enemy.enter('chase');this.cue(enemy);
  }

  private wasp(enemy:Enemy,dt:number):void {
    if(enemy.isSevered) {this.chase(enemy,dt);return;}
    if(!enemy.aggro) return;
    const range=distance(enemy,this.run.player);
    if(range>AI.wingRange) this.move(enemy,{dt});
    if(enemy.cooldown>0||!this.run.world.visible(enemy,this.run.player)) return;
    this.run.combat.enemyShot({from:enemy,angle:angleTo(enemy,this.run.player),damage:enemy.damage});
    enemy.cooldown=AI.stingerInterval;this.cue(enemy);
  }

  private mantis(enemy:Enemy,dt:number):void {
    if(enemy.state==='dormant'&&distance(enemy,this.run.player)>3&&!enemy.aggro) return;
    enemy.aggro=true;enemy.state='chase';this.move(enemy,{dt});
    this.run.combat.damage.contact(enemy,enemy.isSevered?1:2);
  }

  private crab(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    const aim=angleTo(enemy,this.run.player)-Math.PI/2;
    const heading=enemy.angle+Math.max(-dt,Math.min(dt,angleDelta(aim,enemy.angle)));
    const lateral={x:Math.cos(heading),z:-Math.sin(heading)};
    const toward=direction(enemy,this.run.player),side=toward.x*lateral.x+toward.z*lateral.z>=0?1:-1;
    this.move(enemy,{dt,vector:{x:lateral.x*side,z:lateral.z*side}});
    enemy.angle=heading;this.run.combat.damage.contact(enemy);
  }

  private beetle(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    if(enemy.isSevered) {this.chase(enemy,dt);return;}
    switch(enemy.state) {
      case 'chargeWarning':
        if(enemy.stateTime>=AI.chargeWarning) {enemy.direction=direction(enemy,enemy.target);enemy.enter('charging');}
        return;
      case 'charging': {
        const blocked=this.move(enemy,{dt,vector:enemy.direction,scale:AI.chargeSpeed/enemy.speed});
        this.run.combat.damage.contact(enemy);
        if(blocked!==null||enemy.stateTime>AI.chargeDuration) {enemy.enter('stunned');enemy.stun=AI.wallStun;enemy.aux=3;}
        return;
      }
      default:
        enemy.aux=Math.max(0,enemy.aux-dt);
        if(enemy.aux===0&&distance(enemy,this.run.player)<10) {enemy.target={x:this.run.player.x,z:this.run.player.z};enemy.enter('chargeWarning');this.cue(enemy);return;}
        this.chase(enemy,dt);
    }
  }

  private raptor(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    const phase=enemy.id*Math.PI/2+enemy.clock*0.4;
    const radius=distance(enemy,this.run.player)>3?3:0;
    this.move(enemy,{dt,target:{x:this.run.player.x+Math.sin(phase)*radius,z:this.run.player.z+Math.cos(phase)*radius}});
    this.run.combat.damage.contact(enemy);
  }

  private moth(enemy:Enemy,dt:number):void {
    if(distance(enemy,this.run.player)>14&&!enemy.aggro) return;
    if(this.run.player.reloadRemaining>0) {enemy.aggro=true;enemy.state='diving';this.move(enemy,{dt,scale:2.7});this.run.combat.damage.contact(enemy);return;}
    enemy.state='circling';
    const phase=enemy.clock*0.5;
    this.move(enemy,{dt,target:{x:this.run.player.x+Math.sin(phase)*5,z:this.run.player.z+Math.cos(phase)*5}});
  }

  private ghoul(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    enemy.lastSeen=Math.max(0,enemy.lastSeen-dt);
    this.move(enemy,{dt,target:enemy.target,scale:1+this.run.gunHeat});
    this.run.combat.damage.contact(enemy);
    if(enemy.lastSeen===0&&distance(enemy,enemy.target)<1) enemy.aggro=false;
  }

  private jellyfish(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    this.move(enemy,{dt});
    if(distance(enemy,this.run.player)>AI.auraRange||enemy.cooldown>0) return;
    this.cue(enemy);this.run.combat.damage.contact(enemy,AI.auraRange);
  }

  private mimic(enemy:Enemy,dt:number):void {
    if(enemy.state==='disguised'&&!enemy.aggro) return;
    this.chase(enemy,dt);
  }

  revealMimic():boolean {
    const mimic=this.run.enemies.find(enemy=>enemy.kind==='mimic'&&!enemy.isDead&&enemy.state==='disguised'&&distance(enemy,this.run.player)<AI.mimicRange);
    if(!mimic) return false;
    mimic.aggro=true;mimic.enter('revealed');this.cue(mimic);this.run.message('这是寄居蟹！真正的供能电池仍有六块。');return true;
  }

  private eel(enemy:Enemy,dt:number):void {
    switch(enemy.state) {
      case 'hidden':
        enemy.isVulnerable=false;
        if(enemy.stateTime>AI.eelHide&&distance(enemy,this.run.player)<AI.eelRange) {enemy.target={x:this.run.player.x,z:this.run.player.z};enemy.enter('eelWarning');this.cue(enemy);}
        return;
      case 'eelWarning':
        if(enemy.stateTime>AI.eelWarning) {enemy.direction=direction(enemy,enemy.target);enemy.enter('striking');enemy.isVulnerable=true;}
        return;
      case 'striking':
        this.move(enemy,{dt,vector:enemy.direction});this.run.combat.damage.contact(enemy);
        if(enemy.stateTime>AI.eelStrike) {enemy.enter('retracting');enemy.isVulnerable=false;}
        return;
      default:
        this.move(enemy,{dt,target:enemy.home});
        if(distance(enemy,enemy.home)<0.6) enemy.enter('hidden');
    }
  }

  private worm(enemy:Enemy,_dt:number):void {
    const p=this.run.player;
    if(distance(enemy,p)>AI.wormRange&&this.run.snapshot.batteriesCollected<5) return;
    switch(enemy.state) {
      case 'underground':
        enemy.isVulnerable=false;
        if(enemy.stateTime>=AI.wormWait) {
          enemy.target=this.run.world.nearestFree(p,enemy.radius);enemy.enter('warning');this.cue(enemy);
          this.run.environment.addHazard({...enemy.target,kind:'warning',radius:3,remaining:AI.wormWarning});
        }
        return;
      case 'warning':
        if(enemy.stateTime>=AI.wormWarning) {
          enemy.x=enemy.target.x;enemy.z=enemy.target.z;enemy.enter('exposed');enemy.isVulnerable=true;
          this.run.combat.damage.contact(enemy,3);this.cue(enemy);
        }
        return;
      default:
        this.run.combat.damage.contact(enemy);
        if(enemy.stateTime>=AI.wormExposed) {enemy.enter('underground');enemy.isVulnerable=false;}
    }
  }

  private slug(enemy:Enemy,dt:number):void {
    if(!enemy.aggro) return;
    this.move(enemy,{dt});this.run.combat.damage.contact(enemy);
    enemy.aux-=dt;
    if(enemy.aux>0) return;
    enemy.aux=1.5;this.run.environment.addHazard({x:enemy.x,z:enemy.z,kind:'slime',radius:2,remaining:RULES.slimeDuration});
    this.cue(enemy);
  }
}
