import type { Enemy } from './entities';
import type { Run } from './Run';
import type { Vec2 } from '../contracts';
import { ENEMY_SPECS, RULES } from './config';
import { angleDelta, angleTo, direction, distance } from './math';

const PART_ARC = 0.55;
const REWARD = { eliteGold: 10, eliteXp: 15, knockback: 0.25, vulnerableSlow: 0.5 } as const;
const SEVERABLE: Partial<Record<Enemy['kind'], boolean>> = { centipede:true, crab:true, spider:true, corpseSpider:true, beetle:true, wasp:true, mantis:true };

export class Damage {
  constructor(private readonly run: Run) {}

  hit(args: { enemy: Enemy; amount: number; point: Vec2; ignoresArmor?: boolean }): void {
    const { enemy, amount, point } = args;
    if (enemy.isDead || !enemy.isVulnerable) return;
    const relative = Math.abs(angleDelta(angleTo(enemy, point), enemy.angle));
    const isArmored = enemy.kind === 'crab' && !enemy.isSevered && relative < RULES.frontArc && !args.ignoresArmor;
    const damage = amount * (isArmored ? RULES.armorScale : 1);
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.aggro = true;
    this.run.emit({type:'hit',x:enemy.x,z:enemy.z,kind:enemy.kind,value:damage});
    this.knockBack(enemy,point);
    this.strikePart({ enemy, point, amount: damage });
    enemy.isExecutable = enemy.isSevered || enemy.hp / enemy.maxHp <= RULES.executionThreshold;
    if (enemy.hp <= 0) this.kill(enemy);
  }

  private knockBack(enemy:Enemy,point:Vec2):void {
    if(enemy.kind==='slug'||enemy.kind==='worm') return;
    const away=direction(point,enemy);
    this.run.world.move({body:enemy,delta:{x:away.x*REWARD.knockback,z:away.z*REWARD.knockback},radius:enemy.radius});
  }

  private strikePart(args: { enemy: Enemy; point: Vec2; amount: number }): void {
    const { enemy, point, amount } = args;
    if (!SEVERABLE[enemy.kind] || enemy.isSevered) return;
    const offset = Math.abs(angleDelta(angleTo(enemy, point), enemy.angle));
    const isPartHit = enemy.kind === 'beetle' ? offset < PART_ARC : offset > PART_ARC;
    if (!isPartHit) return;
    enemy.partHp = Math.max(0, enemy.partHp - amount);
    if (enemy.partHp > 0) return;
    enemy.isSevered = true;
    enemy.stun = REWARD.vulnerableSlow;
    enemy.enter('severed');
    this.run.emit({ type: 'sever', x: enemy.x, z: enemy.z, kind: enemy.kind });
    switch (enemy.kind) {
      case 'centipede': this.splitCentipede(enemy); break;
      case 'crab': enemy.speed *= REWARD.vulnerableSlow; break;
      case 'wasp': enemy.speed *= REWARD.vulnerableSlow; break;
      case 'spider':case 'corpseSpider':enemy.speed=0;break;
      case 'mantis': enemy.damage *= REWARD.vulnerableSlow; break;
      default: break;
    }
  }

  private splitCentipede(enemy: Enemy): void {
    if(enemy.hp<=0) return;
    const fragment = this.run.creatures.spawn({kind:'centipede', x:enemy.x + Math.cos(enemy.angle), z:enemy.z - Math.sin(enemy.angle), tier:enemy.tier});
    if (!fragment) return;
    fragment.hp = fragment.maxHp = Math.max(1, enemy.hp / 2);
    fragment.isSevered = true;
    fragment.radius *= REWARD.vulnerableSlow;
    fragment.aggro = true;
    enemy.hp = Math.max(1, enemy.hp / 2);
    enemy.radius *= REWARD.vulnerableSlow;
  }

  kill(enemy: Enemy, options: { silent?: boolean } = {}): void {
    if (enemy.isDead) return;
    enemy.hp = 0;
    enemy.isDead = true;
    enemy.isExecutable = false;
    enemy.enter('dead');
    this.run.progression.kill();
    const spec = ENEMY_SPECS[enemy.kind];
    this.run.progression.gainXp(enemy.isElite ? REWARD.eliteXp : spec.xp);
    const p = this.run.player;
    const gold = Math.round(this.run.random.integer(...spec.gold) * (enemy.isElite ? REWARD.eliteGold : 1) * p.multiplier * (1 + 0.1 * p.stacks.greed));
    this.run.progression.drop({ x:enemy.x, z:enemy.z, kind:'coin', value:gold });
    this.dropSupplies(enemy);
    this.run.emit({type:'kill',x:enemy.x,z:enemy.z,kind:enemy.kind,value:gold});
    if(enemy.kind==='parasite') this.run.player.isParasitized=this.run.enemies.some(other=>!other.isDead&&other.kind==='parasite'&&other.state==='latched');
    if (enemy.kind === 'aphid' && !options.silent) this.run.environment.acidExplosion(enemy);
  }

  private dropSupplies(enemy: Enemy): void {
    if (enemy.isElite) {
      this.run.progression.drop({x:enemy.x + 0.3,z:enemy.z,kind:'health',value:RULES.healthPack});
      this.run.progression.drop({x:enemy.x - 0.3,z:enemy.z,kind:'ammo',value:1});
      return;
    }
    if (this.run.random.next() < RULES.ammoChance) this.run.progression.drop({x:enemy.x,z:enemy.z,kind:'ammo',value:1});
  }

  hurtPlayer(args: { amount: number; from: Vec2; ignoresGrace?: boolean }): void {
    const p = this.run.player;
    if (this.run.snapshot.phase !== 'playing' || (!args.ignoresGrace && p.invulnerable > 0)) return;
    p.hp = Math.max(0, p.hp - args.amount);
    p.invulnerable = args.ignoresGrace ? p.invulnerable : RULES.hitGrace;
    if (!args.ignoresGrace) this.run.emit({type:'hurt',x:args.from.x,z:args.from.z,value:args.amount});
    if (p.hp > 0) return;
    this.run.snapshot.phase = 'lost';
    this.run.snapshot.isShopOpen = false;
    this.run.emit({type:'death',x:p.x,z:p.z});
  }

  contact(enemy: Enemy, reach = enemy.radius + RULES.playerRadius): void {
    if (distance(enemy, this.run.player) > reach || enemy.cooldown > 0 || !this.run.world.visible(enemy,this.run.player)) return;
    this.hurtPlayer({amount:enemy.damage,from:enemy});
    enemy.cooldown = 1;
  }
}
