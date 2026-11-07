import type { Dir } from './types';

export type Btn = 'a' | 'b' | 'menu';

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const KEY_BTN: Record<string, Btn> = {
  Space: 'a', KeyJ: 'a', KeyZ: 'a', Enter: 'a',
  KeyX: 'b', KeyK: 'b',
  Escape: 'menu', KeyP: 'menu',
};

/** Keyboard + on-screen touch controls, merged into one 4-way direction and button presses. */
export class Input {
  /** When false (menus open) keys are left alone so buttons/inputs work normally. */
  enabled = false;
  private stack: Dir[] = [];
  private touchDir: Dir | null = null;
  private pressed = new Set<Btn>();

  constructor() {
    addEventListener('keydown', e => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      const d = KEY_DIR[e.code];
      if (d) {
        e.preventDefault();
        if (!this.stack.includes(d)) this.stack.push(d);
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
    return this.touchDir ?? this.stack[this.stack.length - 1] ?? null;
  }

  consume(b: Btn): boolean {
    const had = this.pressed.has(b);
    this.pressed.delete(b);
    return had;
  }

  flush() { this.pressed.clear(); }

  reset() {
    this.stack = [];
    this.touchDir = null;
    this.pressed.clear();
  }

  bindDpad(el: HTMLElement) {
    let id: number | null = null;
    const update = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.1) this.touchDir = null;
      else this.touchDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      el.dataset.dir = this.touchDir ?? '';
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      this.touchDir = null;
      el.dataset.dir = '';
    };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
      update(e);
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) update(e); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  bindButton(el: HTMLElement, b: Btn) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.pressed.add(b);
      el.classList.add('down');
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
}
