/**
 * "Where should I go next?" The next goal comes from the save (what you have, which stars),
 * and a distance field over the whole overworld finds the real way there, around hills and
 * water. The game draws an arrow along that way, the owl tells you about it, and the big
 * map marks it.
 */
import { COLS, OW_COLS, OW_ROWS, ROWS } from '../config';
import type { SaveData } from './save';
import { isSolid, isWater } from './tiles';
import { ROOMS } from './world';

export interface Goal {
  /** Text key suffix: the owl says `goal_<id>`. */
  id: string;
  loc: string;
  tx: number;
  ty: number;
}

/** The next thing to do, in story order. Null when everything is done. */
export function currentGoal(s: SaveData): Goal | null {
  const it = s.items, star = (a: string) => s.stars.includes(a);
  const g = (id: string, loc: string, tx: number, ty: number): Goal => ({ id, loc, tx, ty });
  if (!it.sword) return g('sword', 'ow:7:7', 11, 2);
  if (!star('d1')) return g('d1', 'ow:13:4', 7, 3);
  if (!star('d2')) return s.flags['switch:ow:13:2'] ? g('d2', 'ow:13:2', 7, 3) : g('bridge', 'ow:13:2', 11, 8);
  if (!star('d3')) return g('d3', 'ow:2:4', 12, 3);
  if (!it.shield) return g('shield', 'ow:9:1', 6, 1);
  if (!it.starKey) return g('starkey', 'ow:7:1', 5, 8);
  if (!star('d4')) return g('d4', 'ow:7:1', 8, 2);
  if (!it.crown) return g('island', 'ow:15:7', 9, 3);
  return null;
}

const W = OW_COLS * COLS, H = OW_ROWS * ROWS;

/** Tile at world tile (x, y), with what has been opened in this save. */
function worldTile(s: SaveData, x: number, y: number): string {
  const gx = Math.floor(x / COLS), gy = Math.floor(y / ROWS), tx = x % COLS, ty = y % ROWS;
  const loc = `ow:${gx}:${gy}`;
  const ch = ROOMS.get(loc)?.tiles[ty]?.[tx] ?? 'M';
  if (s.flags[`open:${loc}:${tx},${ty}`]) {
    if (ch === 'Z' || ch === '%') return 'D';
    if (ch === 'L' || ch === 'V') return '.';
  }
  if (ch === '_' && s.flags[`switch:${loc}`]) return '=';
  return ch;
}

export class Guide {
  goal: Goal | null = null;
  private dist = new Int32Array(W * H);
  private key = '';

  /** Recompute when the goal or what is open has changed (cheap: one BFS over the world). */
  update(s: SaveData) {
    const goal = currentGoal(s);
    const key = JSON.stringify([goal, s.items.wings, s.items.starKey, Object.keys(s.flags).filter(k => /^(open|switch):ow/.test(k)).sort()]);
    if (key === this.key) return;
    this.key = key;
    this.goal = goal;
    this.dist.fill(-1);
    if (!goal) return;
    const [gx, gy] = goal.loc.split(':').slice(1).map(Number);
    const start = (gy * ROWS + goal.ty) * W + gx * COLS + goal.tx;
    const walk = (ch: string) =>
      (!isSolid(ch) && ch !== 'D' && ch !== 'O') || (s.items.wings && isWater(ch)) || (ch === 'V' && s.items.starKey);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    this.dist[start] = 0;
    q[tail++] = start;
    while (head < tail) {
      const i = q[head++];
      const x = i % W, y = (i - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (this.dist[j] >= 0 || !walk(worldTile(s, nx, ny))) continue;
        this.dist[j] = this.dist[i] + 1;
        q[tail++] = j;
      }
    }
  }

  /**
   * Follow the way from the player's tile (room `gx, gy`, tile `tx, ty`) while it stays on
   * this screen. Returns where to point: the goal itself if it is on this screen, or the tile
   * at the screen edge where the way leaves (with the direction it leaves in).
   */
  pointer(gx: number, gy: number, tx: number, ty: number): { tx: number; ty: number; out: [number, number] | null } | null {
    if (!this.goal) return null;
    let x = gx * COLS + tx, y = gy * ROWS + ty;
    let d = this.at(x, y);
    if (d < 0) {
      // standing on something odd (a door, the edge): start from the best neighbour
      let best = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nd = this.at(x + dx, y + dy);
        if (nd >= 0 && (best < 0 || nd < best)) { best = nd; x += dx; y += dy; break; }
      }
      d = best;
      if (d < 0) return null;
    }
    for (let steps = 0; steps < 400 && d > 0; steps++) {
      let moved = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (this.at(nx, ny) !== d - 1) continue;
        if (Math.floor(nx / COLS) !== gx || Math.floor(ny / ROWS) !== gy) {
          return { tx: x - gx * COLS, ty: y - gy * ROWS, out: [dx, dy] };
        }
        x = nx; y = ny; d--; moved = true;
        break;
      }
      if (!moved) return null;
    }
    return { tx: x - gx * COLS, ty: y - gy * ROWS, out: null };
  }

  /** Is the goal on this overworld screen? */
  goalHere(loc: string) { return this.goal?.loc === loc; }

  private at(x: number, y: number) {
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : this.dist[y * W + x];
  }
}
