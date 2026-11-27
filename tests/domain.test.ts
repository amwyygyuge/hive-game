import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/domain/GameSession';
import { Run } from '../src/domain/Run';
import { RULES } from '../src/domain/config';
import type { GameEvent, InputFrame } from '../src/contracts';

const STEP=1/60;
const INPUT:InputFrame={moveX:0,moveZ:0,aim:{x:0,z:0},isFiring:false,dash:false,reload:false,interact:false,execute:false,adrenaline:false};
function createRun():Run {
  const run=new Run(123,{id:0,events:[] as GameEvent[]});run.snapshot.phase='playing';return run;
}
function isolate(run:Run):void {run.enemies.length=0;run.projectiles.length=0;run.pickups.length=0;run.player.x=0;run.player.z=6;}
function advance(run:Run,options:{seconds:number;input?:Partial<InputFrame>}):void {
  for(const _ of Array.from({length:Math.round(options.seconds/STEP)})) run.advance(STEP,{...INPUT,...options.input});
}

test('ready, start, pause, resume, restart isolate a complete run',()=>{
  const game=new GameSession(12),initial=game.getSnapshot();
  game.step(1,INPUT);assert.equal(initial.elapsed,0);
  game.dispatch({type:'start'});game.step(STEP,{...INPUT,moveX:1});assert.ok(initial.player.x>0);
  game.dispatch({type:'pause'});const x=initial.player.x;game.step(STEP,{...INPUT,moveX:1});assert.equal(initial.player.x,x);
  game.dispatch({type:'resume'});game.step(STEP,INPUT);assert.equal(initial.phase,'playing');
  game.dispatch({type:'restart'});assert.equal(game.getSnapshot().phase,'ready');assert.equal(game.getSnapshot().player.coins,0);assert.equal(game.getSnapshot().batteriesCollected,0);
});

test('all six real objectives are reachable in the carved floor network',()=>{
  const run=createRun();assert.equal(run.batteries.length,6);
  for(const battery of run.batteries) assert.ok(run.world.pathDistance(run.player,battery)>0,battery.label);
  assert.ok(run.world.pathDistance(run.player,run.world.layout.exit)>0);
});

test('pistol consumes magazine and refills without exhausting infinite reserve',()=>{
  const run=createRun();isolate(run);
  advance(run,{seconds:0.6,input:{isFiring:true,aim:{x:7,z:6}}});assert.ok(run.player.ammo<12);
  run.controller.step(STEP,{...INPUT,reload:true});advance(run,{seconds:1});
  assert.equal(run.player.ammo,12);assert.equal(run.player.reserve,Infinity);
});

test('shop requires proximity, cannot overspend, owns and equips purchased weapons',()=>{
  const run=createRun();run.player.coins=300;run.controller.buy('smg');assert.equal(run.player.coins,300);
  Object.assign(run.player,run.world.layout.shop);run.controller.buy('smg');
  assert.equal(run.player.weapon,'smg');assert.equal(run.player.coins,0);assert.equal(run.player.ammo,32);
  run.controller.buy('rocket');assert.equal(run.player.weapon,'smg');assert.equal(run.player.coins,0);
});

test('switching during reload cannot transfer or duplicate magazine ammunition',()=>{
  const run=createRun();run.player.ownedWeapons.push('smg');run.player.ammo=1;
  run.controller.step(STEP,{...INPUT,reload:true});run.controller.equip('smg');advance(run,{seconds:1});
  assert.equal(run.player.ammo,32);run.controller.equip('pistol');assert.equal(run.player.ammo,1);
});

test('upgrade offers three distinct eligible choices and unique upgrades do not reappear',()=>{
  const run=createRun();run.player.applyUpgrade('nightVision');run.player.applyUpgrade('heartbeat');
  run.progression.gainXp(10);run.progression.step(STEP);
  assert.equal(run.snapshot.phase,'upgrade');assert.equal(new Set(run.snapshot.upgradeOptions.map(o=>o.id)).size,3);
  assert.ok(run.snapshot.upgradeOptions.every(o=>o.id!=='nightVision'&&o.id!=='heartbeat'));
  const chosen=run.snapshot.upgradeOptions[0];run.choose(chosen.id);assert.equal(run.player.stacks[chosen.id],1);assert.equal(run.snapshot.phase,'playing');
});

test('crab frontal armor reduces real damage and feedback while flank hits sever legs',()=>{
  const run=createRun();isolate(run);const crab=run.creatures.spawn({kind:'crab',x:4,z:6})!;crab.angle=0;
  run.combat.damage.hit({enemy:crab,amount:10,point:{x:4,z:7}});assert.equal(crab.hp,108);
  run.combat.damage.hit({enemy:crab,amount:40,point:{x:crab.x+1,z:crab.z}});assert.equal(crab.isSevered,true);assert.equal(crab.isExecutable,true);assert.ok(crab.speed<2.6);
});

test('execution heals, returns ammo, grants invulnerability, rewards only once',()=>{
  const run=createRun();isolate(run);const bug=run.creatures.spawn({kind:'bug',x:0.8,z:6})!;
  bug.hp=1;bug.isExecutable=true;run.player.hp=50;run.player.ammo=1;
  run.combat.execute();assert.equal(run.player.hp,58);assert.equal(run.player.ammo,4);assert.ok(run.player.invulnerable>=0.6);
  const kills=run.player.kills;run.combat.execute();assert.equal(run.player.kills,kills);
});

test('closed gate and walls prevent dashing through geometry',()=>{
  const run=createRun();run.player.x=0;run.player.z=33;
  run.controller.step(STEP,{...INPUT,moveZ:1,dash:true});
  for(const _ of Array.from({length:20})) run.controller.step(STEP,{...INPUT,moveZ:1});
  assert.ok(run.player.z<34);assert.equal(run.snapshot.phase,'playing');
});

test('swept projectiles hit the nearest barrel instead of an enemy behind it',()=>{
  const run=createRun();isolate(run);run.props.length=0;
  run.props.push({id:999,x:1.5,z:6,kind:'barrel',hp:24,maxHp:24,isActive:false,angle:0});
  const bug=run.creatures.spawn({kind:'bug',x:4,z:6})!;
  run.player.angle=Math.PI/2;run.combat.shoot();run.combat.step(0.2);
  assert.equal(run.props[0].hp,12);assert.equal(bug.hp,bug.maxHp);
});

test('projectile cannot hit an enemy behind a concrete wall',()=>{
  const run=createRun();isolate(run);run.props.length=0;
  run.player.x=0;run.player.z=20;const bug=run.creatures.spawn({kind:'bug',x:7,z:20})!;
  run.player.angle=Math.PI/2;run.combat.shoot();run.combat.step(0.25);assert.equal(bug.hp,bug.maxHp);
});

test('parasite latch drains health and dash removes it',()=>{
  const run=createRun();isolate(run);const parasite=run.creatures.spawn({kind:'parasite',x:0.5,z:6})!;parasite.aggro=true;
  run.creatures.step(STEP);run.creatures.step(0.5);assert.equal(run.player.isParasitized,true);assert.ok(run.player.hp<100);
  run.controller.step(STEP,{...INPUT,dash:true});assert.equal(run.player.isParasitized,false);assert.notEqual(parasite.state,'latched');
});

test('centipede severing splits a living body but lethal damage does not resurrect it',()=>{
  const run=createRun();isolate(run);const centipede=run.creatures.spawn({kind:'centipede',x:4,z:6})!;
  run.combat.damage.hit({enemy:centipede,amount:35,point:{x:5,z:6}});
  assert.equal(run.enemies.filter(e=>e.kind==='centipede'&&!e.isDead).length,2);
  const second=run.creatures.spawn({kind:'centipede',x:-4,z:6})!;
  run.combat.damage.hit({enemy:second,amount:200,point:{x:-3,z:6}});assert.equal(second.isDead,true);
});

test('severed beetle never starts another charge',()=>{
  const run=createRun();isolate(run);const beetle=run.creatures.spawn({kind:'beetle',x:3,z:6})!;beetle.isSevered=true;beetle.aggro=true;beetle.enter('charging');
  run.creatures.step(STEP);assert.equal(beetle.state,'chase');
});

test('corpse spider waits for two seconds of facing away',()=>{
  const run=createRun();isolate(run);const spider=run.creatures.spawn({kind:'corpseSpider',x:0,z:10})!;run.player.angle=Math.PI;
  run.creatures.step(1);assert.equal(spider.state,'feigning');run.creatures.step(1.1);assert.notEqual(spider.state,'feigning');
});

test('moth dives during reload rather than ordinary movement',()=>{
  const run=createRun();isolate(run);const moth=run.creatures.spawn({kind:'moth',x:5,z:6})!;
  run.creatures.step(STEP);assert.equal(moth.state,'circling');run.player.reloadRemaining=1;run.creatures.step(STEP);assert.equal(moth.state,'diving');
});

test('eel is invulnerable inside the pipe and worm opens a timed damage window',()=>{
  const run=createRun();isolate(run);const eel=run.creatures.spawn({kind:'eel',x:3,z:6})!;
  run.combat.damage.hit({enemy:eel,amount:100,point:run.player});assert.equal(eel.hp,eel.maxHp);
  const worm=run.creatures.spawn({kind:'worm',x:4,z:6})!;
  run.creatures.step(5.1);assert.equal(worm.state,'warning');assert.equal(worm.isVulnerable,false);
  run.creatures.step(2.1);assert.equal(worm.state,'exposed');assert.equal(worm.isVulnerable,true);
  run.creatures.step(3.1);assert.equal(worm.state,'underground');assert.equal(worm.isVulnerable,false);
});

test('explosions ignite acid and electrical boxes chain through wet enemies',()=>{
  const run=createRun();isolate(run);run.player.z=12;
  const acid=run.environment.addHazard({x:4,z:6,kind:'acid',radius:2,remaining:10});
  run.environment.explode({x:5,z:6,radius:2,enemy:20,player:10});assert.equal(acid.kind,'fire');
  const bug=run.creatures.spawn({kind:'bug',x:-1,z:6})!,box=run.props.find(p=>p.kind==='electric')!;
  run.environment.hitProp(box,1);assert.equal(bug.isDead,true);
});

test('closed fire doors block bullets, can be toggled and destroyed',()=>{
  const run=createRun();run.player.x=0;run.player.z=18;
  const door=run.props.find(prop=>prop.kind==='door')!;
  assert.equal(run.environment.interactDoor(),true);assert.equal(door.isActive,true);
  assert.equal(run.world.visible({x:0,z:18},{x:0,z:16}),false);
  run.environment.hitProp(door,door.hp);assert.equal(run.world.visible({x:0,z:18},{x:0,z:16}),true);
});

test('six batteries, guardian release, real-time gate countdown and crossing exit form a win',()=>{
  const run=createRun();run.player.hp=run.player.maxHp=100000;
  for(const enemy of run.enemies) {enemy.isDead=true;enemy.hp=0;}
  run.objectives.step(STEP);
  for(const battery of run.batteries) {assert.equal(battery.isAvailable,true);run.player.x=battery.x;run.player.z=battery.z;run.objectives.interact();}
  assert.equal(run.snapshot.batteriesCollected,6);
  Object.assign(run.player,run.world.layout.gate);run.objectives.interact();assert.equal(run.snapshot.gatePhase,'opening');
  run.player.slowRemaining=3;
  for(const _ of Array.from({length:30})) run.objectives.step(1);
  assert.equal(run.snapshot.gatePhase,'open');assert.equal(run.snapshot.phase,'playing');
  Object.assign(run.player,run.world.layout.exit);run.objectives.step(STEP);assert.equal(run.snapshot.phase,'won');
});

test('fake battery cannot increase the six real objective counter',()=>{
  const run=createRun(),mimic=run.enemies.find(enemy=>enemy.kind==='mimic')!;
  run.player.x=mimic.x;run.player.z=mimic.z;run.objectives.interact();assert.equal(mimic.state,'revealed');assert.equal(run.snapshot.batteriesCollected,0);
});

test('slow motion leaves player locomotion at normal speed',()=>{
  const normal=createRun(),slow=createRun();isolate(normal);isolate(slow);slow.player.slowRemaining=3;
  normal.advance(STEP,{...INPUT,moveX:1});slow.advance(STEP,{...INPUT,moveX:1});
  assert.equal(normal.player.x,slow.player.x);assert.equal(slow.snapshot.elapsed,STEP);
});

test('damage causes loss and subsequent input cannot revive or move the dead player',()=>{
  const game=new GameSession(42);game.dispatch({type:'start'});
  const snapshot=game.getSnapshot();snapshot.player.hp=1;
  const attacker=snapshot.enemies.find(enemy=>enemy.kind==='bug')!;attacker.x=snapshot.player.x;attacker.z=snapshot.player.z;
  game.step(STEP,INPUT);assert.equal(snapshot.phase,'lost');assert.equal(snapshot.player.hp,0);
  const position={x:snapshot.player.x,z:snapshot.player.z};game.step(STEP,{...INPUT,moveX:1});
  assert.equal(snapshot.player.x,position.x);assert.equal(snapshot.player.z,position.z);
});

test('forty kills fill adrenaline and combo reward tiers expire',()=>{
  const run=createRun();for(const _ of Array.from({length:40})) run.progression.kill();
  assert.equal(run.player.adrenaline,1);assert.equal(run.player.multiplier,2);
  run.controller.step(STEP,{...INPUT,adrenaline:true});assert.equal(run.player.adrenaline,0);assert.ok(run.player.slowRemaining>0);
  run.progression.step(RULES.comboWindow+STEP);assert.equal(run.player.combo,0);assert.equal(run.player.multiplier,1);
});

test('damage feedback carries armored damage rather than the unmodified bullet value',()=>{
  const source={id:0,events:[] as GameEvent[]},run=new Run(123,source);run.snapshot.phase='playing';isolate(run);
  const crab=run.creatures.spawn({kind:'crab',x:4,z:6})!;crab.angle=0;
  run.combat.damage.hit({enemy:crab,amount:10,point:{x:4,z:7}});
  const hit=source.events.find(event=>event.type==='hit');assert.equal(hit?.value,2);assert.equal(hit?.kind,'crab');
});

test('weapon switching cannot bypass the shot cooldown',()=>{
  const run=createRun();isolate(run);run.player.ownedWeapons.push('smg');
  run.controller.step(STEP,{...INPUT,isFiring:true});const cooldown=run.player.fireCooldown;
  run.controller.equip('smg');assert.equal(run.player.fireCooldown,cooldown);
  run.controller.step(STEP,{...INPUT,isFiring:true});assert.equal(run.player.ammo,32);
});

test('shotgun spread damages multiple targets while rocket blast damages nearby creatures',()=>{
  const run=createRun();isolate(run);run.props.length=0;run.player.ownedWeapons.push('shotgun','rocket');
  const left=run.creatures.spawn({kind:'bug',x:5,z:5.5})!,right=run.creatures.spawn({kind:'bug',x:5,z:6.5})!;
  run.controller.equip('shotgun');run.player.angle=Math.PI/2;run.combat.shoot();run.combat.step(0.2);
  assert.ok(left.hp<left.maxHp&&right.hp<right.maxHp);
  run.enemies.length=0;run.projectiles.length=0;
  const center=run.creatures.spawn({kind:'crab',x:5,z:6})!,near=run.creatures.spawn({kind:'bug',x:5,z:8})!;
  run.controller.equip('rocket');run.combat.shoot();run.combat.step(0.3);
  assert.equal(center.isDead,true);assert.equal(near.isDead,true);
});

test('crabs move laterally and destroyed spider abdomens cancel locomotion and jumping',()=>{
  const run=createRun();isolate(run);const crab=run.creatures.spawn({kind:'crab',x:4,z:6})!;crab.aggro=true;
  const before={x:crab.x,z:crab.z};run.creatures.step(STEP);
  const forwardMotion=(crab.x-before.x)*Math.sin(crab.angle)+(crab.z-before.z)*Math.cos(crab.angle);
  assert.ok(Math.abs(forwardMotion)<1e-8);
  const spider=run.creatures.spawn({kind:'spider',x:-4,z:6})!;
  run.combat.damage.hit({enemy:spider,amount:20,point:{x:-3,z:6}});assert.equal(spider.isSevered,true);
  const wounded={x:spider.x,z:spider.z};run.creatures.step(1);run.creatures.step(1);
  assert.equal(spider.x,wounded.x);assert.equal(spider.z,wounded.z);assert.notEqual(spider.state,'leaping');
});
