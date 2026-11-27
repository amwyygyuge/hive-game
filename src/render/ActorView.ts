import { AnimationAction, Group, Mesh, Vector3 } from 'three';
import type { EnemyView, GameSnapshot, PlayerView, WeaponId } from '../contracts';
import { AssetLibrary, type ModelInstance } from './AssetLibrary';
import { applyActorFx, type ActorFxUniforms } from './MaterialEffects';
import { ENEMY_MODELS, FLYING, MODEL, RENDER, SEVER_BONES, WEAPON_MODELS } from './config';
import { pickClipName } from './enemyStates';

const ACTOR = { idle:'Idle', run:'Run', walk:'Walk', shadowRange:18, eliteScale:1.2, corpseTilt:1.35, floatingHeight:1.2, flashDecay:7 } as const;

export class ActorView {
  readonly group=new Group();
  readonly model:ModelInstance;
  private readonly fx:ActorFxUniforms[];
  private readonly animationNames:string[];
  private action:AnimationAction|null=null;
  private clip='';
  private flash=0;
  private hasSevered=false;
  private weapon:ModelInstance|null=null;
  private weaponId:WeaponId|null=null;
  private readonly weaponAnchor=new Group();
  private readonly previous=new Vector3();
  private isPlaced=false;
  private readonly mimic:ModelInstance|null;

  constructor(private readonly assets:AssetLibrary,options:{enemy?:EnemyView}) {
    const enemy=options.enemy;
    this.model=assets.create(enemy?ENEMY_MODELS[enemy.kind]:MODEL.player);
    this.fx=this.model.materials.map(material=>applyActorFx(material));
    this.animationNames=this.model.asset.gltf.animations.map(clip=>clip.name);
    this.group.add(this.model.root);
    this.mimic=enemy?.kind==='mimic'?assets.create(MODEL.battery):null;
    this.alignModel();
    if(this.mimic) {this.mimic.root.scale.setScalar(0.35);this.group.add(this.mimic.root);}
    if(!enemy) this.attachWeaponAnchor();
  }

  private alignModel():void {
    const bounds=this.model.asset.bounds;
    this.model.root.position.x-=(bounds.min.x+bounds.max.x)/2;
    this.model.root.position.z-=(bounds.min.z+bounds.max.z)/2;
    this.model.root.position.y-=bounds.min.y;
  }

  private attachWeaponAnchor():void {
    const hand=this.model.root.getObjectByName('attach-righthand')??this.model.root.getObjectByName('RightHand');
    if(hand) {hand.add(this.weaponAnchor);return;}
    this.weaponAnchor.position.set(-0.32,1.1,0.35);
    this.group.add(this.weaponAnchor);
  }

  updatePlayer(player:PlayerView,dt:number):void {
    this.place({x:player.x,z:player.z,angle:player.angle,height:0});
    this.group.rotation.z=player.hp<=0?ACTOR.corpseTilt:0;
    this.playClip(player.isMoving?ACTOR.run:ACTOR.idle,dt);
    this.equipWeapon(player.weapon);
    this.weaponAnchor.rotation.x=player.reloadRemaining>0?-0.45:0;
    this.fx.forEach(fx=>{fx.rimStrength.value=0.1;fx.flashStrength.value=player.invulnerable>0?0.1:0;});
  }

  applyRecoil(strength:number):void {
    if(this.weapon) {this.weapon.root.position.z=0.08-strength;this.weapon.root.rotation.x=-strength*2;}
  }

  private equipWeapon(id:WeaponId):void {
    if(this.weaponId===id) return;
    this.weapon?.dispose();this.weapon=this.assets.create(WEAPON_MODELS[id]);this.weaponId=id;
    const size=this.weapon.asset.size;
    this.weapon.root.rotation.y=size.x>size.z?Math.PI/2:0;
    this.weapon.root.position.set(0,0,0.08);
    this.weaponAnchor.add(this.weapon.root);
  }

  updateEnemy(enemy:EnemyView,options:{snapshot:GameSnapshot;dt:number}):void {
    const {snapshot,dt}=options,p=snapshot.player;
    const range=Math.hypot(p.x-enemy.x,p.z-enemy.z);
    const isHidden=enemy.state==='underground'||enemy.state==='hidden'||enemy.state==='warning';
    this.group.visible=range<RENDER.cullDistance&&!isHidden;
    if(!this.group.visible) return;
    const floating=FLYING.has(enemy.kind)&&!enemy.isSevered&&!enemy.isDead;
    const height=floating?ACTOR.floatingHeight+Math.sin(snapshot.elapsed*2+enemy.id)*0.15:0;
    this.place({x:enemy.x,z:enemy.z,angle:enemy.angle,height});
    const isDown=enemy.isDead||enemy.state==='feigning';
    this.group.rotation.z=isDown?ACTOR.corpseTilt:0;
    const scale=enemy.isElite?ACTOR.eliteScale:1;
    this.group.scale.setScalar(scale);
    this.updateMimic(enemy);
    this.animateEnemy(enemy,{dt,elapsed:snapshot.elapsed});
    this.updateMaterials(enemy,{dt,range,nightVision:p.nightVision});
    this.model.root.traverse(object=>{if(object instanceof Mesh) object.castShadow=range<ACTOR.shadowRange&&!enemy.isDead;});
  }

  private place(args:{x:number;z:number;angle:number;height:number}):void {
    this.previous.copy(this.group.position);
    this.group.position.set(args.x,args.height,args.z);
    this.group.rotation.y=args.angle;
    if(!this.isPlaced) {this.previous.copy(this.group.position);this.isPlaced=true;}
  }

  private updateMimic(enemy:EnemyView):void {
    if(!this.mimic) return;
    const isDisguised=enemy.state==='disguised'&&!enemy.isDead;
    this.mimic.root.visible=isDisguised;this.model.root.visible=!isDisguised;
  }

  private animateEnemy(enemy:EnemyView,options:{dt:number;elapsed:number}):void {
    if(enemy.isSevered&&!this.hasSevered) this.sever(enemy);
    if(enemy.isDead||enemy.state==='feigning'||enemy.state==='dormant') {this.playClip(ACTOR.idle,0);return;}
    const speed=options.dt>0?this.previous.distanceTo(this.group.position)/options.dt:0;
    this.playClip(pickClipName({kind:enemy.kind,available:this.animationNames,speed})??ACTOR.idle,options.dt);
    switch(enemy.state) {
      case 'leaping':this.group.position.y+=Math.sin(Math.min(1,enemy.stateTime/0.45)*Math.PI)*1.8;break;
      case 'chargeWarning':case 'swelling':this.group.scale.multiplyScalar(1+Math.sin(options.elapsed*30)*0.07);break;
      default:break;
    }
    if(enemy.kind==='cocoon') this.group.scale.multiplyScalar(1+Math.sin(options.elapsed*4)*0.08);
    if(enemy.kind==='moth') this.group.rotation.y=0;
  }

  private sever(enemy:EnemyView):void {
    this.hasSevered=true;
    for(const name of SEVER_BONES[enemy.kind]??[]) {
      const bone=this.model.root.getObjectByName(name);
      if(bone) bone.scale.multiplyScalar(0.08);
    }
  }

  private updateMaterials(enemy:EnemyView,options:{dt:number;range:number;nightVision:boolean}):void {
    this.flash=Math.max(0,this.flash-options.dt*ACTOR.flashDecay);
    for(const fx of this.fx) {
      fx.flashStrength.value=this.flash;
      fx.rimStrength.value=options.nightVision&&options.range<RENDER.nightVisionRange?0.75:0;
      fx.tint.value.set(enemy.isDead?0x693c3b:0xffffff);
      if(enemy.isExecutable&&!enemy.isDead) {fx.rimColor.value.set(0xffc871);fx.rimStrength.value=0.4+Math.sin(enemy.stateTime*12)*0.3;}
    }
  }

  hit():void {this.flash=0.7;}

  private playClip(name:string,dt:number):void {
    const clip=this.model.asset.gltf.animations.find(item=>item.name.toLowerCase()===name.toLowerCase())??this.model.asset.gltf.animations[0];
    if(!clip) return;
    if(this.clip!==clip.name) {
      this.action?.fadeOut(0.15);this.action=this.model.mixer.clipAction(clip);this.action.reset().fadeIn(0.15).play();this.clip=clip.name;
    }
    this.model.mixer.update(dt);
  }

  dispose():void {this.weapon?.dispose();this.mimic?.dispose();this.model.dispose();this.group.removeFromParent();}
}
