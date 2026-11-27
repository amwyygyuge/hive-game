import { AUDIO_CLOCK, BEAT, MUSIC_SECONDS, type LoopId, type SceneId, type StemId } from './types';
import { loopNoise, Noise, SampleSynth, TAU, type Layer, tone, noise, ring } from './SampleSynth';

const RATE = AUDIO_CLOCK.sampleRate;
const ROOT = 36.708;
const BAR = BEAT * AUDIO_CLOCK.beatsPerBar;
const quantize = (frequency: number): number => Math.round(frequency * MUSIC_SECONDS) / MUSIC_SECONDS;
const kick = (at: number): Layer => tone({ at, duration: 0.4, frequency: 125, end: 36.7, gain: 0.32, decay: 0.33 });

/** Six principal stems plus four alternative state textures. Every music buffer shares one clock. */
export class LoopComposer {
  private readonly synth = new SampleSynth(RATE, 0x29a3);
  private readonly random = new Noise(0x13f2a);

  compose(id: LoopId): Float32Array {
    switch (id) {
      case 'drone': return this.drone();
      case 'pulse': return this.pulse();
      case 'metal': return this.metal();
      case 'pad': return this.pad(false);
      case 'rhythm': return this.rhythm(false);
      case 'bio': return this.biological();
      case 'warm': return this.pad(true);
      case 'worm': return this.worm();
      case 'slug': return this.slug();
      case 'frenzy': return this.rhythm(true);
      default: return this.scene(id);
    }
  }

  private empty(): Float32Array { return new Float32Array(Math.round(MUSIC_SECONDS * RATE)); }
  private add(output: Float32Array, layers: readonly Layer[]): void {
    layers.forEach((layer) => this.synth.addWrapped(output, layer));
  }
  private drone(): Float32Array {
    const output = loopNoise({ duration: MUSIC_SECONDS, rate: RATE, low: 120, high: 20, seed: 120 });
    output.forEach((sample, index) => {
      const time = index / RATE;
      const breath = 0.72 + 0.28 * Math.sin(TAU * time / MUSIC_SECONDS);
      output[index] = sample * 0.22 + breath * (Math.sin(TAU * quantize(ROOT) * time) * 0.11
        + Math.sin(TAU * quantize(ROOT * 2 + 0.3) * time) * 0.055);
    });
    return output;
  }
  private pulse(): Float32Array {
    const output = this.empty();
    Array.from({ length: AUDIO_CLOCK.bars }, (_, bar) => {
      this.add(output, [kick(bar * BAR), tone({ at: bar * BAR + BEAT * 2, duration: 0.35, frequency: 95, end: ROOT, gain: 0.21 }),
        tone({ at: bar * BAR + BEAT * 2.75, duration: 0.26, frequency: 900, end: 380, gain: 0.065 }),
        tone({ at: bar * BAR + BEAT * 3.5, duration: 0.2, frequency: 660, end: 250, gain: 0.045 })]);
    });
    return output;
  }
  private metal(): Float32Array {
    const output = this.empty();
    Array.from({ length: AUDIO_CLOCK.bars * 3 }, (_, index) => {
      const at = index * MUSIC_SECONDS / (AUDIO_CLOCK.bars * 3) + this.random.range(0.1, 0.45);
      const frequencies = [293.66, 220, 440, 174.61];
      this.add(output, [ring({ at, duration: 1.5, frequency: frequencies[index % frequencies.length], gain: this.random.range(0.045, 0.09) }),
        noise({ at: at + 0.06, duration: 0.5, low: 4200, high: 2300, gain: 0.025, attack: 0.025 })]);
    });
    return output;
  }
  private pad(warm: boolean): Float32Array {
    const output = this.empty();
    const frequencies = (warm ? [146.83, 185, 220, 329.63] : [73.416, 174.61, 220, 311.13]).map(quantize);
    output.forEach((_, index) => {
      const time = index / RATE;
      const swell = 0.76 + 0.24 * Math.sin(TAU * time / MUSIC_SECONDS);
      const chord = frequencies.reduce((sum, frequency, voice) => {
        const beating = 0.8 + 0.2 * Math.sin(TAU * (voice + 1) * time / MUSIC_SECONDS);
        return sum + Math.sin(TAU * frequency * time) * beating / frequencies.length;
      }, 0);
      output[index] = chord * swell * (warm ? 0.2 : 0.14) + (warm ? Math.sin(TAU * quantize(100) * time) * 0.015 : 0);
    });
    return output;
  }
  private rhythm(frenzy: boolean): Float32Array {
    const output = this.empty();
    const subdivisions = frenzy ? 16 : 8;
    Array.from({ length: AUDIO_CLOCK.bars * subdivisions }, (_, index) => {
      const at = index * BAR / subdivisions;
      const beat = index % subdivisions;
      this.add(output, [noise({ at, duration: 0.075, gain: index % 2 ? 0.035 : 0.065, high: 4500, decay: 0.06 })]);
      if (beat % (subdivisions / 2) === 0) this.add(output, [kick(at)]);
      else if (beat % (subdivisions / 2) === subdivisions / 4) this.add(output, [noise({ at, duration: 0.18, gain: 0.14, high: 650, low: 4800 }), ring({ at, duration: 0.22, frequency: 185, gain: 0.07 })]);
      if (frenzy) this.add(output, [tone({ at, duration: 0.1, gain: beat % 4 ? 0.06 : 0.11, frequency: beat % 3 ? 73.416 : 77.78, harmonics: 3 })]);
    });
    return output;
  }
  private biological(): Float32Array {
    const output = this.empty();
    Array.from({ length: AUDIO_CLOCK.bars * 3 }, (_, index) => {
      const at = index * MUSIC_SECONDS / (AUDIO_CLOCK.bars * 3) + this.random.range(0, 0.4);
      this.add(output, index % 3 === 0
        ? [noise({ at, duration: 1.2, low: 1600, high: 500, flutter: 36, gain: 0.1, attack: 0.06 })]
        : [tone({ at, duration: 0.9, frequency: this.random.range(120, 220), end: 70, vibrato: 0.15, gain: 0.07 }),
          noise({ at, duration: 0.8, low: 600, high: 60, flutter: 8, gain: 0.12, attack: 0.03 })]);
    });
    return output;
  }
  private worm(): Float32Array {
    const output = loopNoise({ duration: MUSIC_SECONDS, rate: RATE, low: 200, high: 25, seed: 692 });
    output.forEach((sample, index) => { output[index] = sample * (0.42 + 0.18 * Math.sin(TAU * 3 * index / output.length)); });
    Array.from({ length: AUDIO_CLOCK.bars * 3 }, (_, index) => {
      this.add(output, [tone({ at: index * BAR / 3, duration: 0.6, frequency: 85, end: 30, gain: 0.24 }),
        noise({ at: index * BAR / 3, duration: 0.5, high: 850, low: 3500, gain: 0.09 })]);
    });
    return output;
  }
  private slug(): Float32Array {
    const output = loopNoise({ duration: MUSIC_SECONDS, rate: RATE, low: 650, high: 100, seed: 551 });
    output.forEach((sample, index) => {
      const time = index / RATE;
      const glide = TAU * quantize(41.2) * time + 10 * Math.sin(TAU * 2 * time / MUSIC_SECONDS);
      output[index] = sample * 0.22 + Math.sin(glide) * 0.16 + Math.sin(glide * 2) * 0.035;
    });
    return output;
  }
  private scene(id: SceneId): Float32Array {
    const settings: Record<SceneId, { low: number; high: number; gain: number }> = {
      air: { low: 1800, high: 80, gain: 0.12 }, drips: { low: 800, high: 100, gain: 0.008 },
      electric: { low: 7000, high: 2700, gain: 0.025 }, flies: { low: 2400, high: 1000, gain: 0.012 },
      slime: { low: 650, high: 60, gain: 0.07 }, shop: { low: 2000, high: 700, gain: 0.016 },
      swarm: { low: 4200, high: 1000, gain: 0.035 }, wormRubble: { low: 280, high: 30, gain: 0.42 },
      slugDrag: { low: 1600, high: 160, gain: 0.16 },
    };
    const setting = settings[id];
    const output = loopNoise({ duration: AUDIO_CLOCK.ambienceSeconds, rate: RATE, low: setting.low, high: setting.high, seed: id.length * 675 + id.charCodeAt(0) });
    output.forEach((sample, index) => {
      const time = index / RATE;
      output[index] = sample * setting.gain * (0.65 + 0.35 * Math.sin(TAU * time / AUDIO_CLOCK.ambienceSeconds));
      if (id === 'shop') output[index] += Math.sin(TAU * 100 * time) * 0.035;
      else if (id === 'flies') output[index] += (Math.sin(TAU * 185 * time + 4 * Math.sin(TAU * 3 * time)) + 0.3 * Math.sin(TAU * 370 * time)) * 0.03;
    });
    this.sceneDetails(output, id);
    return output;
  }
  private sceneDetails(output: Float32Array, id: SceneId): void {
    const count = id === 'swarm' ? 45 : id === 'electric' ? 19 : 8;
    Array.from({ length: count }, (_, index) => {
      const at = index * AUDIO_CLOCK.ambienceSeconds / count + this.random.range(0, 0.1);
      switch (id) {
        case 'drips': this.add(output, [tone({ at, duration: 0.25, frequency: this.random.range(950, 1700), end: 500, gain: 0.065 }), ring({ at: at + 0.02, duration: 0.35, frequency: 480, gain: 0.018 })]); break;
        case 'electric': this.add(output, [noise({ at, duration: 0.07, gain: 0.09, high: 3000, flutter: 100 })]); break;
        case 'slime': this.add(output, [tone({ at, duration: 0.45, frequency: this.random.range(180, 350), end: 55, gain: 0.085, vibrato: 0.2 })]); break;
        case 'swarm': this.add(output, [ring({ at, duration: 0.06, frequency: this.random.range(800, 2300), gain: 0.04 })]); break;
        case 'slugDrag': this.add(output, [noise({ at, duration: 0.6, gain: 0.07, low: 900, flutter: 12, attack: 0.03 })]); break;
        case 'wormRubble': this.add(output, [noise({ at, duration: 0.3, gain: 0.065, low: 4200, high: 900 })]); break;
        default: break;
      }
    });
  }
}

export const isMusicLoop = (id: LoopId): id is StemId => !['air', 'drips', 'electric', 'flies', 'slime', 'shop', 'swarm', 'wormRubble', 'slugDrag'].includes(id);
