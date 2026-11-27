import { Fog, HemisphereLight, PCFSoftShadowMap, PointLight, Scene, SpotLight, Vector3, WebGLRenderer } from 'three';
import type { Vec2 } from '../contracts';
import { damp, RENDER } from './config';

const MUZZLE_DECAY = 9;
const FOG_NEAR_FACTOR = 0.6;

/** Drives the darkness level (ambient/fill/fog) from the battery count, and carries the flashlight, muzzle and glow lights. */
export class Lighting {
  readonly hemisphere = new HemisphereLight(0x9fb4c2, 0x14100d, RENDER.ambient[0]);
  readonly flashlight = new SpotLight(0xf3ead0, RENDER.flashlightIntensity, 26, RENDER.flashlightAngle, 0.42, RENDER.flashlightDecay);
  readonly muzzleLight = new PointLight(0xffb15c, 0, 7, 1.4);
  readonly explosionLight = new PointLight(0xff8a3c, 0, 12, 1.2);
  private muzzleRemaining = 0;
  private explosionRemaining = 0;
  muzzleScale=1;

  constructor(private readonly scene: Scene, renderer: WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(RENDER.shadowSize, RENDER.shadowSize);
    this.flashlight.shadow.bias = -0.0015;
    this.flashlight.shadow.camera.near = 0.3;
    this.flashlight.shadow.camera.far = 26;
    scene.add(this.hemisphere, this.flashlight, this.flashlight.target, this.muzzleLight, this.explosionLight);
    scene.fog = new Fog(0x070b0d,25,65);
  }

  /** `batteriesCollected` in 0..6 maps to a darkness stage; values beyond the table clamp to the deepest stage. */
  update(options: { batteriesCollected: number; player: Vec2; aim: Vec2; elapsed: number; dt: number }): void {
    const stage = Math.min(RENDER.ambient.length - 1, options.batteriesCollected);
    this.hemisphere.intensity = damp(this.hemisphere.intensity, { target: RENDER.ambient[stage], speed: 1.4, dt: options.dt });
    this.hemisphere.groundColor.set(stage > 3 ? 0x070605 : 0x14100d);
    const fogFar = 40 + RENDER.fill[stage] * 25;
    if (this.scene.fog instanceof Fog) { this.scene.fog.near = fogFar * FOG_NEAR_FACTOR; this.scene.fog.far = fogFar; }
    const dx = options.aim.x - options.player.x;
    const dz = options.aim.z - options.player.z;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    this.flashlight.position.set(options.player.x, RENDER.flashlightHeight, options.player.z);
    this.flashlight.target.position.set(options.player.x + (dx / length) * 6, RENDER.flashlightHeight * 0.6, options.player.z + (dz / length) * 6);
    this.flashlight.target.updateMatrixWorld();
    this.flashlight.intensity = damp(this.flashlight.intensity, { target: RENDER.flashlightIntensity * (0.55 + RENDER.fill[stage] * 0.6), speed: 3, dt: options.dt });
    this.muzzleRemaining = Math.max(0, this.muzzleRemaining - options.dt);
    this.muzzleLight.intensity = this.muzzleRemaining > 0 ? (this.muzzleRemaining / 0.08) * 26 * this.muzzleScale : damp(this.muzzleLight.intensity, { target: 0, speed: MUZZLE_DECAY, dt: options.dt });
    this.explosionRemaining = Math.max(0, this.explosionRemaining - options.dt);
    this.explosionLight.intensity = this.explosionRemaining > 0 ? (this.explosionRemaining / 0.4) * 60 : damp(this.explosionLight.intensity, { target: 0, speed: MUZZLE_DECAY, dt: options.dt });
  }

  flashMuzzle(position: Vector3): void { this.muzzleRemaining = 0.08; this.muzzleLight.position.copy(position); }
  flashExplosion(position: Vector3): void { this.explosionRemaining = 0.4; this.explosionLight.position.copy(position); }
}
