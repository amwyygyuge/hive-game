import type { AudioLevels } from '../contracts';
import { unit } from './SampleSynth';

const FADE_TAU_DIVISOR = 3;
const PARAM_EPSILON = 0.001;
const MASTER_HEADROOM = 0.72;
const OPEN_CUTOFF = 18000;

/** Re-target without a discontinuity; only schedule changed values. */
export class SmoothParam {
  private last = Number.NaN;
  constructor(private readonly parameter: AudioParam) {}
  to(options: { value: number; now: number; seconds: number }): void {
    if (Math.abs(options.value - this.last) < PARAM_EPSILON) return;
    this.last = options.value;
    this.parameter.setTargetAtTime(options.value, options.now, Math.max(0.004, options.seconds / FADE_TAU_DIVISOR));
  }
}

export class AudioGraph {
  readonly music: GainNode;
  readonly effects: GainNode;
  readonly ambience: GainNode;
  private readonly master: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly controls: Record<'music' | 'effects' | 'ambience' | 'master' | 'filter', SmoothParam>;

  constructor(readonly context: AudioContext) {
    this.music = context.createGain();
    this.effects = context.createGain();
    this.ambience = context.createGain();
    this.master = context.createGain();
    this.filter = context.createBiquadFilter();
    this.compressor = context.createDynamicsCompressor();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = OPEN_CUTOFF;
    this.filter.Q.value = 0.55;
    this.master.gain.value = MASTER_HEADROOM;
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 14;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.22;
    [this.music, this.effects, this.ambience].forEach((bus) => bus.connect(this.filter));
    this.filter.connect(this.master).connect(this.compressor).connect(context.destination);
    this.controls = { music: new SmoothParam(this.music.gain), effects: new SmoothParam(this.effects.gain), ambience: new SmoothParam(this.ambience.gain), master: new SmoothParam(this.master.gain), filter: new SmoothParam(this.filter.frequency) };
  }

  setLevels(levels: AudioLevels): void {
    const now = this.context.currentTime;
    (['music', 'effects', 'ambience'] as const).forEach((channel) => {
      this.controls[channel].to({ value: unit(levels[channel]) ** 1.5, now, seconds: 0.08 });
    });
    this.controls.master.to({ value: levels.isMuted ? 0 : MASTER_HEADROOM, now, seconds: 0.04 });
  }
  muffle(cutoff: number): void {
    this.controls.filter.to({ value: cutoff, now: this.context.currentTime, seconds: 0.15 });
  }
  dispose(): void {
    [this.music, this.effects, this.ambience, this.filter, this.master, this.compressor].forEach((node) => node.disconnect());
  }
}

export class GlobalEffects {
  private adrenalineUntil = 0;
  private hurtUntil = 0;
  private explosionUntil = 0;

  trigger(options: { type: 'adrenaline' | 'hurt' | 'explosion'; now: number; intensity?: number }): void {
    switch (options.type) {
      case 'adrenaline': this.adrenalineUntil = options.now + 3; break;
      case 'hurt': this.hurtUntil = options.now + 0.7; break;
      case 'explosion': this.explosionUntil = options.now + 1.1 * (options.intensity ?? 1); break;
    }
  }
  read(now: number): { cutoff: number; rate: number } {
    const slow = now < this.adrenalineUntil;
    const hurt = now < this.hurtUntil;
    const explosion = now < this.explosionUntil;
    return { cutoff: slow ? 1250 : explosion ? 2100 : hurt ? 4200 : OPEN_CUTOFF, rate: slow ? 0.74 : 1 };
  }
  reset(): void { this.adrenalineUntil = 0; this.hurtUntil = 0; this.explosionUntil = 0; }
}
