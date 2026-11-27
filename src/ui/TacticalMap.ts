import type { GameSnapshot, Vec2 } from '../contracts';

const MAP = {
  size: 208, padding: 12, wall: '#5b6867', floor: '#172325', grid: '#253335',
  player: '#edf8ef', objective: '#b3ef71', locked: '#6e7c63', danger: '#d47164',
  shop: '#e4c18b', corpse: '#543338', background: '#091215',
  pointRadius: 3, playerRadius: 4, viewRange: 10,
} as const;

export class TacticalMap {
  private readonly context: CanvasRenderingContext2D;
  private isExpanded = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建战术地图画布');
    this.context = context;
    canvas.width = MAP.size;
    canvas.height = MAP.size;
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.canvas.closest('.map-panel')?.classList.toggle('expanded', this.isExpanded);
  }

  draw(snapshot: GameSnapshot): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, MAP.size, MAP.size);
    ctx.fillStyle = MAP.background;
    ctx.fillRect(0, 0, MAP.size, MAP.size);
    const scale = (MAP.size - MAP.padding * 2) / Math.max(snapshot.world.width, snapshot.world.depth);
    ctx.save();
    ctx.translate(MAP.size / 2, MAP.size / 2);
    ctx.scale(scale, scale);
    this.drawStructure(snapshot);
    this.drawObjectives(snapshot, scale);
    this.drawPlayer(snapshot, scale);
    ctx.restore();
  }

  private drawStructure(snapshot: GameSnapshot): void {
    const ctx = this.context;
    for (const room of snapshot.world.regions) {
      ctx.fillStyle = MAP.floor;
      ctx.fillRect(room.x - room.width / 2, room.z - room.depth / 2, room.width, room.depth);
      ctx.strokeStyle = MAP.grid;
      ctx.lineWidth = 0.25;
      ctx.strokeRect(room.x - room.width / 2, room.z - room.depth / 2, room.width, room.depth);
    }
    ctx.fillStyle = MAP.wall;
    for (const wall of snapshot.world.walls) {
      ctx.fillRect(wall.x - wall.width / 2, wall.z - wall.depth / 2, wall.width, wall.depth);
    }
  }

  private drawObjectives(snapshot: GameSnapshot, scale: number): void {
    for (const battery of snapshot.batteries) {
      if (battery.isCollected) continue;
      this.drawPoint(battery, { color: battery.isAvailable ? MAP.objective : MAP.locked, radius: MAP.pointRadius / scale });
    }
    this.drawPoint(snapshot.world.shop, { color: MAP.shop, radius: MAP.pointRadius / scale });
    this.drawPoint(snapshot.world.gate, { color: MAP.objective, radius: MAP.pointRadius / scale });
    for (const enemy of snapshot.enemies) {
      const distance = Math.hypot(enemy.x - snapshot.player.x, enemy.z - snapshot.player.z);
      if (enemy.isDead || distance > MAP.viewRange) continue;
      this.drawPoint(enemy, { color: MAP.danger, radius: 1 / scale });
    }
  }

  private drawPlayer(snapshot: GameSnapshot, scale: number): void {
    const ctx = this.context;
    ctx.save();
    ctx.translate(snapshot.player.x, snapshot.player.z);
    ctx.rotate(-snapshot.player.angle);
    ctx.fillStyle = MAP.player;
    const radius = MAP.playerRadius / scale;
    ctx.beginPath();
    ctx.moveTo(0, radius * 1.7);
    ctx.lineTo(-radius, -radius);
    ctx.lineTo(radius, -radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawPoint(point: Vec2, style: { color: string; radius: number }): void {
    this.context.fillStyle = style.color;
    this.context.beginPath();
    this.context.arc(point.x, point.z, style.radius, 0, Math.PI * 2);
    this.context.fill();
  }
}
