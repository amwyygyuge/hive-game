import type { Vec2, WallView } from '../contracts';
import { unit } from './SampleSynth';
import { AudioGraph } from './AudioGraph';
import { SoundBank } from './SoundBank';
import type { SoundId } from './types';

const MAX_VOICES = 40;
const CULL_GAIN = 0.003;
const RATE_LIMIT_SECONDS = 0.025;
const OPEN_CUTOFF = 18000;
const WALL_CUTOFF = 850;
const WALL_GAIN = 0.62;
const REFERENCE_DISTANCE = 4;
export interface SpatialMix { gain: number; pan: number; cutoff: number }
export interface PlaySound {
  id: SoundId; position?: Vec2; range?: number; gain?: number; rate?: number;
  priority?: number; pan?: number; delay?: number; duration?: number;
}
interface Voice { source: AudioBufferSourceNode; nodes: readonly AudioNode[]; priority: number; started: number }

/** Top-down equal-power stereo, inverse-square distance, and slab-tested wall occlusion. */
export class SpatialPlayer {
  private listener: Vec2 = { x: 0, z: 0 };
  private walls: readonly WallView[] = [];
  private readonly voices = new Set<Voice>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private rate = 1;
  private readonly right: Vec2;

  constructor(private readonly options: { graph: AudioGraph; bank: SoundBank; screenRight: Vec2 }) {
    const magnitude = Math.hypot(options.screenRight.x, options.screenRight.z) || 1;
    this.right = { x: options.screenRight.x / magnitude, z: options.screenRight.z / magnitude };
  }
  get activeVoices(): number { return this.voices.size; }
  setScene(options: { listener: Vec2; walls: readonly WallView[]; rate: number }): void {
    this.listener = options.listener;
    this.walls = options.walls;
    this.rate = options.rate;
  }
  mix(position: Vec2, range: number): SpatialMix {
    const dx = position.x - this.listener.x;
    const dz = position.z - this.listener.z;
    const distance = Math.hypot(dx, dz);
    const falloff = (1 - unit(distance / range)) ** 1.2 / (1 + (distance / REFERENCE_DISTANCE) ** 1.2);
    const blocked = distance > 0.5 && this.walls.some((wall) => this.intersects({ source: position, wall }));
    return {
      gain: falloff * (blocked ? WALL_GAIN : 1),
      pan: Math.max(-0.95, Math.min(0.95, (dx * this.right.x + dz * this.right.z) / Math.max(3, distance))),
      cutoff: blocked ? WALL_CUTOFF : OPEN_CUTOFF,
    };
  }
  play(options: PlaySound): void {
    const context = this.options.graph.context;
    const now = context.currentTime;
    const mix = options.position ? this.mix(options.position, options.range ?? 24) : { gain: 1, pan: 0, cutoff: OPEN_CUTOFF };
    const gain = mix.gain * (options.gain ?? 1);
    const priority = options.priority ?? 2;
    if (context.state !== 'running' || gain < CULL_GAIN || now - (this.lastPlayed.get(options.id) ?? -Infinity) < RATE_LIMIT_SECONDS || !this.reserve(priority)) return;
    const buffer = this.options.bank.acquire(options.id);
    if (!buffer) return;
    this.lastPlayed.set(options.id, now);
    const source = context.createBufferSource();
    const volume = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = (options.rate ?? 1) * this.rate;
    volume.gain.value = gain;
    filter.type = 'lowpass';
    filter.frequency.value = mix.cutoff;
    filter.Q.value = 0.5;
    pan.pan.value = options.pan ?? mix.pan;
    source.connect(volume).connect(filter).connect(pan).connect(this.options.graph.effects);
    const voice: Voice = { source, nodes: [source, volume, filter, pan], priority, started: now };
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    source.start(now + (options.delay ?? 0));
    if (options.duration !== undefined) source.stop(now + (options.delay ?? 0) + options.duration);
  }
  stopAll(): void {
    this.voices.forEach((voice) => { voice.source.stop(); this.release(voice); });
    this.lastPlayed.clear();
  }
  private release(voice: Voice): void {
    voice.source.onended = null;
    voice.nodes.forEach((node) => node.disconnect());
    this.voices.delete(voice);
  }
  private reserve(priority: number): boolean {
    if (this.voices.size < MAX_VOICES) return true;
    const candidate = [...this.voices].sort((first, second) => first.priority - second.priority || first.started - second.started)[0];
    if (!candidate || candidate.priority > priority) return false;
    candidate.source.stop();
    this.release(candidate);
    return true;
  }
  private intersects(options: { source: Vec2; wall: WallView }): boolean {
    const wall = options.wall;
    const x = this.slab({ origin: this.listener.x, delta: options.source.x - this.listener.x, center: wall.x, half: wall.width / 2 });
    const z = this.slab({ origin: this.listener.z, delta: options.source.z - this.listener.z, center: wall.z, half: wall.depth / 2 });
    return Math.max(x[0], z[0], 0.015) < Math.min(x[1], z[1], 0.985);
  }
  private slab(options: { origin: number; delta: number; center: number; half: number }): readonly [number, number] {
    if (Math.abs(options.delta) < 0.00001) return Math.abs(options.origin - options.center) <= options.half ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const first = (options.center - options.half - options.origin) / options.delta;
    const second = (options.center + options.half - options.origin) / options.delta;
    return [Math.min(first, second), Math.max(first, second)];
  }
}
