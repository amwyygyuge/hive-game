import type { EnemyKind, EnemyView, PlayerView, UpgradeId, WeaponId, Vec2, ProjectileView } from '../contracts';
import { ENEMY_SPECS, RULES, UPGRADES, WEAPONS } from './config';
export class Player implements PlayerView {
  x=0; z=28; angle=Math.PI; hp=100; maxHp=100; level=1; xp=0; nextXp=10;
  coins=0; kills=0; weapon:WeaponId='pistol'; reloadRemaining=0; dashRemaining=0; invulnerable=0;
  combo=0; multiplier=1; adrenaline=0; slowRemaining=0; flashlightRange=12;
  nightVision=false; heartbeat=false; silenced=false; isMoving=false; isParasitized=false;
  ownedWeapons:WeaponId[]=['pistol']; fireCooldown=0; comboRemaining=0; dashTime=0;
  dashDirection:Vec2={x:0,z:0}; stepTimer=0; pendingLevels=0;
  readonly stacks=Object.fromEntries(Object.keys(UPGRADES).map(id=>[id,0])) as Record<UpgradeId,number>;
  readonly stocks=Object.fromEntries(Object.values(WEAPONS).map(w=>[w.id,{ammo:w.magazine,reserve:w.reserve}])) as Record<WeaponId,{ammo:number;reserve:number}>;
  get ammo():number { return this.stocks[this.weapon].ammo; }
  set ammo(value:number) { this.stocks[this.weapon].ammo=value; }
  get reserve():number { return this.stocks[this.weapon].reserve; }
  set reserve(value:number) { this.stocks[this.weapon].reserve=value; }
  applyUpgrade(id:UpgradeId):void {
    this.stacks[id]++;
    switch(id) {
      case 'health': this.maxHp+=20; this.hp=Math.min(this.maxHp,this.hp+20); break;
      case 'flashlight': this.flashlightRange=12*(1+0.2*this.stacks.flashlight); break;
      case 'nightVision': this.nightVision=true; break;
      case 'heartbeat': this.heartbeat=true; break;
    }
  }
}
export interface EnemyInit extends Vec2 { id:number;kind:EnemyKind;tier?:number;elite?:boolean;batteries?:number;owner?:number;pack?:number;patrol?:boolean }
export class Enemy implements EnemyView {
  readonly id:number; readonly kind:EnemyKind; x:number; z:number; angle=0;
  hp:number; maxHp:number; radius:number; state='idle'; stateTime=0;
  isElite:boolean; isDead=false; isVulnerable=true; isExecutable=false; isSevered=false;
  partHp:number; target:Vec2; home:Vec2; tier:number; owner:number; pack:number; patrol:boolean;
  aggro=false; cooldown=0; clock=0; aux=0; stun=0; slow=0; damage:number; speed:number;
  direction:Vec2={x:0,z:0}; lastSeen=0; knock:Vec2={x:0,z:0};
  constructor(init:EnemyInit) {
    const spec=ENEMY_SPECS[init.kind],boss=init.kind==='worm'||init.kind==='slug';
    this.id=init.id;this.kind=init.kind;this.x=init.x;this.z=init.z;this.tier=init.tier??1;
    this.isElite=init.elite??false; this.owner=init.owner??0; this.pack=init.pack??0;this.patrol=init.patrol??false;
    const scale=boss?1:([1,1,1.6,2.5][this.tier]??1)*(1+0.06*(init.batteries??0))*(this.isElite?6:1);
    this.maxHp=spec.hp*scale;this.hp=this.maxHp;this.radius=spec.radius*(this.isElite?1.2:1);
    this.partHp=this.maxHp*(init.kind==='centipede'?1/3:RULES.partFraction);
    this.damage=spec.damage*(boss?1:([1,1,1.3,1.6][this.tier]??1))*(this.isElite?1.5:1);
    this.speed=spec.speed;this.target={x:init.x,z:init.z};this.home={...this.target};
    switch(init.kind) {
      case 'worm':this.state='underground';this.isVulnerable=false;break;
      case 'eel':this.state='hidden';this.isVulnerable=false;break;
      case 'corpseSpider':this.state='feigning';break;
      case 'mantis':this.state='dormant';break;
      case 'mimic':this.state='revealed';this.aggro=true;break;
    }
  }
  enter(state:string):void { this.state=state;this.stateTime=0; }
}
export interface Projectile extends ProjectileView { damage:number;speed:number;weapon:WeaponId; }
