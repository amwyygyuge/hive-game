import type { AudioLevels, GameAction, GameSnapshot, UpgradeId, WeaponId } from '../contracts';
import { RULES, SHOP_ITEMS, UPGRADES, WEAPONS } from '../domain/config';
import { TacticalMap } from './TacticalMap';
import { formatTime, percent, renderIntro, renderPause, renderResult, renderShop, renderUpgrade } from './templates';

const HUD_INTERVAL = 0.1;
const ADRENALINE_MAX = RULES.adrenalineKills;
const INTERACTION_RANGE = 3;
const HEALTH_WARNING = 0.3;
const DEFAULT_LEVELS: AudioLevels = { music: 0.5, effects: 0.7, ambience: 0.45, isMuted: false };
const WEAPON_IDS: Readonly<Record<string, boolean>> = Object.fromEntries(Object.keys(WEAPONS).map(id => [id, true]));
const UPGRADE_IDS: Readonly<Record<string, boolean>> = Object.fromEntries(Object.keys(UPGRADES).map(id => [id, true]));
const SUPPLY_IDS: Readonly<Record<string, boolean>> = Object.fromEntries(Object.keys(SHOP_ITEMS).map(id => [id, true]));
const AUDIO_STATUS_SELECTOR = '.audio-panel p';
const FOCUSABLE = 'button:not(:disabled), input, [tabindex="0"]';

interface HudCallbacks { action: (action: GameAction) => void; levels: (levels: AudioLevels) => void }

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`界面节点缺失: ${selector}`);
  return element;
}

export class GameHud {
  readonly viewport: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly map: TacticalMap;
  private readonly elements: Record<string, HTMLElement>;
  private readonly lifecycle = new AbortController();
  private readonly levels: AudioLevels = { ...DEFAULT_LEVELS };
  private overlayKey = '';
  private elapsed = 0;
  private isLoaded = false;
  private displayedBatteries = -1;

  constructor(private readonly root: HTMLElement, private readonly callbacks: HudCallbacks) {
    root.innerHTML = this.renderShell();
    this.viewport = requireElement(root, '#viewport');
    this.overlay = requireElement(root, '#overlay');
    this.hud = requireElement(root, '#hud');
    this.map = new TacticalMap(requireElement<HTMLCanvasElement>(root, '#tactical-map'));
    this.elements = Object.fromEntries(Array.from(root.querySelectorAll<HTMLElement>('[data-hud]')).map((element) => [element.dataset.hud ?? '', element]));
    const options = { signal: this.lifecycle.signal };
    root.addEventListener('click', this.click, options);
    root.addEventListener('input', this.changeLevel, options);
    root.addEventListener('keydown', this.trapFocus, options);
    this.callbacks.levels(this.levels);
  }

  setLoading(message: string): void {
    const status = this.overlay.querySelector('.load-status');
    if (status) status.textContent = message;
  }

  showAudioLoading():void {
    this.setLoading('正在合成配乐与枪声，首次进入稍候…');
    const button=this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]');
    if(button) {button.disabled=true;button.innerHTML='<span>连接声音系统</span><b>↗</b>';}
  }

  setReady(): void {
    this.isLoaded = true;
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]');
    if (!button) return;
    button.disabled = false;
    button.innerHTML = '<span>进入巢穴</span><b>↗</b>';
    this.setLoading('设施已接入 · 点击开始并启用声音');
  }

  setError(error: unknown): void {
    this.setLoading(`接入失败：${error instanceof Error ? error.message : String(error)}。请检查本地资源后刷新。`);
    this.root.classList.add('has-error');
  }

  toggleMap(): void { this.map.toggle(); }

  update(snapshot: GameSnapshot, dt: number): void {
    this.updateOverlay(snapshot);
    this.elapsed += dt;
    if (this.elapsed < HUD_INTERVAL) return;
    this.elapsed = 0;
    this.updateVitals(snapshot);
    this.updateObjective(snapshot);
    this.updateShop(snapshot);
    this.updateBoss(snapshot);
    this.map.draw(snapshot);
  }

  dispose(): void { this.lifecycle.abort(); }

  private renderShell(): string {
    return `<div id="viewport" tabindex="0" aria-label="游戏场景：WASD 移动，鼠标瞄准射击"></div>
      <div class="screen-grain" aria-hidden="true"></div><div class="damage-vignette" aria-hidden="true"></div>
      <header class="brand-bar"><a href="./" aria-label="深层巢穴首页">HIVE<span>/</span>BELOW</a><span class="build-label">深层巢穴 · 生存协议</span>
      <div class="header-actions"><button class="icon-button" data-action="pause" aria-label="暂停游戏">Ⅱ</button><button class="icon-button" data-ui="audio" aria-label="声音设置" aria-expanded="false">声音</button></div></header>
      <section class="audio-panel" hidden aria-label="声音设置"><h2>声音控制</h2>${(['music', 'effects', 'ambience'] as const).map((channel) => `<label>${{ music: '配乐', effects: '音效', ambience: '环境' }[channel]}<input type="range" min="0" max="1" step="0.05" value="${DEFAULT_LEVELS[channel]}" data-channel="${channel}" aria-label="${channel}" /></label>`).join('')}<label class="mute-control"><input type="checkbox" data-channel="isMuted" /> 总静音</label><p>首次点击进入后启用声音。</p></section>
      <div id="hud" hidden>
        <section class="objective"><p class="eyebrow">PRIMARY OBJECTIVE</p><h2 data-hud="objective">回收供能电池</h2><div class="battery-track" data-hud="batteries"></div><p data-hud="gate">六块电池，一条生路。</p></section>
        <section class="run-info"><span data-hud="region"></span><b data-hud="time">00:00</b><span data-hud="kills">0 击杀</span></section>
        <section class="map-panel"><div class="map-heading"><span>设施平面图</span><button data-ui="map" aria-label="展开战术地图">TAB ↗</button></div><canvas id="tactical-map" aria-label="设施地图：绿色电池，金色补给，白色玩家"></canvas><div class="map-legend"><span>● 电池</span><span>● 补给</span><span>▲ 你</span></div></section>
        <section class="vitals"><div class="health-line"><span>生命体征</span><strong data-hud="health"></strong></div><div class="meter health-meter"><i data-hud="health-bar"></i></div><div class="xp-line"><span data-hud="level"></span><div class="meter xp-meter"><i data-hud="xp-bar"></i></div><span data-hud="xp"></span></div><div class="ability-line"><span data-hud="dash"></span><span data-hud="adrenaline"></span></div></section>
        <section class="weapon-hud"><p data-hud="weapon"></p><div><strong data-hud="ammo"></strong><span data-hud="reserve"></span></div><small data-hud="reload"></small><span class="wallet" data-hud="coins"></span></section>
        <section class="combo-hud" data-hud="combo"></section>
        <section class="boss-hud" data-hud="boss" hidden><strong data-hud="boss-name"></strong><span data-hud="boss-state"></span><div class="meter"><i data-hud="boss-bar"></i></div></section>
        <p class="interaction-hint" data-hud="hint"></p><p class="game-message" data-hud="message" role="status"></p>
        <footer class="key-strip"><span><kbd>WASD</kbd> 移动</span><span><kbd>R</kbd> 换弹</span><span><kbd>空格</kbd> 冲刺</span><span><kbd>E</kbd> 交互</span><span><kbd>F</kbd> 处决</span><span><kbd>Q</kbd> 慢动作</span><span><kbd>Esc</kbd> 暂停</span></footer>
      </div><div id="overlay"></div>`;
  }

  reportAudioError(error: unknown): void {
    const status = requireElement(this.root, AUDIO_STATUS_SELECTOR);
    status.textContent = `声音启用失败：${error instanceof Error ? error.message : String(error)}。可继续游玩，点击继续时重试。`;
  }

  private updateOverlay(snapshot: GameSnapshot): void {
    const key = `${snapshot.phase}:${snapshot.isShopOpen}:${snapshot.player.level}:${snapshot.player.ownedWeapons.join(',')}:${snapshot.player.silenced}`;
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.hud.hidden = snapshot.phase === 'ready';
    const content = this.getOverlayContent(snapshot);
    this.overlay.innerHTML = content;
    this.overlay.className = `overlay ${snapshot.phase === 'ready' ? 'intro-overlay' : 'modal-overlay'} ${snapshot.isShopOpen ? 'is-shop' : ''}`;
    this.overlay.hidden = !content;
    this.overlay.setAttribute('role', snapshot.phase === 'ready' ? 'region' : 'dialog');
    this.overlay.setAttribute('aria-modal', String(!snapshot.isShopOpen && snapshot.phase !== 'ready'));
    this.overlay.setAttribute('aria-label', snapshot.isShopOpen ? '补给终端' : '游戏菜单');
    this.root.dataset.phase = snapshot.phase;
    this.applyOverlayFocus(snapshot);
  }

  private applyOverlayFocus(snapshot: GameSnapshot): void {
    if (snapshot.phase === 'ready') {
      if (this.isLoaded) this.setReady();
      return;
    }
    if (this.overlay.hidden || snapshot.isShopOpen) {
      this.viewport.focus({ preventScroll: true });
      return;
    }
    this.overlay.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  private getOverlayContent(snapshot: GameSnapshot): string {
    switch (snapshot.phase) {
      case 'ready': return renderIntro();
      case 'upgrade': return renderUpgrade(snapshot);
      case 'paused': return renderPause();
      case 'won': case 'lost': return renderResult(snapshot);
      default: return snapshot.isShopOpen ? renderShop(snapshot) : '';
    }
  }

  private updateVitals(snapshot: GameSnapshot): void {
    const player = snapshot.player;
    const values: Record<string, string> = {
      health: `${Math.ceil(player.hp)} / ${player.maxHp}`, level: `LV ${player.level.toString().padStart(2, '0')}`,
      xp: `${Math.floor(player.xp)} / ${player.nextXp}`, weapon: WEAPONS[player.weapon].name,
      ammo: player.ammo.toString().padStart(2, '0'), reserve: `/ ${Number.isFinite(player.reserve) ? player.reserve : '∞'}`,
      reload: player.reloadRemaining > 0 ? `换弹中 ${player.reloadRemaining.toFixed(1)}s` : 'R 换弹 / 1–5 切换',
      coins: `${player.coins} G`, dash: player.dashRemaining > 0 ? `冲刺 ${player.dashRemaining.toFixed(1)}s` : '空格 · 冲刺就绪',
      adrenaline: player.adrenaline >= 1 ? 'Q · 肾上腺素就绪' : `肾上腺素 ${Math.floor(player.adrenaline * ADRENALINE_MAX)} / ${ADRENALINE_MAX}`,
      time: formatTime(snapshot.elapsed), kills: `${player.kills} 击杀`, region: snapshot.regionName,
      combo: player.combo > 1 ? `${player.combo} 连杀 / ×${player.multiplier}` : '', message: snapshot.message,
    };
    for (const [key, value] of Object.entries(values)) {
      if (this.elements[key].textContent !== value) this.elements[key].textContent = value;
    }
    this.elements['health-bar'].style.width = percent(player.hp, player.maxHp);
    this.elements['xp-bar'].style.width = percent(player.xp, player.nextXp);
    this.root.classList.toggle('low-health', player.hp / player.maxHp <= HEALTH_WARNING);
    this.root.classList.toggle('parasitized', player.isParasitized);
    this.root.classList.toggle('slow-motion', player.slowRemaining > 0);
  }

  private updateObjective(snapshot: GameSnapshot): void {
    this.updateBatteryTrack(snapshot);
    this.elements.objective.textContent = snapshot.gatePhase === 'locked' ? '回收供能电池' : '返回大门 · 准备撤离';
    const gateText = { locked: '拔出电池会让巢穴断电。', opening: `虫群狂暴 · 开门剩余 ${Math.ceil(snapshot.gateRemaining)} 秒`, open: '大门已开！穿过南侧出口。' };
    this.elements.gate.textContent = snapshot.batteriesCollected === 6 && snapshot.gatePhase === 'locked' ? '六块已齐，返回南侧大门按 E 安装。' : gateText[snapshot.gatePhase];
    this.elements.hint.textContent = this.getInteractionHint(snapshot);
  }

  private updateBoss(snapshot:GameSnapshot):void {
    const boss=snapshot.enemies.find(enemy=>!enemy.isDead&&(enemy.kind==='worm'||enemy.kind==='slug')&&Math.hypot(enemy.x-snapshot.player.x,enemy.z-snapshot.player.z)<20);
    this.elements.boss.hidden=!boss;
    if(!boss) return;
    this.elements['boss-name'].textContent=boss.kind==='worm'?'钻地沙虫':'豹纹巨蛞蝓';
    const states:Record<string,string>={underground:'潜伏 · 等待震动预警',warning:'地面隆起 · 立即离开标记',exposed:'出土窗口 · 现在开火'};
    this.elements['boss-state'].textContent=boss.kind==='worm'?(states[boss.state]??'锁定目标'):'黏液减速 · 不受硬直影响';
    this.elements['boss-bar'].style.width=percent(boss.hp,boss.maxHp);
  }

  private updateBatteryTrack(snapshot: GameSnapshot): void {
    if (snapshot.batteriesCollected === this.displayedBatteries) return;
    this.displayedBatteries = snapshot.batteriesCollected;
    this.elements.batteries.innerHTML = snapshot.batteries.map((_, index) => `<i class="${index < snapshot.batteriesCollected ? 'collected' : ''}"></i>`).join('') + `<b>${snapshot.batteriesCollected} / ${snapshot.batteries.length}</b>`;
  }

  private getInteractionHint(snapshot: GameSnapshot): string {
    const player = snapshot.player;
    const isNear = (point: { x: number; z: number }): boolean => Math.hypot(point.x - player.x, point.z - player.z) < INTERACTION_RANGE;
    switch (true) {
      case snapshot.enemies.some((enemy) => !enemy.isDead && enemy.isExecutable && isNear(enemy)): return '[F] 靠近处决 · 回血 + 弹药';
      case snapshot.batteries.some((battery) => !battery.isCollected && battery.isAvailable && isNear(battery)): return '[E] 拔出电池';
      case isNear(snapshot.world.shop): return '[E] 补给终端 · 这里并不安全';
      case isNear(snapshot.world.gate): return snapshot.batteriesCollected === 6 ? '[E] 安装电池 / 穿过大门撤离' : '大门需要 6 块电池';
      case snapshot.props.some((prop) => prop.kind === 'door' && prop.hp > 0 && isNear(prop)): return '[E] 开关防火门';
      default: return player.isParasitized ? '寄生中！按空格冲刺甩掉寄生虫' : '';
    }
  }

  private updateShop(snapshot: GameSnapshot): void {
    if (!snapshot.isShopOpen) return;
    for (const button of this.overlay.querySelectorAll<HTMLButtonElement>('[data-price]')) {
      button.disabled = button.dataset.owned === 'true' || Number(button.dataset.price) > snapshot.player.coins;
    }
  }

  private readonly click = (event: MouseEvent): void => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!button || button.disabled) return;
    switch (button.dataset.ui) {
      case 'map': this.toggleMap(); return;
      case 'audio': this.toggleAudio(button); return;
      default: this.dispatchButton(button);
    }
  };

  private toggleAudio(button: HTMLButtonElement): void {
    const panel = requireElement(this.root, '.audio-panel');
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  }

  private dispatchButton(button: HTMLButtonElement): void {
    const { action, id = '' } = button.dataset;
    switch (action) {
      case 'start': case 'restart': case 'pause': case 'resume': case 'closeShop': this.callbacks.action({ type: action }); return;
      case 'equip': if (WEAPON_IDS[id]) this.callbacks.action({ type: 'equip', id: id as WeaponId }); return;
      case 'upgrade': if (UPGRADE_IDS[id]) this.callbacks.action({ type: 'upgrade', id: id as UpgradeId }); return;
      case 'buy': if (WEAPON_IDS[id] || SUPPLY_IDS[id]) this.callbacks.action({ type: 'buy', id: id as WeaponId | 'silencer' | 'ammo' | 'health' });
    }
  }

  private readonly changeLevel = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    switch (input.dataset.channel) {
      case 'music': case 'effects': case 'ambience': this.levels[input.dataset.channel] = Number(input.value); break;
      case 'isMuted': this.levels.isMuted = input.checked; break;
      default: return;
    }
    this.callbacks.levels({ ...this.levels });
  };

  private readonly trapFocus = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || this.overlay.hidden || !this.overlay.contains(document.activeElement)) return;
    const items = Array.from(this.overlay.querySelectorAll<HTMLElement>(FOCUSABLE));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };
}
