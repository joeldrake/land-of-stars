import { HUD_H } from '../config';
import { Touch } from './touch';
import type { Dir } from './types';

export type Btn = 'a' | 'b' | 'spin' | 'menu' | 'inv' | 'map';

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const KEY_BTN: Record<string, Btn> = {
  Space: 'a', KeyJ: 'a', KeyZ: 'a', Enter: 'a',
  KeyX: 'b', KeyK: 'b',
  KeyQ: 'spin', ShiftLeft: 'spin', ShiftRight: 'spin',
  KeyI: 'inv', KeyC: 'inv', Tab: 'inv', KeyM: 'map',
  Escape: 'menu', KeyP: 'menu',
};

/** Keyboard (arrows + buttons) and touch/mouse gestures on the game screen (`touch`). */
export class Input {
  /** When false (menus open) keys are left alone so buttons/inputs work normally. */
  enabled = false;
  private stack: Dir[] = [];
  private pressed = new Set<Btn>();
  /** Swipes, taps and held fingers on the game screen. */
  readonly touch = new Touch(HUD_H);
  /** Direction presses since the last frame, so menus never miss a quick tap. */
  private dirTaps: Dir[] = [];

  constructor() {
    addEventListener('keydown', e => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      const d = KEY_DIR[e.code];
      if (d) {
        e.preventDefault();
        if (!this.stack.includes(d)) this.stack.push(d);
        if (!e.repeat) this.dirTaps.push(d);
        return;
      }
      const b = KEY_BTN[e.code];
      if (b) {
        e.preventDefault();
        if (!e.repeat) this.pressed.add(b);
      }
    });
    addEventListener('keyup', e => {
      const d = KEY_DIR[e.code];
      if (d) this.stack = this.stack.filter(x => x !== d);
    });
    addEventListener('blur', () => this.reset());
  }

  /** Most recently pressed direction wins, like on a real d-pad. */
  get dir(): Dir | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  consume(b: Btn): boolean {
    const had = this.pressed.has(b);
    this.pressed.delete(b);
    return had;
  }

  /** Press a button from code (taps on the game screen). */
  press(b: Btn) { this.pressed.add(b); }

  /** The oldest direction tap not yet handled (for menus). */
  consumeDir(): Dir | null { return this.dirTaps.shift() ?? null; }

  flush() { this.pressed.clear(); this.dirTaps = []; }

  reset() {
    this.stack = [];
    this.pressed.clear();
    this.dirTaps = [];
    this.touch.reset();
  }
}
