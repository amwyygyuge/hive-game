import type { EnemyKind, EnemyView } from '../contracts';

export type EnemyPhase = 'idle' | 'move' | 'telegraph' | 'attack' | 'hidden' | 'dying';

const HIDDEN_STATES = new Set(['underground', 'hidden']);
const TELEGRAPH_STATES = new Set(['telegraph', 'windup', 'charge', 'leap']);
const ATTACK_STATES = new Set(['attack', 'emerged', 'exposed', 'risen']);
const MOVE_STATES = new Set(['chase', 'retracting']);
const DORMANT_STATES = new Set(['dormant', 'feigning', 'stunned']);

/** Classifies the domain's raw state string into a small set of visual phases shared by every enemy kind. */
export function classifyPhase(enemy: EnemyView): EnemyPhase {
  if (enemy.isDead || enemy.state === 'dead') return 'dying';
  if (HIDDEN_STATES.has(enemy.state)) return 'hidden';
  if (DORMANT_STATES.has(enemy.state)) return 'idle';
  if (TELEGRAPH_STATES.has(enemy.state)) return 'telegraph';
  if (ATTACK_STATES.has(enemy.state)) return 'attack';
  if (MOVE_STATES.has(enemy.state)) return 'move';
  return enemy.state === 'idle' ? 'idle' : 'move';
}

export const isMimicDisguised = (enemy: EnemyView): boolean => enemy.kind === 'mimic' && enemy.state !== 'attack' && enemy.state !== 'chase' && enemy.state !== 'dead';
export const isCorpseSpiderDown = (enemy: EnemyView): boolean => enemy.kind === 'corpseSpider' && enemy.state === 'feigning';
export const isWormUnderground = (enemy: EnemyView): boolean => enemy.kind === 'worm' && enemy.state === 'underground';
export const isWormTelegraphing = (enemy: EnemyView): boolean => enemy.kind === 'worm' && enemy.state === 'telegraph';
export const isEelHidden = (enemy: EnemyView): boolean => enemy.kind === 'eel' && enemy.state === 'hidden';

const CLIP_PRIORITY: Record<EnemyKind, readonly string[]> = {
  bug: ['Run', 'Walk', 'Idle'], aphid: ['Run', 'Walk', 'Idle'], parasite: ['Run', 'Walk', 'Idle'],
  centipede: ['Crawl', 'Idle'], queen: ['Run', 'Walk', 'Idle'], cocoon: ['Idle'],
  spider: ['Run', 'Walk', 'Idle'], corpseSpider: ['Walk', 'Idle'], wasp: ['Fly fast', 'Fly', 'Idle'],
  bat: ['Fly', 'Run', 'Walk', 'Idle'], mantis: ['Run', 'Walk', 'Idle'], crab: ['Run', 'Walk', 'Idle'],
  beetle: ['Run', 'Walk', 'Idle'], raptor: ['Run', 'Walk', 'Idle'], moth: ['Fly fast', 'Fly', 'Idle'],
  ghoul: ['Run', 'Walk', 'Idle'], jellyfish: ['Swim fast', 'Swim', 'Idle'], mimic: ['Run', 'Walk', 'Idle'],
  eel: ['Swim fast', 'Swim', 'Idle'], worm: ['Crawl', 'Idle'], slug: ['Crawl', 'Idle'],
};
const RUN_SPEED = 3.6;
const IDLE_SPEED = 0.3;

/** Picks the preferred clip that exists on the loaded model: fastest clip above the run threshold, idle below the idle threshold, else the next slower clip in priority order. */
export function pickClipName(options: { kind: EnemyKind; available: readonly string[]; speed: number }): string | undefined {
  const priority = CLIP_PRIORITY[options.kind];
  const chain = options.speed > RUN_SPEED ? priority : options.speed < IDLE_SPEED ? [...priority].reverse() : priority.slice(1).concat(priority[0]);
  return chain.find((name) => options.available.includes(name));
}

