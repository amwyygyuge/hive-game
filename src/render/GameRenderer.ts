import { ACESFilmicToneMapping, Color, Fog, Mesh, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { GameEvent, GameSnapshot, Vec2 } from '../contracts';
import { AssetLibrary } from './AssetLibrary';
import { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { World } from './World';
import { ProceduralTextures } from './ProceduralTextures';
import { ActorView } from './ActorView';
import { SceneObjects } from './SceneObjects';
import { CombatEffects } from './CombatEffects';
import { RENDER } from './config';
import { ImpactOverlay } from './ImpactOverlay';

const RECOIL={pistol:0.055,smg:0.035,shotgun:0.14,pulse:0.055,rocket:0.2} as const;
const SHAKE={decay:7,kill:0.09,explosion:0.3,hurt:0.16,execute:0.23} as const;
const HIT_STOP={kill:0.035,execute:0.065} as const;

export class GameRenderer {
  private readonly scene=new Scene();
  private readonly engine:WebGLRenderer;
  private readonly assets=new AssetLibrary();
  private readonly camera:CameraRig;
  private readonly lighting:Lighting;
  private readonly impacts:ImpactOverlay;
  private readonly textures=new ProceduralTextures();
  private readonly actors=new Map<number,ActorView>();
  private player:ActorView|null=null;
  private world:World|null=null;
  private objects:SceneObjects|null=null;
  private effects:CombatEffects|null=null;
  private elapsed=0;
  private previousElapsed=0;
  private shake=0;
  private recoil=0;
  private hitStop=0;
  private disposed=false;
  private readonly aim:Vec2={x:0,z:15};
  private readonly playerPosition=new Vector3();
  private readonly lifecycle=new AbortController();

  constructor(private readonly container:HTMLElement) {
    this.engine=new WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.engine.setPixelRatio(Math.min(RENDER.maxPixelRatio,window.devicePixelRatio));
    this.engine.outputColorSpace=SRGBColorSpace;this.engine.toneMapping=ACESFilmicToneMapping;this.engine.toneMappingExposure=1.35;
    this.impacts=new ImpactOverlay(container);
    this.engine.domElement.setAttribute('aria-hidden','true');container.append(this.engine.domElement);
    this.scene.background=new Color(RENDER.background);
    this.camera=new CameraRig(container);this.lighting=new Lighting(this.scene,this.engine);
    this.scene.fog=new Fog(RENDER.background,25,65);
    this.resize();
    this.engine.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();container.setAttribute('aria-label','图形上下文丢失，请刷新页面重新连接');},{signal:this.lifecycle.signal});
  }

  async initialize(snapshot:GameSnapshot,onProgress?:(message:string)=>void):Promise<void> {
    await this.assets.initialize(snapshot,onProgress);
    if(this.disposed) return;
    this.world=new World({scene:this.scene,snapshot,textures:this.textures,assets:this.assets});
    this.objects=new SceneObjects(this.assets,snapshot);this.scene.add(this.objects.group);
    this.effects=new CombatEffects(this.scene,this.textures);
    this.effects.seedScenery(snapshot);
    this.player=new ActorView(this.assets,{});this.scene.add(this.player.group);
    this.camera.update({player:snapshot.player,aim:this.aim,dt:1});
  }

  render(snapshot:GameSnapshot,options:{dt:number;events:readonly GameEvent[]}):void {
    if(!this.world||!this.player||!this.objects||!this.effects||this.disposed) return;
    const isPaused=snapshot.phase==='paused'||snapshot.phase==='upgrade';
    const dt=isPaused?0:Math.min(options.dt,RENDER.maxDelta);
    this.elapsed+=dt;
    this.hitStop=Math.max(0,this.hitStop-options.dt);
    if(snapshot.elapsed<this.previousElapsed) {this.resetRun();this.hitStop=0;}
    this.previousElapsed=snapshot.elapsed;
    this.consumeEvents(options.events);
    this.aim.x=snapshot.player.x+Math.sin(snapshot.player.angle)*snapshot.player.flashlightRange;
    this.aim.z=snapshot.player.z+Math.cos(snapshot.player.angle)*snapshot.player.flashlightRange;
    this.camera.update({player:snapshot.player,aim:this.aim,dt:options.dt});
    this.animateCamera(options.dt);
    this.player.updatePlayer(snapshot.player,dt);
    this.player.applyRecoil(this.recoil);
    this.recoil=Math.max(0,this.recoil-options.dt*4);
    this.updateActors(snapshot,dt);
    this.objects.update(snapshot);
    this.effects.update(snapshot,{dt,events:options.events});
    this.updateLight(snapshot,dt);
    this.world.updateGate(snapshot.gatePhase);
    this.impacts.update(this.camera.camera,{dt,events:options.events});
    if(this.hitStop===0) this.engine.render(this.scene,this.camera.camera);
  }

  private consumeEvents(events:readonly GameEvent[]):void {
    for(const event of events) {
      switch(event.type) {
        case 'shot': {
          const strength=RECOIL[event.weapon??'pistol'];this.shake=Math.max(this.shake,strength);this.recoil=strength;
          this.lighting.flashMuzzle(new Vector3(event.x+Math.sin(event.angle??0)*0.7,1.1,event.z+Math.cos(event.angle??0)*0.7));
          this.lighting.muzzleScale=event.silenced?0.25:1;break;
        }
        case 'hit':this.flashTarget(event);break;
        case 'kill':this.shake=Math.max(this.shake,SHAKE.kill);this.hitStop=HIT_STOP.kill;break;
        case 'hurt':this.shake=Math.max(this.shake,SHAKE.hurt);break;
        case 'execute':this.shake=SHAKE.execute;this.hitStop=HIT_STOP.execute;break;
        case 'explosion':this.shake=SHAKE.explosion;this.lighting.flashExplosion(new Vector3(event.x,1,event.z));break;
        default:break;
      }
    }
  }

  private flashTarget(event:GameEvent):void {
    const closest=[...this.actors.values()].find(actor=>Math.hypot(actor.group.position.x-event.x,actor.group.position.z-event.z)<2);
    closest?.hit();
  }

  private animateCamera(dt:number):void {
    this.shake=Math.max(0,this.shake-dt*SHAKE.decay);
    const amplitude=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:this.shake;
    this.camera.camera.position.x+=Math.sin(this.elapsed*121)*amplitude;
    this.camera.camera.position.z+=Math.cos(this.elapsed*97)*amplitude;
    this.camera.camera.updateMatrixWorld();
  }

  private updateActors(snapshot:GameSnapshot,dt:number):void {
    const present=new Set<number>();
    for(const enemy of snapshot.enemies) {
      present.add(enemy.id);
      const actor=this.actors.get(enemy.id)??this.createActor(enemy);
      actor.updateEnemy(enemy,{snapshot,dt});
    }
    for(const [id,actor] of this.actors) {
      if(present.has(id)) continue;
      actor.dispose();this.actors.delete(id);
    }
  }

  private createActor(enemy:GameSnapshot['enemies'][number]):ActorView {
    const actor=new ActorView(this.assets,{enemy});this.actors.set(enemy.id,actor);this.scene.add(actor.group);return actor;
  }

  private updateLight(snapshot:GameSnapshot,dt:number):void {
    const p=snapshot.player;
    this.playerPosition.set(p.x,0,p.z);
    this.lighting.update({batteriesCollected:snapshot.batteriesCollected,player:p,aim:this.aim,elapsed:this.elapsed,dt});
    this.lighting.flashlight.distance=p.flashlightRange*1.7;
    this.world!.wallUniforms.player.value.copy(this.playerPosition);
    this.world!.wallUniforms.camera.value.copy(this.camera.camera.position);
    const power=snapshot.world.regions.map(region=>{
      if(snapshot.batteriesCollected>=5) return 0;
      if(snapshot.batteriesCollected>=3) return region.id%2===0?0:0.15;
      return Math.max(0.25,1-snapshot.batteriesCollected*0.28);
    });
    this.world!.updateLamps({player:this.playerPosition,power,elapsed:this.elapsed});
  }

  aimFromScreen(clientX:number,clientY:number):Vec2 {return this.camera.aimFromScreen(clientX,clientY);}
  resize():void {this.camera.resize();this.engine.setSize(this.container.clientWidth,this.container.clientHeight);}
  getDiagnostics():object {return {assets:this.assets.getDiagnostics(),actors:this.actors.size,calls:this.engine.info.render.calls,triangles:this.engine.info.render.triangles,geometries:this.engine.info.memory.geometries,textures:this.engine.info.memory.textures};}

  private resetRun():void {this.effects?.reset();this.actors.forEach(actor=>actor.dispose());this.actors.clear();this.shake=0;}

  dispose():void {
    if(this.disposed) return;
    this.disposed=true;this.lifecycle.abort();this.actors.forEach(actor=>actor.dispose());this.actors.clear();
    this.player?.dispose();this.objects?.dispose();this.effects?.dispose();
    this.impacts.dispose();
    this.scene.traverse(object=>{if(object instanceof Mesh) {object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(material=>material.dispose());}});
    this.assets.dispose();this.textures.dispose();this.engine.dispose();this.engine.domElement.remove();
  }
}
