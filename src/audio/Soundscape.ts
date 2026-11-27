import type { EnemyView, GameSnapshot, Vec2 } from '../contracts';
import { AudioGraph, SmoothParam } from './AudioGraph';
import { SoundBank } from './SoundBank';
import { SpatialPlayer, type SpatialMix } from './SpatialPlayer';
import { SCENES, type MusicState, type SceneId } from './types';
import { unit } from './SampleSynth';

const BOSS_HEARTBEAT_RANGE = 20;
const LOW_HP = 30;
const HEARTBEAT_LOOKAHEAD = 0.06;
interface SceneLoop { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode; volume: SmoothParam; cutoff: SmoothParam; panning: SmoothParam; target: number }
const centered = (gain: number): SpatialMix => ({ gain, pan: 0, cutoff: 14000 });

export class Soundscape {
  private readonly loops = new Map<SceneId, SceneLoop>();
  private nextHeartbeat = 0;

  constructor(private readonly options: { graph: AudioGraph; bank: SoundBank; player: SpatialPlayer }) {
    const context = options.graph.context;
    SCENES.forEach((id, index) => {
      const buffer = options.bank.loops.get(id);
      if (!buffer) throw new Error(`Missing composed soundscape: ${id}`);
      const source = context.createBufferSource();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();
      const pan = context.createStereoPanner();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      const bus = ['swarm', 'wormRubble', 'slugDrag'].includes(id) ? options.graph.effects : options.graph.ambience;
      source.connect(gain).connect(filter).connect(pan).connect(bus);
      source.start(context.currentTime + 0.06, index * 0.31 % buffer.duration);
      this.loops.set(id, { source, gain, filter, pan, volume: new SmoothParam(gain.gain), cutoff: new SmoothParam(filter.frequency), panning: new SmoothParam(pan.pan), target: 0 });
    });
  }
  get activeLoops(): readonly string[] { return [...this.loops].filter(([, loop]) => loop.target > 0.005).map(([id]) => `scene.${id}`); }

  update(snapshot: GameSnapshot, state: MusicState): void {
    const now = this.options.graph.context.currentTime;
    const ending = state === 'dead' || state === 'won';
    const mixes = this.sceneMixes(snapshot);
    this.loops.forEach((loop, id) => {
      const mix = mixes[id];
      loop.target = ending ? 0 : mix.gain;
      loop.volume.to({ value: loop.target, now, seconds: ending ? 0.5 : 1.5 });
      loop.panning.to({ value: mix.pan, now, seconds: 0.2 });
      loop.cutoff.to({ value: mix.cutoff, now, seconds: 0.2 });
    });
    if (!ending && snapshot.phase !== 'ready') this.heartbeat(snapshot, state);
  }
  dispose(): void {
    this.loops.forEach((loop) => {
      loop.source.stop();
      [loop.source, loop.gain, loop.filter, loop.pan].forEach((node) => node.disconnect());
    });
    this.loops.clear();
  }
  private sceneMixes(snapshot: GameSnapshot): Record<SceneId, SpatialMix> {
    const player = snapshot.player;
    const boss = (kind: 'worm' | 'slug'): EnemyView | undefined => snapshot.enemies.find((enemy) => !enemy.isDead && enemy.kind === kind);
    const worm = boss('worm');
    const slug = boss('slug');
    const bugs = snapshot.enemies.filter((enemy) => !enemy.isDead && enemy.kind === 'bug' && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 20);
    const center = bugs.reduce((point, enemy) => ({ x: point.x + enemy.x / bugs.length, z: point.z + enemy.z / bugs.length }), { x: 0, z: 0 });
    const slime = snapshot.hazards.find((hazard) => ['slime', 'acid', 'water'].includes(hazard.kind) && Math.hypot(hazard.x - player.x, hazard.z - player.z) < 10);
    const bones = snapshot.world.decorations.find((prop) => prop.model.includes('skull') && Math.hypot(prop.x - player.x, prop.z - player.z) < 14);
    const corpse = snapshot.enemies.find((enemy) => enemy.isDead && Math.hypot(enemy.x - player.x, enemy.z - player.z) < 7);
    const shopMix = this.options.player.mix(snapshot.world.shop, 13);
    return {
      air: centered(snapshot.batteriesCollected >= 3 ? 0.24 : 0.45),
      drips: centered(snapshot.batteriesCollected >= 3 ? 0.38 : 0.28),
      electric: centered(0.1 + snapshot.batteriesCollected * 0.1),
      flies: bones || corpse ? this.options.player.mix((bones ?? corpse) as Vec2, 15) : centered(0),
      slime: slime ? this.options.player.mix(slime, 12) : centered(0),
      shop: { ...shopMix, gain: shopMix.gain * 0.65 },
      swarm: bugs.length ? this.scaled(center, { range: 22, gain: Math.min(1.4, bugs.length * 0.18) }) : centered(0),
      wormRubble: worm ? this.scaled(worm, { range: 36, gain: /warn|emerg|surface|telegraph/i.test(worm.state) ? 1.2 : 0.25 }) : centered(0),
      slugDrag: slug ? this.scaled(slug, { range: 32, gain: 0.95 }) : centered(0),
    };
  }
  private scaled(position: Vec2, options: { range: number; gain: number }): SpatialMix {
    const mix = this.options.player.mix(position, options.range);
    return { ...mix, gain: mix.gain * options.gain };
  }
  private heartbeat(snapshot: GameSnapshot, state: MusicState): void {
    const now = this.options.graph.context.currentTime;
    const boss = snapshot.enemies.reduce<EnemyView | undefined>((nearest, enemy) => {
      if (enemy.isDead || (enemy.kind !== 'worm' && enemy.kind !== 'slug')) return nearest;
      const distance = Math.hypot(enemy.x - snapshot.player.x, enemy.z - snapshot.player.z);
      const previous = nearest ? Math.hypot(nearest.x - snapshot.player.x, nearest.z - snapshot.player.z) : Infinity;
      return distance < previous ? enemy : nearest;
    }, undefined);
    const bossDistance = boss ? Math.hypot(boss.x - snapshot.player.x, boss.z - snapshot.player.z) : Infinity;
    const lowHp = unit(1 - snapshot.player.hp / LOW_HP);
    const proximity = unit(1 - bossDistance / BOSS_HEARTBEAT_RANGE);
    const alert = ['alert', 'combat', 'frenzy', 'worm', 'slug'].includes(state) ? 0.13 : 0;
    const intensity = Math.max(lowHp, proximity * 0.65, alert);
    if (intensity <= 0 || now + HEARTBEAT_LOOKAHEAD < this.nextHeartbeat) return;
    const bpm = 60 + lowHp * 85 + proximity * 25 + alert * 100;
    const pan = boss && bossDistance < BOSS_HEARTBEAT_RANGE && snapshot.player.heartbeat ? this.options.player.mix(boss, BOSS_HEARTBEAT_RANGE).pan : 0;
    this.options.player.play({ id: 'heartbeat', gain: 0.22 + intensity * 0.5, priority: 3, pan, delay: Math.max(0, this.nextHeartbeat - now) });
    this.nextHeartbeat = Math.max(now, this.nextHeartbeat) + 60 / bpm;
  }
}
