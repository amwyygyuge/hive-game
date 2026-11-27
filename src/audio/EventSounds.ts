import type { EnemyKind, GameEvent, GameSnapshot, PickupView, WeaponId } from '../contracts';
import { GlobalEffects } from './AudioGraph';
import { RELOAD_SECONDS } from './ActionRecipes';
import { SpatialPlayer } from './SpatialPlayer';
import { semitones, unit } from './SampleSynth';
import type { SoundId } from './types';

const WEAPON_RANGE: Record<WeaponId, number> = { pistol: 24, smg: 28, shotgun: 40, pulse: 32, rocket: 48 };
const ARMORED: readonly EnemyKind[] = ['bug', 'centipede', 'queen', 'spider', 'corpseSpider', 'crab', 'beetle', 'mimic', 'mantis'];
const BURSTING: readonly EnemyKind[] = ['aphid', 'parasite', 'cocoon', 'jellyfish'];
const COIN_LADDER_SECONDS = 0.35;
const PICKUP_MATCH_RANGE = 2;
const ENEMY_RANGE: Partial<Record<EnemyKind, number>> = { moth: 2, spider: 5, mantis: 7, queen: 30, worm: 45, slug: 30, ghoul: 26, cocoon: 11, mimic: 14, corpseSpider: 12 };

export class EventSounds {
  private previousPickups: readonly PickupView[] = [];
  private coinTime = -Infinity;
  private coinChain = 0;
  private ending: 'won' | 'lost' | null = null;
  private countdown = -1;
  private gateWasOpen = false;

  constructor(private readonly options: { player: SpatialPlayer; effects: GlobalEffects; now: () => number }) {}

  consume(snapshot: GameSnapshot, events: readonly GameEvent[]): void {
    events.forEach((event) => this.route(event, snapshot));
    this.updateGate(snapshot);
    this.updateEnding(snapshot);
    this.previousPickups = snapshot.pickups;
  }
  remember(snapshot: GameSnapshot): void {
    // Paused/background frames consume their batches without queueing any delayed playback.
    this.previousPickups = snapshot.pickups;
    this.countdown = snapshot.gatePhase === 'opening' ? Math.ceil(snapshot.gateRemaining) : -1;
    this.gateWasOpen = snapshot.gatePhase === 'open';
  }
  reset(): void {
    this.previousPickups = [];
    this.coinTime = -Infinity;
    this.coinChain = 0;
    this.ending = null;
    this.countdown = -1;
    this.gateWasOpen = false;
  }
  private route(event: GameEvent, snapshot: GameSnapshot): void {
    switch (event.type) {
      case 'shot': this.shot(event, snapshot); break;
      case 'hit': this.hit(event, snapshot); break;
      case 'kill': this.kill(event); break;
      case 'enemyCue': this.enemyCue(event); break;
      case 'step': this.step(event, snapshot); break;
      case 'reload': this.reload(event, snapshot); break;
      case 'pickup': this.pickup(event); break;
      case 'battery': this.options.player.play({ id: 'battery', gain: 0.8, priority: 5 }); break;
      case 'gate': this.options.player.play({ id: 'gate', position: event, range: 80, priority: 4 }); break;
      case 'hurt': this.hurt(event); break;
      case 'explosion': this.explosion(event, snapshot); break;
      case 'adrenaline': this.adrenaline(); break;
      case 'death': this.playEnding('lost'); break;
      case 'win': this.playEnding('won'); break;
      case 'empty': this.options.player.play({ id: 'empty', gain: 0.8, priority: 4 }); break;
      case 'upgrade': this.options.player.play({ id: 'upgrade', gain: 0.8, priority: 4 }); break;
      case 'purchase': this.options.player.play({ id: 'purchase', gain: 0.8, priority: 4 }); break;
      case 'dash': this.options.player.play({ id: 'dash', gain: 0.6, priority: 2 }); break;
      case 'execute': this.options.player.play({ id: 'execute', position: event, range: 18, gain: 1.1, priority: 5 }); break;
      case 'sever': this.options.player.play({ id: 'sever', position: event, range: 22, gain: 0.8, priority: 4 }); break;
      case 'combo': this.options.player.play({ id: 'combo', gain: 0.7, rate: semitones((event.value ?? 10) >= 50 ? 7 : (event.value ?? 10) >= 25 ? 4 : 0), priority: 4 }); break;
    }
  }
  private shot(event: GameEvent, snapshot: GameSnapshot): void {
    if (event.kind && !event.weapon) { this.enemyCue({ ...event, value: event.value ?? 2 }); return; }
    const weapon = event.weapon ?? snapshot.player.weapon;
    const quiet = event.silenced ?? snapshot.player.silenced;
    this.options.player.play({ id: `${quiet ? 'quiet' : 'gun'}.${weapon}`, position: event, range: WEAPON_RANGE[weapon] * (quiet ? 0.2 : 1), gain: quiet ? 0.6 : 0.8, priority: 3 });
  }
  private hit(event: GameEvent, snapshot: GameSnapshot): void {
    const crab = event.kind === 'crab' ? snapshot.enemies.find((enemy) => enemy.kind === 'crab' && Math.hypot(enemy.x - event.x, enemy.z - event.z) < 2) : undefined;
    const facing = crab ? Math.atan2(snapshot.player.x - crab.x, snapshot.player.z - crab.z) : 0;
    const armor = crab && Math.cos(facing - crab.angle) > 0.45;
    const id: SoundId = armor ? 'armor' : event.kind && ARMORED.includes(event.kind) ? 'hit.shell' : 'hit.flesh';
    this.options.player.play({ id, position: event, range: 17, gain: 0.3 + unit((event.value ?? 10) / 40) * 0.4, priority: 2 });
  }
  private kill(event: GameEvent): void {
    const id: SoundId = event.kind && BURSTING.includes(event.kind) ? 'death.burst' : event.kind && ARMORED.includes(event.kind) ? 'death.shell' : 'death.flesh';
    this.options.player.play({ id, position: event, range: 22, gain: 0.65, priority: 2 });
  }
  private enemyCue(event: GameEvent): void {
    if (!event.kind) return;
    const range = ENEMY_RANGE[event.kind] ?? 22;
    const id: SoundId = `${(event.value ?? 1) >= 1 ? 'alert' : 'cue'}.${event.kind}`;
    this.options.player.play({ id, position: event, range, gain: event.kind === 'moth' ? 0.3 : 0.9, priority: 5 });
  }
  private step(event: GameEvent, snapshot: GameSnapshot): void {
    if (event.kind) { this.enemyCue({ ...event, value: 0 }); return; }
    const slime = snapshot.hazards.some((hazard) => ['slime', 'acid', 'water'].includes(hazard.kind) && Math.hypot(event.x - hazard.x, event.z - hazard.z) < hazard.radius);
    const region = snapshot.world.regions.find((area) => Math.abs(event.x - area.x) < area.width / 2 && Math.abs(event.z - area.z) < area.depth / 2);
    const id: SoundId = slime ? 'step.slime' : (region?.tier ?? 1) % 2 ? 'step.metal' : 'step.concrete';
    const quiet = unit(event.value ?? 1);
    this.options.player.play({ id, position: event, range: 12 * quiet, gain: 0.42 * quiet, priority: 1 });
  }
  private reload(event: GameEvent, snapshot: GameSnapshot): void {
    const weapon = event.weapon ?? snapshot.player.weapon;
    const duration = snapshot.player.reloadRemaining || event.value || RELOAD_SECONDS[weapon];
    this.options.player.play({ id: `reload.${weapon}`, gain: 0.75, rate: RELOAD_SECONDS[weapon] / duration, priority: 4 });
  }
  private pickup(event: GameEvent): void {
    const pickup = this.previousPickups.find((candidate) => Math.hypot(candidate.x - event.x, candidate.z - event.z) < PICKUP_MATCH_RANGE);
    const byValue:Partial<Record<number,SoundId>>={[-1]:'ammo',[-2]:'health'};
    const id=event.value===undefined?(pickup?.kind??'coin'):(byValue[event.value]??'coin');
    const now = this.options.now();
    this.coinChain = now - this.coinTime < COIN_LADDER_SECONDS ? Math.min(12, this.coinChain + 1) : 0;
    this.coinTime = now;
    this.options.player.play({ id, gain: 0.65, rate: id === 'coin' ? semitones(this.coinChain * 0.65) : 1, priority: 3 });
  }
  private hurt(event: GameEvent): void {
    this.options.player.play({ id: 'hurt', gain: 0.6 + unit((event.value ?? 8) / 35) * 0.35, priority: 5 });
    this.options.effects.trigger({ type: 'hurt', now: this.options.now() });
    this.options.player.play({ id: 'tinnitus', gain: 0.5, priority: 2 });
  }
  private explosion(event: GameEvent, snapshot: GameSnapshot): void {
    const intensity = unit(1 - Math.hypot(event.x - snapshot.player.x, event.z - snapshot.player.z) / 12);
    this.options.player.play({ id: 'explosion', position: event, range: 55, gain: 0.95, priority: 4 });
    if (intensity > 0.1) {
      this.options.effects.trigger({ type: 'explosion', now: this.options.now(), intensity });
      this.options.player.play({ id: 'tinnitus', gain: intensity * 0.8, priority: 2 });
    }
  }
  private adrenaline(): void {
    this.options.player.play({ id: 'adrenaline', gain: 0.85, priority: 5 });
    this.options.effects.trigger({ type: 'adrenaline', now: this.options.now() });
  }
  private updateGate(snapshot: GameSnapshot): void {
    const seconds = snapshot.gatePhase === 'opening' ? Math.ceil(snapshot.gateRemaining) : -1;
    if (seconds > 0 && seconds !== this.countdown) {
      this.options.player.play({ id: 'countdown', gain: 0.65, rate: semitones(seconds <= 5 ? 7 : seconds <= 10 ? 3 : 0), priority: 5 });
    } else if (snapshot.gatePhase === 'open' && !this.gateWasOpen) {
      this.options.player.play({ id: 'gateOpen', position: snapshot.world.gate, range: 90, priority: 5 });
    }
    this.countdown = seconds;
    this.gateWasOpen = snapshot.gatePhase === 'open';
  }
  private updateEnding(snapshot: GameSnapshot): void {
    if (snapshot.phase === 'won' || snapshot.phase === 'lost') this.playEnding(snapshot.phase);
    else if (snapshot.phase === 'ready' || snapshot.phase === 'playing') this.ending = null;
  }
  private playEnding(ending: 'won' | 'lost'): void {
    if (this.ending === ending) return;
    this.ending = ending;
    this.options.player.stopAll();
    this.options.player.play({ id: ending === 'won' ? 'win' : 'death', gain: 0.8, priority: 5 });
  }
}
