import { DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, PointLight, RingGeometry, SphereGeometry } from 'three';
import type { GameSnapshot, HazardView } from '../contracts';
import { AssetLibrary, type ModelInstance } from './AssetLibrary';
import { MODEL } from './config';

const SIGNAL={battery:0xa7ee70,shop:0xf1ce8b,alarm:0xe95e4f} as const;
const POOL_COLORS:Record<HazardView['kind'],number>={acid:0x8fc63b,fire:0xec6d29,slime:0x477564,water:0x3a6975,warning:0xed6744};
interface Item {group:Group;model:ModelInstance|null}

export class SceneObjects {
  readonly group=new Group();
  private readonly items=new Map<number,Item>();
  private readonly hazards=new Map<number,Mesh>();
  private readonly pickupGeometry=new SphereGeometry(0.13,6,4);
  private readonly hazardGeometry=new PlaneGeometry(2,2);
  private readonly pickupMaterials={coin:new MeshBasicMaterial({color:0xe8c778}),ammo:new MeshBasicMaterial({color:0xa2dce6}),health:new MeshBasicMaterial({color:0xe68f83})};
  private readonly signalLights:PointLight[]=[];

  constructor(private readonly assets:AssetLibrary,snapshot:GameSnapshot) {
    for(const [point,color] of [[snapshot.world.shop,SIGNAL.shop],[snapshot.world.gate,SIGNAL.battery]] as const) {
      const light=new PointLight(color,28,12,1.5);light.position.set(point.x,2.7,point.z);this.signalLights.push(light);this.group.add(light);
    }
    for(const decoration of snapshot.world.decorations) {
      if(decoration.model===MODEL.shop) continue;
      const model=assets.create(decoration.model);model.root.position.set(decoration.x,0,decoration.z);model.root.rotation.y=decoration.angle;model.root.scale.multiplyScalar(decoration.scale);
      model.root.userData.isDecoration=true;
      this.group.add(model.root);
    }
  }

  update(snapshot:GameSnapshot):void {
    const used=new Set<number>();
    for(const battery of snapshot.batteries) {
      used.add(battery.id);
      const item=this.obtain(battery.id,MODEL.battery);
      item.group.visible=!battery.isCollected;item.group.position.set(battery.x,0,battery.z);item.group.scale.setScalar(0.5);
      item.model?.materials.forEach(material=>{material.emissive.set(battery.isAvailable?SIGNAL.battery:0x384d30);material.emissiveIntensity=battery.isAvailable?0.3:0.06;});
    }
    for(const prop of snapshot.props) {
      used.add(prop.id);const item=this.obtain(prop.id,MODEL[prop.kind]);
      item.group.position.set(prop.x,0,prop.z);item.group.visible=prop.hp>0;
      item.group.rotation.y=prop.kind==='door'?(prop.isActive?0:Math.PI/2):prop.angle;
      if(prop.kind==='door') item.group.scale.set(2.8,1,1);
    }
    for(const pickup of snapshot.pickups) {
      used.add(pickup.id);const item=this.obtain(pickup.id,null,pickup.kind);
      item.group.position.set(pickup.x,0.35+Math.sin(snapshot.elapsed*4+pickup.id)*0.1,pickup.z);
    }
    for(const [id,item] of this.items) {
      if(used.has(id)) continue;
      item.model?.dispose();item.group.removeFromParent();this.items.delete(id);
    }
    this.updateHazards(snapshot);
  }

  private obtain(id:number,modelName:string|null,kind:'coin'|'ammo'|'health'='coin'):Item {
    const existing=this.items.get(id);
    if(existing) return existing;
    const group=new Group(),model=modelName?this.assets.create(modelName):null;
    if(model) group.add(model.root);
    else group.add(new Mesh(this.pickupGeometry,this.pickupMaterials[kind]));
    const item={group,model};this.items.set(id,item);this.group.add(group);return item;
  }

  private updateHazards(snapshot:GameSnapshot):void {
    const used=new Set<number>();
    for(const hazard of snapshot.hazards) {
      used.add(hazard.id);
      const mesh=this.obtainHazard(hazard);
      mesh.position.set(hazard.x,0.07,hazard.z);mesh.scale.set(hazard.radius,hazard.radius,1);
      const material=mesh.material as MeshBasicMaterial;
      material.color.set(POOL_COLORS[hazard.kind]);
      material.opacity=hazard.kind==='warning'?0.35+Math.sin(snapshot.elapsed*16)*0.2:0.35;
    }
    for(const [id,mesh] of this.hazards) {
      if(used.has(id)) continue;
      mesh.removeFromParent();(mesh.material as MeshBasicMaterial).dispose();mesh.geometry.dispose();this.hazards.delete(id);
    }
  }

  private obtainHazard(hazard:HazardView):Mesh {
    const existing=this.hazards.get(hazard.id);
    if(existing) return existing;
    const geometry=new RingGeometry(hazard.kind==='warning'?0.85:0,1,32);
    const mesh=new Mesh(geometry,new MeshBasicMaterial({color:POOL_COLORS[hazard.kind],transparent:true,opacity:0.4,depthWrite:false,side:DoubleSide}));
    mesh.rotation.x=-Math.PI/2;this.hazards.set(hazard.id,mesh);this.group.add(mesh);return mesh;
  }

  dispose():void {
    for(const item of this.items.values()) item.model?.dispose();
    this.items.clear();this.pickupGeometry.dispose();this.hazardGeometry.dispose();
    Object.values(this.pickupMaterials).forEach(material=>material.dispose());
    for(const mesh of this.hazards.values()) {mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();}
    this.hazards.clear();this.group.removeFromParent();
  }
}
