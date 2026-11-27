export const TAU = Math.PI * 2;
const SILENCE_FLOOR = 6.9;
const LOOP_SEAM_SECONDS = 0.035;

export class Noise {
  constructor(private seed = 0x627573) {}
  next(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967296;
  }
  signed(): number { return this.next() * 2 - 1; }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
}

export class LowPass {
  private value = 0;
  private readonly coefficient: number;
  constructor(sampleRate: number, cutoff: number) {
    this.coefficient = 1 - Math.exp(-TAU * cutoff / sampleRate);
  }
  process(input: number): number {
    this.value += this.coefficient * (input - this.value);
    return this.value;
  }
}

export interface NoiseLayer {
  type: 'noise'; low?: number; high?: number; flutter?: number;
  at?: number; duration: number; gain: number; attack?: number; decay?: number;
}
export interface ToneLayer {
  type: 'tone'; frequency: number; end?: number; harmonics?: number; vibrato?: number;
  at?: number; duration: number; gain: number; attack?: number; decay?: number; flutter?: number;
}
export interface RingLayer {
  type: 'ring'; frequency: number; ratios?: readonly number[];
  at?: number; duration: number; gain: number; attack?: number; decay?: number;
}
export type Layer = NoiseLayer | ToneLayer | RingLayer;
export interface Recipe { duration: number; layers: readonly Layer[] }
export const noise = (layer: Omit<NoiseLayer, 'type'>): NoiseLayer => ({ type: 'noise', ...layer });
export const tone = (layer: Omit<ToneLayer, 'type'>): ToneLayer => ({ type: 'tone', ...layer });
export const ring = (layer: Omit<RingLayer, 'type'>): RingLayer => ({ type: 'ring', ...layer });
export const unit = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
export const semitones = (value: number): number => 2 ** (value / 12);

export class SampleSynth {
  private readonly random: Noise;
  constructor(readonly sampleRate: number, seed = 0x627573) { this.random = new Noise(seed); }

  render(recipe: Recipe): Float32Array {
    const output = new Float32Array(Math.ceil(recipe.duration * this.sampleRate));
    recipe.layers.forEach((layer) => this.add(output, layer));
    const edge = Math.floor(this.sampleRate * 0.003);
    output.forEach((sample, index) => {
      const fade = Math.min(1, index / edge, (output.length - 1 - index) / edge);
      output[index] = Math.tanh(sample) * Math.max(0, fade);
    });
    return output;
  }

  add(target: Float32Array, layer: Layer): void {
    const samples = this.layer(layer);
    const offset = Math.round((layer.at ?? 0) * this.sampleRate);
    samples.forEach((sample, index) => {
      const destination = offset + index;
      if (destination < target.length) target[destination] += sample;
    });
  }

  addWrapped(target: Float32Array, layer: Layer): void {
    const samples = this.layer(layer);
    const offset = Math.round((layer.at ?? 0) * this.sampleRate);
    samples.forEach((sample, index) => { target[(offset + index) % target.length] += sample; });
  }

  layer(layer: Layer): Float32Array {
    const length = Math.ceil(layer.duration * this.sampleRate);
    const output = new Float32Array(length);
    const generator = this.generator(layer);
    output.forEach((_, index) => {
      const time = index / this.sampleRate;
      const attack = Math.min(1, time / (layer.attack ?? 0.002));
      const tail = Math.min(1, (layer.duration - time) / 0.01);
      const envelope = attack * Math.exp(-SILENCE_FLOOR * time / (layer.decay ?? layer.duration));
      output[index] = generator(time) * layer.gain * envelope * tail;
    });
    return output;
  }

  private generator(layer: Layer): (time: number) => number {
    switch (layer.type) {
      case 'noise': return this.noiseGenerator(layer);
      case 'tone': return this.toneGenerator(layer);
      case 'ring': return (time) => (layer.ratios ?? [1, 2.73, 4.13, 6.79]).reduce((sum, ratio, index) =>
        sum + Math.sin(TAU * layer.frequency * ratio * time) * Math.exp(-time * index * 5) / (index + 1), 0);
    }
  }

  private noiseGenerator(layer: NoiseLayer): (time: number) => number {
    const low = new LowPass(this.sampleRate, layer.low ?? this.sampleRate * 0.42);
    const high = new LowPass(this.sampleRate, layer.high ?? 25);
    return (time) => {
      const sample = low.process(this.random.signed());
      const band = sample - high.process(sample);
      return band * (layer.flutter ? 0.55 + 0.45 * Math.sin(TAU * layer.flutter * time) : 1);
    };
  }

  private toneGenerator(layer: ToneLayer): (time: number) => number {
    const state = { phase: 0 };
    return (time) => {
      const progress = Math.min(1, time / Math.max(0.015, layer.duration * 0.55));
      const frequency = layer.frequency * ((layer.end ?? layer.frequency) / layer.frequency) ** progress;
      state.phase += TAU * frequency * (1 + (layer.vibrato ?? 0) * Math.sin(TAU * 13 * time)) / this.sampleRate;
      const harmonics = layer.harmonics ?? 1;
      const wave = Math.sin(state.phase) + (harmonics > 1 ? Math.sin(state.phase * 2) * 0.25 + Math.sin(state.phase * 3) * 0.12 : 0);
      return wave * (layer.flutter ? 0.6 + 0.4 * Math.sin(TAU * layer.flutter * time) : 1);
    };
  }
}

/** Crossfade an extension into the opening; preserve buffer duration and timing. */
export function loopNoise(options: { duration: number; rate: number; low: number; high?: number; seed: number }): Float32Array {
  const random = new Noise(options.seed);
  const low = new LowPass(options.rate, options.low);
  const high = new LowPass(options.rate, options.high ?? 10);
  const length = Math.round(options.duration * options.rate);
  const seam = Math.round(LOOP_SEAM_SECONDS * options.rate);
  const extended = new Float32Array(length + seam);
  extended.forEach((_, index) => {
    const sample = low.process(random.signed());
    extended[index] = sample - high.process(sample);
  });
  const output = extended.slice(0, length);
  output.subarray(0, seam).forEach((sample, index) => {
    const blend = index / seam;
    output[index] = extended[length + index] * (1 - blend) + sample * blend;
  });
  return output;
}
