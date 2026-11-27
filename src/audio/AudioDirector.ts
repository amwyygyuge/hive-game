import type { AudioLevels, GameEvent, GameSnapshot } from '../contracts';
import { AudioGraph, GlobalEffects } from './AudioGraph';
import { SoundBank } from './SoundBank';
import { SpatialPlayer } from './SpatialPlayer';
import { MusicMixer, MusicScore } from './MusicScore';
import { Soundscape } from './Soundscape';
import { EventSounds } from './EventSounds';
import { AUDIO_CLOCK, type AudioDiagnostics, type AudioDirectorOptions } from './types';

const DEFAULT:AudioLevels={music:0.5,effects:0.7,ambience:0.45,isMuted:false};

export class AudioDirector {
  private context:AudioContext|null=null;
  private graph:AudioGraph|null=null;
  private bank:SoundBank|null=null;
  private player:SpatialPlayer|null=null;
  private music:MusicMixer|null=null;
  private soundscape:Soundscape|null=null;
  private events:EventSounds|null=null;
  private readonly score=new MusicScore();
  private readonly effects=new GlobalEffects();
  private readonly lifecycle=new AbortController();
  private levels:AudioLevels={...DEFAULT};
  private loading:Promise<void>|null=null;
  private isUnlocked=false;
  private isDisposed=false;
  private lastElapsed=0;

  constructor(private readonly options:AudioDirectorOptions={}) {
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.suspend();},{signal:this.lifecycle.signal});
  }

  async unlock():Promise<void> {
    if(this.isDisposed) return;
    this.context??=new AudioContext();
    await this.context.resume();
    this.loading??=this.initialize(this.context);
    await this.loading;
    this.isUnlocked=true;
  }

  private async initialize(context:AudioContext):Promise<void> {
    this.graph=new AudioGraph(context);this.graph.setLevels(this.levels);
    this.bank=new SoundBank(context);await this.bank.compose();
    if(this.options.manifest) await this.bank.replace(this.options.manifest);
    if(this.isDisposed) {this.bank.dispose();return;}
    this.player=new SpatialPlayer({graph:this.graph,bank:this.bank,screenRight:this.options.screenRight??{x:1,z:0}});
    this.music=new MusicMixer(this.graph,this.bank);
    this.soundscape=new Soundscape({graph:this.graph,bank:this.bank,player:this.player});
    this.events=new EventSounds({player:this.player,effects:this.effects,now:()=>context.currentTime});
  }

  update(snapshot:GameSnapshot,events:readonly GameEvent[]):void {
    if(!this.graph||!this.player||!this.music||!this.soundscape||!this.events||!this.isUnlocked) return;
    if(snapshot.elapsed<this.lastElapsed) this.reset();
    this.lastElapsed=snapshot.elapsed;
    if(snapshot.phase==='paused'||document.hidden||this.context?.state!=='running') {this.events.remember(snapshot);return;}
    const state=this.score.update(snapshot,events),effect=this.effects.read(this.graph.context.currentTime);
    const doorWalls=snapshot.props.filter(prop=>prop.kind==='door'&&prop.isActive&&prop.hp>0).map(prop=>({...prop,width:5.6,depth:0.6,height:3}));
    this.player.setScene({listener:snapshot.player,walls:[...snapshot.world.walls,...doorWalls],rate:effect.rate});
    this.graph.muffle(effect.cutoff);
    this.music.update({snapshot,state,rate:effect.rate});this.soundscape.update(snapshot,state);this.events.consume(snapshot,events);
  }

  setLevels(levels:AudioLevels):void {this.levels={...levels};this.graph?.setLevels(this.levels);}
  suspend():void {this.player?.stopAll();if(this.context?.state==='running') void this.context.suspend();}

  private reset():void {this.player?.stopAll();this.events?.reset();this.effects.reset();this.score.reset();}

  getDiagnostics():AudioDiagnostics {
    const active=[...(this.music?.activeLoops??[]),...(this.soundscape?.activeLoops??[])];
    const state=this.isDisposed?'disposed':this.isUnlocked?this.score.state:this.loading?'loading':'locked';
    return {state,contextState:this.context?.state??'uncreated',activeLoops:active,loopSources:this.music?19:0,activeVoices:this.player?.activeVoices??0,synthesizedBytes:this.bank?.synthesizedBytes??0,replacementBytes:this.bank?.replacementBytes??0,errors:this.bank?.errors??[],bpm:AUDIO_CLOCK.bpm,unlocked:this.isUnlocked,muted:this.levels.isMuted};
  }

  dispose():void {
    if(this.isDisposed) return;
    this.isDisposed=true;this.lifecycle.abort();this.player?.stopAll();this.music?.dispose();this.soundscape?.dispose();this.bank?.dispose();this.graph?.dispose();
    if(this.context&&this.context.state!=='closed') void this.context.close();
  }
}
