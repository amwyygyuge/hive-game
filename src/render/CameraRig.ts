import { OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three';
import type { Vec2 } from '../contracts';
import { damp, RENDER } from './config';

const PITCH = Math.PI / 180 * 55;
const AIM_PLANE_HEIGHT = 0.45;

/** Oblique cinematic top-down follow camera: orthographic, fixed ~55° pitch, smoothed lead toward the aim point. */
export class CameraRig {
  readonly camera = new OrthographicCamera();
  private readonly target = new Vector3();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private aspect = 1;

  constructor(private readonly container: HTMLElement) {
    this.camera.near = 0.1;
    this.camera.far = RENDER.far;
    this.resize();
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.aspect = width / height;
    const viewHeight = Math.max(RENDER.viewHeight, RENDER.minViewWidth / this.aspect);
    this.camera.left = (-viewHeight * this.aspect) / 2;
    this.camera.right = (viewHeight * this.aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  update(options: { player: Vec2; aim: Vec2; dt: number }): void {
    const leadX = damp(0, { target: (options.aim.x - options.player.x) * 0.18, speed: 6, dt: options.dt });
    const leadZ = damp(0, { target: (options.aim.z - options.player.z) * 0.18, speed: 6, dt: options.dt });
    this.target.set(
      damp(this.target.x, { target: options.player.x + leadX, speed: RENDER.cameraFollow, dt: options.dt }),
      0,
      damp(this.target.z, { target: options.player.z + leadZ, speed: RENDER.cameraFollow, dt: options.dt }),
    );
    this.camera.position.set(this.target.x, RENDER.cameraHeight, this.target.z + RENDER.cameraBack);
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.camera.rotation.x = -PITCH;
  }

  aimFromScreen(clientX: number, clientY: number): Vec2 {
    const rect = this.container.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    const travel = direction.y === 0 ? 0 : (AIM_PLANE_HEIGHT - origin.y) / direction.y;
    return { x: origin.x + direction.x * travel, z: origin.z + direction.z * travel };
  }
}
