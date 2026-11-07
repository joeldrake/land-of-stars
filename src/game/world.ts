import { COLS, ROWS } from '../config';
import { ENEMY_CHARS, ITEM_CHARS } from './tiles';
import { DIR_VEC, type Dir } from './types';

export type AreaKind = 'ow' | 'cave' | 'dungeon';

export interface Spawn { ch: string; tx: number; ty: number }
export interface Door { tx: number; ty: number; to: string; ax: number; ay: number }
export interface Exit { dir: Dir; to: string; ax: number; ay: number }
/**
 * `after` is said once everything in the room has been picked up.
 * `alt` is said instead when the player owns `alt.item` (e.g. `bombs=digger_bombs`).
 */
export interface Npc {
  tx: number; ty: number; kind: string; text: string; after?: string; alt?: { item: string; text: string };
  /** Only there once this castle's star has been won (`star:d1`). */
  star?: string;
}

export interface RoomDef {
  loc: string;
  area: string;
  kind: AreaKind;
  gx: number;
  gy: number;
  ground: string;
  tiles: string[];
  spawns: Spawn[];
  items: Spawn[];
  rewards: Spawn[];
  doors: Door[];
  exits: Exit[];
  npcs: Npc[];
  warnings: string[];
}

/** 'ow:7:7' → overworld screen, 'cave:sword' → cave, 'd1:2:3' → dungeon d1 room. */
export function locInfo(loc: string): { area: string; kind: AreaKind; gx: number; gy: number } {
  const p = loc.split(':');
  if (p[0] === 'ow') return { area: 'ow', kind: 'ow', gx: +p[1], gy: +p[2] };
  if (p[0] === 'cave') return { area: 'cave', kind: 'cave', gx: 0, gy: 0 };
  return { area: p[0], kind: 'dungeon', gx: +p[1], gy: +p[2] };
}

const xy = (s: string | undefined): [number, number] => {
  const [a, b] = (s ?? '').split(',').map(Number);
  return [a, b];
};

export function parseRoom(loc: string, src: string): RoomDef {
  const info = locInfo(loc);
  const warnings: string[] = [];
  const grid: string[] = [];
  const def: RoomDef = {
    loc, ...info, ground: '.', tiles: [], spawns: [], items: [], rewards: [],
    doors: [], exits: [], npcs: [], warnings,
  };

  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('@')) {
      const m = line.slice(1).trim().split(/\s+/);
      if (m[0] === 'door') {
        const [tx, ty] = xy(m[1]);
        const [ax, ay] = xy(m[4]);
        def.doors.push({ tx, ty, to: m[3], ax, ay });
      } else if (m[0] === 'exit') {
        const [ax, ay] = xy(m[4]);
        def.exits.push({ dir: m[1] as Dir, to: m[3], ax, ay });
      } else if (m[0] === 'npc') {
        const [tx, ty] = xy(m[1]);
        const rest = m.slice(4);
        const altTok = rest.find(x => x.includes('='));
        const starTok = rest.find(x => x.startsWith('star:'));
        const after = rest.find(x => !x.includes('=') && !x.startsWith('star:'));
        const alt = altTok ? { item: altTok.split('=')[0], text: altTok.split('=')[1] } : undefined;
        def.npcs.push({ tx, ty, kind: m[2], text: m[3], after, alt, star: starTok?.slice(5) });
      } else if (m[0] === 'reward') {
        const [tx, ty] = xy(m[2]);
        def.rewards.push({ ch: m[1], tx, ty });
      } else {
        warnings.push(`unknown meta "${m[0]}"`);
      }
      continue;
    }
    grid.push(line);
  }

  if (grid.length !== ROWS) warnings.push(`expected ${ROWS} rows, got ${grid.length}`);
  const rows = grid.slice(0, ROWS);
  while (rows.length < ROWS) rows.push('');
  const fixed = rows.map((r, y) => {
    if (r.length !== COLS && y < grid.length) warnings.push(`row ${y} has ${r.length} chars, expected ${COLS}`);
    return r.padEnd(COLS, '#').slice(0, COLS);
  });

  let dots = 0, sand = 0;
  for (const r of fixed) for (const c of r) { if (c === '.') dots++; else if (c === ',') sand++; }
  def.ground = sand > dots ? ',' : '.';

  def.tiles = fixed.map((r, ty) => [...r].map((ch, tx) => {
    if (ENEMY_CHARS.includes(ch)) { def.spawns.push({ ch, tx, ty }); return def.ground; }
    if (ITEM_CHARS.includes(ch)) { def.items.push({ ch, tx, ty }); return def.ground; }
    return ch;
  }).join(''));
  return def;
}

export function pathToLoc(path: string): string | null {
  let m = path.match(/overworld\/(\d+)_(\d+)\.txt$/);
  if (m) return `ow:${+m[1]}:${+m[2]}`;
  m = path.match(/caves\/([\w-]+)\.txt$/);
  if (m) return `cave:${m[1]}`;
  m = path.match(/dungeons\/(\w+)\/(\d+)_(\d+)\.txt$/);
  if (m) return `${m[1]}:${+m[2]}:${+m[3]}`;
  return null;
}

const files = import.meta.glob('../world/**/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const ROOMS = new Map<string, RoomDef>();
for (const [path, src] of Object.entries(files)) {
  const loc = pathToLoc(path);
  if (loc) ROOMS.set(loc, parseRoom(loc, src));
}

export function neighborLoc(def: RoomDef, dir: Dir): string | null {
  if (def.kind === 'cave') return null;
  const [dx, dy] = DIR_VEC[dir];
  const loc = `${def.area}:${def.gx + dx}:${def.gy + dy}`;
  return ROOMS.has(loc) ? loc : null;
}

/** The dungeon room that leads back out to the overworld. */
export function entranceOf(area: string): RoomDef | null {
  for (const r of ROOMS.values()) {
    if (r.area === area && r.exits.some(e => e.to.startsWith('ow:'))) return r;
  }
  return null;
}
