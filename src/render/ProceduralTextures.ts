import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const TEXTURE_SIZE = 256;
const TILE_GRID = 64;
export class ProceduralTextures {
  private seed = 28741;
  readonly floor = this.makeFloor();
  readonly wall = this.makeWall();
  readonly glow = this.makeGlow();
  readonly blood = this.makeBlood();
  private readonly textures = [this.floor, this.wall, this.glow, this.blood];

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private canvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建程序化纹理');
    return { canvas, context };
  }

  private finish(canvas: HTMLCanvasElement): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }

  private noise(context: CanvasRenderingContext2D): void {
    for (const index of Array.from({ length: 6400 }, (_, value) => value)) {
      const shade = 25 + Math.floor(this.random() * 45);
      context.fillStyle = `rgba(${shade},${shade + 6},${shade + 8},.26)`;
      context.fillRect((index % 80) * 3.2, Math.floor(index / 80) * 3.2, 3, 3);
    }
  }

  private makeFloor(): CanvasTexture {
    const { canvas, context } = this.canvas();
    context.fillStyle = '#526066';
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    this.noise(context);
    for (const row of [0, 1, 2, 3]) {
      for (const column of [0, 1, 2, 3]) {
        const x = row * TILE_GRID;
        const y = column * TILE_GRID;
        context.strokeStyle = '#1b292e';
        context.lineWidth = 2;
        context.strokeRect(x + 1, y + 1, TILE_GRID - 2, TILE_GRID - 2);
        context.strokeStyle = '#758081';
        context.lineWidth = 0.7;
        context.strokeRect(x + 4, y + 4, TILE_GRID - 8, TILE_GRID - 8);
        context.fillStyle = '#182328';
        for (const corner of [[7, 7], [57, 7], [7, 57], [57, 57]]) {
          context.fillRect(x + corner[0], y + corner[1], 2, 2);
        }
      }
    }
    for (const _ of Array.from({ length: 50 })) {
      void _;
      context.strokeStyle = 'rgba(10,18,20,.22)';
      context.beginPath();
      context.moveTo(this.random() * TEXTURE_SIZE, this.random() * TEXTURE_SIZE);
      context.lineTo(this.random() * TEXTURE_SIZE, this.random() * TEXTURE_SIZE);
      context.stroke();
    }
    return this.finish(canvas);
  }

  private makeWall(): CanvasTexture {
    const { canvas, context } = this.canvas();
    context.fillStyle = '#586065';
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    this.noise(context);
    context.fillStyle = '#26343a';
    context.fillRect(0, 180, TEXTURE_SIZE, 76);
    context.fillStyle = '#928057';
    context.fillRect(0, 180, TEXTURE_SIZE, 14);
    for (const index of Array.from({ length: 12 }, (_, value) => value)) {
      context.fillStyle = '#273034';
      context.beginPath();
      context.moveTo(index * 25, 180);
      context.lineTo(index * 25 + 12, 180);
      context.lineTo(index * 25 - 2, 194);
      context.lineTo(index * 25 - 14, 194);
      context.fill();
    }
    context.strokeStyle = '#202c32';
    context.lineWidth = 3;
    context.strokeRect(2, 2, 252, 252);
    return this.finish(canvas);
  }

  private makeGlow(): CanvasTexture {
    const { canvas, context } = this.canvas();
    const center = TEXTURE_SIZE / 2;
    const gradient = context.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0, 'rgba(255,255,255,.7)');
    gradient.addColorStop(0.25, 'rgba(255,255,255,.38)');
    gradient.addColorStop(0.65, 'rgba(255,255,255,.09)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
    return this.finish(canvas);
  }

  private makeBlood(): CanvasTexture {
    const { canvas, context } = this.canvas();
    for (const index of Array.from({ length: 85 }, (_, value) => value)) {
      const angle = this.random() * Math.PI * 2;
      const distance = Math.pow(this.random(), 1.5) * 105;
      const radius = index < 12 ? 24 : 2 + this.random() * 13;
      context.fillStyle = `rgba(255,255,255,${0.35 + this.random() * 0.6})`;
      context.beginPath();
      context.ellipse(128 + Math.cos(angle) * distance, 128 + Math.sin(angle) * distance,
        radius, radius * 0.6, angle, 0, Math.PI * 2);
      context.fill();
    }
    return this.finish(canvas);
  }

  dispose(): void { this.textures.forEach((texture) => texture.dispose()); }
}
