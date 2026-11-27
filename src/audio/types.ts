import type { EnemyKind, WeaponId } from '../contracts';

export const AUDIO_CLOCK = { bpm: 90, beatsPerBar: 4, bars: 4, sampleRate: 22050, ambienceSeconds: 8 } as const;
export const BEAT = 60 / AUDIO_CLOCK.bpm;
export const MUSIC_SECONDS = BEAT * AUDIO_CLOCK.beatsPerBar * AUDIO_CLOCK.bars;
export const STEMS = ['drone', 'pulse', 'metal', 'pad', 'rhythm', 'bio', 'warm', 'worm', 'slug', 'frenzy'] as const;
export const SCENES = ['air', 'drips', 'electric', 'flies', 'slime', 'shop', 'swarm', 'wormRubble', 'slugDrag'] as const;
export type StemId = typeof STEMS[number];
export type SceneId = typeof SCENES[number];
export type LoopId = StemId | SceneId;
export type MusicState = 'shallow' | 'deep' | 'alert' | 'combat' | 'shop' | 'worm' | 'slug' | 'frenzy' | 'dead' | 'won';
export type SoundId = `gun.${WeaponId}` | `quiet.${WeaponId}` | `reload.${WeaponId}` | `cue.${EnemyKind}` | `alert.${EnemyKind}`
  | 'hit.shell' | 'hit.flesh' | 'armor' | 'death.shell' | 'death.flesh' | 'death.burst' | 'sever' | 'execute'
  | 'hurt' | 'tinnitus' | 'dash' | 'coin' | 'ammo' | 'health' | 'battery' | 'gate' | 'gateOpen' | 'countdown'
  | 'win' | 'death' | 'upgrade' | 'purchase' | 'combo' | 'adrenaline' | 'explosion' | 'empty'
  | 'step.metal' | 'step.concrete' | 'step.slime' | 'heartbeat';

/** Local same-origin OGG replacements only. Music loops must contain four bars at 90 BPM. */
export interface AudioManifest {
  loops?: Partial<Record<LoopId, string>>;
  effects?: Partial<Record<SoundId, string>>;
}
export interface AudioDirectorOptions { manifest?: AudioManifest; screenRight?: { x: number; z: number } }
export interface AudioDiagnostics {
  readonly state: MusicState | 'locked' | 'loading' | 'disposed';
  readonly contextState: AudioContextState | 'uncreated';
  readonly activeLoops: readonly string[];
  readonly loopSources: number;
  readonly activeVoices: number;
  readonly synthesizedBytes: number;
  readonly replacementBytes: number;
  readonly errors: readonly string[];
  readonly bpm: number;
  readonly unlocked: boolean;
  readonly muted: boolean;
}
