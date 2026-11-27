import type { BatteryView, GameEvent, GameSnapshot, HazardView, PickupView, PropView, UpgradeId, Vec2 } from '../contracts';
import { Random } from './math';
import { World } from './World';
import { Enemy, Player, type Projectile } from './entities';
import { Combat } from './Combat';
import { Enemies } from './Enemies';
import { Environment } from './Environment';
import { Progression } from './Progression';
import { Objectives } from './Objectives';
import { Director } from './Director';
import { PlayerController } from './PlayerController';
import type { InputFrame } from '../contracts';
import { RULES } from './config';
export class Run {
  readonly random:Random; readonly world=new World(); readonly player=new Player();
  readonly enemies:Enemy[]=[]; readonly projectiles:Projectile[]=[];readonly pickups:PickupView[]=[];
  readonly batteries:BatteryView[]=[];readonly hazards:HazardView[]=[];readonly props:PropView[]=[];
  readonly snapshot:GameSnapshot;
  readonly combat:Combat;readonly creatures:Enemies;readonly environment:Environment;
  readonly progression:Progression;readonly objectives:Objectives;readonly director:Director;readonly controller:PlayerController;
  messageTime=0; gunHeat=0; readonly lastGun:Vec2={x:0,z:28}; shopDismissed=false;
  constructor(readonly seed:number,private readonly source:{id:number;events:GameEvent[]}) {
    this.random=new Random(seed);
    this.snapshot={phase:'ready',elapsed:0,seed,player:this.player,enemies:this.enemies,projectiles:this.projectiles,pickups:this.pickups,batteries:this.batteries,hazards:this.hazards,props:this.props,batteriesCollected:0,gatePhase:'locked',gateRemaining:0,upgradeOptions:[],isShopOpen:false,message:'集齐六块电池，返回南部大门。',regionName:'南部补给站',world:this.world.layout};
    this.combat=new Combat(this);this.creatures=new Enemies(this);this.environment=new Environment(this);
    this.progression=new Progression(this);this.objectives=new Objectives(this);this.director=new Director(this);
    this.controller=new PlayerController(this);this.environment.populate();this.director.populate();this.objectives.populate();
  }
  nextId():number { return ++this.source.id; }
  emit(event:GameEvent):void { this.source.events.push(event); }
  message(text:string):void { this.snapshot.message=text;this.messageTime=RULES.messageDuration; }
  advance(dt:number,input:InputFrame):void {
    const scale=this.player.slowRemaining>0?RULES.slowScale:1,worldDt=dt*scale;
    this.snapshot.elapsed+=dt;this.messageTime=Math.max(0,this.messageTime-dt);
    this.gunHeat=Math.max(0,this.gunHeat-dt*RULES.heatDecay);
    this.controller.step(dt,input);this.creatures.step(worldDt);this.combat.step(worldDt);
    this.environment.step(worldDt);this.progression.pickups(worldDt);this.director.step(worldDt);
    this.objectives.step(dt);this.progression.step(dt);
    this.snapshot.regionName=this.world.region(this.player).name;
    if(this.messageTime===0) this.snapshot.message='';
  }
  choose(id:UpgradeId):void { this.progression.choose(id); }
}
