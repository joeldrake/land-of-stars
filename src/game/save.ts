import { START, TILE } from '../config';
import type { Dir } from './types';

/** Things you can put on the B button, in inventory order. */
export const B_ITEMS = ['staff', 'bombs', 'boomerang'] as const;
export type BItem = (typeof B_ITEMS)[number];

export interface Items {
  sword: boolean;
  staff: boolean;
  /** The bomb bag. The number of bombs is `SaveData.bombs`. */
  bombs: boolean;
  boomerang: boolean;
  map: boolean;
  starKey: boolean;
  wings: boolean;
  /** Bounces enemy shots that hit her from the front. */
  shield: boolean;
  /** The Star Crown from the secret island. Just for show: she wears it. */
  crown: boolean;
}

export const MAX_BOMBS = 8;

export interface SaveData {
  v: 1;
  updatedAt: number;
  name: string;
  hp: number; // in half hearts
  maxHp: number;
  gems: number;
  /** Small keys, counted per castle so a spare key from one castle can't skip a door in the next. */
  keys: Record<string, number>;
  bombs: number;
  bItem: BItem;
  items: Items;
  stars: string[];
  flags: Record<string, boolean>;
  pos: { loc: string; x: number; y: number; dir: Dir };
}

export function newSave(name: string): SaveData {
  return {
    v: 1,
    updatedAt: Date.now(),
    name,
    hp: 6,
    maxHp: 6,
    gems: 0,
    keys: {},
    bombs: 0,
    bItem: 'staff',
    items: { sword: false, staff: false, bombs: false, boomerang: false, map: false, starKey: false, wings: false, shield: false, crown: false },
    stars: [],
    flags: {},
    pos: { loc: START.loc, x: START.tx * TILE, y: START.ty * TILE, dir: 'down' },
  };
}

/** Accepts anything (old versions, remote JSON) and returns a complete save, or null. */
export function normalizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Omit<SaveData, 'keys'>> & { keys?: unknown };
  const base = newSave(typeof r.name === 'string' ? r.name : 'MIRA');
  // Old saves had one key counter; all keys back then belonged to castle 1.
  const keys = typeof r.keys === 'number' ? (r.keys > 0 ? { d1: r.keys } : {})
    : r.keys && typeof r.keys === 'object' ? { ...(r.keys as Record<string, number>) } : {};
  return {
    ...base,
    ...r,
    v: 1,
    keys,
    bombs: typeof r.bombs === 'number' ? r.bombs : 0,
    bItem: B_ITEMS.includes(r.bItem as BItem) ? (r.bItem as BItem) : 'staff',
    items: { ...base.items, ...(r.items ?? {}) },
    flags: { ...(r.flags ?? {}) },
    stars: Array.isArray(r.stars) ? r.stars : [],
    pos: r.pos && typeof r.pos.loc === 'string' ? r.pos : base.pos,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}
