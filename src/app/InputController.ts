import type { InputFrame, Vec2, WeaponId } from '../contracts';

const KEY = {
  up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD', dash: 'Space',
  reload: 'KeyR', interact: 'KeyE', execute: 'KeyF', adrenaline: 'KeyQ',
  pause: 'Escape', map: 'Tab',
} as const;
const WEAPON_KEYS: Record<string, WeaponId> = {
  Digit1: 'pistol', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'pulse', Digit5: 'rocket',
};
const GAME_KEYS: Readonly<Record<string, boolean>> = Object.fromEntries(
  [...Object.values(KEY), ...Object.keys(WEAPON_KEYS)].map((key) => [key, true]),
);
const PRIMARY_BUTTON = 0;

interface InputCallbacks {
  pause: () => void;
  toggleMap: () => void;
  equip: (id: WeaponId) => void;
  blur: () => void;
}

export class InputController {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  private readonly lifecycle = new AbortController();
  private isFiring = false;

  constructor(private readonly canvas: HTMLElement, private readonly callbacks: InputCallbacks) {
    const options = { signal: this.lifecycle.signal };
    window.addEventListener('keydown', this.pressKey, options);
    window.addEventListener('keyup', this.releaseKey, options);
    window.addEventListener('pointermove', this.movePointer, options);
    canvas.addEventListener('pointerdown', this.pressPointer, options);
    window.addEventListener('pointerup', this.releasePointer, options);
    window.addEventListener('blur', this.loseFocus, options);
    document.addEventListener('visibilitychange', this.changeVisibility, options);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  }

  readFrame(aimFromScreen: (x: number, y: number) => Vec2): InputFrame {
    const frame: InputFrame = {
      moveX: Number(this.held.has(KEY.right)) - Number(this.held.has(KEY.left)),
      moveZ: Number(this.held.has(KEY.down)) - Number(this.held.has(KEY.up)),
      aim: aimFromScreen(this.pointer.x, this.pointer.y), isFiring: this.isFiring,
      dash: this.pressed.has(KEY.dash), reload: this.pressed.has(KEY.reload),
      interact: this.pressed.has(KEY.interact), execute: this.pressed.has(KEY.execute),
      adrenaline: this.pressed.has(KEY.adrenaline),
    };
    this.pressed.clear();
    return frame;
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
    this.isFiring = false;
  }

  dispose(): void {
    this.lifecycle.abort();
    this.clear();
  }

  private readonly pressKey = (event: KeyboardEvent): void => {
    const target = event.target;
    const isFormControl = target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
    const isButtonActivation = target instanceof HTMLButtonElement && event.code === KEY.dash;
    if (isFormControl || isButtonActivation || !GAME_KEYS[event.code]) return;
    event.preventDefault();
    if (event.repeat) return;
    switch (event.code) {
      case KEY.pause: this.callbacks.pause(); return;
      case KEY.map: this.callbacks.toggleMap(); return;
      default: this.pressGameplayKey(event.code);
    }
  };

  private pressGameplayKey(code: string): void {
    const weapon = WEAPON_KEYS[code];
    if (weapon) {
      this.callbacks.equip(weapon);
      return;
    }
    this.held.add(code);
    this.pressed.add(code);
  }

  private readonly releaseKey = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly movePointer = (event: PointerEvent): void => {
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
  };

  private readonly pressPointer = (event: PointerEvent): void => {
    if (event.button !== PRIMARY_BUTTON) return;
    this.isFiring = true;
    this.canvas.focus({ preventScroll: true });
  };

  private readonly releasePointer = (): void => { this.isFiring = false; };

  private readonly loseFocus = (): void => {
    this.clear();
    this.callbacks.blur();
  };

  private readonly changeVisibility = (): void => {
    if (document.hidden) this.loseFocus();
  };
}
