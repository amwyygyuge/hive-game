export type Vec2 = { x: number; z: number };
export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'pulse' | 'rocket';
export type EnemyKind = 'bug' | 'aphid' | 'parasite' | 'centipede' | 'queen' | 'cocoon' | 'spider' | 'corpseSpider' | 'wasp' | 'bat' | 'mantis' | 'crab' | 'beetle' | 'raptor' | 'moth' | 'ghoul' | 'jellyfish' | 'mimic' | 'eel' | 'worm' | 'slug';
export type RunPhase = 'ready' | 'playing' | 'upgrade' | 'paused' | 'won' | 'lost';
export type GatePhase = 'locked' | 'opening' | 'open';
export type UpgradeId = 'health' | 'damage' | 'fireRate' | 'speed' | 'reload' | 'critical' | 'dash' | 'pickup' | 'regeneration' | 'flashlight' | 'nightVision' | 'quiet' | 'heartbeat' | 'greed' | 'learning';
export interface UpgradeOption { id: UpgradeId; name: string; description: string; line: 'combat' | 'dark' | 'economy'; stacks: number; maxStacks: number }
export interface WeaponSpec { id: WeaponId; name: string; price: number; damage: number; rate: number; magazine: number; reload: number; noise: number; pellets: number; reserve: number; model: string }
export interface PlayerView extends Vec2 {
  angle: number; hp: number; maxHp: number; level: number; xp: number; nextXp: number;
  coins: number; kills: number; weapon: WeaponId; ammo: number; reserve: number;
  reloadRemaining: number; dashRemaining: number; invulnerable: number;
  combo: number; multiplier: number; adrenaline: number; slowRemaining: number;
  flashlightRange: number; nightVision: boolean; heartbeat: boolean; silenced: boolean;
  isMoving: boolean; isParasitized: boolean; ownedWeapons: WeaponId[];
}
export interface EnemyView extends Vec2 {
  id: number; kind: EnemyKind; angle: number; hp: number; maxHp: number; radius: number;
  state: string; stateTime: number; isElite: boolean; isDead: boolean; isVulnerable: boolean;
  isExecutable: boolean; isSevered: boolean; partHp: number; target: Vec2;
}
export interface ProjectileView extends Vec2 { id: number; previous: Vec2; angle: number; radius: number; isEnemy: boolean; isRocket: boolean; life: number }
export interface PickupView extends Vec2 { id: number; kind: 'coin' | 'ammo' | 'health'; value: number }
export interface BatteryView extends Vec2 { id: number; isCollected: boolean; isAvailable: boolean; guardianId: number | null; label: string }
export interface HazardView extends Vec2 { id: number; kind: 'acid' | 'fire' | 'slime' | 'water' | 'warning'; radius: number; remaining: number }
export interface PropView extends Vec2 { id: number; kind: 'barrel' | 'electric' | 'door' | 'crate'; hp: number; maxHp: number; isActive: boolean; angle: number }
export interface WallView extends Vec2 { width: number; depth: number; height: number }
export interface RegionView extends Vec2 { id: number; name: string; subtitle: string; width: number; depth: number; tier: number }
export interface Decoration extends Vec2 { model: string; angle: number; scale: number }
export interface WorldLayout { width: number; depth: number; spawn: Vec2; shop: Vec2; gate: Vec2; exit: Vec2; walls: WallView[]; regions: RegionView[]; decorations: Decoration[] }
export interface GameSnapshot {
  phase: RunPhase; elapsed: number; seed: number; player: PlayerView;
  enemies: EnemyView[]; projectiles: ProjectileView[]; pickups: PickupView[];
  batteries: BatteryView[]; hazards: HazardView[]; props: PropView[];
  batteriesCollected: number; gatePhase: GatePhase; gateRemaining: number;
  upgradeOptions: UpgradeOption[]; isShopOpen: boolean; message: string;
  regionName: string; world: WorldLayout;
}
export interface InputFrame { moveX: number; moveZ: number; aim: Vec2; isFiring: boolean; dash: boolean; reload: boolean; interact: boolean; execute: boolean; adrenaline: boolean }
export type GameAction =
  | { type: 'start' | 'restart' | 'pause' | 'resume' | 'closeShop' }
  | { type: 'upgrade'; id: UpgradeId }
  | { type: 'buy'; id: WeaponId | 'silencer' | 'ammo' | 'health' }
  | { type: 'equip'; id: WeaponId };
export type GameEventType = 'shot' | 'hit' | 'kill' | 'hurt' | 'reload' | 'empty' | 'pickup' | 'battery' | 'gate' | 'win' | 'death' | 'upgrade' | 'purchase' | 'dash' | 'execute' | 'adrenaline' | 'explosion' | 'sever' | 'enemyCue' | 'step' | 'combo';
export interface GameEvent extends Vec2 { type: GameEventType; kind?: EnemyKind; weapon?: WeaponId; value?: number; angle?: number; silenced?: boolean }
export interface AudioLevels { music: number; effects: number; ambience: number; isMuted: boolean }
