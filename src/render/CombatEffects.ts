import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, Quaternion, Scene, Vector3, BoxGeometry } from 'three';
import type { GameEvent, GameSnapshot } from '../contracts';
import { BLOOD_GREEN } from './config';
import type { ProceduralTextures } from './ProceduralTextures';

const FX={particles:320,stains:800,shots:512,gravity:5,ground:0.045,particleLife:0.5} as const;
interface Particle {life:number;vx:number;vy:number;vz:number}

export class CombatEffects {
  private readonly positions=new Float32Array(FX.particles*3);
  private readonly colors=new Float32Array(FX.particles*3);
  private readonly particles:Particle[]=Array.from({length:FX.particles},()=>({life:0,vx:0,vy:0,vz:0}));
  private readonly geometry=new BufferGeometry();
  private readonly points:Points;
  private readonly stains:InstancedMesh;
  private readonly shots:InstancedMesh;
  private readonly matrix=new Matrix4();
  private readonly position=new Vector3();
  private readonly rotation=new Quaternion();
  private readonly scale=new Vector3();
  private particleCursor=0;
  private stainCursor=0;
  private regions:GameSnapshot['world']['regions']=[];

  constructor(scene:Scene,textures:ProceduralTextures) {
    this.geometry.setAttribute('position',new BufferAttribute(this.positions,3));
    this.geometry.setAttribute('color',new BufferAttribute(this.colors,3));
    this.points=new Points(this.geometry,new PointsMaterial({size:0.09,vertexColors:true,transparent:true,opacity:0.9,depthWrite:false}));
    this.points.frustumCulled=false;
    this.stains=new InstancedMesh(new PlaneGeometry(1,1),new MeshBasicMaterial({map:textures.blood,transparent:true,opacity:0.8,depthWrite:false,side:DoubleSide}),FX.stains);
    this.stains.count=0;this.stains.frustumCulled=false;
    this.shots=new InstancedMesh(new BoxGeometry(0.045,0.045,1),new MeshBasicMaterial({color:0xffffff}),FX.shots);
    this.shots.count=0;this.shots.frustumCulled=false;
    scene.add(this.points,this.stains,this.shots);
  }

  seedScenery(snapshot:GameSnapshot):void {
    this.regions=snapshot.world.regions;
    this.paintScenery();
  }

  private paintScenery():void {
    for(const region of this.regions) {
      if(region.width<8||region.depth<8) continue;
      for(const index of Array.from({length:region.tier*5},(_,i)=>i)) {
        const x=region.x+Math.sin(index*5.7+region.id)*region.width*0.35;
        const z=region.z+Math.cos(index*3.3+region.id)*region.depth*0.35;
        this.splat({type:'kill',x,z,kind:index%3===0?'bug':'ghoul'});
      }
    }
  }

  update(snapshot:GameSnapshot,args:{dt:number;events:readonly GameEvent[]}):void {
    for(const event of args.events) this.consume(event);
    this.animateParticles(args.dt);
    this.drawShots(snapshot);
  }

  private consume(event:GameEvent):void {
    switch(event.type) {
      case 'kill':case 'execute':this.splat(event);this.burst(event,18);break;
      case 'sever':this.splat(event);this.burst(event,12);break;
      case 'hit':this.burst(event,5);break;
      case 'explosion':this.burst(event,36);break;
      case 'shot':this.burst(event,2);break;
      default:break;
    }
  }

  private burst(event:GameEvent,count:number):void {
    const color=new Color(event.type==='shot'?0xd5ac6b:event.type==='explosion'?0xff9654:event.kind&&BLOOD_GREEN.has(event.kind)?0x8ed94b:0xbf3d43);
    for(const index of Array.from({length:count},(_,i)=>i)) {
      const slot=this.particleCursor++%FX.particles,particle=this.particles[slot],offset=slot*3;
      const angle=(index*2.399+this.particleCursor)*Math.PI;
      particle.life=FX.particleLife;particle.vx=Math.sin(angle)*2;particle.vz=Math.cos(angle)*2;particle.vy=2+index%3;
      this.positions[offset]=event.x;this.positions[offset+1]=0.8;this.positions[offset+2]=event.z;
      this.colors[offset]=color.r;this.colors[offset+1]=color.g;this.colors[offset+2]=color.b;
    }
    this.geometry.attributes.color.needsUpdate=true;
  }

  private splat(event:GameEvent):void {
    const slot=this.stainCursor++%FX.stains;
    this.position.set(event.x,FX.ground+slot*0.00001,event.z);
    this.rotation.setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
    this.scale.set(1.4+slot%3*0.2,1.2+slot%2*0.3,1);
    this.matrix.compose(this.position,this.rotation,this.scale);this.stains.setMatrixAt(slot,this.matrix);
    this.stains.setColorAt(slot,new Color(event.kind&&BLOOD_GREEN.has(event.kind)?0x6c8b35:0xa6363e));
    this.stains.count=Math.min(FX.stains,this.stainCursor);this.stains.instanceMatrix.needsUpdate=true;
    if(this.stains.instanceColor) this.stains.instanceColor.needsUpdate=true;
  }

  private animateParticles(dt:number):void {
    for(const [index,particle] of this.particles.entries()) {
      const offset=index*3;particle.life-=dt;
      if(particle.life<=0) {this.positions[offset+1]=-99;continue;}
      particle.vy-=FX.gravity*dt;
      this.positions[offset]+=particle.vx*dt;this.positions[offset+1]+=particle.vy*dt;this.positions[offset+2]+=particle.vz*dt;
    }
    this.geometry.attributes.position.needsUpdate=true;
  }

  private drawShots(snapshot:GameSnapshot):void {
    const visible=snapshot.projectiles.slice(0,FX.shots);
    for(const [index,shot] of visible.entries()) {
      this.position.set(shot.x,0.75,shot.z);this.rotation.setFromAxisAngle(new Vector3(0,1,0),shot.angle);
      this.scale.set(shot.isRocket?4:1,shot.isRocket?4:1,shot.isEnemy?0.3:0.65);
      this.matrix.compose(this.position,this.rotation,this.scale);this.shots.setMatrixAt(index,this.matrix);
      this.shots.setColorAt(index,new Color(shot.isEnemy?0x9aff55:shot.isRocket?0xff8754:0xffe3ab));
    }
    this.shots.count=visible.length;this.shots.instanceMatrix.needsUpdate=true;
    if(this.shots.instanceColor) this.shots.instanceColor.needsUpdate=true;
  }

  reset():void {this.stains.count=0;this.stainCursor=0;this.particles.forEach(p=>p.life=0);this.paintScenery();}
  dispose():void {
    for(const mesh of [this.stains,this.shots,this.points]) {mesh.removeFromParent();mesh.geometry.dispose();(mesh.material as MeshBasicMaterial|PointsMaterial).dispose();}
  }
}
