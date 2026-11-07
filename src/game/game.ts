import { COLS, HUD_H, RENDER_SCALE, ROOM_H, ROOM_W, ROWS, START, STEP, TILE, VIEW_H, VIEW_W } from '../config';
import { t } from '../i18n';
import type { Dialog } from '../ui/dialog';
import { art, paintRoom, tileImage } from './art';
import { drawHud, drawInventory, drawWorldMap, HUD_TAP, INV_COLS, INV_SLOTS, invSlotAt } from './hud';
import { play } from './sfx';
import type { Input } from './input';
import { B_ITEMS, MAX_BOMBS, type BItem, type Items, type SaveData } from './save';
import { blocksShot, isSolid, isWater } from './tiles';
import { DIR_VEC, DIRS, type Dir } from './types';
import { entranceOf, locInfo, neighborLoc, ROOMS, type Npc, type RoomDef } from './world';

/** Player hitbox inside the 16x16 sprite: the lower part, so the head can overlap walls. */
const HB = { ox: 3, oy: 6, w: 10, h: 10 };
const PLAYER_SPEED = 80;
const ATTACK_TIME = 0.28;
const PUSH_TIME = 0.3;
const SLIDE_TIME = 0.2;
const BOMB_FUSE = 1.3;
const BOMB_RADIUS = 30;

interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type EnemyKind = 's' | 'b' | 'g' | 'k' | 'c' | 'z' | 'v' | 'X' | 'XC' | 'XG' | 'XS';
const STATS: Record<EnemyKind, { hp: number; speed: number; dmg: number; size: number; fly?: boolean }> = {
  s: { hp: 1, speed: 26, dmg: 1, size: 16 },
  b: { hp: 1, speed: 46, dmg: 1, size: 16, fly: true },
  g: { hp: 2, speed: 34, dmg: 1, size: 16 },
  k: { hp: 2, speed: 40, dmg: 1, size: 16 },
  c: { hp: 2, speed: 50, dmg: 1, size: 16 },
  z: { hp: 2, speed: 24, dmg: 1, size: 16, fly: true },
  v: { hp: 1, speed: 55, dmg: 1, size: 16 },
  X: { hp: 8, speed: 28, dmg: 2, size: 32 },
  XC: { hp: 10, speed: 40, dmg: 2, size: 32 },
  XG: { hp: 10, speed: 30, dmg: 2, size: 32, fly: true },
  XS: { hp: 5, speed: 30, dmg: 2, size: 32 },
};
/** `X` in a room file is the boss of that castle. */
const BOSS_BY_AREA: Record<string, EnemyKind> = { d1: 'X', d2: 'XC', d3: 'XG', d4: 'XS' };
const isBoss = (k: EnemyKind) => k[0] === 'X';
/** The boomerang knocks these out; bigger enemies are only stunned. */
const BOOMERANG_KILLS = new Set<EnemyKind>(['s', 'b', 'z', 'v']);

interface Enemy {
  kind: EnemyKind; x: number; y: number; size: number; hp: number;
  dir: Dir; vx: number; vy: number; think: number; shoot: number;
  hurt: number; kbx: number; kby: number; kbT: number; spawn: number; anim: number;
  /** Frozen by the boomerang. */
  stun: number;
  /** Ghosts fade in and out; while hidden they can't hurt or be hurt. */
  hidden: boolean; fade: number;
}
/** `orb` is the Star Eater's big star ball: bounce it back with the shield to hurt him. */
type ShotKind = 'magic' | 'rock' | 'slime' | 'bubble' | 'fire' | 'starshot' | 'orb' | 'boomerang';
interface Shot {
  x: number; y: number; vx: number; vy: number; r: number; friendly: boolean; dmg: number; kind: ShotKind; life: number;
  /** Boomerang only. */
  back?: boolean; t?: number; carry?: Pickup; hit?: Set<Enemy>;
}
interface Pickup { ch: string; x: number; y: number; flag?: string; life?: number }
interface Effect { kind: 'puff' | 'sparkle' | 'boom'; x: number; y: number; t: number; dur: number }
interface Bomb { x: number; y: number; t: number }

interface RoomRT {
  def: RoomDef;
  theme: string;
  tiles: string[][];
  canvas: HTMLCanvasElement;
  hadEnemies: boolean;
  solved: boolean;
  /** Tile indexes (ty * COLS + tx) of pressure plates. */
  plates: Set<number>;
  /** Messages already shown in this visit, so bumping a wall doesn't repeat them. */
  said: Set<string>;
  /** People here right now (some only show up after a castle is won). */
  npcs: Npc[];
  npcBlock: Set<number>;
  pushT: number;
  slide: { fx: number; fy: number; tx: number; ty: number; t: number } | null;
}

export interface GameHooks {
  onSave(s: SaveData): void;
  onMenu(): void;
}

/** Inventory slots in the order they are drawn. */
export type Slot = keyof Items | 'stars';

const roomTheme = (def: RoomDef) =>
  def.kind === 'dungeon' ? def.area : def.kind === 'cave' && def.loc.startsWith('cave:house') ? 'house' : '';

export class Game {
  private ctx: CanvasRenderingContext2D;
  room!: RoomRT;
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  effects: Effect[] = [];
  bombsOut: Bomb[] = [];
  player = { x: 0, y: 0, dir: 'down' as Dir, attack: 0, inv: 0, kbx: 0, kby: 0, kbT: 0, anim: 0, moving: false };
  mode: 'play' | 'scroll' | 'fade' | 'dead' | 'inv' | 'map' = 'play';
  paused = false;
  time = 0;
  /** Inventory cursor (index into INV_SLOTS). */
  invCursor = 0;
  private scroll: { to: RoomRT; dir: Dir; t: number; dur: number; fromX: number; fromY: number } | null = null;
  private fade: { t: number; dur: number; out: boolean; mid?: () => void } | null = null;
  private deadT = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private input: Input,
    private dialog: Dialog,
    public save: SaveData,
    private hooks: GameHooks,
  ) {
    canvas.width = VIEW_W * RENDER_SCALE;
    canvas.height = VIEW_H * RENDER_SCALE;
    this.ctx = canvas.getContext('2d')!;
    if (save.hp <= 0) save.hp = save.maxHp;
    const p = save.pos;
    const ok = ROOMS.has(p.loc);
    this.enterRoom(ok ? p.loc : START.loc, ok ? p.x : START.tx * TILE, ok ? p.y : START.ty * TILE, p.dir);
    this.arrived();
    if (!save.flags.intro) {
      save.flags.intro = true;
      this.say('intro');
    }
  }

  // ------------------------------------------------------------------ loop
  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.acc += dt;
        while (this.acc >= STEP) {
          this.update(STEP);
          this.acc -= STEP;
        }
      }
      this.render();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); }

  flag(k: string) { return !!this.save.flags[k]; }

  // ------------------------------------------------------------------ dev tools (only used in dev mode)
  /** Can't take damage. */
  god = false;

  devWarp(loc: string, tx: number, ty: number) {
    if (!ROOMS.has(loc)) return;
    if (this.dialog.open) this.dialog.close();
    this.mode = 'play';
    this.warpTo(loc, tx * TILE, ty * TILE, 'up');
  }

  devKillAll() {
    for (const e of [...this.enemies]) { e.hidden = false; this.damageEnemy(e, 999, e.x, e.y, 'orb'); }
  }

  /** Forget opened chests, doors, puzzles and beaten bosses, then rebuild the room. */
  devResetWorld() {
    for (const k of Object.keys(this.save.flags)) {
      if (/^(got|open|boss|solved|switch):/.test(k)) delete this.save.flags[k];
    }
    this.devWarp(this.room.def.loc, Math.round(this.player.x / TILE), Math.round(this.player.y / TILE));
  }

  /** Write position + progress through the save hook. */
  persist() {
    const p = this.player;
    this.save.pos = { loc: this.room.def.loc, x: Math.round(p.x), y: Math.round(p.y), dir: p.dir };
    this.hooks.onSave(this.save);
  }

  private say(key: string, then?: () => void) {
    this.input.reset();
    this.dialog.show(t(key, { name: this.save.name }), then);
  }

  /** Say something only once per visit to the room. */
  private sayOnce(key: string) {
    if (this.room.said.has(key)) return;
    this.room.said.add(key);
    this.say(key);
  }

  private update(dt: number) {
    this.time += dt;
    if (this.input.consume('menu')) { this.hooks.onMenu(); return; }
    if (this.dialog.open) {
      if (this.input.consume('a') || this.input.consume('b')) this.dialog.advance();
      return;
    }
    this.effects = this.effects.filter(e => (e.t += dt) < e.dur);

    if (this.mode === 'inv') this.updateInventory();
    else if (this.mode === 'map') this.updateMap();
    else if (this.mode === 'scroll') this.updateScroll(dt);
    else if (this.mode === 'fade') this.updateFade(dt);
    else if (this.mode === 'dead') this.updateDead(dt);
    else {
      if (this.input.consume('inv')) { this.openInventory(); this.input.flush(); return; }
      if (this.input.consume('map')) { this.openMap(); this.input.flush(); return; }
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateShots(dt);
      this.updateBombs(dt);
      this.updatePickups(dt);
      this.updateSlide(dt);
      this.checkSolved();
    }
    this.input.flush();
  }

  // ------------------------------------------------------------------ rooms
  private buildRoom(loc: string): RoomRT {
    const def = ROOMS.get(loc)!;
    const tiles = def.tiles.map(r => [...r]);
    const solved = this.flag(`solved:${loc}`), switched = this.flag(`switch:${loc}`);
    const plates = new Set<number>();
    tiles.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === '+') plates.add(y * COLS + x);
      if (this.flag(`open:${loc}:${x},${y}`)) {
        if (ch === 'L' || ch === 'V') row[x] = def.ground;
        if (ch === 'Z' || ch === '%') row[x] = this.crackOpensTo(def, x, y, ch);
      }
      if (solved && ch === '|') row[x] = def.ground;
      if (solved && ch === 'I') row[x] = 'J';
      if (switched && ch === 'Q') row[x] = 'U';
      if (switched && ch === '_') row[x] = '=';
    }));
    const theme = roomTheme(def);
    const npcs = def.npcs.filter(n => !n.star || this.save.stars.includes(n.star));
    return {
      def, theme, tiles, plates, npcs,
      canvas: paintRoom(def.kind, def.ground, tiles, theme),
      hadEnemies: false, solved: false, said: new Set(), pushT: 0, slide: null,
      npcBlock: new Set(npcs.map(n => n.ty * COLS + n.tx)),
    };
  }

  /** What a bombed crack turns into: stairs/cave if a door is hidden there, otherwise floor. */
  private crackOpensTo(def: RoomDef, x: number, y: number, ch: string) {
    return ch === 'Z' || def.doors.some(d => d.tx === x && d.ty === y) ? 'D' : def.ground;
  }

  private repaint() {
    const r = this.room;
    paintRoom(r.def.kind, r.def.ground, r.tiles, r.theme, r.canvas);
  }

  /** Spawn enemies and items for the current room. */
  private populate() {
    const def = this.room.def;
    this.enemies = [];
    this.shots = [];
    this.pickups = [];
    this.bombsOut = [];
    for (const s of def.spawns) {
      if (s.ch === 'X' && this.flag(`boss:${def.loc}`)) continue;
      const kind = (s.ch === 'X' ? BOSS_BY_AREA[def.area] ?? 'X' : s.ch) as EnemyKind;
      this.enemies.push(this.makeEnemy(kind, s.tx * TILE, s.ty * TILE));
    }
    this.room.hadEnemies = this.enemies.length > 0;
    for (const it of def.items) {
      // Bomb refills come back every visit, but only once you have the bomb bag.
      if (it.ch === '0') {
        if (this.save.items.bombs) this.pickups.push({ ch: it.ch, x: it.tx * TILE, y: it.ty * TILE });
        continue;
      }
      const flag = `got:${def.loc}:${it.tx},${it.ty}`;
      if (!this.flag(flag)) this.pickups.push({ ch: it.ch, x: it.tx * TILE, y: it.ty * TILE, flag });
    }
    if (this.flag(`solved:${def.loc}`)) this.solve(false);
    else this.checkSolved(false);
  }

  /** A room is solved when its enemies are gone, every plate has a block and every torch burns. */
  private checkSolved(fx = true) {
    const r = this.room;
    if (r.solved || r.slide) return;
    if (r.hadEnemies && this.enemies.length) return;
    for (const i of r.plates) if (r.tiles[Math.floor(i / COLS)][i % COLS] !== 'P') return;
    if (r.tiles.some(row => row.includes('I'))) return;
    this.solve(fx);
  }

  private solve(fx: boolean) {
    const r = this.room;
    r.solved = true;
    this.revealRewards(fx);
    let bars = false;
    r.tiles.forEach((row, y) => row.forEach((ch, x) => {
      if (ch !== '|') return;
      row[x] = r.def.ground;
      bars = true;
      if (fx) this.effects.push({ kind: 'puff', x: x * TILE + 8, y: y * TILE + 8, t: 0, dur: 0.4 });
    }));
    const torches = r.tiles.some(row => row.includes('J'));
    if (bars || torches) {
      this.save.flags[`solved:${r.def.loc}`] = true;
      this.persist();
    }
    if (bars) {
      this.repaint();
      if (fx) play('secret');
    }
  }

  private revealRewards(fx: boolean) {
    for (const r of this.room.def.rewards) {
      const flag = `got:${this.room.def.loc}:${r.tx},${r.ty}`;
      if (this.flag(flag)) continue;
      this.pickups.push({ ch: r.ch, x: r.tx * TILE, y: r.ty * TILE, flag });
      if (fx) this.effects.push({ kind: 'sparkle', x: r.tx * TILE + 8, y: r.ty * TILE + 8, t: 0, dur: 0.8 });
    }
  }

  private enterRoom(loc: string, x: number, y: number, dir: Dir) {
    this.room = this.buildRoom(loc);
    Object.assign(this.player, { x, y, dir, attack: 0, kbT: 0 });
    if (this.playerBlockedAt(x, y)) this.moveToFreeTile();
    this.populate();
  }

  /** Called once the player is fully inside a new room. */
  private arrived() {
    this.persist();
    // Inside caves and houses the person greets you; outside you walk up and press A.
    if (this.room.def.kind === 'ow') return;
    const npc = this.room.npcs.find(n => n.kind !== 'sign');
    if (npc) this.talkTo(npc);
  }

  /** Nearest tile she fits on. `preferLand` skips water first, so she lands on real ground. */
  private moveToFreeTile(preferLand = false) {
    if (preferLand && this.findFreeTile(true)) return;
    this.findFreeTile(false);
  }

  private findFreeTile(landOnly: boolean): boolean {
    const p = this.player;
    const sx = clamp(Math.round(p.x / TILE), 0, COLS - 1), sy = clamp(Math.round(p.y / TILE), 0, ROWS - 1);
    const seen = new Set([sy * COLS + sx]);
    const q: [number, number][] = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift()!;
      const ok = !this.playerBlockedAt(x * TILE, y * TILE) && !(landOnly && isWater(this.room.tiles[y][x]));
      if (ok) { p.x = x * TILE; p.y = y * TILE; return true; }
      for (const d of DIRS) {
        const nx = x + DIR_VEC[d][0], ny = y + DIR_VEC[d][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(ny * COLS + nx)) continue;
        seen.add(ny * COLS + nx);
        q.push([nx, ny]);
      }
    }
    return false;
  }

  private warpTo(loc: string, x: number, y: number, dir: Dir) {
    this.mode = 'fade';
    this.fade = { t: 0, dur: 0.25, out: true, mid: () => this.enterRoom(loc, x, y, dir) };
  }

  private updateFade(dt: number) {
    const f = this.fade!;
    f.t += dt;
    if (f.t < f.dur) return;
    if (f.out) {
      f.mid?.();
      f.out = false;
      f.t = 0;
    } else {
      this.fade = null;
      this.mode = 'play';
      this.arrived();
    }
  }

  private beginScroll(loc: string, dir: Dir) {
    const to = this.buildRoom(loc);
    const horizontal = dir === 'left' || dir === 'right';
    this.scroll = { to, dir, t: 0, dur: horizontal ? 0.7 : 0.55, fromX: this.player.x, fromY: this.player.y };
    this.mode = 'scroll';
    this.enemies = [];
    this.shots = [];
    this.pickups = [];
    this.bombsOut = [];
    this.player.attack = 0;
  }

  /** Where the player stands in the new room after scrolling in direction `dir`. */
  private scrollTarget(dir: Dir) {
    const p = this.player;
    return {
      x: dir === 'right' ? 0 : dir === 'left' ? ROOM_W - TILE : p.x,
      y: dir === 'down' ? 0 : dir === 'up' ? ROOM_H - TILE : p.y,
    };
  }

  private updateScroll(dt: number) {
    const s = this.scroll!;
    s.t += dt;
    this.player.anim += dt;
    if (s.t < s.dur) return;
    const target = this.scrollTarget(s.dir);
    this.room = s.to;
    this.player.x = target.x;
    this.player.y = target.y;
    this.scroll = null;
    this.mode = 'play';
    // Flying with the wings over water can carry her into a cliff or trees on the next
    // screen. Then she "falls down" onto the nearest ground instead of getting stuck.
    if (this.playerBlockedAt(this.player.x, this.player.y)) {
      this.moveToFreeTile(true);
      this.effects.push({ kind: 'puff', x: this.player.x + 8, y: this.player.y + 12, t: 0, dur: 0.4 });
      play('push');
    }
    this.populate();
    this.arrived();
  }

  // ------------------------------------------------------------------ collision
  private solidAt(tx: number, ty: number, forPlayer = false): boolean {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    const ch = this.room.tiles[ty][tx];
    if (forPlayer && this.save.items.wings && isWater(ch)) return false;
    return isSolid(ch) || this.room.npcBlock.has(ty * COLS + tx);
  }

  private boxSolid(x: number, y: number, w: number, h: number, forPlayer = false): boolean {
    for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - 0.01) / TILE); ty++) {
      for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 0.01) / TILE); tx++) {
        if (this.solidAt(tx, ty, forPlayer)) return true;
      }
    }
    return false;
  }

  private playerBlockedAt(x: number, y: number) {
    return this.boxSolid(x + HB.ox, y + HB.oy, HB.w, HB.h, true);
  }

  playerBox(): Box {
    return { x: this.player.x + HB.ox, y: this.player.y + HB.oy, w: HB.w, h: HB.h };
  }

  /** Move with "corner assist": if blocked, slide sideways around corners up to 7px. */
  private movePlayer(dx: number, dy: number, assist = true) {
    const p = this.player;
    if (dx) {
      if (!this.playerBlockedAt(p.x + dx, p.y)) p.x += dx;
      else if (assist) {
        const n = this.nudge(p.x + dx, p.y, 'y');
        if (n) p.y += Math.sign(n) * Math.min(Math.abs(n), Math.abs(dx));
      }
    }
    if (dy) {
      if (!this.playerBlockedAt(p.x, p.y + dy)) p.y += dy;
      else if (assist) {
        const n = this.nudge(p.x, p.y + dy, 'x');
        if (n) p.x += Math.sign(n) * Math.min(Math.abs(n), Math.abs(dy));
      }
    }
  }

  private nudge(x: number, y: number, axis: 'x' | 'y'): number {
    for (let i = 1; i <= 7; i++) {
      for (const s of [-1, 1]) {
        const nx = axis === 'x' ? x + s * i : x;
        const ny = axis === 'y' ? y + s * i : y;
        if (!this.playerBlockedAt(nx, ny)) return s * i;
      }
    }
    return 0;
  }

  // ------------------------------------------------------------------ player
  private updatePlayer(dt: number) {
    const p = this.player;
    p.inv = Math.max(0, p.inv - dt);

    if (p.kbT > 0) {
      p.kbT -= dt;
      this.movePlayer(p.kbx * dt, p.kby * dt, false);
      p.x = clamp(p.x, -HB.ox, ROOM_W - HB.ox - HB.w);
      p.y = clamp(p.y, -HB.oy, ROOM_H - HB.oy - HB.h);
      return;
    }
    if (p.attack > 0) {
      p.attack -= dt;
      this.swordHits();
      return;
    }

    if (this.input.consume('a')) {
      if (this.tryTalk()) return;
      if (this.save.items.sword) { p.attack = ATTACK_TIME; play('sword'); return; }
    }
    if (this.input.consume('b')) this.useB();

    const d = this.input.dir;
    p.moving = !!d;
    if (d) {
      p.dir = d;
      p.anim += dt;
      const [vx, vy] = DIR_VEC[d];
      const speed = PLAYER_SPEED * (this.save.items.wings ? 1.3 : 1);
      this.movePlayer(vx * speed * dt, vy * speed * dt);
      this.checkBump(dt);
      if (this.save.items.wings && Math.random() < dt * 12) {
        this.effects.push({ kind: 'sparkle', x: p.x + 8 + (Math.random() - 0.5) * 8, y: p.y + 14, t: 0, dur: 0.3 });
      }
    } else this.room.pushT = 0;
    this.checkDoor();
    this.checkEdges();
  }

  /** The B item that is actually usable: falls back to another one you own. */
  bItem(): BItem | null {
    const s = this.save;
    if (s.items[s.bItem]) return s.bItem;
    return B_ITEMS.find(i => s.items[i]) ?? null;
  }

  private useB() {
    const p = this.player;
    const [vx, vy] = DIR_VEC[p.dir];
    switch (this.bItem()) {
      case 'staff':
        if (this.shots.some(s => s.kind === 'magic')) return;
        this.shots.push({ x: p.x + 8 + vx * 8, y: p.y + 10 + vy * 8, vx: vx * 160, vy: vy * 160, r: 4, friendly: true, dmg: 2, kind: 'magic', life: 2 });
        play('magic');
        return;
      case 'bombs':
        if (this.save.bombs <= 0 || this.bombsOut.length) return;
        this.save.bombs--;
        this.bombsOut.push({ x: p.x + 8 + vx * 12, y: p.y + 10 + vy * 12, t: BOMB_FUSE });
        play('bombPut');
        return;
      case 'boomerang':
        if (this.shots.some(s => s.kind === 'boomerang')) return;
        this.shots.push({
          x: p.x + 8 + vx * 6, y: p.y + 10 + vy * 6, vx: vx * 170, vy: vy * 170, r: 5, friendly: true, dmg: 1,
          kind: 'boomerang', life: 99, back: false, t: 0, hit: new Set(),
        });
        play('boomerang');
        return;
    }
  }

  /** The tile right in front of the player. */
  private frontTile(): [number, number] {
    const p = this.player;
    const [vx, vy] = DIR_VEC[p.dir];
    return [Math.floor((p.x + 8 + vx * 10) / TILE), Math.floor((p.y + 11 + vy * 10) / TILE)];
  }

  /** Walking into something: locked doors, the star gate, bars, cracks and blocks to push. */
  private checkBump(dt: number) {
    const [tx, ty] = this.frontTile();
    const ch = this.room.tiles[ty]?.[tx];
    if (ch !== 'P') this.room.pushT = 0;
    switch (ch) {
      case 'L': {
        const area = this.room.def.area;
        if ((this.save.keys[area] ?? 0) <= 0) {
          if (!this.room.said.has('locked')) play('locked');
          this.sayOnce('locked');
          return;
        }
        this.save.keys[area]--;
        play('unlock');
        this.openConnected(tx, ty, 'L', this.room.def.ground);
        return;
      }
      case 'V':
        if (!this.save.items.starKey) { this.sayOnce('gate_locked'); return; }
        play('secret');
        this.openConnected(tx, ty, 'V', this.room.def.ground);
        this.sayOnce('gate_open');
        return;
      case '|':
        this.sayOnce('bars');
        return;
      case '%':
        this.sayOnce('cracked');
        return;
      case 'P':
        this.tryPush(tx, ty, dt);
        return;
    }
  }

  /** Open every connected tile of the same kind (doors are 2 tiles wide) and remember it. */
  private openConnected(tx: number, ty: number, ch: string, into: string) {
    const q: [number, number][] = [[tx, ty]];
    while (q.length) {
      const [x, y] = q.pop()!;
      if (this.room.tiles[y]?.[x] !== ch) continue;
      this.room.tiles[y][x] = into;
      this.save.flags[`open:${this.room.def.loc}:${x},${y}`] = true;
      this.effects.push({ kind: 'puff', x: x * TILE + 8, y: y * TILE + 8, t: 0, dur: 0.4 });
      for (const dd of DIRS) q.push([x + DIR_VEC[dd][0], y + DIR_VEC[dd][1]]);
    }
    this.repaint();
    this.persist();
  }

  // ------------------------------------------------------------------ pushing blocks
  private tryPush(tx: number, ty: number, dt: number) {
    const r = this.room;
    const p = this.player;
    const [vx, vy] = DIR_VEC[p.dir];
    // Only push when lined up with the block, so you don't push it by brushing past.
    const off = vx ? p.y + 11 - (ty * TILE + 8) : p.x + 8 - (tx * TILE + 8);
    if (Math.abs(off) > 6 || r.slide || r.plates.has(ty * COLS + tx)) { r.pushT = 0; return; }
    r.pushT += dt;
    if (r.pushT < PUSH_TIME) return;
    r.pushT = 0;
    const nx = tx + vx, ny = ty + vy;
    const dest = r.tiles[ny]?.[nx];
    if (dest !== r.def.ground && dest !== '+') return;
    const box = { x: nx * TILE, y: ny * TILE, w: TILE, h: TILE };
    if (this.enemies.some(e => overlap(box, this.enemyBox(e))) || r.npcBlock.has(ny * COLS + nx)) return;
    if (this.pickups.some(pk => overlap(box, { x: pk.x + 2, y: pk.y + 2, w: 12, h: 12 }))) return;

    const door = r.def.doors.some(d => d.tx === tx && d.ty === ty);
    r.tiles[ty][tx] = r.plates.has(ty * COLS + tx) ? '+' : door ? 'D' : r.def.ground;
    r.tiles[ny][nx] = 'P';
    r.slide = { fx: tx, fy: ty, tx: nx, ty: ny, t: 0 };
    this.repaint();
    play(door ? 'secret' : 'push');
  }

  private updateSlide(dt: number) {
    const s = this.room.slide;
    if (!s) return;
    s.t += dt;
    if (s.t < SLIDE_TIME) return;
    this.room.slide = null;
    if (this.room.plates.has(s.ty * COLS + s.tx)) play('click');
  }

  private checkDoor() {
    const p = this.player;
    const tx = Math.floor((p.x + 8) / TILE), ty = Math.floor((p.y + 11) / TILE);
    const ch = this.room.tiles[ty]?.[tx];
    if (ch !== 'D' && ch !== 'O') return;
    const door = this.room.def.doors.find(d => d.tx === tx && d.ty === ty);
    if (!door) return;
    play('door');
    this.warpTo(door.to, door.ax * TILE, door.ay * TILE, 'up');
  }

  private checkEdges() {
    const b = this.playerBox();
    let dir: Dir | null = null;
    if (b.x < 0) dir = 'left';
    else if (b.x + b.w > ROOM_W) dir = 'right';
    else if (b.y < 0) dir = 'up';
    else if (b.y + b.h > ROOM_H) dir = 'down';
    if (!dir) return;
    const exit = this.room.def.exits.find(e => e.dir === dir);
    if (exit) { this.warpTo(exit.to, exit.ax * TILE, exit.ay * TILE, dir); return; }
    const n = neighborLoc(this.room.def, dir);
    if (n) { this.beginScroll(n, dir); return; }
    const p = this.player;
    p.x = clamp(p.x, -HB.ox, ROOM_W - HB.ox - HB.w);
    p.y = clamp(p.y, -HB.oy, ROOM_H - HB.oy - HB.h);
  }

  private tryTalk(): boolean {
    const p = this.player;
    for (const n of this.room.npcs) {
      if (Math.hypot(n.tx * TILE + 8 - (p.x + 8), n.ty * TILE + 8 - (p.y + 10)) < 28) {
        this.talkTo(n);
        return true;
      }
    }
    return false;
  }

  private talkTo(n: Npc) {
    const def = this.room.def;
    const all = [...def.items, ...def.rewards].filter(i => i.ch !== '0');
    const allTaken = all.length > 0 && all.every(i => this.flag(`got:${def.loc}:${i.tx},${i.ty}`));
    if (allTaken && n.after) { this.say(n.after); return; }
    if (n.alt && this.save.items[n.alt.item as keyof Items]) { this.say(n.alt.text); return; }
    this.say(n.text);
  }

  private swordBox(): Box | null {
    const p = this.player;
    if (p.attack <= 0.04 || p.attack > ATTACK_TIME - 0.03) return null;
    switch (p.dir) {
      case 'up': return { x: p.x + 4, y: p.y - 12, w: 8, h: 16 };
      case 'down': return { x: p.x + 4, y: p.y + 12, w: 8, h: 16 };
      case 'left': return { x: p.x - 12, y: p.y + 5, w: 16, h: 9 };
      case 'right': return { x: p.x + 12, y: p.y + 5, w: 16, h: 9 };
    }
  }

  private swordHits() {
    const sb = this.swordBox();
    if (!sb) return;
    for (const e of this.enemies) {
      if (e.spawn > 0 || e.hurt > 0 || e.hidden) continue;
      if (overlap(sb, this.enemyBox(e))) this.damageEnemy(e, 1, this.player.x + 8, this.player.y + 10);
    }
  }

  private hurtPlayer(dmg: number, fromX: number, fromY: number) {
    const p = this.player;
    if (p.inv > 0 || this.mode !== 'play' || this.god) return;
    this.save.hp -= dmg;
    p.inv = 1.3;
    p.attack = 0;
    let dx = p.x + 8 - fromX, dy = p.y + 10 - fromY;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    p.kbx = dx * 170; p.kby = dy * 170; p.kbT = 0.14;
    play(this.save.hp <= 0 ? 'die' : 'hurt');
    if (this.save.hp <= 0) {
      this.save.hp = 0;
      this.mode = 'dead';
      this.deadT = 1.4;
    }
  }

  private updateDead(dt: number) {
    if (this.deadT === Infinity) return;
    this.deadT -= dt;
    if (this.deadT > 0) return;
    this.deadT = Infinity;
    this.say('dead', () => this.respawn());
  }

  private respawn() {
    this.save.hp = this.save.maxHp;
    this.player.inv = 0;
    const def = this.room.def;
    if (def.kind === 'dungeon') {
      const ent = entranceOf(def.area);
      if (ent) { this.warpTo(ent.loc, 7 * TILE + 8, 8 * TILE, 'up'); return; }
    }
    this.warpTo(START.loc, START.tx * TILE, START.ty * TILE, 'down');
  }

  // ------------------------------------------------------------------ enemies
  private makeEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const s = STATS[kind];
    const a = Math.random() < 0.5 ? 1 : -1, b = Math.random() < 0.5 ? 1 : -1;
    return {
      kind, x, y, size: s.size, hp: s.hp, dir: 'down',
      vx: kind === 'v' ? a * s.speed : 0, vy: kind === 'v' ? b * s.speed : 0,
      think: Math.random(), shoot: 1.5 + Math.random() * 2,
      hurt: 0, kbx: 0, kby: 0, kbT: 0, spawn: 0.5, anim: Math.random(),
      stun: 0, hidden: false, fade: 2 + Math.random() * 2,
    };
  }

  private enemyBox(e: Enemy): Box {
    return { x: e.x + 2, y: e.y + 2, w: e.size - 4, h: e.size - 4 };
  }

  private moveEnemy(e: Enemy, dx: number, dy: number): boolean {
    const nx = e.x + dx, ny = e.y + dy;
    const fly = STATS[e.kind].fly;
    const margin = fly ? TILE : 0;
    if (nx < margin || ny < margin || nx + e.size > ROOM_W - margin || ny + e.size > ROOM_H - margin) return false;
    if (!fly && this.boxSolid(nx + 1, ny + 1, e.size - 2, e.size - 2)) return false;
    e.x = nx;
    e.y = ny;
    return true;
  }

  /** A random spot where a boss fits, for the ghost king's teleport. */
  private freeSpot(size: number): [number, number] | null {
    for (let i = 0; i < 40; i++) {
      const x = TILE * (2 + Math.floor(Math.random() * (COLS - 5)));
      const y = TILE * (2 + Math.floor(Math.random() * (ROWS - 5)));
      const pb = this.playerBox();
      if (Math.hypot(x - pb.x, y - pb.y) < 48) continue;
      if (!this.boxSolid(x, y, size, size)) return [x, y];
    }
    return null;
  }

  private updateEnemies(dt: number) {
    const p = this.player;
    const pb = this.playerBox();
    for (const e of this.enemies) {
      e.anim += dt;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (e.hurt > 0) e.hurt -= dt;
      if (e.stun > 0) { e.stun -= dt; continue; }

      // ghosts fade in and out
      if (e.kind === 'z' || e.kind === 'XG') {
        e.fade -= dt;
        if (e.fade <= 0) {
          e.hidden = !e.hidden;
          e.fade = e.hidden ? 1.1 : e.kind === 'XG' ? 3 : 2.5;
          if (!e.hidden && e.kind === 'XG') {
            const spot = this.freeSpot(e.size);
            if (spot) [e.x, e.y] = spot;
            this.ring(e, 8, 70, 'fire');
          }
        }
        if (e.hidden) continue;
      }

      if (e.kbT > 0) {
        e.kbT -= dt;
        this.moveEnemy(e, e.kbx * dt, e.kby * dt);
      } else {
        const sp = STATS[e.kind].speed;
        e.think -= dt;
        if (e.kind === 'v') {
          if (!this.moveEnemy(e, e.vx * dt, 0)) e.vx = -e.vx;
          if (!this.moveEnemy(e, 0, e.vy * dt)) e.vy = -e.vy;
        } else if (e.kind === 'c' || e.kind === 'XC') {
          // crabs walk sideways
          if (e.think <= 0) {
            e.dir = Math.random() < (e.kind === 'XC' ? 0.85 : 0.75) ? (Math.random() < 0.5 ? 'left' : 'right') : (Math.random() < 0.5 ? 'up' : 'down');
            e.think = 0.5 + Math.random() * 1.2;
          }
          const [vx, vy] = DIR_VEC[e.dir];
          if (!this.moveEnemy(e, vx * sp * dt, vy * sp * 0.5 * dt)) e.think = 0;
        } else if (e.kind === 'b' || e.kind === 'z' || isBoss(e.kind)) {
          if (e.think <= 0) {
            const a = Math.random() * Math.PI * 2;
            const still = e.kind === 'b' && Math.random() < 0.25;
            e.vx = still ? 0 : Math.cos(a) * sp;
            e.vy = still ? 0 : Math.sin(a) * sp;
            e.think = 0.5 + Math.random() * 1.5;
          }
          if (!this.moveEnemy(e, e.vx * dt, e.vy * dt)) { e.vx = -e.vx; e.vy = -e.vy; }
        } else {
          if (e.think <= 0) {
            e.dir = DIRS[Math.floor(Math.random() * 4)];
            e.think = 0.6 + Math.random() * 1.4;
          }
          const [vx, vy] = DIR_VEC[e.dir];
          if (!this.moveEnemy(e, vx * sp * dt, vy * sp * dt)) e.think = 0;
        }

        e.shoot -= dt;
        if (e.shoot <= 0) {
          const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
          const aim = Math.atan2(p.y + 10 - cy, p.x + 8 - cx);
          if (e.kind === 'g') {
            const [vx, vy] = DIR_VEC[e.dir];
            this.shots.push({ x: cx, y: cy, vx: vx * 90, vy: vy * 90, r: 3, friendly: false, dmg: 1, kind: 'rock', life: 3 });
            e.shoot = 2 + Math.random() * 2;
          } else if (e.kind === 'X') {
            this.spread(cx, cy, aim, [-0.35, 0, 0.35], 75, 'slime');
            e.shoot = 2.2;
          } else if (e.kind === 'XC') {
            this.spread(cx, cy, aim, [-0.6, -0.3, 0, 0.3, 0.6], 70, 'bubble');
            e.shoot = 2.4;
          } else if (e.kind === 'XS') {
            // pattern: star ball, star ball, ring of little stars (`fade` is free to use as a counter here)
            e.fade = (Math.floor(e.fade) + 1) % 3;
            if (e.fade === 2) {
              this.ring(e, 6, 70, 'starshot', this.time);
              e.shoot = 1.6;
            } else {
              this.shots.push({ x: cx, y: cy, vx: Math.cos(aim) * 65, vy: Math.sin(aim) * 65, r: 6, friendly: false, dmg: 1, kind: 'orb', life: 5 });
              play('magic');
              e.shoot = 2.6;
            }
          } else e.shoot = 99;
        }
      }
      if (overlap(this.enemyBox(e), pb)) this.hurtPlayer(STATS[e.kind].dmg, e.x + e.size / 2, e.y + e.size / 2);
    }
  }

  private spread(cx: number, cy: number, aim: number, offs: number[], speed: number, kind: ShotKind) {
    for (const off of offs) {
      this.shots.push({ x: cx, y: cy, vx: Math.cos(aim + off) * speed, vy: Math.sin(aim + off) * speed, r: 4, friendly: false, dmg: 1, kind, life: 4 });
    }
  }

  private ring(e: Enemy, n: number, speed: number, kind: ShotKind, turn = 0) {
    const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      this.shots.push({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, friendly: false, dmg: 1, kind, life: 4 });
    }
  }

  private damageEnemy(e: Enemy, dmg: number, fromX: number, fromY: number, src = '') {
    // Only his own star ball, bounced back with the shield, can hurt the Star Eater.
    if (e.kind === 'XS' && src !== 'orb') {
      play('clang');
      e.hurt = 0.2;
      this.sayOnce(this.save.items.shield ? 'eater_hint' : 'eater_noshield');
      return;
    }
    e.hp -= dmg;
    e.hurt = 0.35;
    if (!isBoss(e.kind)) {
      let dx = e.x + e.size / 2 - fromX, dy = e.y + e.size / 2 - fromY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      e.kbx = dx * 180; e.kby = dy * 180; e.kbT = 0.15;
    }
    if (e.hp > 0) { play('hit'); return; }
    play(isBoss(e.kind) ? 'bossDie' : 'kill');
    this.enemies = this.enemies.filter(x => x !== e);
    const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
    this.effects.push({ kind: 'puff', x: cx, y: cy, t: 0, dur: 0.4 });
    if (isBoss(e.kind)) {
      this.save.flags[`boss:${this.room.def.loc}`] = true;
      this.shots = this.shots.filter(s => s.friendly);
      this.persist();
      return;
    }
    const r = Math.random();
    const bombs = this.save.items.bombs;
    const drop = r < 0.22 ? '$' : r < 0.38 ? 'h' : bombs && r < 0.5 ? '0' : null;
    if (drop) this.pickups.push({ ch: drop, x: cx - 8, y: cy - 8, life: 8 });
  }

  /** The boomerang: kills small things, stuns big ones. */
  private boomerangHit(e: Enemy) {
    if (BOOMERANG_KILLS.has(e.kind)) { this.damageEnemy(e, 1, this.player.x + 8, this.player.y + 10); return; }
    if (e.kind === 'XS') { this.damageEnemy(e, 0, 0, 0); return; }
    e.stun = isBoss(e.kind) ? 1 : 2.5;
    play('hit');
  }

  // ------------------------------------------------------------------ shots, switches & torches
  private hitTile(s: Shot, tx: number, ty: number) {
    const ch = this.room.tiles[ty]?.[tx];
    if (ch === 'I' && s.kind === 'magic') {
      this.room.tiles[ty][tx] = 'J';
      this.repaint();
      play('torch');
    } else if (ch === 'Q') {
      this.hitCrystal();
    }
  }

  /** A crystal was hit: every crystal in the room turns gold and hidden bridges appear. */
  private hitCrystal() {
    const r = this.room;
    r.tiles.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === 'Q') row[x] = 'U';
      if (ch === '_') {
        row[x] = '=';
        this.effects.push({ kind: 'sparkle', x: x * TILE + 8, y: y * TILE + 8, t: 0, dur: 0.6 });
      }
    }));
    this.save.flags[`switch:${r.def.loc}`] = true;
    this.repaint();
    play('crystal');
    this.persist();
  }

  private updateShots(dt: number) {
    const pb = this.playerBox();
    const keep: Shot[] = [];
    for (const s of this.shots) {
      if (s.kind === 'boomerang') {
        if (this.updateBoomerang(s, dt)) keep.push(s);
        continue;
      }
      if (s.kind === 'orb' && s.friendly) this.steerToBoss(s, dt);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const out = s.x < 0 || s.y < 0 || s.x > ROOM_W || s.y > ROOM_H || s.life <= 0;
      const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
      const tile = this.room.tiles[ty]?.[tx];
      if (out || (tile && blocksShot(tile))) {
        if (s.friendly) {
          this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
          if (!out) this.hitTile(s, tx, ty);
        }
        continue;
      }
      const box = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      if (s.friendly) {
        const hit = this.enemies.find(e => e.spawn <= 0 && !e.hidden && overlap(box, this.enemyBox(e)));
        if (hit) {
          this.damageEnemy(hit, s.dmg, s.x - s.vx, s.y - s.vy, s.kind);
          this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
          continue;
        }
      } else if (overlap(box, pb)) {
        if (this.shieldBlocks(s)) {
          // bounce it back: now it is hers and hurts enemies like magic
          s.friendly = true;
          s.vx = -s.vx * 1.3;
          s.vy = -s.vy * 1.3;
          s.dmg = s.kind === 'orb' ? 1 : 2;
          s.life = s.kind === 'orb' ? 4 : 2;
          play('clang');
          this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
          keep.push(s);
          continue;
        }
        this.hurtPlayer(s.dmg, s.x - s.vx, s.y - s.vy);
        continue;
      }
      keep.push(s);
    }
    this.shots = keep;
  }

  /** A bounced star ball curves toward the Star Eater, so a young player doesn't have to aim. */
  private steerToBoss(s: Shot, dt: number) {
    const boss = this.enemies.find(e => e.kind === 'XS');
    if (!boss) return;
    const dx = boss.x + boss.size / 2 - s.x, dy = boss.y + boss.size / 2 - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(s.vx, s.vy);
    const k = Math.min(1, dt * 4);
    s.vx += ((dx / d) * speed - s.vx) * k;
    s.vy += ((dy / d) * speed - s.vy) * k;
  }

  /** With the shield, shots coming at her face bounce off (not while swinging the sword). */
  private shieldBlocks(s: Shot): boolean {
    const p = this.player;
    if (!this.save.items.shield || p.attack > 0 || this.mode !== 'play') return false;
    const [dx, dy] = DIR_VEC[p.dir];
    const inFront = (s.x - (p.x + 8)) * dx + (s.y - (p.y + 10)) * dy > -2;
    const towardHer = s.vx * dx + s.vy * dy < 0;
    return inFront && towardHer;
  }

  /** Returns false when the boomerang is back in her hand. */
  private updateBoomerang(s: Shot, dt: number): boolean {
    const p = this.player;
    s.t! += dt;
    if (!s.back) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
      const tile = this.room.tiles[ty]?.[tx];
      const out = s.x < 4 || s.y < 4 || s.x > ROOM_W - 4 || s.y > ROOM_H - 4;
      if (tile && blocksShot(tile)) {
        this.hitTile(s, tx, ty);
        this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
        s.back = true;
      }
      if (out || s.t! > 0.45) s.back = true;
    } else {
      const dx = p.x + 8 - s.x, dy = p.y + 10 - s.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        if (s.carry) this.collect(s.carry);
        return false;
      }
      s.x += (dx / d) * 200 * dt;
      s.y += (dy / d) * 200 * dt;
    }
    const box = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
    for (const e of this.enemies) {
      if (e.spawn > 0 || e.hidden || s.hit!.has(e) || !overlap(box, this.enemyBox(e))) continue;
      s.hit!.add(e);
      this.boomerangHit(e);
      s.back = true;
    }
    if (!s.carry) {
      const pk = this.pickups.find(k => overlap(box, { x: k.x + 2, y: k.y + 2, w: 12, h: 12 }));
      if (pk) {
        this.pickups = this.pickups.filter(x => x !== pk);
        delete pk.life;
        s.carry = pk;
        s.back = true;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ bombs
  private updateBombs(dt: number) {
    for (const b of [...this.bombsOut]) {
      b.t -= dt;
      if (b.t > 0) continue;
      this.bombsOut = this.bombsOut.filter(x => x !== b);
      this.explode(b.x, b.y);
    }
  }

  private explode(x: number, y: number) {
    play('bomb');
    this.effects.push({ kind: 'boom', x, y, t: 0, dur: 0.5 });
    for (const e of [...this.enemies]) {
      if (e.spawn > 0 || e.hidden) continue;
      if (Math.hypot(e.x + e.size / 2 - x, e.y + e.size / 2 - y) < BOMB_RADIUS + e.size / 2) this.damageEnemy(e, isBoss(e.kind) ? 2 : 3, x, y);
    }
    const r = this.room;
    let found = false;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      const ch = r.tiles[ty][tx];
      if (ch !== 'Z' && ch !== '%') continue;
      if (Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y) > 22) continue;
      this.openConnected(tx, ty, ch, this.crackOpensTo(r.def, tx, ty, ch));
      found = true;
    }
    if (found) play('secret');
  }

  // ------------------------------------------------------------------ pickups
  private updatePickups(dt: number) {
    const pb = this.playerBox();
    for (const pk of [...this.pickups]) {
      if (pk.life !== undefined && (pk.life -= dt) <= 0) {
        this.pickups = this.pickups.filter(x => x !== pk);
        continue;
      }
      if (overlap(pb, { x: pk.x + 2, y: pk.y + 2, w: 12, h: 12 })) {
        this.pickups = this.pickups.filter(x => x !== pk);
        this.collect(pk);
      }
    }
  }

  private collect(pk: Pickup) {
    const s = this.save;
    const area = this.room.def.area;
    const msgs: string[] = [];
    let then: (() => void) | undefined;
    const leave = () => {
      const exit = entranceOf(area)?.exits.find(e => e.to.startsWith('ow:'));
      if (exit) then = () => this.warpTo(exit.to, exit.ax * TILE, exit.ay * TILE, 'down');
    };
    switch (pk.ch) {
      case 'h': s.hp = Math.min(s.maxHp, s.hp + 2); play('heart'); break;
      case '$': s.gems = Math.min(999, s.gems + 1); play('gem'); break;
      case '0': s.bombs = Math.min(MAX_BOMBS, s.bombs + 2); play('gem'); break;
      case 'K': s.keys[area] = (s.keys[area] ?? 0) + 1; play('key'); break;
      case 'H': s.maxHp = Math.min(32, s.maxHp + 2); s.hp = s.maxHp; msgs.push('got_heart'); play('item'); break;
      case '1': s.items.sword = true; msgs.push('got_sword'); play('item'); break;
      case '2': s.items.staff = true; s.bItem = 'staff'; msgs.push('got_staff'); play('item'); break;
      case '3': s.items.bombs = true; s.bombs = MAX_BOMBS; s.bItem = 'bombs'; msgs.push('got_bombs'); play('item'); break;
      case '4': s.items.boomerang = true; s.bItem = 'boomerang'; msgs.push('got_boomerang'); play('item'); break;
      case '7': s.items.starKey = true; msgs.push('got_starkey'); play('item'); break;
      case '9': s.items.map = true; msgs.push('got_map'); play('item'); break;
      case '6': s.items.shield = true; msgs.push('got_shield'); play('item'); break;
      case '8': s.items.crown = true; msgs.push('got_crown'); play('star'); break;
      case '5':
        s.items.wings = true;
        if (!s.stars.includes(area)) s.stars.push(area);
        s.hp = s.maxHp;
        s.flags.ending = true;
        msgs.push('got_wings', 'the_end');
        play('star');
        leave();
        break;
      case '*': {
        play('star');
        if (!s.stars.includes(area)) s.stars.push(area);
        s.hp = s.maxHp;
        msgs.push('got_star', `next_${area}`);
        leave();
        break;
      }
    }
    this.effects.push({ kind: 'sparkle', x: pk.x + 8, y: pk.y + 8, t: 0, dur: 0.4 });
    if (pk.flag) s.flags[pk.flag] = true;
    this.persist();
    const lines = msgs.map(k => t(k, { name: s.name })).filter(x => !/^NEXT_/.test(x));
    if (lines.length) {
      this.input.reset();
      this.dialog.show(lines.join('|'), then);
    }
  }

  // ------------------------------------------------------------------ inventory & map
  openInventory() {
    if (this.mode !== 'play' || this.dialog.open) return;
    this.mode = 'inv';
    const cur = INV_SLOTS.indexOf(this.bItem() ?? 'staff');
    this.invCursor = Math.max(0, cur);
    play('menu');
  }

  openMap() {
    if ((this.mode !== 'play' && this.mode !== 'inv') || this.dialog.open) return;
    if (!this.save.items.map) {
      if (this.mode === 'inv') this.mode = 'play';
      this.say('no_map');
      return;
    }
    this.mode = 'map';
    play('menu');
  }

  private closeOverlay() {
    this.mode = 'play';
    this.input.reset();
  }

  private updateInventory() {
    if (this.input.consume('inv') || this.input.consume('b')) { this.closeOverlay(); return; }
    if (this.input.consume('map')) { this.openMap(); return; }
    const d = this.input.consumeDir();
    if (d) {
      const cols = INV_COLS, rows = Math.ceil(INV_SLOTS.length / cols);
      const [vx, vy] = DIR_VEC[d];
      const x = (this.invCursor % cols + vx + cols) % cols;
      const y = (Math.floor(this.invCursor / cols) + vy + rows) % rows;
      this.invCursor = Math.min(INV_SLOTS.length - 1, y * cols + x);
      play('menu');
    }
    if (this.input.consume('a')) this.chooseSlot(this.invCursor);
  }

  /** Pick a slot: B items go on the B button, the map opens the map. */
  private chooseSlot(i: number) {
    const slot = INV_SLOTS[i];
    this.invCursor = i;
    if (slot === 'map' && this.save.items.map) { this.openMap(); return; }
    const owned = slot === 'stars' ? this.save.stars.length > 0 : this.save.items[slot];
    if (!owned) return;
    if ((B_ITEMS as readonly string[]).includes(slot)) {
      this.save.bItem = slot as BItem;
      play('click');
      this.persist();
      this.closeOverlay();
      return;
    }
    // Things that are always on (sword on A, shield, key, wings, stars): explain what they do.
    play('menu');
    this.closeOverlay();
    this.say(`info_${slot}`);
  }

  private updateMap() {
    if (this.input.consume('map') || this.input.consume('b') || this.input.consume('a') || this.input.consume('inv')) this.closeOverlay();
  }

  /** A tap or click on the game screen, in game pixels (0..VIEW_W, 0..VIEW_H). */
  tap(x: number, y: number) {
    if (this.dialog.open) return;
    const inside = (r: Box) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    if (this.mode === 'map') { this.closeOverlay(); return; }
    if (this.mode === 'inv') {
      const i = invSlotAt(x, y - HUD_H);
      if (i < 0) this.closeOverlay();
      else this.chooseSlot(i);
      return;
    }
    if (this.mode !== 'play') return;
    if (inside(HUD_TAP.map)) this.openMap();
    else if (inside(HUD_TAP.items)) this.openInventory();
  }

  // ------------------------------------------------------------------ rendering
  private render() {
    const g = this.ctx;
    g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#000';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    drawHud(g, this);

    g.save();
    g.translate(0, HUD_H);
    g.beginPath();
    g.rect(0, 0, ROOM_W, ROOM_H);
    g.clip();
    if (this.scroll) this.renderScroll(g);
    else this.renderRoom(g);

    if (this.fade) {
      const a = this.fade.out ? this.fade.t / this.fade.dur : 1 - this.fade.t / this.fade.dur;
      g.fillStyle = `rgba(0,0,0,${clamp(a, 0, 1)})`;
      g.fillRect(0, 0, ROOM_W, ROOM_H);
    }
    if (this.mode === 'dead') {
      g.fillStyle = 'rgba(160,0,0,0.35)';
      g.fillRect(0, 0, ROOM_W, ROOM_H);
    }
    if (this.mode === 'inv') drawInventory(g, this);
    if (this.mode === 'map') drawWorldMap(g, this);
    g.restore();
  }

  private renderScroll(g: CanvasRenderingContext2D) {
    const s = this.scroll!;
    const k = Math.min(1, s.t / s.dur);
    const [dx, dy] = DIR_VEC[s.dir];
    const camX = dx * ROOM_W * k, camY = dy * ROOM_H * k;
    g.drawImage(this.room.canvas, -camX, -camY);
    this.drawFlags(g, this.room, -camX, -camY);
    this.drawNpcs(g, this.room, -camX, -camY);
    g.drawImage(s.to.canvas, dx * ROOM_W - camX, dy * ROOM_H - camY);
    this.drawFlags(g, s.to, dx * ROOM_W - camX, dy * ROOM_H - camY);
    this.drawNpcs(g, s.to, dx * ROOM_W - camX, dy * ROOM_H - camY);
    const target = this.scrollTarget(s.dir);
    const wx = s.fromX + (dx * ROOM_W + target.x - s.fromX) * k;
    const wy = s.fromY + (dy * ROOM_H + target.y - s.fromY) * k;
    this.drawPlayer(g, wx - camX, wy - camY);
  }

  /** A flag waves over every castle whose star (or wings) has been won. */
  private drawFlags(g: CanvasRenderingContext2D, room: RoomRT, ox: number, oy: number) {
    if (room.def.kind !== 'ow') return;
    for (const d of room.def.doors) {
      const info = locInfo(d.to);
      if (info.kind !== 'dungeon' || !this.save.stars.includes(info.area)) continue;
      let top = d.ty;
      while (top > 0 && room.tiles[top - 1][d.tx] === 'C') top--;
      const img = art.flag[Math.floor(this.time * 3) % 2];
      g.drawImage(img, Math.round(ox + d.tx * TILE + 4), Math.round(oy + top * TILE - 9));
    }
  }

  private renderRoom(g: CanvasRenderingContext2D) {
    const r = this.room;
    g.drawImage(r.canvas, 0, 0);
    const blink = Math.floor(this.time * 10) % 2 === 0;

    if (r.slide) {
      const s = r.slide;
      const k = Math.min(1, s.t / SLIDE_TIME);
      const v = (s.tx * 7 + s.ty * 13) % 3;
      g.drawImage(tileImage(r.def.kind, r.def.ground, v, r.theme), s.tx * TILE, s.ty * TILE);
      if (r.plates.has(s.ty * COLS + s.tx)) g.drawImage(tileImage(r.def.kind, '+', v, r.theme), s.tx * TILE, s.ty * TILE);
      g.drawImage(tileImage(r.def.kind, 'P', 0, r.theme), Math.round((s.fx + (s.tx - s.fx) * k) * TILE), Math.round((s.fy + (s.ty - s.fy) * k) * TILE));
    }
    this.drawFlags(g, r, 0, 0);

    for (const pk of this.pickups) {
      if (pk.life !== undefined && pk.life < 2 && blink) continue;
      this.drawPickup(g, pk.ch, pk.x, pk.y);
    }
    this.drawNpcs(g, r, 0, 0);
    for (const b of this.bombsOut) {
      if (b.t < 0.4 && blink) continue;
      g.drawImage(art.bomb, Math.round(b.x - 4), Math.round(b.y - 6));
    }
    for (const e of this.enemies) this.drawEnemy(g, e);
    for (const s of this.shots) this.drawShot(g, s);

    const p = this.player;
    if (!(p.inv > 0 && Math.floor(this.time * 20) % 2 === 0) || this.mode === 'dead') {
      this.drawSword(g);
      this.drawPlayer(g, p.x, p.y);
    }
    for (const e of this.effects) this.drawEffect(g, e);
  }

  /** People. Outdoor friends bob a little and show a speech bubble to invite a chat. */
  private drawNpcs(g: CanvasRenderingContext2D, room: RoomRT, ox: number, oy: number) {
    for (const n of room.npcs) {
      const img = art.npc[n.kind] ?? art.npc.granny;
      const outdoor = room.def.kind === 'ow';
      const bob = outdoor ? Math.round(Math.sin(this.time * 3 + n.tx) * 1) : 0;
      const x = Math.round(ox + n.tx * TILE), y = Math.round(oy + n.ty * TILE) + bob;
      g.drawImage(img, x, y);
      if (outdoor && Math.floor(this.time * 2) % 2 === 0) {
        g.fillStyle = '#ffffff';
        g.fillRect(x + 10, y - 9, 9, 6);
        g.fillRect(x + 11, y - 3, 2, 2);
        g.fillStyle = '#000000';
        for (const dx of [12, 14, 16]) g.fillRect(x + dx, y - 6, 1, 1);
      }
    }
  }

  private drawPickup(g: CanvasRenderingContext2D, ch: string, x: number, y: number) {
    const img = art.item[ch];
    if (!img) return;
    const bob = '*578'.includes(ch) ? Math.round(Math.sin(this.time * 4) * 1.5) : 0;
    g.drawImage(img, Math.round(x + (16 - img.width) / 2), Math.round(y + (16 - img.height) / 2) + bob);
  }

  private drawPlayer(g: CanvasRenderingContext2D, x: number, y: number) {
    const p = this.player;
    let dir = p.dir;
    if (this.mode === 'dead') dir = DIRS[[1, 3, 0, 2][Math.floor(this.time * 10) % 4]];
    const walking = (p.moving || this.mode === 'scroll') && p.attack <= 0;
    const frame = walking ? Math.floor(p.anim * 8) % 2 : 0;
    if (this.save.items.wings) {
      const flap = Math.floor(this.time * 6) % 2;
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(x) - 2, Math.round(y) + 8 - flap, 4, 3);
      g.fillRect(Math.round(x) + 14, Math.round(y) + 8 - flap, 4, 3);
      g.fillStyle = '#bfe4ff';
      g.fillRect(Math.round(x) - 1, Math.round(y) + 11 - flap, 3, 2);
      g.fillRect(Math.round(x) + 14, Math.round(y) + 11 - flap, 3, 2);
    }
    g.drawImage(art.player[dir][frame], Math.round(x), Math.round(y));
    if (this.save.items.crown) {
      // the Star Crown sits on top of her hair
      const cx = Math.round(x) + 5, cy = Math.round(y) - 2;
      g.fillStyle = '#ffd34d';
      g.fillRect(cx, cy + 2, 6, 2);
      g.fillRect(cx, cy, 1, 2); g.fillRect(cx + 5, cy, 1, 2); g.fillRect(cx + 2, cy - 1, 2, 3);
      g.fillStyle = '#ff4a8a';
      g.fillRect(cx + 2, cy + 2, 2, 1);
    }
    if (this.save.items.shield && this.mode !== 'dead' && dir !== 'up') {
      // the shield in her hand, on the side that faces forward
      const img = art.shieldSmall;
      const sx = dir === 'down' ? 1 : dir === 'right' ? 10 : 0;
      g.drawImage(img, Math.round(x) + sx, Math.round(y) + 8);
    }
  }

  private drawSword(g: CanvasRenderingContext2D) {
    const p = this.player;
    if (p.attack <= 0) return;
    const img = art.item['1'];
    const pos: Record<Dir, [number, number, number]> = {
      up: [p.x + 8, p.y - 3, 0],
      down: [p.x + 8, p.y + 21, Math.PI],
      right: [p.x + 21, p.y + 10, Math.PI / 2],
      left: [p.x - 5, p.y + 10, -Math.PI / 2],
    };
    const [cx, cy, ang] = pos[p.dir];
    g.save();
    g.translate(Math.round(cx), Math.round(cy));
    g.rotate(ang);
    g.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
    g.restore();
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
    const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
    if (e.spawn > 0) {
      this.drawEffect(g, { kind: 'puff', x: cx, y: cy, t: 0.5 - e.spawn, dur: 0.5 });
      return;
    }
    if (e.hurt > 0 && Math.floor(this.time * 30) % 2 === 0) return;
    const frames = art.enemy[e.kind];
    const img = frames[e.stun > 0 ? 0 : Math.floor(e.anim * 4) % 2];
    g.save();
    if (e.kind === 'z' || e.kind === 'XG') {
      // fading in and out
      const k = e.hidden ? clamp(1 - e.fade / 0.3, 0, 1) * 0.25 : clamp(e.fade / 0.3, 0.25, 1) * 0.85;
      g.globalAlpha = e.hidden ? Math.max(0.08, 0.25 - k) : k;
    }
    const x = Math.round(e.x), y = Math.round(e.y);
    if (isBoss(e.kind)) {
      g.drawImage(img, x, y, 32, 32);
      if (e.kind !== 'XS') this.drawCrown(g, x, y + (e.kind === 'XC' ? 2 : 6));
    } else {
      g.drawImage(img, x, y);
    }
    if (e.stun > 0) {
      // dizzy stars
      g.fillStyle = '#ffe14d';
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 3;
        g.fillRect(Math.round(cx + Math.cos(a) * e.size * 0.4) - 1, Math.round(e.y + 2 + Math.sin(a) * 3) - 1, 2, 2);
      }
    }
    g.restore();
  }

  private drawCrown(g: CanvasRenderingContext2D, x: number, y: number) {
    g.fillStyle = '#ffd34d';
    g.fillRect(x + 9, y + 4, 14, 4);
    for (const ox of [9, 15, 21]) g.fillRect(x + ox, y, 2, 4);
    g.fillStyle = '#ff4a6a';
    g.fillRect(x + 15, y + 5, 2, 2);
  }

  private drawShot(g: CanvasRenderingContext2D, s: Shot) {
    const x = Math.round(s.x), y = Math.round(s.y);
    const flick = Math.floor(this.time * 20) % 2 === 0;
    switch (s.kind) {
      case 'magic':
        g.fillStyle = flick ? '#ffffff' : '#ff7af0';
        g.fillRect(x - 1, y - 4, 2, 8);
        g.fillRect(x - 4, y - 1, 8, 2);
        g.fillStyle = '#ffe066';
        g.fillRect(x - 2, y - 2, 4, 4);
        return;
      case 'boomerang': {
        if (s.carry) this.drawPickup(g, s.carry.ch, s.x - 8, s.y - 8);
        const img = art.item['4'];
        g.save();
        g.translate(x, y);
        g.rotate(this.time * 18);
        g.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
        g.restore();
        return;
      }
      case 'rock':
        g.fillStyle = '#555';
        g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = '#aaa';
        g.fillRect(x - 2, y - 2, 2, 2);
        return;
      case 'bubble':
        g.fillStyle = '#bfe4ff';
        g.fillRect(x - 3, y - 4, 6, 8);
        g.fillRect(x - 4, y - 3, 8, 6);
        g.fillStyle = '#ffffff';
        g.fillRect(x - 2, y - 2, 2, 2);
        return;
      case 'fire':
        g.fillStyle = flick ? '#b07aff' : '#ffffff';
        g.fillRect(x - 3, y - 3, 6, 6);
        g.fillStyle = '#5a2aa0';
        g.fillRect(x - 1, y - 1, 2, 2);
        return;
      case 'orb': {
        const big = Math.floor(this.time * 8) % 2 === 0;
        const [a, b] = s.friendly ? ['#7ac0ff', '#ffffff'] : ['#ff3a8a', '#ffe14d'];
        g.fillStyle = a;
        g.fillRect(x - 5, y - 3, 10, 6);
        g.fillRect(x - 3, y - 5, 6, 10);
        g.fillStyle = b;
        g.fillRect(x - (big ? 3 : 2), y - 1, big ? 6 : 4, 2);
        g.fillRect(x - 1, y - (big ? 3 : 2), 2, big ? 6 : 4);
        return;
      }
      case 'starshot':
        g.fillStyle = flick ? '#ffe14d' : '#ff3a5a';
        g.fillRect(x - 1, y - 4, 2, 8);
        g.fillRect(x - 4, y - 1, 8, 2);
        return;
      default:
        g.fillStyle = '#0c4038';
        g.fillRect(x - 4, y - 4, 8, 8);
        g.fillStyle = '#4cc0a0';
        g.fillRect(x - 3, y - 3, 6, 6);
    }
  }

  private drawEffect(g: CanvasRenderingContext2D, e: Effect) {
    const k = e.t / e.dur;
    if (e.kind === 'puff') {
      const r = 2 + 8 * k;
      g.fillStyle = k < 0.5 ? '#ffffff' : '#c0c0c0';
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        g.fillRect(Math.round(e.x + Math.cos(a) * r) - 2, Math.round(e.y + Math.sin(a) * r) - 2, 4, 4);
      }
    } else if (e.kind === 'boom') {
      const r = 6 + 22 * k;
      const cols = ['#ffffff', '#ffe14d', '#ff9a2a', '#a0a0a0'];
      g.fillStyle = cols[Math.min(3, Math.floor(k * 4))];
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.fillRect(Math.round(e.x + Math.cos(a) * r) - 3, Math.round(e.y + Math.sin(a) * r) - 3, 6, 6);
      }
      if (k < 0.3) g.fillRect(Math.round(e.x) - 8, Math.round(e.y) - 8, 16, 16);
    } else {
      const r = 3 + 7 * k;
      g.fillStyle = Math.floor(this.time * 20) % 2 ? '#ffe14d' : '#ffffff';
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + k * 2;
        g.fillRect(Math.round(e.x + Math.cos(a) * r) - 1, Math.round(e.y + Math.sin(a) * r) - 1, 2, 2);
      }
    }
  }
}

