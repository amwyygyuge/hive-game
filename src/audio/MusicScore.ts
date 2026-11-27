import type { GameEvent, GameSnapshot } from '../contracts';
import { AudioGraph, SmoothParam } from './AudioGraph';
import { SoundBank } from './SoundBank';
import { MUSIC_SECONDS, STEMS, type MusicState, type StemId } from './types';
import { unit } from './SampleSynth';

const ALERT_RANGE = 15;
const BOSS_RANGE = 34;
const COMBAT_HOLD = 4;
const ALERT_HOLD = 7;
const MIX_SECONDS = 3;
const END_FADE = { dead: 0.5, won: 10 } as const;
const PRIORITY: Record<MusicState, number> = { shallow: 0, deep: 0, shop: 1, alert: 2, combat: 3, worm: 4, slug: 4, frenzy: 5, dead: 6, won: 6 };
// Six principal stems, with alternate textures replacing rather than adding to the full mix.
const MIX: Record<MusicState, Partial<Record<StemId, number>>> = {
  shallow: { drone: 0.8, metal: 0.65 }, deep: { drone: 0.17, pulse: 0.25, metal: 0.15 },
  alert: { drone: 0.45, pulse: 0.75, metal: 0.55, bio: 0.45 },
  combat: { drone: 0.45, pulse: 0.8, metal: 0.7, pad: 0.65, rhythm: 0.8, bio: 0.65 },
  shop: { warm: 0.8, metal: 0.06 },
  worm: { drone: 0.35, pulse: 0.7, metal: 0.6, rhythm: 0.8, bio: 0.55, worm: 0.8 },
  slug: { drone: 0.35, pulse: 0.4, metal: 0.3, pad: 0.5, bio: 0.7, slug: 0.9 },
  frenzy: { drone: 0.35, pulse: 0.8, metal: 0.75, rhythm: 0.9, bio: 0.7, frenzy: 0.9 },
  dead: {}, won: { warm: 0.9 },
};
interface Stem { source: AudioBufferSourceNode; gain: GainNode; control: SmoothParam; rate: SmoothParam; target: number }

export class MusicScore {
  state: MusicState = 'shallow';
  private lastViolence = -Infinity;
  private lastShot = -Infinity;
  private lastDanger = -Infinity;

  update(snapshot: GameSnapshot, events: readonly GameEvent[]): MusicState {
    events.forEach((event) => {
      if (event.type === 'shot') this.lastShot = snapshot.elapsed;
      else if (event.type === 'hurt' || event.type === 'hit' || event.type === 'execute') this.lastViolence = snapshot.elapsed;
    });
    const target = this.resolve(snapshot);
    if (PRIORITY[target] >= PRIORITY.alert) this.lastDanger = snapshot.elapsed;
    else if (PRIORITY[this.state] >= PRIORITY.alert && PRIORITY[this.state] <= PRIORITY.combat && snapshot.elapsed - this.lastDanger < 2) return this.state;
    this.state = target;
    return this.state;
  }
  reset(): void {
    this.state = 'shallow';
    this.lastViolence = -Infinity;
    this.lastShot = -Infinity;
    this.lastDanger = -Infinity;
  }
  private resolve(snapshot: GameSnapshot): MusicState {
    if (snapshot.phase === 'lost') return 'dead';
    if (snapshot.phase === 'won') return 'won';
    if (snapshot.gatePhase === 'opening') return 'frenzy';
    const threats = snapshot.enemies.filter((enemy) => !enemy.isDead && !['mimic', 'corpseSpider', 'moth'].includes(enemy.kind));
    const boss = threats.find((enemy) => (enemy.kind === 'worm' || enemy.kind === 'slug') && Math.hypot(enemy.x - snapshot.player.x, enemy.z - snapshot.player.z) < BOSS_RANGE);
    if (boss) return boss.kind === 'worm' ? 'worm' : 'slug';
    const nearest = threats.reduce((distance, enemy) => Math.min(distance, Math.hypot(enemy.x - snapshot.player.x, enemy.z - snapshot.player.z)), Infinity);
    const recentShot = snapshot.elapsed - this.lastShot;
    if (snapshot.elapsed - this.lastViolence < COMBAT_HOLD || (recentShot < COMBAT_HOLD && nearest < ALERT_RANGE * 1.4)) return 'combat';
    if (snapshot.isShopOpen || Math.hypot(snapshot.player.x - snapshot.world.shop.x, snapshot.player.z - snapshot.world.shop.z) < 6) return 'shop';
    if (nearest < ALERT_RANGE || recentShot < ALERT_HOLD) return 'alert';
    return snapshot.batteriesCollected >= 3 ? 'deep' : 'shallow';
  }
}

export class MusicMixer {
  private readonly stems = new Map<StemId, Stem>();
  private endingStarted = -Infinity;
  private previous: MusicState = 'shallow';

  constructor(private readonly graph: AudioGraph, bank: SoundBank) {
    const start = graph.context.currentTime + 0.06;
    STEMS.forEach((id) => {
      const buffer = bank.loops.get(id);
      if (!buffer) throw new Error(`Missing composed stem: ${id}`);
      const source = graph.context.createBufferSource();
      const gain = graph.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopEnd = MUSIC_SECONDS;
      gain.gain.value = 0;
      source.connect(gain).connect(graph.music);
      source.start(start);
      this.stems.set(id, { source, gain, control: new SmoothParam(gain.gain), rate: new SmoothParam(source.playbackRate), target: 0 });
    });
  }
  get activeLoops(): readonly string[] { return [...this.stems].filter(([, stem]) => stem.target > 0.005).map(([id]) => `music.${id}`); }
  update(options: { snapshot: GameSnapshot; state: MusicState; rate: number }): void {
    const now = this.graph.context.currentTime;
    if (options.state === 'won' && this.previous !== 'won') this.endingStarted = now;
    else if (options.state !== 'won') this.endingStarted = -Infinity;
    this.previous = options.state;
    const winFade = options.state === 'won' ? unit(1 - (now - this.endingStarted) / END_FADE.won) : 1;
    const finalSilence = options.snapshot.gatePhase === 'opening' && options.snapshot.gateRemaining <= 1;
    const depth = options.state === 'deep' ? Math.max(0.4, 1 - (options.snapshot.batteriesCollected - 3) * 0.15) : 1;
    const tightening = options.state === 'frenzy' ? 0.65 + 0.35 * unit(1 - options.snapshot.gateRemaining / 30) : 1;
    this.stems.forEach((stem, id) => {
      const target = (MIX[options.state][id] ?? 0) * depth * winFade * tightening * (finalSilence ? 0 : 1);
      stem.target = target;
      const seconds = finalSilence ? 0.05 : options.state === 'dead' ? END_FADE.dead : options.state === 'won' ? 0.5 : MIX_SECONDS;
      stem.control.to({ value: target, now, seconds });
      stem.rate.to({ value: options.rate, now, seconds: 0.2 });
    });
  }
  dispose(): void {
    this.stems.forEach((stem) => { stem.source.stop(); stem.source.disconnect(); stem.gain.disconnect(); });
    this.stems.clear();
  }
}
