import { START, TILE } from '../config';
import type { Dir } from './types';

export interface SaveData {
  v: 1;
  updatedAt: number;
  name: string;
  hp: number; // in half hearts
  maxHp: number;
  gems: number;
  keys: number;
  items: { sword: boolean; staff: boolean };
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
    keys: 0,
    items: { sword: false, staff: false },
    stars: [],
    flags: {},
    pos: { loc: START.loc, x: START.tx * TILE, y: START.ty * TILE, dir: 'down' },
  };
}

/** Accepts anything (old versions, remote JSON) and returns a complete save, or null. */
export function normalizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SaveData>;
  const base = newSave(typeof r.name === 'string' ? r.name : 'MIRA');
  return {
    ...base,
    ...r,
    v: 1,
    items: { ...base.items, ...(r.items ?? {}) },
    flags: { ...(r.flags ?? {}) },
    stars: Array.isArray(r.stars) ? r.stars : [],
    pos: r.pos && typeof r.pos.loc === 'string' ? r.pos : base.pos,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}
