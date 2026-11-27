import type { InputFrame, WeaponId } from '../contracts';
import { RULES, SHOP_ITEMS, WEAPONS } from './config';
import { clamp, distance } from './math';
import type { Run } from './Run';
export class PlayerController {
  constructor(private readonly run:Run) {}
  step(dt:number,input:InputFrame):void {
    const p=this.run.player;
    p.angle=Math.atan2(input.aim.x-p.x,input.aim.z-p.z);
    p.invulnerable=Math.max(0,p.invulnerable-dt);p.dashRemaining=Math.max(0,p.dashRemaining-dt);
    p.slowRemaining=Math.max(0,p.slowRemaining-dt);p.fireCooldown=Math.max(0,p.fireCooldown-dt);
    p.hp=Math.min(p.maxHp,p.hp+dt*0.5*p.stacks.regeneration);
    this.reloadTick(dt);
    if(input.adrenaline&&p.adrenaline>=1) {
      p.adrenaline=0;p.slowRemaining=RULES.slowDuration;this.run.emit({type:'adrenaline',x:p.x,z:p.z});
    }
    const length=Math.max(1,Math.hypot(input.moveX,input.moveZ));
    const movement={x:input.moveX/length,z:input.moveZ/length};
    if(input.dash&&p.dashRemaining===0) this.dash(movement);
    const inSlime=this.run.hazards.some(h=>h.kind==='slime'&&distance(h,p)<h.radius);
    const speed=RULES.playerSpeed*(1+0.05*p.stacks.speed)*(inSlime?RULES.slimeScale:1);
    const isDash=p.dashTime>0;
    const delta=isDash?{x:p.dashDirection.x*RULES.dashDistance/RULES.dashDuration*dt,z:p.dashDirection.z*RULES.dashDistance/RULES.dashDuration*dt}:{x:movement.x*speed*dt,z:movement.z*speed*dt};
    this.run.world.move({body:p,delta,radius:RULES.playerRadius});p.dashTime=Math.max(0,p.dashTime-dt);
    p.isMoving=movement.x!==0||movement.z!==0;p.stepTimer-=dt;
    if(p.isMoving&&p.stepTimer<=0) { this.run.emit({type:'step',x:p.x,z:p.z,value:Math.pow(0.7,p.stacks.quiet)});p.stepTimer=RULES.footstepInterval; }
    const actions:readonly [boolean,()=>void][]=[
      [input.reload,()=>this.reload()],[input.isFiring,()=>this.fire()],
      [input.execute,()=>this.run.combat.execute()],[input.interact,()=>this.run.objectives.interact()],
    ];
    for(const [isActive,action] of actions) {if(isActive) action();}
    const nearShop=distance(p,this.run.world.layout.shop)<=RULES.shopRange;
    if(!nearShop) {this.run.shopDismissed=false;this.run.snapshot.isShopOpen=false;}
  }
  private dash(movement:{x:number;z:number}):void {
    const p=this.run.player, moving=Math.hypot(movement.x,movement.z)>0;
    p.dashDirection=moving?movement:{x:Math.sin(p.angle),z:Math.cos(p.angle)};
    p.dashTime=RULES.dashDuration;p.dashRemaining=RULES.dashCooldown*(1-0.15*p.stacks.dash);
    p.invulnerable=RULES.dashDuration;this.run.creatures.detachParasites();
    this.run.emit({type:'dash',x:p.x,z:p.z,angle:p.angle});
  }
  private reloadTick(dt:number):void {
    const p=this.run.player;
    if(p.reloadRemaining<=0) return;
    p.reloadRemaining=Math.max(0,p.reloadRemaining-dt);
    if(p.reloadRemaining===0) {
      const amount=Math.min(WEAPONS[p.weapon].magazine-p.ammo,p.reserve);
      p.ammo+=amount;p.reserve-=amount;
    }
  }
  private reload():void {
    const p=this.run.player,w=WEAPONS[p.weapon];
    if(p.reloadRemaining>0||p.ammo>=w.magazine||p.reserve<=0) return;
    p.reloadRemaining=w.reload/(1+0.15*p.stacks.reload);
    this.run.emit({type:'reload',x:p.x,z:p.z,weapon:p.weapon,value:p.reloadRemaining});
  }
  private fire():void {
    const p=this.run.player,w=WEAPONS[p.weapon];
    if(p.fireCooldown>0||p.reloadRemaining>0) return;
    if(p.ammo===0) {
      this.run.emit({type:'empty',x:p.x,z:p.z,weapon:p.weapon});p.fireCooldown=0.3;this.reload();return;
    }
    p.ammo--;p.fireCooldown=1/(w.rate*(1+0.08*p.stacks.fireRate));
    this.run.combat.shoot();this.run.gunHeat=clamp(this.run.gunHeat+RULES.gunHeatPerShot);
    this.run.lastGun.x=p.x;this.run.lastGun.z=p.z;
    const noise=w.noise*(p.silenced?0.2:1);
    this.run.creatures.hear(noise);
    this.run.emit({type:'shot',x:p.x,z:p.z,angle:p.angle,weapon:p.weapon,silenced:p.silenced,value:noise});
  }
  equip(id:WeaponId):void {
    const p=this.run.player;
    if(this.run.snapshot.phase!=='playing'||!p.ownedWeapons.includes(id)) return;
    p.weapon=id;p.reloadRemaining=0;
  }
  buy(id:WeaponId|'silencer'|'ammo'|'health'):void {
    const p=this.run.player;
    if(this.run.snapshot.phase!=='playing'||distance(p,this.run.world.layout.shop)>RULES.shopRange) return;
    if(id in WEAPONS) {
      const weapon=id as WeaponId,w=WEAPONS[weapon];
      if(p.ownedWeapons.includes(weapon)||p.coins<w.price) { this.run.message('金币不足，或已持有该武器。');return; }
      p.coins-=w.price;p.ownedWeapons.push(weapon);this.equip(weapon);
    } else {
      const item=SHOP_ITEMS[id as keyof typeof SHOP_ITEMS];
      if(p.coins<item.price||(id==='silencer'&&p.silenced)||(id==='ammo'&&p.reserve===Infinity)||(id==='health'&&p.hp===p.maxHp)) { this.run.message('无法购买：金币不足或无需补给。');return; }
      p.coins-=item.price;
      switch(id) { case 'silencer':p.silenced=true;break;case 'ammo':p.reserve=WEAPONS[p.weapon].reserve;break;case 'health':p.hp=Math.min(p.maxHp,p.hp+40);break; }
    }
    this.run.emit({type:'purchase',x:p.x,z:p.z,weapon:p.weapon});
  }
}
