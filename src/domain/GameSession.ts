import type { GameAction, GameEvent, GameSnapshot, InputFrame } from '../contracts';
import { RULES } from './config';
import { Run } from './Run';
export class GameSession {
  private readonly source={id:0,events:[] as GameEvent[]};
  private run:Run;
  constructor(private readonly seed=Math.floor(Math.random()*0xFFFFFFFF)) { this.run=new Run(seed,this.source); }
  getSnapshot():GameSnapshot { return this.run.snapshot; }
  step(dtSeconds:number,input:InputFrame):void {
    if(!Number.isFinite(dtSeconds)||dtSeconds<=0||this.run.snapshot.phase!=='playing') return;
    const cursor={remaining:Math.min(RULES.maxFrame,dtSeconds),first:true};
    const held={...input,dash:false,reload:false,interact:false,execute:false,adrenaline:false};
    while(cursor.remaining>1e-8&&this.run.snapshot.phase==='playing') {
      const dt=Math.min(cursor.remaining,RULES.maxStep);
      this.run.advance(dt,cursor.first?input:held);cursor.first=false;cursor.remaining-=dt;
    }
  }
  dispatch(action:GameAction):void {
    const state=this.run.snapshot;
    switch(action.type) {
      case 'restart':this.source.events.length=0;this.run=new Run(this.seed,this.source);break;
      case 'start':if(state.phase==='ready') state.phase='playing';break;
      case 'pause':if(state.phase==='playing') state.phase='paused';break;
      case 'resume':if(state.phase==='paused') state.phase='playing';break;
      case 'closeShop':state.isShopOpen=false;this.run.shopDismissed=true;break;
      case 'upgrade':this.run.choose(action.id);break;
      case 'buy':this.run.controller.buy(action.id);break;
      case 'equip':this.run.controller.equip(action.id);break;
    }
  }
  drainEvents():GameEvent[] { return this.source.events.splice(0); }
}
