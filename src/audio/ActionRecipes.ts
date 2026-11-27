import { noise, ring, tone, type Layer, type Recipe } from './SampleSynth';
import type { EnemyKind, WeaponId } from '../contracts';
import type { SoundId } from './types';

const WEAPONS: readonly WeaponId[] = ['pistol', 'smg', 'shotgun', 'pulse', 'rocket'];
const GUN_PROFILE: Record<WeaponId, { duration: number; body: number; crack: number; tail: number }> = {
  pistol: { duration: 0.42, body: 180, crack: 0.65, tail: 0.22 },
  smg: { duration: 0.22, body: 230, crack: 0.48, tail: 0.12 },
  shotgun: { duration: 0.72, body: 105, crack: 0.85, tail: 0.55 },
  pulse: { duration: 0.35, body: 135, crack: 0.28, tail: 0.18 },
  rocket: { duration: 1.1, body: 85, crack: 0.28, tail: 0.65 },
};
export const RELOAD_SECONDS: Record<WeaponId, number> = { pistol: 0.9, smg: 1.4, shotgun: 2.2, pulse: 2, rocket: 2.6 };
const RELOAD_SCORE: Record<WeaponId, readonly number[]> = {
  pistol: [0, 0.3, 0.64, 0.79], smg: [0, 0.2, 0.7, 1.16], shotgun: [0, 0.28, 0.57, 0.86, 1.15, 1.44, 1.9],
  pulse: [0, 0.2, 0.9, 1.5, 1.75], rocket: [0, 0.5, 1.2, 1.9, 2.35],
};

export class WeaponRecipes {
  entries(): readonly (readonly [SoundId, Recipe])[] {
    return WEAPONS.flatMap((weapon) => [
      [`gun.${weapon}`, this.gun(weapon)] as const,
      [`quiet.${weapon}`, this.suppressed(weapon)] as const,
      [`reload.${weapon}`, this.reload(weapon)] as const,
    ]);
  }
  private gun(weapon: WeaponId): Recipe {
    const profile = GUN_PROFILE[weapon];
    const layers: Layer[] = [
      noise({ duration: 0.065, gain: profile.crack, high: 1600, decay: 0.045 }),
      tone({ duration: profile.duration, gain: 0.52, frequency: profile.body, end: 38, decay: profile.tail }),
      noise({ duration: profile.duration, gain: 0.37, low: 1800, high: 80, decay: profile.tail }),
      ring({ at: 0.025, duration: 0.09, gain: 0.075, frequency: 1150 }),
    ];
    if (weapon === 'pulse') layers.push(tone({ duration: 0.24, gain: 0.28, frequency: 1600, end: 240, harmonics: 3, vibrato: 0.03 }));
    else if (weapon === 'rocket') layers.push(noise({ duration: 0.95, gain: 0.6, low: 3200, high: 300, attack: 0.025, decay: 0.9 }));
    return { duration: profile.duration, layers };
  }
  private suppressed(weapon: WeaponId): Recipe {
    const profile = GUN_PROFILE[weapon];
    return { duration: profile.duration, layers: [
      tone({ duration: 0.14, gain: 0.32, frequency: profile.body, end: 60, decay: 0.12 }),
      noise({ duration: profile.duration, gain: 0.2, low: 700, high: 90, decay: profile.tail }),
      ring({ at: 0.028, duration: 0.045, gain: 0.06, frequency: 1250 }),
    ] };
  }
  private reload(weapon: WeaponId): Recipe {
    const score = RELOAD_SCORE[weapon];
    return { duration: RELOAD_SECONDS[weapon], layers: score.flatMap((at, index) => [
      ring({ at, duration: 0.1, gain: 0.1, frequency: index % 2 ? 720 : 1450 }),
      noise({ at, duration: index === score.length - 1 ? 0.16 : 0.08, gain: 0.19, low: 2600, high: 450 }),
      tone({ at: at + 0.015, duration: 0.08, gain: 0.09, frequency: 160, end: 75 }),
    ]) };
  }
}

const ENEMIES: readonly EnemyKind[] = ['bug', 'aphid', 'parasite', 'centipede', 'queen', 'cocoon', 'spider', 'corpseSpider', 'wasp', 'bat', 'mantis', 'crab', 'beetle', 'raptor', 'moth', 'ghoul', 'jellyfish', 'mimic', 'eel', 'worm', 'slug'];
const crack = (frequency: number): Recipe => ({ duration: 0.3, layers: [
  noise({ duration: 0.09, gain: 0.32, high: 1200 }), ring({ duration: 0.26, frequency, gain: 0.19 }),
] });
const wet = (frequency: number): Recipe => ({ duration: 0.9, layers: [
  tone({ duration: 0.55, gain: 0.22, frequency, end: frequency * 0.35, vibrato: 0.16, harmonics: 3 }),
  noise({ duration: 0.85, gain: 0.38, low: 850, high: 100, flutter: 7, attack: 0.05 }),
] });
const steps = (options: { count: number; spacing: number; frequency: number; gain: number }): Recipe => ({
  duration: options.count * options.spacing + 0.3,
  layers: Array.from({ length: options.count }, (_, index) => [
    ring({ at: index * options.spacing, duration: 0.12, frequency: options.frequency * (1 + index % 3 * 0.12), gain: options.gain }),
    noise({ at: index * options.spacing, duration: 0.08, gain: options.gain * 0.9, low: 3000, high: 700 }),
  ]).flat(),
});

export class CreatureRecipes {
  entries(): readonly (readonly [SoundId, Recipe])[] {
    return ENEMIES.flatMap((kind) => [
      [`cue.${kind}`, this.cue(kind)] as const,
      [`alert.${kind}`, this.alert(kind)] as const,
    ]);
  }
  private cue(kind: EnemyKind): Recipe {
    switch (kind) {
      case 'bug': return steps({ count: 9, spacing: 0.065, frequency: 1500, gain: 0.08 });
      case 'aphid': return wet(330);
      case 'parasite': return wet(175);
      case 'centipede': return steps({ count: 8, spacing: 0.12, frequency: 480, gain: 0.16 });
      case 'queen': return wet(95);
      case 'cocoon': return { duration: 1.2, layers: [tone({ duration: 0.8, frequency: 64, end: 38, gain: 0.24, attack: 0.05 }), noise({ duration: 1.2, gain: 0.13, low: 450, flutter: 3 })] };
      case 'spider': return { duration: 0.2, layers: [noise({ duration: 0.2, gain: 0.15, high: 2400, low: 6500, attack: 0.04 })] };
      case 'corpseSpider': return crack(680);
      case 'wasp': return { duration: 1.1, layers: [tone({ duration: 1.1, frequency: 215, end: 250, gain: 0.13, harmonics: 3, vibrato: 0.08, flutter: 86, attack: 0.04, decay: 2 }), noise({ duration: 1.1, gain: 0.08, high: 1200, flutter: 86 })] };
      case 'bat': return this.bat();
      case 'mantis': return { duration: 0.1, layers: [noise({ duration: 0.1, gain: 0.4, high: 1100, low: 7000, attack: 0.012 })] };
      case 'crab': return steps({ count: 3, spacing: 0.13, frequency: 920, gain: 0.12 });
      case 'beetle': return { duration: 0.8, layers: [tone({ duration: 0.75, frequency: 420, end: 780, gain: 0.11, harmonics: 3, vibrato: 0.04, attack: 0.1, decay: 1.8 }), noise({ duration: 0.7, gain: 0.17, low: 2200, high: 1100, flutter: 19, attack: 0.08 })] };
      case 'raptor': return { duration: 0.5, layers: [noise({ duration: 0.32, gain: 0.27, high: 1700, low: 6000, attack: 0.025 }), ring({ duration: 0.4, frequency: 280, gain: 0.14 })] };
      case 'moth': return { duration: 0.5, layers: [noise({ duration: 0.5, gain: 0.06, high: 3500, low: 8000, attack: 0.08, flutter: 24 })] };
      case 'ghoul': return { duration: 0.7, layers: [...wet(125).layers, ...steps({ count: 2, spacing: 0.22, frequency: 430, gain: 0.11 }).layers] };
      case 'jellyfish': return { duration: 0.9, layers: [...wet(280).layers, noise({ at: 0.2, duration: 0.6, gain: 0.11, high: 2500, flutter: 100 })] };
      case 'mimic': return { duration: 0.55, layers: [...crack(370).layers, ring({ at: 0.04, duration: 0.5, frequency: 155, gain: 0.17 })] };
      case 'eel': return { duration: 0.65, layers: [...wet(480).layers, noise({ duration: 0.3, gain: 0.3, low: 4200, high: 500 })] };
      case 'worm': return { duration: 2, layers: [noise({ duration: 2, gain: 0.85, low: 260, high: 25, flutter: 16, attack: 0.15, decay: 5 }), noise({ duration: 1.4, gain: 0.35, low: 3600, high: 900, attack: 0.1 }), tone({ duration: 1.9, frequency: 44, end: 32, gain: 0.4, attack: 0.08 })] };
      case 'slug': return wet(75);
    }
  }
  private alert(kind: EnemyKind): Recipe {
    switch (kind) {
      case 'aphid': return { duration: 0.5, layers: [tone({ duration: 0.5, frequency: 450, end: 1800, gain: 0.19, vibrato: 0.08, harmonics: 3, attack: 0.05, decay: 2 }), noise({ duration: 0.5, gain: 0.12, high: 1700, attack: 0.07, decay: 2 })] };
      case 'wasp': return { duration: 0.65, layers: [tone({ duration: 0.65, frequency: 220, end: 620, gain: 0.22, harmonics: 3, flutter: 90, vibrato: 0.035, attack: 0.03 })] };
      case 'beetle': return steps({ count: 8, spacing: 0.1, frequency: 150, gain: 0.22 });
      default: return this.cue(kind);
    }
  }
  private bat(): Recipe {
    return { duration: 0.8, layers: [
      ...[0, 0.11, 0.28, 0.4].map((at) => tone({ at, duration: 0.055, frequency: 6500, end: 3300, gain: 0.13 })),
      noise({ at: 0.15, duration: 0.45, gain: 0.12, low: 2300, high: 400, flutter: 13 }),
    ] };
  }
}
