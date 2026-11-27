import type { GameAction, InputFrame } from '../contracts';
import { GameSession } from '../domain/GameSession';
import { GameRenderer } from '../render/GameRenderer';
import { AudioDirector } from '../audio/AudioDirector';
import { GameHud } from '../ui/GameHud';
import { InputController } from './InputController';

const LOOP = { step: 1 / 60, maxDelta: 0.1, milliseconds: 1000 } as const;
const PASSIVE_KEYS = { dash: false, reload: false, interact: false, execute: false, adrenaline: false } as const;

export class GameApplication {
  private readonly session = new GameSession();
  private readonly audio = new AudioDirector();
  private readonly hud: GameHud;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private readonly lifecycle = new AbortController();
  private readonly loop = { last: 0, accumulator: 0, request: 0, isReady: false, isDisposed: false };
  private pendingInput: InputFrame | null = null;
  private isStarting=false;

  constructor(root: HTMLElement) {
    this.hud = new GameHud(root, {
      action: (action) => this.dispatch(action),
      levels: (levels) => this.audio.setLevels(levels),
    });
    this.renderer = new GameRenderer(this.hud.viewport);
    this.input = new InputController(this.hud.viewport, {
      pause: () => this.togglePause(), toggleMap: () => this.hud.toggleMap(),
      equip: (id) => this.dispatch({ type: 'equip', id }), blur: () => this.pauseForFocus(),
    });
    window.addEventListener('resize', () => this.renderer.resize(), { signal: this.lifecycle.signal });
    window.addEventListener('pagehide', () => this.dispose(), { signal: this.lifecycle.signal });
    this.hud.update(this.session.getSnapshot(), LOOP.step);
  }

  async initialize(): Promise<void> {
    try {
      await this.renderer.initialize(this.session.getSnapshot(), (message) => this.hud.setLoading(message));
      this.renderer.render(this.session.getSnapshot(), { dt: 0, events: [] });
      this.loop.isReady = true;
      this.hud.setReady();
      this.loop.last = performance.now();
      this.loop.request = requestAnimationFrame(this.tick);
    } catch (error: unknown) {
      this.hud.setError(error);
      console.error('Game initialization failed', error);
    }
  }

  getDiagnostics(): object {
    const snapshot = this.session.getSnapshot();
    return {
      phase: snapshot.phase, elapsed: snapshot.elapsed, batteries: snapshot.batteriesCollected,
      player: { x: snapshot.player.x, z: snapshot.player.z, hp: snapshot.player.hp, ammo: snapshot.player.ammo, weapon: snapshot.player.weapon, kills: snapshot.player.kills },
      enemies: snapshot.enemies.filter((enemy) => !enemy.isDead).length,
      isShopOpen: snapshot.isShopOpen,
      audio: this.audio.getDiagnostics(), renderer: this.renderer.getDiagnostics(),
    };
  }

  dispose(): void {
    if (this.loop.isDisposed) return;
    this.loop.isDisposed = true;
    cancelAnimationFrame(this.loop.request);
    this.lifecycle.abort();
    this.input.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }

  private dispatch(action: GameAction): void {
    if (!this.loop.isReady) return;
    if(action.type==='start'||action.type==='restart') {void this.startRun(action.type);return;}
    this.input.clear();
    this.pendingInput = null;
    this.session.dispatch(action);
    this.applyActionAudio(action);
    this.hud.update(this.session.getSnapshot(), LOOP.step);
  }

  private async startRun(type:'start'|'restart'):Promise<void> {
    if(this.isStarting) return;
    this.isStarting=true;this.hud.showAudioLoading();
    try {await this.audio.unlock();}
    catch(error:unknown) {this.hud.reportAudioError(error);console.warn('Audio unavailable',error);}
    this.isStarting=false;
    if(this.loop.isDisposed) return;
    this.input.clear();this.pendingInput=null;
    this.session.dispatch({type});
    this.session.dispatch({type:'start'});
    if(document.hidden) {this.session.dispatch({type:'pause'});this.audio.suspend();}
    this.hud.update(this.session.getSnapshot(),LOOP.step);
  }

  private applyActionAudio(action: GameAction): void {
    if (action.type === 'pause') {
      this.audio.suspend();
      return;
    }
    void this.audio.unlock().catch((error: unknown) => {
      this.hud.reportAudioError(error);
      console.warn('Audio unavailable; gameplay remains available', error);
    });
  }

  private togglePause(): void {
    const snapshot = this.session.getSnapshot();
    if (snapshot.isShopOpen) {
      this.dispatch({ type: 'closeShop' });
      return;
    }
    switch (snapshot.phase) {
      case 'playing': this.dispatch({ type: 'pause' }); break;
      case 'paused': this.dispatch({ type: 'resume' }); break;
      default: break;
    }
  }

  private pauseForFocus(): void {
    this.pendingInput = null;
    if (this.session.getSnapshot().phase === 'playing') this.dispatch({ type: 'pause' });
    this.audio.suspend();
  }

  private readonly tick = (now: number): void => {
    if (this.loop.isDisposed) return;
    const dt = Math.min(LOOP.maxDelta, Math.max(0, (now - this.loop.last) / LOOP.milliseconds));
    this.loop.last = now;
    this.loop.accumulator += dt;
    this.mergeInput(this.input.readFrame((x, y) => this.renderer.aimFromScreen(x, y)));
    this.advanceSimulation();
    const snapshot = this.session.getSnapshot();
    const events = this.session.drainEvents();
    this.renderer.render(snapshot, { dt, events });
    this.audio.update(snapshot, events);
    this.hud.update(snapshot, dt);
    this.loop.request = requestAnimationFrame(this.tick);
  };

  private mergeInput(frame: InputFrame): void {
    const previous = this.pendingInput;
    this.pendingInput = {
      ...frame, dash: frame.dash || Boolean(previous?.dash), reload: frame.reload || Boolean(previous?.reload),
      interact: frame.interact || Boolean(previous?.interact), execute: frame.execute || Boolean(previous?.execute),
      adrenaline: frame.adrenaline || Boolean(previous?.adrenaline),
    };
  }

  private advanceSimulation(): void {
    if (!this.pendingInput) return;
    while (this.loop.accumulator >= LOOP.step) {
      this.session.step(LOOP.step, this.pendingInput);
      this.pendingInput = { ...this.pendingInput, ...PASSIVE_KEYS };
      this.loop.accumulator -= LOOP.step;
    }
  }
}
