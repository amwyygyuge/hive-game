import type { EnemyKind, WeaponId } from '../contracts';

export const MODEL = {
  player: 'base-commander', battery: 'battery-bank-b4d362', shop: 'field-console-a92adc',
  gate: 'barred-cell-door-571e9c', barrel: 'oil-drum-386c30', electric: 'site-generator-298792',
  door: 'iron-bound-door-e0e953', crate: 'ammo-crate-ee3ec0',
} as const;
export const ENEMY_MODELS: Record<EnemyKind, string> = {
  bug: 'alien-hive-bug-base', aphid: 'green-aphid-base', parasite: 'green-aphid-base',
  centipede: 'stone-centipede-base', queen: 'ant-queen-base', cocoon: 'ant-pupa-cocoon-3e6ebd',
  spider: 'tarantula-base', corpseSpider: 'tarantula-base', wasp: 'common-wasp-base',
  bat: 'bat-base', mantis: 'praying-mantis-base', crab: 'reef-crab-base', beetle: 'stag-beetle-base',
  raptor: 'velociraptor-base', moth: 'honey-moth-base', ghoul: 'flesh-eater-base',
  jellyfish: 'moon-jellyfish-0fa43c', mimic: 'hermit-crab-base', eel: 'moray-eel-base',
  worm: 'earthworm-base', slug: 'leopard-slug-base',
};
export const WEAPON_MODELS: Record<WeaponId, string> = {
  pistol: 'pistol-42de05', smg: 'rifle-df1815', shotgun: 'bolt-action-rifle-2f1793',
  pulse: 'rotary-cannon-e2114b', rocket: 'rocket-launcher-032299',
};
export const RENDER = {
  maxPixelRatio: 1.5, viewHeight: 17, minViewWidth: 17, cameraHeight: 25,
  cameraBack: 17.5, cameraFollow: 9, cameraLead: 1.3, far: 140, maxDelta: 0.05,
  cullDistance: 29, nightVisionRange: 8, shadowSize: 1024, flashlightHeight: 1.35,
  flashlightIntensity: 44, flashlightAngle: 0.5, flashlightDecay: 1.15,
  ambient: [0.62, 0.53, 0.44, 0.22, 0.16, 0.085, 0.065],
  fill: [1.0, 0.8, 0.65, 0.28, 0.2, 0.065, 0.055],
  fogDensity: 0.026, background: 0x071013, corpseLimit: 96,
} as const;
export const BLOOD_GREEN = new Set<EnemyKind>(['bug', 'aphid', 'parasite', 'centipede', 'queen', 'cocoon', 'wasp', 'mantis', 'slug']);
export const FLYING = new Set<EnemyKind>(['wasp', 'bat', 'moth', 'jellyfish']);
export const SEVER_BONES: Partial<Record<EnemyKind, readonly string[]>> = {
  centipede: ['Tail'], crab: ['LeftLeg1Hip', 'LeftLeg2Hip'], spider: ['Abdomen'],
  corpseSpider: ['Abdomen'], beetle: ['LeftMandible', 'RightMandible'],
  wasp: ['LeftForeWing', 'LeftHindWing', 'RightForeWing', 'RightHindWing'], mantis: ['LeftRaptorCoxa'],
};
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const damp = (current: number, options: { target: number; speed: number; dt: number }): number =>
  current + (options.target - current) * (1 - Math.exp(-options.speed * options.dt));
