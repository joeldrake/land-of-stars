/**
 * Touch and mouse gestures on the game screen, in game pixels (0..VIEW_W, 0..VIEW_H).
 *
 *   hold          walk toward the finger
 *   tap           walk to that spot / talk to the person you tapped
 *   double tap    use the B item toward that spot
 *   fast swipe    sword slash (Fruit Ninja style); zig-zag for more slashes
 *   draw a circle spin attack
 *
 * Several fingers work at once (hold with one, swipe with another).
 */
export type Gesture =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'double'; x: number; y: number }
  /** A slash where the finger cut: (x, y) is the middle of the cut, (dx, dy) its direction. */
  | { kind: 'slash'; x: number; y: number; dx: number; dy: number }
  | { kind: 'spin' };

interface Point { x: number; y: number; t: number }
interface Track {
  pts: Point[];
  start: Point;
  /** Started on the HUD: only taps count there. */
  hud: boolean;
  mode: 'pending' | 'walk' | 'swipe';
  travelled: number;
  /** For spin detection: how far the swipe direction has turned (radians, signed). */
  turned: number;
  segAngle: number | null;
  seg: Point;
  lastSlash: number;
  lastSlashAngle: number;
}

/** Game pixels per millisecond. A third of the screen in about 150 ms counts as a swipe. */
const SWIPE_SPEED = 0.3;
const SWIPE_MIN = 10;
const HOLD_MS = 90;
const TAP_MS = 260;
const TAP_MOVE = 8;
const DOUBLE_MS = 330;
const DOUBLE_DIST = 26;
const TRAIL_MS = 140;
/** A circle doesn't have to be perfect: ~300 degrees of turning is enough. */
const SPIN_TURN = Math.PI * 1.65;

const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Touch {
  private tracks = new Map<number, Track>();
  private queue: Gesture[] = [];
  private lastTap: Point | null = null;
  /** Top of the playing field; touches above it are on the HUD. */
  constructor(private hudH: number) {}

  down(id: number, x: number, y: number, t: number) {
    const p = { x, y, t };
    this.tracks.set(id, {
      pts: [p], start: p, hud: y < this.hudH, mode: 'pending', travelled: 0,
      turned: 0, segAngle: null, seg: p, lastSlash: -1e9, lastSlashAngle: 0,
    });
  }

  move(id: number, x: number, y: number, t: number) {
    const tr = this.tracks.get(id);
    if (!tr) return;
    const prev = tr.pts[tr.pts.length - 1];
    tr.travelled += Math.hypot(x - prev.x, y - prev.y);
    const p = { x, y, t };
    tr.pts.push(p);
    while (tr.pts.length > 2 && t - tr.pts[0].t > 400) tr.pts.shift();
    if (tr.hud) return;

    // speed over the last ~70 ms
    const recent = tr.pts.filter(q => t - q.t <= 70);
    const first = recent[0];
    const dt = Math.max(1, t - first.t);
    const dx = x - first.x, dy = y - first.y;
    const dist = Math.hypot(dx, dy);
    const fast = dist / dt > SWIPE_SPEED && dist >= SWIPE_MIN;

    if (tr.mode !== 'swipe' && fast) {
      tr.mode = 'swipe';
      this.slash(tr, first, p);
    } else if (tr.mode === 'swipe') {
      // zig-zag: a fast change of direction is a new slash
      const a = Math.atan2(dy, dx);
      if (fast && t - tr.lastSlash > 160 && Math.abs(angleDiff(a, tr.lastSlashAngle)) > Math.PI / 2) this.slash(tr, first, p);
      this.trackTurning(tr, p);
    } else if (tr.mode === 'pending' && t - tr.start.t > HOLD_MS) {
      tr.mode = 'walk';
    }
  }

  up(id: number, x: number, y: number, t: number) {
    const tr = this.tracks.get(id);
    if (!tr) return;
    this.tracks.delete(id);
    if (tr.mode === 'swipe') return;
    const quick = t - tr.start.t < TAP_MS && tr.travelled < TAP_MOVE;
    if (!quick) return;
    const last = this.lastTap;
    if (last && t - last.t < DOUBLE_MS && Math.hypot(x - last.x, y - last.y) < DOUBLE_DIST && !tr.hud) {
      this.queue.push({ kind: 'double', x, y });
      this.lastTap = null;
    } else {
      this.queue.push({ kind: 'tap', x, y });
      this.lastTap = { x, y, t };
    }
  }

  cancel(id: number) { this.tracks.delete(id); }

  reset() { this.tracks.clear(); this.queue = []; }

  /** Gestures since the last frame. */
  consume(): Gesture[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  /** Where a held finger wants her to walk (the newest one), or null. */
  walkTarget(now: number): { x: number; y: number } | null {
    let best: Track | null = null;
    for (const tr of this.tracks.values()) {
      if (tr.hud || tr.mode === 'swipe') continue;
      if (tr.mode === 'pending' && now - tr.start.t < HOLD_MS) continue;
      if (!best || tr.start.t > best.start.t) best = tr;
    }
    if (!best) return null;
    const p = best.pts[best.pts.length - 1];
    return { x: p.x, y: p.y };
  }

  /** Recent points of swiping fingers, for drawing the white trail. */
  trails(now: number): Point[][] {
    const out: Point[][] = [];
    for (const tr of this.tracks.values()) {
      if (tr.mode !== 'swipe') continue;
      const pts = tr.pts.filter(p => now - p.t < TRAIL_MS);
      if (pts.length > 1) out.push(pts);
    }
    return out;
  }

  private slash(tr: Track, from: Point, to: Point) {
    tr.lastSlash = to.t;
    tr.lastSlashAngle = Math.atan2(to.y - from.y, to.x - from.x);
    this.queue.push({ kind: 'slash', x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, dx: to.x - from.x, dy: to.y - from.y });
  }

  /** Add up how much the swipe turns; drawing (most of) a circle is a spin attack. */
  private trackTurning(tr: Track, p: Point) {
    const len = Math.hypot(p.x - tr.seg.x, p.y - tr.seg.y);
    if (len < 5) return;
    const a = Math.atan2(p.y - tr.seg.y, p.x - tr.seg.x);
    if (tr.segAngle !== null) {
      const d = angleDiff(a, tr.segAngle);
      // a sharp reversal is a zig-zag, not a circle
      if (Math.abs(d) > Math.PI * 0.6) tr.turned = 0;
      else tr.turned += d;
    }
    tr.segAngle = a;
    tr.seg = p;
    if (Math.abs(tr.turned) >= SPIN_TURN) {
      tr.turned = 0; // keep circling for another spin
      this.queue.push({ kind: 'spin' });
    }
  }
}
