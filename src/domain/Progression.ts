import type { PickupView, UpgradeId } from '../contracts';
import { RULES, UPGRADES, WEAPONS } from './config';
import { direction, distance, retain } from './math';
import type { Run } from './Run';
const LINE_WEIGHTS={combat:0.6,dark:0.25,economy:0.15} as const;
const COMBO_TIERS=[{kills:50,multiplier:3},{kills:25,multiplier:2},{kills:10,multiplier:1.5}] as const;
export class Progression {
  constructor(private readonly run:Run) {}
  kill():void {
    const p=this.run.player;
    p.kills++;p.combo++;p.comboRemaining=RULES.comboWindow;p.adrenaline=Math.min(1,p.adrenaline+1/RULES.adrenalineKills);
    p.multiplier=COMBO_TIERS.find(tier=>p.combo>=tier.kills)?.multiplier??1;
    if([10,25,50].includes(p.combo)) this.run.emit({type:'combo',x:p.x,z:p.z,value:p.combo});
  }
  gainXp(value:number):void {
    const p=this.run.player;p.xp+=value*p.multiplier*(1+0.1*p.stacks.learning);
    while(p.xp>=p.nextXp) { p.xp-=p.nextXp;p.level++;p.nextXp=10+(p.level-1)*6;p.pendingLevels++; }
  }
  step(dt:number):void {
    const p=this.run.player;p.comboRemaining=Math.max(0,p.comboRemaining-dt);
    if(p.comboRemaining===0) { p.combo=0;p.multiplier=1; }
    if(this.run.snapshot.phase==='playing'&&p.pendingLevels>0) this.offer();
  }
  private offer():void {
    const eligible=Object.values(UPGRADES).filter(u=>this.run.player.stacks[u.id]<u.maxStacks);
    const choices:typeof eligible=[];
    while(choices.length<3&&eligible.length>0) {
      const weight=(line:keyof typeof LINE_WEIGHTS):number=>LINE_WEIGHTS[line]/eligible.filter(option=>option.line===line).length;
      const total=eligible.reduce((sum,u)=>sum+weight(u.line),0),cursor={value:this.run.random.next()*total};
      const selected=eligible.findIndex(u=>{cursor.value-=weight(u.line);return cursor.value<=0;});
      choices.push(eligible.splice(Math.max(0,selected),1)[0]!);
    }
    if(choices.length===0) { this.run.player.pendingLevels=0;return; }
    this.run.snapshot.upgradeOptions=choices.map(u=>({...u,stacks:this.run.player.stacks[u.id]}));
    this.run.snapshot.phase='upgrade';
  }
  choose(id:UpgradeId):void {
    const state=this.run.snapshot;
    if(state.phase!=='upgrade'||!state.upgradeOptions.some(u=>u.id===id)) return;
    this.run.player.applyUpgrade(id);this.run.player.pendingLevels--;state.upgradeOptions=[];state.phase='playing';
    this.run.emit({type:'upgrade',x:this.run.player.x,z:this.run.player.z});
    if(this.run.player.pendingLevels>0) this.offer();
  }
  drop(args:{x:number;z:number;kind:PickupView['kind'];value:number}):void {
    this.run.pickups.push({id:this.run.nextId(),...args});
  }
  pickups(dt:number):void {
    const p=this.run.player,range=RULES.pickupRadius*(1+0.3*p.stacks.pickup);
    retain(this.run.pickups,item=>{
      const d=distance(item,p);
      if(d>range||!this.run.world.visible(item,p)) return true;
      const move=direction(item,p);item.x+=move.x*dt*8;item.z+=move.z*dt*8;
      if(d>0.4) return true;
      switch(item.kind) {
        case 'coin':p.coins+=item.value;break;
        case 'health':p.hp=Math.min(p.maxHp,p.hp+item.value);break;
        case 'ammo': {
          const id=p.weapon==='pistol'?[...p.ownedWeapons].reverse().find(w=>w!=='pistol'):p.weapon;
          if(id) p.stocks[id].reserve=Math.min(WEAPONS[id].reserve,p.stocks[id].reserve+Math.ceil(WEAPONS[id].reserve*RULES.ammoRecovery));
          break;
        }
      }
      this.run.emit({type:'pickup',x:item.x,z:item.z,value:item.kind==='ammo'?-1:item.kind==='health'?-2:item.value});return false;
    });
  }
}
