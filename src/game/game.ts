import { COLS, HUD_H, RENDER_SCALE, ROOM_H, ROOM_W, ROWS, START, STEP, TILE, VIEW_H, VIEW_W } from '../config';
import { t } from '../i18n';
import type { Dialog } from '../ui/dialog';
import { art, paintRoom } from './art';
import { drawHud } from './hud';
import { play } from './sfx';
import type { Input } from './input';
import type { SaveData } from './save';
import { blocksShot, isSolid } from './tiles';
import { DIR_VEC, DIRS, type Dir } from './types';
import { entranceOf, neighborLoc, ROOMS, type Npc, type RoomDef } from './world';

/** Player hitbox inside the 16x16 sprite: the lower part, so the head can overlap walls. */
const HB = { ox: 3, oy: 6, w: 10, h: 10 };
const PLAYER_SPEED = 80;
const ATTACK_TIME = 0.28;

interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type EnemyKind = 's' | 'b' | 'g' | 'k' | 'X';
const STATS: Record<EnemyKind, { hp: number; speed: number; dmg: number; size: number; fly?: boolean }> = {
  s: { hp: 1, speed: 26, dmg: 1, size: 16 },
  b: { hp: 1, speed: 46, dmg: 1, size: 16, fly: true },
  g: { hp: 2, speed: 34, dmg: 1, size: 16 },
  k: { hp: 2, speed: 40, dmg: 1, size: 16 },
  X: { hp: 8, speed: 28, dmg: 2, size: 32 },
};

interface Enemy {
  kind: EnemyKind; x: number; y: number; size: number; hp: number;
  dir: Dir; vx: number; vy: number; think: number; shoot: number;
  hurt: number; kbx: number; kby: number; kbT: number; spawn: number; anim: number;
}
interface Shot { x: number; y: number; vx: number; vy: number; r: number; friendly: boolean; dmg: number; kind: 'magic' | 'rock' | 'slime'; life: number }
interface Pickup { ch: string; x: number; y: number; flag?: string; life?: number }
interface Effect { kind: 'puff' | 'sparkle'; x: number; y: number; t: number; dur: number }

interface RoomRT {
  def: RoomDef;
  tiles: string[][];
  canvas: HTMLCanvasElement;
  hadEnemies: boolean;
  rewardsDone: boolean;
  lockedSaid: boolean;
  npcBlock: Set<number>;
}

export interface GameHooks {
  onSave(s: SaveData): void;
  onMenu(): void;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  room!: RoomRT;
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  pickups: Pickup[] = [];
  effects: Effect[] = [];
  player = { x: 0, y: 0, dir: 'down' as Dir, attack: 0, inv: 0, kbx: 0, kby: 0, kbT: 0, anim: 0, moving: false };
  mode: 'play' | 'scroll' | 'fade' | 'dead' = 'play';
  paused = false;
  time = 0;
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

  private update(dt: number) {
    this.time += dt;
    if (this.input.consume('menu')) { this.hooks.onMenu(); return; }
    if (this.dialog.open) {
      if (this.input.consume('a') || this.input.consume('b')) this.dialog.advance();
      return;
    }
    this.effects = this.effects.filter(e => (e.t += dt) < e.dur);

    if (this.mode === 'scroll') this.updateScroll(dt);
    else if (this.mode === 'fade') this.updateFade(dt);
    else if (this.mode === 'dead') this.updateDead(dt);
    else {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updateShots(dt);
      this.updatePickups(dt);
      if (this.room.hadEnemies && !this.room.rewardsDone && this.enemies.length === 0) this.revealRewards(true);
    }
    this.input.flush();
  }

  // ------------------------------------------------------------------ rooms
  private buildRoom(loc: string): RoomRT {
    const def = ROOMS.get(loc)!;
    const tiles = def.tiles.map(r => [...r]);
    tiles.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === 'L' && this.flag(`open:${loc}:${x},${y}`)) row[x] = def.ground;
    }));
    return {
      def, tiles,
      canvas: paintRoom(def.kind, def.ground, tiles),
      hadEnemies: false, rewardsDone: false, lockedSaid: false,
      npcBlock: new Set(def.npcs.map(n => n.ty * COLS + n.tx)),
    };
  }

  /** Spawn enemies and items for the current room. */
  private populate() {
    const def = this.room.def;
    this.enemies = [];
    this.shots = [];
    this.pickups = [];
    for (const s of def.spawns) {
      if (s.ch === 'X' && this.flag(`boss:${def.loc}`)) continue;
      this.enemies.push(this.makeEnemy(s.ch as EnemyKind, s.tx * TILE, s.ty * TILE));
    }
    this.room.hadEnemies = this.enemies.length > 0;
    for (const it of def.items) {
      const flag = `got:${def.loc}:${it.tx},${it.ty}`;
      if (!this.flag(flag)) this.pickups.push({ ch: it.ch, x: it.tx * TILE, y: it.ty * TILE, flag });
    }
    if (!this.room.hadEnemies) this.revealRewards(false);
  }

  private revealRewards(fx: boolean) {
    this.room.rewardsDone = true;
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
    const npc = this.room.def.npcs[0];
    if (npc) this.talkTo(npc);
  }

  private moveToFreeTile() {
    const p = this.player;
    const sx = clamp(Math.round(p.x / TILE), 0, COLS - 1), sy = clamp(Math.round(p.y / TILE), 0, ROWS - 1);
    const seen = new Set([sy * COLS + sx]);
    const q: [number, number][] = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.shift()!;
      if (!this.playerBlockedAt(x * TILE, y * TILE)) { p.x = x * TILE; p.y = y * TILE; return; }
      for (const d of DIRS) {
        const nx = x + DIR_VEC[d][0], ny = y + DIR_VEC[d][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(ny * COLS + nx)) continue;
        seen.add(ny * COLS + nx);
        q.push([nx, ny]);
      }
    }
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
    this.populate();
    this.arrived();
  }

  // ------------------------------------------------------------------ collision
  private solidAt(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return false;
    return isSolid(this.room.tiles[ty][tx]) || this.room.npcBlock.has(ty * COLS + tx);
  }

  private boxSolid(x: number, y: number, w: number, h: number): boolean {
    for (let ty = Math.floor(y / TILE); ty <= Math.floor((y + h - 0.01) / TILE); ty++) {
      for (let tx = Math.floor(x / TILE); tx <= Math.floor((x + w - 0.01) / TILE); tx++) {
        if (this.solidAt(tx, ty)) return true;
      }
    }
    return false;
  }

  private playerBlockedAt(x: number, y: number) {
    return this.boxSolid(x + HB.ox, y + HB.oy, HB.w, HB.h);
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
    if (this.input.consume('b') && this.save.items.staff && !this.shots.some(s => s.friendly)) {
      const [vx, vy] = DIR_VEC[p.dir];
      this.shots.push({ x: p.x + 8 + vx * 8, y: p.y + 10 + vy * 8, vx: vx * 160, vy: vy * 160, r: 4, friendly: true, dmg: 2, kind: 'magic', life: 2 });
      play('magic');
    }

    const d = this.input.dir;
    p.moving = !!d;
    if (d) {
      p.dir = d;
      p.anim += dt;
      const [vx, vy] = DIR_VEC[d];
      this.movePlayer(vx * PLAYER_SPEED * dt, vy * PLAYER_SPEED * dt);
      this.checkLock();
    }
    this.checkDoor();
    this.checkEdges();
  }

  private checkLock() {
    const p = this.player;
    const [vx, vy] = DIR_VEC[p.dir];
    const tx = Math.floor((p.x + 8 + vx * 10) / TILE), ty = Math.floor((p.y + 11 + vy * 10) / TILE);
    if (this.room.tiles[ty]?.[tx] !== 'L') return;
    if (this.save.keys <= 0) {
      if (!this.room.lockedSaid) { this.room.lockedSaid = true; play('locked'); this.say('locked'); }
      return;
    }
    this.save.keys--;
    play('unlock');
    // open every connected lock tile (doors are 2 tiles wide)
    const q: [number, number][] = [[tx, ty]];
    while (q.length) {
      const [x, y] = q.pop()!;
      if (this.room.tiles[y]?.[x] !== 'L') continue;
      this.room.tiles[y][x] = this.room.def.ground;
      this.save.flags[`open:${this.room.def.loc}:${x},${y}`] = true;
      this.effects.push({ kind: 'puff', x: x * TILE + 8, y: y * TILE + 8, t: 0, dur: 0.4 });
      for (const dd of DIRS) q.push([x + DIR_VEC[dd][0], y + DIR_VEC[dd][1]]);
    }
    paintRoom(this.room.def.kind, this.room.def.ground, this.room.tiles, this.room.canvas);
    this.persist();
  }

  private checkDoor() {
    const p = this.player;
    const tx = Math.floor((p.x + 8) / TILE), ty = Math.floor((p.y + 11) / TILE);
    if (this.room.tiles[ty]?.[tx] !== 'D') return;
    const door = this.room.def.doors.find(d => d.tx === tx && d.ty === ty);
    if (door) play('door');
    if (door) this.warpTo(door.to, door.ax * TILE, door.ay * TILE, 'up');
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
    for (const n of this.room.def.npcs) {
      if (Math.hypot(n.tx * TILE + 8 - (p.x + 8), n.ty * TILE + 8 - (p.y + 10)) < 28) {
        this.talkTo(n);
        return true;
      }
    }
    return false;
  }

  private talkTo(n: Npc) {
    const def = this.room.def;
    const all = [...def.items, ...def.rewards];
    const allTaken = all.length > 0 && all.every(i => this.flag(`got:${def.loc}:${i.tx},${i.ty}`));
    this.say(allTaken && n.after ? n.after : n.text);
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
      if (e.spawn > 0 || e.hurt > 0) continue;
      if (overlap(sb, this.enemyBox(e))) this.damageEnemy(e, 1, this.player.x + 8, this.player.y + 10);
    }
  }

  private hurtPlayer(dmg: number, fromX: number, fromY: number) {
    const p = this.player;
    if (p.inv > 0 || this.mode !== 'play') return;
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
    return {
      kind, x, y, size: s.size, hp: s.hp, dir: 'down', vx: 0, vy: 0,
      think: Math.random(), shoot: 1.5 + Math.random() * 2,
      hurt: 0, kbx: 0, kby: 0, kbT: 0, spawn: 0.5, anim: Math.random(),
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

  private updateEnemies(dt: number) {
    const p = this.player;
    const pb = this.playerBox();
    for (const e of this.enemies) {
      e.anim += dt;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (e.hurt > 0) e.hurt -= dt;
      if (e.kbT > 0) {
        e.kbT -= dt;
        this.moveEnemy(e, e.kbx * dt, e.kby * dt);
      } else {
        const sp = STATS[e.kind].speed;
        e.think -= dt;
        if (e.kind === 'b' || e.kind === 'X') {
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
          if (e.kind === 'g') {
            const [vx, vy] = DIR_VEC[e.dir];
            this.shots.push({ x: cx, y: cy, vx: vx * 90, vy: vy * 90, r: 3, friendly: false, dmg: 1, kind: 'rock', life: 3 });
            e.shoot = 2 + Math.random() * 2;
          } else if (e.kind === 'X') {
            const base = Math.atan2(p.y + 10 - cy, p.x + 8 - cx);
            for (const off of [-0.35, 0, 0.35]) {
              this.shots.push({ x: cx, y: cy, vx: Math.cos(base + off) * 75, vy: Math.sin(base + off) * 75, r: 4, friendly: false, dmg: 1, kind: 'slime', life: 4 });
            }
            e.shoot = 2.2;
          } else e.shoot = 99;
        }
      }
      if (overlap(this.enemyBox(e), pb)) this.hurtPlayer(STATS[e.kind].dmg, e.x + e.size / 2, e.y + e.size / 2);
    }
  }

  private damageEnemy(e: Enemy, dmg: number, fromX: number, fromY: number) {
    e.hp -= dmg;
    e.hurt = 0.35;
    if (e.kind !== 'X') {
      let dx = e.x + e.size / 2 - fromX, dy = e.y + e.size / 2 - fromY;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      e.kbx = dx * 180; e.kby = dy * 180; e.kbT = 0.15;
    }
    if (e.hp > 0) { play('hit'); return; }
    play(e.kind === 'X' ? 'bossDie' : 'kill');
    this.enemies = this.enemies.filter(x => x !== e);
    const cx = e.x + e.size / 2, cy = e.y + e.size / 2;
    this.effects.push({ kind: 'puff', x: cx, y: cy, t: 0, dur: 0.4 });
    if (e.kind === 'X') {
      this.save.flags[`boss:${this.room.def.loc}`] = true;
      this.shots = this.shots.filter(s => s.friendly);
      this.persist();
      return;
    }
    const r = Math.random();
    const drop = r < 0.25 ? '$' : r < 0.42 ? 'h' : null;
    if (drop) this.pickups.push({ ch: drop, x: cx - 8, y: cy - 8, life: 8 });
  }

  // ------------------------------------------------------------------ shots & pickups
  private updateShots(dt: number) {
    const pb = this.playerBox();
    const keep: Shot[] = [];
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const out = s.x < 0 || s.y < 0 || s.x > ROOM_W || s.y > ROOM_H || s.life <= 0;
      const tile = this.room.tiles[Math.floor(s.y / TILE)]?.[Math.floor(s.x / TILE)];
      if (out || (tile && blocksShot(tile))) {
        if (s.friendly) this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
        continue;
      }
      const box = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
      if (s.friendly) {
        const hit = this.enemies.find(e => e.spawn <= 0 && overlap(box, this.enemyBox(e)));
        if (hit) {
          this.damageEnemy(hit, s.dmg, s.x - s.vx, s.y - s.vy);
          this.effects.push({ kind: 'sparkle', x: s.x, y: s.y, t: 0, dur: 0.3 });
          continue;
        }
      } else if (overlap(box, pb)) {
        this.hurtPlayer(s.dmg, s.x - s.vx, s.y - s.vy);
        continue;
      }
      keep.push(s);
    }
    this.shots = keep;
  }

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
    let msg: string | null = null;
    let then: (() => void) | undefined;
    switch (pk.ch) {
      case 'h': s.hp = Math.min(s.maxHp, s.hp + 2); play('heart'); break;
      case '$': s.gems = Math.min(999, s.gems + 1); play('gem'); break;
      case 'K': s.keys++; play('key'); break;
      case 'H': s.maxHp = Math.min(32, s.maxHp + 2); s.hp = s.maxHp; msg = 'got_heart'; play('item'); break;
      case '1': s.items.sword = true; msg = 'got_sword'; play('item'); break;
      case '2': s.items.staff = true; msg = 'got_staff'; play('item'); break;
      case '*': {
        play('star');
        const area = this.room.def.area;
        if (!s.stars.includes(area)) s.stars.push(area);
        s.hp = s.maxHp;
        msg = 'got_star';
        const exit = entranceOf(area)?.exits.find(e => e.to.startsWith('ow:'));
        if (exit) then = () => this.warpTo(exit.to, exit.ax * TILE, exit.ay * TILE, 'down');
        break;
      }
    }
    this.effects.push({ kind: 'sparkle', x: pk.x + 8, y: pk.y + 8, t: 0, dur: 0.4 });
    if (pk.flag) s.flags[pk.flag] = true;
    this.persist();
    if (msg) this.say(msg, then);
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
    g.restore();
  }

  private renderScroll(g: CanvasRenderingContext2D) {
    const s = this.scroll!;
    const k = Math.min(1, s.t / s.dur);
    const [dx, dy] = DIR_VEC[s.dir];
    const camX = dx * ROOM_W * k, camY = dy * ROOM_H * k;
    g.drawImage(this.room.canvas, -camX, -camY);
    g.drawImage(s.to.canvas, dx * ROOM_W - camX, dy * ROOM_H - camY);
    const target = this.scrollTarget(s.dir);
    const wx = s.fromX + (dx * ROOM_W + target.x - s.fromX) * k;
    const wy = s.fromY + (dy * ROOM_H + target.y - s.fromY) * k;
    this.drawPlayer(g, wx - camX, wy - camY);
  }

  private renderRoom(g: CanvasRenderingContext2D) {
    g.drawImage(this.room.canvas, 0, 0);
    const blink = Math.floor(this.time * 10) % 2 === 0;

    for (const pk of this.pickups) {
      if (pk.life !== undefined && pk.life < 2 && blink) continue;
      const img = art.item[pk.ch];
      if (!img) continue;
      const bob = pk.ch === '*' ? Math.round(Math.sin(this.time * 4) * 1.5) : 0;
      g.drawImage(img, Math.round(pk.x + (16 - img.width) / 2), Math.round(pk.y + (16 - img.height) / 2) + bob);
    }
    for (const n of this.room.def.npcs) {
      const img = art.npc[n.kind] ?? art.npc.granny;
      g.drawImage(img, n.tx * TILE, n.ty * TILE);
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

  private drawPlayer(g: CanvasRenderingContext2D, x: number, y: number) {
    const p = this.player;
    let dir = p.dir;
    if (this.mode === 'dead') dir = DIRS[[1, 3, 0, 2][Math.floor(this.time * 10) % 4]];
    const walking = (p.moving || this.mode === 'scroll') && p.attack <= 0;
    const frame = walking ? Math.floor(p.anim * 8) % 2 : 0;
    g.drawImage(art.player[dir][frame], Math.round(x), Math.round(y));
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
    const img = art.enemy[e.kind][Math.floor(e.anim * 4) % 2];
    if (e.kind === 'X') {
      g.drawImage(img, Math.round(e.x), Math.round(e.y), 32, 32);
      // crown
      const x = Math.round(e.x), y = Math.round(e.y) + 6;
      g.fillStyle = '#ffd34d';
      g.fillRect(x + 9, y + 4, 14, 4);
      for (const ox of [9, 15, 21]) g.fillRect(x + ox, y, 2, 4);
      g.fillStyle = '#ff4a6a';
      g.fillRect(x + 15, y + 5, 2, 2);
    } else {
      g.drawImage(img, Math.round(e.x), Math.round(e.y));
    }
  }

  private drawShot(g: CanvasRenderingContext2D, s: Shot) {
    const x = Math.round(s.x), y = Math.round(s.y);
    if (s.kind === 'magic') {
      const big = Math.floor(this.time * 20) % 2 === 0;
      g.fillStyle = big ? '#ffffff' : '#ff7af0';
      g.fillRect(x - 1, y - 4, 2, 8);
      g.fillRect(x - 4, y - 1, 8, 2);
      g.fillStyle = '#ffe066';
      g.fillRect(x - 2, y - 2, 4, 4);
    } else if (s.kind === 'rock') {
      g.fillStyle = '#555';
      g.fillRect(x - 3, y - 3, 6, 6);
      g.fillStyle = '#aaa';
      g.fillRect(x - 2, y - 2, 2, 2);
    } else {
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
