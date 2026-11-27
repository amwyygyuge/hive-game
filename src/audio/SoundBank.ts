import { WeaponRecipes, CreatureRecipes } from './ActionRecipes';
import { SystemRecipes } from './SystemRecipes';
import { SampleSynth } from './SampleSynth';
import { LoopComposer, isMusicLoop } from './LoopComposer';
import { AUDIO_CLOCK, MUSIC_SECONDS, SCENES, STEMS, type AudioManifest, type LoopId, type SoundId } from './types';

const BUDGET = { effect: 150 * 1024, ambience: 500 * 1024, stem: 2 * 1024 * 1024, total: 60 * 1024 * 1024 } as const;
const VARIANTS = 2;
const YIELD_MILLISECONDS = 0;
const yieldToPage = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, YIELD_MILLISECONDS));

export class SoundBank {
  readonly loops = new Map<LoopId, AudioBuffer>();
  readonly effects = new Map<SoundId, readonly AudioBuffer[]>();
  readonly errors: string[] = [];
  synthesizedBytes = 0;
  replacementBytes = 0;
  private readonly cursor = new Map<SoundId, number>();
  private readonly requests = new AbortController();

  constructor(private readonly context: AudioContext) {}

  async compose(): Promise<void> {
    const composer = new LoopComposer();
    for (const id of [...STEMS, ...SCENES]) {
      this.loops.set(id, this.buffer(composer.compose(id)));
      await yieldToPage();
    }
    const entries = [...new WeaponRecipes().entries(), ...new CreatureRecipes().entries(), ...new SystemRecipes().entries()];
    for (const [id, recipe] of entries) {
      const variants = Array.from({ length: VARIANTS }, (_, variant) =>
        this.buffer(new SampleSynth(AUDIO_CLOCK.sampleRate, 0x52ab + id.length * 123 + variant * 137).render(recipe)));
      this.effects.set(id, variants);
      await yieldToPage();
    }
  }

  acquire(id: SoundId): AudioBuffer | undefined {
    const options = this.effects.get(id);
    if (!options?.length) return undefined;
    const cursor = this.cursor.get(id) ?? 0;
    this.cursor.set(id, (cursor + 1) % options.length);
    return options[cursor];
  }

  async replace(manifest: AudioManifest): Promise<void> {
    const loopEntries = Object.entries(manifest.loops ?? {}) as [LoopId, string][];
    const effectEntries = Object.entries(manifest.effects ?? {}) as [SoundId, string][];
    for (const [id, path] of loopEntries) await this.load({ id, path, isLoop: true });
    for (const [id, path] of effectEntries) await this.load({ id, path, isLoop: false });
  }

  dispose(): void {
    this.requests.abort();
    this.loops.clear();
    this.effects.clear();
    this.cursor.clear();
  }

  private buffer(samples: Float32Array): AudioBuffer {
    const buffer = this.context.createBuffer(1, samples.length, AUDIO_CLOCK.sampleRate);
    buffer.getChannelData(0).set(samples);
    this.synthesizedBytes += samples.byteLength;
    return buffer;
  }

  private async load(entry: { id: LoopId | SoundId; path: string; isLoop: boolean }): Promise<void> {
    try {
      const url = new URL(entry.path, window.location.href);
      if (url.origin !== window.location.origin || !/\.ogg$/i.test(url.pathname)) throw new Error('Only same-origin local OGG URLs are accepted');
      const response = await fetch(url, { signal: this.requests.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const limit = entry.isLoop ? isMusicLoop(entry.id as LoopId) ? BUDGET.stem : BUDGET.ambience : BUDGET.effect;
      if (bytes.byteLength > limit || this.replacementBytes + bytes.byteLength > BUDGET.total) throw new Error('Encoded sound budget exceeded (150 KB effect / 500 KB ambience / 2 MB stem / 60 MB total)');
      const decoded = await this.context.decodeAudioData(bytes);
      const expectedDuration = isMusicLoop(entry.id as LoopId) ? MUSIC_SECONDS : AUDIO_CLOCK.ambienceSeconds;
      if (entry.isLoop && Math.abs(decoded.duration - expectedDuration) > 0.002) throw new Error(`Loop must be exactly ${expectedDuration.toFixed(6)} seconds for sample-accurate synchronization`);
      this.replacementBytes += bytes.byteLength;
      if (entry.isLoop) this.loops.set(entry.id as LoopId, decoded);
      else this.effects.set(entry.id as SoundId, [decoded]);
    } catch (error: unknown) {
      if (this.requests.signal.aborted) return;
      const message = `Audio asset ${entry.path}: ${error instanceof Error ? error.message : String(error)}`;
      this.errors.push(message);
      console.warn(message);
    }
  }
}
