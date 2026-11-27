import type { EnemyKind, Vec2 } from '../contracts';
import type { Run } from './Run';
import { RULES } from './config';
import { distance } from './math';

const ENCOUNTERS: {kind:EnemyKind;x:number;z:number;tier:number}[] = [
  {kind:'bug',x:0,z:20,tier:1},{kind:'bug',x:-4,z:11,tier:1},{kind:'bug',x:6,z:9,tier:1},
  {kind:'aphid',x:-6,z:3,tier:1},{kind:'parasite',x:7,z:0,tier:1},{kind:'centipede',x:-25,z:5,tier:2},
  {kind:'spider',x:-29,z:1,tier:2},{kind:'corpseSpider',x:24,z:7,tier:2},{kind:'wasp',x:32,z:2,tier:2},
  {kind:'mantis',x:29,z:12,tier:2},{kind:'crab',x:-32,z:11,tier:2},{kind:'beetle',x:0,z:-10,tier:2},
  {kind:'moth',x:-23,z:-17,tier:3},{kind:'ghoul',x:21,z:-17,tier:3},{kind:'jellyfish',x:30,z:-11,tier:3},
  {kind:'eel',x:-34,z:6,tier:2},{kind:'mimic',x:25,z:10,tier:2},
  {kind:'slug',x:0,z:-25,tier:3},{kind:'worm',x:7,z:-33,tier:3},
];
const POOLS:Record<number,readonly EnemyKind[]> = {
  1:['bug','bug','aphid','spider','parasite'],
  2:['bug','aphid','spider','wasp','crab','centipede','beetle','bat'],
  3:['bug','spider','mantis','raptor','moth','ghoul','jellyfish','beetle'],
};
const SPAWN = { minDistance:12, maxDistance:19, attempts:12, eliteInterval:60, patrolThreshold:3 } as const;

export class Director {
  private spawnTimer=RULES.spawnInterval as number;
  private eliteTimer=SPAWN.eliteInterval as number;
  constructor(private readonly run:Run) {}

  populate():void {
    for(const encounter of ENCOUNTERS) {
      const enemy=this.run.creatures.spawn(encounter);
      if(enemy?.kind==='mimic') {enemy.state='disguised';enemy.aggro=false;}
    }
    for(const side of [-1,1]) {
      for(const index of [0,1,2]) {
        this.run.creatures.spawn({kind:'bat',x:side*27+index,z:-11,tier:3,pack:side});
        this.run.creatures.spawn({kind:'raptor',x:side*28+index,z:-20,tier:3,pack:side});
      }
    }
  }

  step(dt:number):void {
    if(this.run.snapshot.gatePhase==='opening') return;
    this.spawnTimer-=dt;this.eliteTimer-=dt;
    if(this.spawnTimer>0) return;
    this.spawnTimer=RULES.spawnInterval*Math.pow(0.92,this.run.snapshot.batteriesCollected);
    const ambient=this.run.enemies.filter(enemy=>!enemy.isDead&&enemy.patrol).length;
    if(ambient>=RULES.ambientCap) return;
    const region=this.run.world.region(this.run.player),tier=region.tier;
    const point=this.chooseSpawn(this.run.player);
    const kind=this.run.random.pick(POOLS[tier]);
    const isElite=this.eliteTimer<=0&&this.run.snapshot.batteriesCollected>=SPAWN.patrolThreshold;
    const enemy=this.run.creatures.spawn({...point,kind,tier,elite:isElite,patrol:true});
    if(enemy) enemy.aggro=true;
    if(isElite) this.eliteTimer=SPAWN.eliteInterval;
  }

  private chooseSpawn(around:Vec2):Vec2 {
    for(const _ of Array.from({length:SPAWN.attempts})) {
      const angle=this.run.random.between(-Math.PI,Math.PI),radius=this.run.random.between(SPAWN.minDistance,SPAWN.maxDistance);
      const point=this.run.world.nearestFree({x:around.x+Math.sin(angle)*radius,z:around.z+Math.cos(angle)*radius});
      if(distance(point,around)>SPAWN.minDistance) return point;
    }
    return this.run.world.nearestFree({x:0,z:10});
  }

  gateWave(options:{isElite:boolean;sequence:number}):void {
    const points=[{x:0,z:18},{x:-10,z:25},{x:10,z:25}];
    const point=points[options.sequence%points.length];
    const kind=options.sequence%2===0?'bug':'spider';
    const enemy=this.run.creatures.spawn({...point,kind,tier:2,elite:options.isElite,patrol:true});
    if(enemy) enemy.aggro=true;
    if(options.sequence%2!==0) return;
    const companion=this.run.creatures.spawn({...point,x:point.x+1,kind:'bug',tier:1,patrol:true});
    if(companion) companion.aggro=true;
  }
}
