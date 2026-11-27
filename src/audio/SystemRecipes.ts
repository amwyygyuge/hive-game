import { noise, ring, tone, type Layer, type Recipe } from './SampleSynth';
import type { SoundId } from './types';

const bone: readonly Layer[] = [noise({ duration: 0.12, gain: 0.44, high: 1800 }), ring({ duration: 0.16, frequency: 360, gain: 0.22 })];
const flesh: readonly Layer[] = [tone({ duration: 0.2, frequency: 120, end: 45, gain: 0.27 }), noise({ duration: 0.22, low: 1300, high: 100, gain: 0.28 })];
const chime = (options: { frequencies: readonly number[]; spacing: number; gain: number }): Layer[] => options.frequencies.map((frequency, index) =>
  tone({ at: index * options.spacing, duration: 0.7, frequency, gain: options.gain, harmonics: 2, attack: 0.008 }));

/** Short, dynamically restrained information sounds, not jump-scare stingers. */
export class SystemRecipes {
  entries(): readonly (readonly [SoundId, Recipe])[] {
    return [
      ['hit.shell', { duration: 0.22, layers: bone }],
      ['hit.flesh', { duration: 0.23, layers: flesh }],
      ['armor', { duration: 0.45, layers: [ring({ duration: 0.45, frequency: 1800, gain: 0.22 })] }],
      ['death.shell', { duration: 0.55, layers: [...bone, noise({ at: 0.04, duration: 0.5, gain: 0.3, low: 3200, high: 500 })] }],
      ['death.flesh', { duration: 0.55, layers: [...flesh, noise({ at: 0.02, duration: 0.5, gain: 0.25, low: 950, flutter: 12 })] }],
      ['death.burst', { duration: 0.9, layers: [...flesh, noise({ duration: 0.9, gain: 0.48, low: 4200, high: 180 }), tone({ duration: 0.5, frequency: 220, end: 40, gain: 0.2 })] }],
      ['sever', { duration: 0.35, layers: [...bone, ...flesh] }],
      ['execute', { duration: 0.55, layers: [...bone, ...flesh, tone({ at: 0.1, duration: 0.4, frequency: 85, end: 32, gain: 0.32 })] }],
      ['hurt', { duration: 0.4, layers: [tone({ duration: 0.38, frequency: 95, end: 36, gain: 0.36 }), noise({ duration: 0.1, gain: 0.18, low: 1400 })] }],
      ['tinnitus', { duration: 1.7, layers: [tone({ duration: 1.7, frequency: 3900, end: 3100, gain: 0.045, attack: 0.03 })] }],
      ['dash', { duration: 0.35, layers: [noise({ duration: 0.35, gain: 0.22, low: 2700, high: 250, attack: 0.03 })] }],
      ['coin', { duration: 0.32, layers: [ring({ duration: 0.32, frequency: 1760, gain: 0.16 }), tone({ at: 0.025, duration: 0.2, frequency: 2640, gain: 0.055 })] }],
      ['ammo', { duration: 0.4, layers: [ring({ duration: 0.3, frequency: 890, gain: 0.14 }), noise({ duration: 0.25, gain: 0.17, high: 1300, flutter: 27 })] }],
      ['health', { duration: 0.9, layers: chime({ frequencies: [440, 660], spacing: 0.11, gain: 0.1 }) }],
      ['battery', this.battery()],
      ['gate', this.gate()],
      ['gateOpen', { duration: 1.8, layers: [ring({ duration: 1.3, frequency: 110, gain: 0.3 }), noise({ duration: 1.8, low: 2300, high: 300, gain: 0.38 }), tone({ duration: 0.7, frequency: 70, end: 30, gain: 0.3 })] }],
      ['countdown', { duration: 0.18, layers: [tone({ duration: 0.18, frequency: 720, gain: 0.12, attack: 0.008, decay: 0.4 })] }],
      ['win', { duration: 5, layers: [146.83, 185, 220, 293.66].map((frequency) => tone({ duration: 5, frequency, gain: 0.09, attack: 0.15, decay: 5 })) }],
      ['death', { duration: 1.2, layers: [tone({ duration: 1.2, frequency: 65, end: 24, gain: 0.35, attack: 0.01 }), noise({ duration: 0.45, low: 300, gain: 0.3 })] }],
      ['upgrade', { duration: 1.2, layers: [noise({ duration: 0.12, gain: 0.12, high: 1800 }), ...chime({ frequencies: [293.66, 440, 587.33, 880], spacing: 0.1, gain: 0.1 })] }],
      ['purchase', { duration: 1, layers: [...chime({ frequencies: [1320, 1760, 2200], spacing: 0.06, gain: 0.075 }), ring({ at: 0.4, duration: 0.2, frequency: 780, gain: 0.14 }), noise({ at: 0.5, duration: 0.16, gain: 0.22, low: 3000, high: 500 })] }],
      ['combo', { duration: 0.9, layers: chime({ frequencies: [146.83, 220, 293.66], spacing: 0.055, gain: 0.13 }) }],
      ['adrenaline', { duration: 1.5, layers: [tone({ duration: 1.5, frequency: 650, end: 45, gain: 0.15, harmonics: 3 }), noise({ duration: 1.2, gain: 0.2, low: 1800, high: 70, attack: 0.06 })] }],
      ['explosion', this.explosion()],
      ['empty', { duration: 0.12, layers: [ring({ duration: 0.08, frequency: 1600, gain: 0.12 }), noise({ duration: 0.035, gain: 0.15, low: 4500, high: 1700 })] }],
      ['step.metal', { duration: 0.3, layers: [noise({ duration: 0.15, gain: 0.18, low: 3400, high: 400 }), ring({ duration: 0.3, frequency: 270, gain: 0.095 })] }],
      ['step.concrete', { duration: 0.22, layers: [noise({ duration: 0.2, gain: 0.2, low: 1500, high: 100 }), tone({ duration: 0.11, frequency: 105, end: 55, gain: 0.1 })] }],
      ['step.slime', { duration: 0.3, layers: [noise({ duration: 0.3, gain: 0.2, low: 900, high: 100, flutter: 17 }), tone({ duration: 0.22, frequency: 230, end: 70, gain: 0.095, vibrato: 0.15 })] }],
      ['heartbeat', this.heartbeat()],
    ];
  }
  private battery(): Recipe {
    return { duration: 2.3, layers: [
      tone({ duration: 2.3, frequency: 65, end: 220, gain: 0.2, harmonics: 3, attack: 0.08, decay: 4 }),
      tone({ at: 0.15, duration: 1.8, frequency: 440, end: 880, gain: 0.08, attack: 0.05 }),
      noise({ duration: 0.7, gain: 0.15, high: 2000, flutter: 55 }),
      ring({ at: 0.35, duration: 1.8, frequency: 146.83, gain: 0.15 }),
    ] };
  }
  private gate(): Recipe {
    return { duration: 3.8, layers: [
      tone({ duration: 3.8, frequency: 90, end: 180, gain: 0.17, harmonics: 3, flutter: 15, attack: 0.2, decay: 7 }),
      noise({ duration: 3.8, gain: 0.28, low: 2600, high: 300, flutter: 18, attack: 0.1, decay: 6 }),
      ...[0.1, 0.5, 1.3, 2.2, 3.4].map((at) => ring({ at, duration: 0.35, frequency: 145, gain: 0.13 })),
    ] };
  }
  private explosion(): Recipe {
    return { duration: 2.5, layers: [
      tone({ duration: 2.4, frequency: 110, end: 25, gain: 0.65, attack: 0.008, decay: 1.8 }),
      noise({ duration: 0.16, gain: 0.7, low: 7000, high: 1500, decay: 0.12 }),
      noise({ duration: 2.5, gain: 0.62, low: 1500, high: 35, decay: 1.9 }),
      ...[0.15, 0.32, 0.56, 0.8].map((at) => noise({ at, duration: 0.14, gain: 0.11, high: 1300 })),
    ] };
  }
  private heartbeat(): Recipe {
    return { duration: 0.45, layers: [
      tone({ duration: 0.17, frequency: 82, end: 42, gain: 0.35, attack: 0.007 }),
      tone({ at: 0.19, duration: 0.2, frequency: 65, end: 37, gain: 0.24, attack: 0.007 }),
      noise({ duration: 0.4, low: 160, high: 25, gain: 0.15 }),
    ] };
  }
}
