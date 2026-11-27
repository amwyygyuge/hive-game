import type { EnemyKind, PropView, Vec2 } from '../contracts';
import { RULES, WEAPONS } from './config';
import { angleDelta, boxHit, circleHit, distance } from './math';
import { Enemy, type Projectile } from './entities';
import type { Run } from './Run';
import { Damage } from './Damage';
const BOSS_KINDS:Record<string,true> = {worm:true,slug:true};
export class Combat {
  readonly damage:Damage;
  constructor(private readonly run:Run) { this.damage=new Damage(run); }
  shoot():void {
    const p=this.run.player,w=WEAPONS[p.weapon],muzzle={x:p.x+Math.sin(p.angle)*0.5,z:p.z+Math.cos(p.angle)*0.5};
    for(const index of Array.from({length:w.pellets},(_,i)=>i)) {
      const spread=(w.pellets>1?0.26:0.035)*(index-(w.pellets-1)/2)/Math.max(1,w.pellets-1);
      const angle=p.angle+spread;
      this.run.projectiles.push({id:this.run.nextId(),x:muzzle.x,z:muzzle.z,previous:{...muzzle},angle,radius:RULES.projectileRadius,isEnemy:false,isRocket:p.weapon==='rocket',life:RULES.shotLife,damage:w.damage*(1+0.1*p.stacks.damage)*(this.critical()?2:1)*(p.silenced?0.9:1),speed:p.weapon==='rocket'?RULES.rocketSpeed:RULES.bulletSpeed,weapon:p.weapon});
    }
  }
  private critical():boolean { return this.run.random.next()<0.06*this.run.player.stacks.critical; }
  enemyShot(args:{from:Vec2;angle:number;damage:number;speed?:number}):void {
    this.run.projectiles.push({id:this.run.nextId(),x:args.from.x,z:args.from.z,previous:{...args.from},angle:args.angle,radius:RULES.projectileRadius,isEnemy:true,isRocket:false,life:1.4,damage:args.damage,speed:args.speed??RULES.stingerSpeed,weapon:'pistol'});
  }
  step(dt:number):void {
    for(const bullet of this.run.projectiles) this.advance(bullet,dt);
    const alive=this.run.projectiles.filter(b=>b.life>0);
    this.run.projectiles.length=0;this.run.projectiles.push(...alive);
  }
  private advance(bullet:Projectile,dt:number):void {
    bullet.life-=dt;bullet.previous={x:bullet.x,z:bullet.z};
    const to={x:bullet.x+Math.sin(bullet.angle)*bullet.speed*dt,z:bullet.z+Math.cos(bullet.angle)*bullet.speed*dt};
    const hit=this.sweep(bullet,to);
    if(hit.t>=1) { bullet.x=to.x;bullet.z=to.z;return; }
    bullet.x=bullet.previous.x+(to.x-bullet.previous.x)*hit.t;bullet.z=bullet.previous.z+(to.z-bullet.previous.z)*hit.t;
    bullet.life=0;
    if(bullet.isRocket) { this.run.environment.explode({x:bullet.x,z:bullet.z,radius:RULES.rocketRadius,enemy:bullet.damage,player:bullet.damage/2});return; }
    if(hit.enemy) { this.damage.hit({enemy:hit.enemy,amount:bullet.damage,point:{x:bullet.x,z:bullet.z}});return; }
    if(hit.prop) { this.run.environment.hitProp(hit.prop,bullet.damage);return; }
    if(hit.player) this.damage.hurtPlayer({amount:bullet.damage,from:bullet.previous});
  }
  private sweep(bullet:Projectile,to:Vec2):{t:number;enemy?:Enemy;player?:boolean;prop?:PropView} {
    const ray=this.run.world.ray(bullet,to);
    const best={t:ray.t,enemy:undefined as Enemy|undefined,player:false,prop:this.run.props.find(prop=>prop.id===ray.id)};
    for(const prop of this.run.props) {
      if(prop.hp<=0||prop.kind==='door') continue;
      const t=circleHit({from:bullet,to,center:prop,radius:0.55});
      if(t<best.t) {best.t=t;best.prop=prop;}
    }
    if(!bullet.isEnemy) {
      for(const enemy of this.run.enemies) {
        if(enemy.isDead||!enemy.isVulnerable) continue;
        const t=circleHit({from:bullet,to,center:enemy,radius:enemy.radius});
        if(t<best.t) { best.t=t;best.enemy=enemy;best.prop=undefined; }
      }
    } else {
      const t=circleHit({from:bullet,to,center:this.run.player,radius:RULES.playerRadius});
      if(t<best.t) { best.t=t;best.player=true;best.prop=undefined; }
    }
    return best;
  }
  execute():void {
    const p=this.run.player;
    const target=this.run.enemies.find(e=>!e.isDead&&e.isVulnerable&&e.isExecutable&&distance(e,p)<=RULES.executionRange+e.radius&&this.run.world.visible(p,e));
    if(!target) return;
    this.damage.kill(target,{silent:true});
    p.hp=Math.min(p.maxHp,p.hp+RULES.executionHeal);p.invulnerable=Math.max(p.invulnerable,RULES.executionInvulnerability);
    const weapon=WEAPONS[p.weapon];p.ammo=Math.min(weapon.magazine,p.ammo+Math.ceil(weapon.magazine*RULES.magazineRecovery));
    this.run.emit({type:'execute',x:p.x,z:p.z,kind:target.kind});
  }
  blockedBy(from:Vec2,to:Vec2):number|null {
    for(const block of this.run.world.blockers) {
      if(block.active&&boxHit({from,to,...block})<1) return block.id;
    }
    return null;
  }
  frontFacing(enemy:Enemy,point:Vec2):number { return angleDelta(Math.atan2(point.x-enemy.x,point.z-enemy.z),enemy.angle); }
}
export const isBoss=(kind:EnemyKind):boolean => BOSS_KINDS[kind]===true;
