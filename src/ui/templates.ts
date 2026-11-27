import type { GameSnapshot, WeaponId } from '../contracts';
import { SHOP_ITEMS, WEAPONS } from '../domain/config';

const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'shotgun', 'pulse', 'rocket'];
const SECONDS_PER_MINUTE = 60;
const PERCENT = 100;

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % SECONDS_PER_MINUTE).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export function renderIntro(): string {
  return `<section class="intro" aria-labelledby="intro-title">
    <div class="eyebrow"><span class="signal-dot"></span> 深层设施 · 最后撤离指令</div>
    <h1 id="intro-title">深层<br><span>巢穴</span><i>HIVE / BELOW</i></h1>
    <p class="intro-copy">电还亮着。它们还没醒。<br>找到六块电池，带走这里最后的光。</p>
    <button class="primary enter-button" data-action="start" disabled><span>正在接入设施</span><b>↗</b></button>
    <p class="load-status" role="status">初始化渲染引擎…</p>
    <div class="intro-meta"><span>单人 / 生存射击</span><span>键盘 + 鼠标 · 建议戴耳机</span></div>
  </section>
  <aside class="briefing" aria-label="行动目标">
    <p class="eyebrow">MISSION BRIEF / 06</p>
    <h2>每带走一束光，<br>黑暗便更近一步。</h2>
    <ol><li><b>01</b><span>搜集电池<small>杀怪攒金币，购买火力，深入巢穴。</small></span></li>
    <li><b>02</b><span>承受断电<small>每拔出一块电池，虫群更狂暴。</small></span></li>
    <li><b>03</b><span>活着离开<small>回到南侧大门，守住最后 30 秒。</small></span></li></ol>
    <div class="briefing-controls"><kbd>W A S D</kbd> 移动 <kbd>鼠标</kbd> 瞄准 / 开火<br><kbd>空格</kbd> 冲刺 <kbd>E</kbd> 交互 <kbd>F</kbd> 处决</div>
  </aside>`;
}

export function renderUpgrade(snapshot: GameSnapshot): string {
  return `<section class="modal-content upgrade-panel"><p class="eyebrow">ADAPT / LEVEL ${snapshot.player.level}</p>
    <h2>在黑暗中进化</h2><p class="muted">选择一项强化。本次选择时战斗暂停。</p>
    <div class="upgrade-options">${snapshot.upgradeOptions.map((option, index) => `
      <button class="upgrade-card" data-action="upgrade" data-id="${option.id}">
        <span class="option-index">0${index + 1}</span><span class="eyebrow">${{ combat: '战斗适应', dark: '暗线生存', economy: '资源获取' }[option.line]}</span>
        <strong>${option.name}</strong><p>${option.description}</p><small>${option.stacks} / ${option.maxStacks} 层 <span>选择 ↗</span></small>
      </button>`).join('')}</div></section>`;
}

export function renderShop(snapshot: GameSnapshot): string {
  return `<section class="modal-content shop-panel"><div class="panel-heading"><div><p class="eyebrow">SUPPLY TERMINAL</p><h2>补给终端</h2></div><button class="text-button" data-action="closeShop">关闭 [E / Esc]</button></div>
    <p class="shop-warning">灯光不会保护你。交易期间虫群仍在行动。</p>
    <div class="shop-items">${WEAPON_ORDER.filter((id) => id !== 'pistol').map((id) => renderWeapon(snapshot, id)).join('')}
      ${Object.values(SHOP_ITEMS).map((item) => renderSupply({ ...item, isOwned: item.id === 'silencer' && snapshot.player.silenced })).join('')}
    </div><p class="muted">已购武器永久保留至本局结束 · 数字键 1–5 切换</p></section>`;
}

function renderWeapon(snapshot: GameSnapshot, id: WeaponId): string {
  const weapon = WEAPONS[id];
  const isOwned = snapshot.player.ownedWeapons.includes(id);
  return `<button class="shop-item" data-action="${isOwned ? 'equip' : 'buy'}" data-id="${id}" data-price="${isOwned ? 0 : weapon.price}">
    <span><strong>${weapon.name}</strong><small>${weapon.damage}${weapon.pellets > 1 ? ` × ${weapon.pellets}` : ''} 伤害 / ${weapon.magazine} 发弹匣</small></span>
    <b>${isOwned ? '装备 ↗' : `${weapon.price} G`}</b></button>`;
}

function renderSupply(item: { id: string; name: string; description: string; price: number; isOwned: boolean }): string {
  return `<button class="shop-item" data-action="buy" data-id="${item.id}" data-price="${item.price}" ${item.isOwned ? 'disabled data-owned="true"' : ''}>
    <span><strong>${item.name}</strong><small>${item.description}</small></span><b>${item.isOwned ? '已安装' : `${item.price} G`}</b></button>`;
}

export function renderPause(): string {
  return `<section class="modal-content pause-panel"><p class="eyebrow">SIGNAL HELD</p><h2>呼吸一下。</h2>
    <p class="muted">游戏已暂停。返回后继续本次行动。</p>
    <div class="pause-controls"><p><kbd>W A S D</kbd> 移动 <kbd>鼠标左键</kbd> 开火</p><p><kbd>R</kbd> 换弹 <kbd>空格</kbd> 冲刺 <kbd>F</kbd> 处决</p>
    <p><kbd>E</kbd> 拾取电池 / 商店 / 大门 / 防火门</p><p><kbd>Q</kbd> 肾上腺素 <kbd>1–5</kbd> 武器 <kbd>Tab</kbd> 地图</p></div>
    <div class="button-row"><button class="primary" data-action="resume">继续行动 ↗</button><button class="text-button" data-action="restart">重新开始</button></div>
  </section>`;
}

export function renderResult(snapshot: GameSnapshot): string {
  const hasWon = snapshot.phase === 'won';
  return `<section class="modal-content result-panel"><p class="eyebrow">${hasWon ? 'EXTRACTION COMPLETE' : 'SIGNAL LOST'}</p>
    <h2>${hasWon ? '你带回了光。' : '巢穴记住了你。'}</h2><p class="muted">${hasWon ? '六块电池。最后三十秒。一次生还。' : '这不是安全区。下一次，听清黑暗里的声音。'}</p>
    <div class="result-stats"><div><b>${formatTime(snapshot.elapsed)}</b><span>行动时间</span></div><div><b>${snapshot.player.kills}</b><span>击杀</span></div>
    <div><b>${snapshot.batteriesCollected}/6</b><span>回收电池</span></div><div><b>${snapshot.player.level}</b><span>适应等级</span></div></div>
    <button class="primary" data-action="restart">再次深入 ↗</button></section>`;
}

export function percent(value: number, maximum: number): string {
  return `${Math.max(0, Math.min(PERCENT, value / Math.max(1, maximum) * PERCENT))}%`;
}
