import { AnimationMixer, Box3, Group, Material, Mesh, MeshStandardMaterial, SkinnedMesh, Texture, Vector3 } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameSnapshot } from '../contracts';
import { ENEMY_MODELS, MODEL, WEAPON_MODELS } from './config';

const URLS = import.meta.glob<string>('/assets-tuned/*.glb', { query: '?url', import: 'default', eager: true });
const LOAD_CONCURRENCY = 4;
interface Asset { gltf: GLTF; bounds: Box3; size: Vector3 }
export interface ModelInstance { root: Group; asset: Asset; mixer: AnimationMixer; materials: MeshStandardMaterial[]; dispose: () => void }

export class AssetLibrary {
  private readonly loader = new GLTFLoader();
  private readonly assets = new Map<string, Asset>();
  private readonly failures: string[] = [];
  private disposed = false;

  async initialize(snapshot: GameSnapshot, progress?: (message: string) => void): Promise<void> {
    const core = [MODEL.player, WEAPON_MODELS.pistol, MODEL.battery, MODEL.shop, ENEMY_MODELS.bug];
    const rest = [...Object.values(ENEMY_MODELS), ...Object.values(WEAPON_MODELS), ...Object.values(MODEL),
      ...snapshot.world.decorations.map((decoration) => decoration.model)];
    await this.loadBatch(core, progress);
    await this.loadBatch([...new Set(rest)].filter((name) => !this.assets.has(name)), progress);
    if (this.failures.length) throw new Error(`本地模型加载失败：${this.failures.join('、')}。请检查 assets-tuned 文件是否完整。`);
  }

  private async loadBatch(names: string[], progress?: (message: string) => void): Promise<void> {
    const queue = [...names];
    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, async () => {
      while (queue.length && !this.disposed) {
        const name = queue.shift();
        if (name) await this.loadOne(name, progress);
      }
    }));
  }

  private async loadOne(name: string, progress?: (message: string) => void): Promise<void> {
    const key = `/assets-tuned/${name.replace(/\.glb$/, '')}.glb`;
    const url = URLS[key];
    if (!url) { this.failures.push(name); return; }
    try {
      progress?.(`正在连接巢穴资产 · ${name} (${this.assets.size + 1})`);
      const gltf = await this.loader.loadAsync(url);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = !(object instanceof SkinnedMesh);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (material instanceof MeshStandardMaterial) {
              material.roughness = Math.max(material.roughness, 0.68);
              material.metalness = Math.min(material.metalness, 0.45);
            }
          }
        }
      });
      const bounds = new Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new Vector3());
      if (this.disposed) this.disposeRoot(gltf.scene);
      else this.assets.set(name, { gltf, bounds, size });
    } catch (error) {
      this.failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  create(name: string): ModelInstance {
    const asset = this.assets.get(name);
    if (!asset) throw new Error(`模型尚未加载：${name}`);
    const root = clone(asset.gltf.scene) as Group;
    const materials: MeshStandardMaterial[] = [];
    const copies = new Map<Material, Material>();
    root.traverse((object) => {
      if (object instanceof Mesh) {
        const copy = (material: Material): Material => {
          const existing = copies.get(material);
          if (existing) return existing;
          const result = material.clone();
          copies.set(material, result);
          if (result instanceof MeshStandardMaterial) materials.push(result);
          return result;
        };
        object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
      }
    });
    const mixer = new AnimationMixer(root);
    return { root, asset, mixer, materials, dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      copies.forEach((material) => material.dispose());
      const skeletons = new Set<SkinnedMesh['skeleton']>();
      root.traverse((object) => { if (object instanceof SkinnedMesh) skeletons.add(object.skeleton); });
      skeletons.forEach((skeleton) => skeleton.dispose());
      root.removeFromParent();
    } };
  }

  getDiagnostics(): object {
    return { loaded: this.assets.size, failed: [...this.failures], disposed: this.disposed,
      models: [...this.assets].map(([name, asset]) => ({ name, size: asset.size.toArray(), animations: asset.gltf.animations.map((clip) => clip.name) })) };
  }

  dispose(): void {
    this.disposed = true;
    this.assets.forEach((asset) => this.disposeRoot(asset.gltf.scene));
    this.assets.clear();
  }

  private disposeRoot(root: Group): void {
    const geometries = new Set<Mesh['geometry']>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    root.traverse((object) => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material)) { if (value instanceof Texture) textures.add(value); }
        }
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
  }
}
