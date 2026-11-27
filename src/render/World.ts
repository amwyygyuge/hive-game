import {
  BoxGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  PlaneGeometry, PointLight, Quaternion, RingGeometry, Scene, Vector3,
} from 'three';
import type { GameSnapshot, GatePhase, WallView } from '../contracts';
import type { AssetLibrary } from './AssetLibrary';
import { MODEL } from './config';
import { applyWallCutaway, type WallFxUniforms } from './MaterialEffects';
import type { ProceduralTextures } from './ProceduralTextures';

const WALL_CUT_HEIGHT = 1.6;
const LAMP_SPACING = 9;
const LAMP_POOL = 10;
const TIER_TINT = [0x6b7a80, 0x6d6a78, 0x7a6060];

interface Lamp { position: Vector3; power: number; flicker: number; region: number }

/** Builds the static industrial scenery: floor, cutaway walls, wall-mounted lamps, shop pad and gate frame. */
export class World {
  readonly group = new Group();
  readonly lamps: Lamp[] = [];
  readonly wallUniforms: WallFxUniforms;
  private readonly lampLights: PointLight[] = [];
  private readonly lampGlows: Mesh[] = [];
  private readonly gatePanels:Group[]=[];

  constructor(options: { scene: Scene; snapshot: GameSnapshot; textures: ProceduralTextures; assets: AssetLibrary }) {
    const { scene, snapshot, textures, assets } = options;
    scene.add(this.group);
    this.buildFloor(snapshot, textures);
    this.wallUniforms = this.buildWalls(snapshot.world.walls, textures);
    this.buildLamps(snapshot);
    this.buildShop(snapshot, assets);
    this.buildGate(snapshot, assets);
  }

  private buildFloor(snapshot: GameSnapshot, textures: ProceduralTextures): void {
    const base = textures.floor.clone();
    base.needsUpdate = true;
    base.repeat.set(snapshot.world.width / 4, snapshot.world.depth / 4);
    const floor = new Mesh(new PlaneGeometry(snapshot.world.width, snapshot.world.depth),
      new MeshStandardMaterial({ map: base, roughness: 0.95, metalness: 0.08, color: 0x9aa3a6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
    for (const region of snapshot.world.regions) {
      const plate = new Mesh(new PlaneGeometry(region.width, region.depth),
        new MeshStandardMaterial({ color: TIER_TINT[Math.min(region.tier, TIER_TINT.length - 1)], roughness: 0.92, transparent: true, opacity: 0.22 }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(region.x, 0.02, region.z);
      this.group.add(plate);
    }
  }

  private buildWalls(walls: readonly WallView[], textures: ProceduralTextures): WallFxUniforms {
    const material = new MeshStandardMaterial({ map: textures.wall, roughness: 0.88, metalness: 0.18, color: 0xaab0b2 });
    const uniforms = applyWallCutaway(material, WALL_CUT_HEIGHT);
    const instanced = new InstancedMesh(new BoxGeometry(1, 1, 1), material, walls.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    const identity = new Quaternion();
    walls.forEach((wall, index) => {
      const matrix = new Matrix4().compose(
        new Vector3(wall.x, wall.height / 2, wall.z),
        identity,
        new Vector3(wall.width, wall.height, wall.depth),
      );
      instanced.setMatrixAt(index, matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    this.group.add(instanced);
    return uniforms;
  }

  private buildLamps(snapshot: GameSnapshot): void {
    const { width, depth } = snapshot.world;
    const columns = Math.max(1, Math.round(width / LAMP_SPACING));
    const rows = Math.max(1, Math.round(depth / LAMP_SPACING));
    for (const row of Array.from({ length: rows }, (_, value) => value)) {
      for (const column of Array.from({ length: columns }, (_, value) => value)) {
        const x = -width / 2 + (column + 0.5) * (width / columns);
        const z = -depth / 2 + (row + 0.5) * (depth / rows);
        const region = snapshot.world.regions.find((candidate) =>
          Math.abs(candidate.x - x) < candidate.width / 2 && Math.abs(candidate.z - z) < candidate.depth / 2);
        if(region) this.lamps.push({ position: new Vector3(x, 3.2, z), power: 1, flicker: 0, region: region.id });
      }
    }
    const glowMaterial = new MeshStandardMaterial({ color: 0x93b5ba, emissive: 0x93b5ba, emissiveIntensity: 0.5, transparent: true, opacity: 0.65 });
    for (const _index of Array.from({ length: LAMP_POOL }, (_, value) => value)) {
      const light = new PointLight(0xffe3bf, 0, 10, 1.6);
      light.castShadow = false;
      this.group.add(light);
      this.lampLights.push(light);
      const glow = new Mesh(new PlaneGeometry(0.85, 0.045), glowMaterial.clone());
      glow.material.side = DoubleSide;
      this.group.add(glow);
      this.lampGlows.push(glow);
    }
  }

  private buildShop(snapshot: GameSnapshot, assets: AssetLibrary): void {
    const console = assets.create(MODEL.shop);
    console.root.position.set(snapshot.world.shop.x, 0, snapshot.world.shop.z);
    console.root.scale.setScalar(1.3);
    this.group.add(console.root);
    const ring = new Mesh(new RingGeometry(1.5, 1.57, 40), new MeshStandardMaterial({ color: 0xb0a274, emissive: 0xb0a274, emissiveIntensity: 0.2, side: DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(snapshot.world.shop.x, 0.03, snapshot.world.shop.z);
    this.group.add(ring);
  }

  private buildGate(snapshot: GameSnapshot, assets: AssetLibrary): void {
    for (const side of [-1.4, 1.4]) {
      const panel = assets.create(MODEL.gate);
      panel.root.scale.set(2.8, 1.3, 1.3);
      panel.root.position.set(snapshot.world.gate.x + side,0,snapshot.world.gate.z);
      this.group.add(panel.root);
      this.gatePanels.push(panel.root);
    }
    const beacon = assets.create(MODEL.battery);
    beacon.root.scale.setScalar(0.55);
    beacon.root.position.set(snapshot.world.gate.x, 0, snapshot.world.gate.z - 2.4);
    this.group.add(beacon.root);
  }

  updateGate(phase:GatePhase):void {
    for(const panel of this.gatePanels) panel.position.y=phase==='open'?5:0;
  }

  /** Reassigns the pooled lamp lights/glows to the nearest powered lamps each frame and updates flicker. */
  updateLamps(options: { player: Vector3; power: readonly number[]; elapsed: number }): void {
    const nearest = this.lamps
      .map((lamp) => ({ lamp, distance: lamp.position.distanceTo(options.player) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, this.lampLights.length);
    nearest.forEach((entry, index) => {
      const power = entry.lamp.region >= 0 ? (options.power[entry.lamp.region] ?? 1) : 1;
      const flicker = power > 0.05 && power < 0.95 ? 0.65 + Math.sin(options.elapsed * 14 + entry.lamp.position.x) * 0.35 : 1;
      const intensity = power * flicker * 5.5;
      const light = this.lampLights[index];
      const glow = this.lampGlows[index];
      light.position.copy(entry.lamp.position);
      light.intensity = intensity;
      const color=entry.lamp.region%3===0?0xd25349:0x9abcc1;
      light.color.set(color);
      (glow.material as MeshStandardMaterial).emissive.set(color);
      glow.position.set(entry.lamp.position.x, entry.lamp.position.y, entry.lamp.position.z);
      glow.lookAt(options.player.x, entry.lamp.position.y, options.player.z);
      (glow.material as MeshStandardMaterial).opacity = Math.min(1, intensity * 0.22);
    });
    for (const index of Array.from({ length: this.lampLights.length - nearest.length }, (_, value) => value + nearest.length)) {
      this.lampLights[index].intensity = 0;
      (this.lampGlows[index].material as MeshStandardMaterial).opacity = 0;
    }
  }
}
