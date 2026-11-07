import { describe, expect, it } from 'vitest';
import { COLS, OW_COLS, OW_ROWS, ROWS, START } from '../src/config';
import { DOOR_CHARS, HIDDEN_DOOR_CHARS, isSolid } from '../src/game/tiles';
import { sv } from '../src/i18n/sv';
import { entranceOf, neighborLoc, ROOMS } from '../src/game/world';
import type { Dir } from '../src/game/types';

// Things that open later count as open for edge-matching:
// locked doors (key), bars (solve the room), cracked walls (bomb) and the star gate.
const open = (ch: string) => 'L|%V'.includes(ch) || !isSolid(ch);

function edge(tiles: string[], dir: Dir): string[] {
  switch (dir) {
    case 'up': return [...tiles[0]];
    case 'down': return [...tiles[ROWS - 1]];
    case 'left': return tiles.map(r => r[0]);
    case 'right': return tiles.map(r => r[COLS - 1]);
  }
}
const OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

describe('world files', () => {
  it('parse without warnings', () => {
    const bad = [...ROOMS.values()].filter(r => r.warnings.length).map(r => `${r.loc}: ${r.warnings.join('; ')}`);
    expect(bad).toEqual([]);
  });

  it('has the full 16x8 overworld and the start screen', () => {
    for (let y = 0; y < OW_ROWS; y++) for (let x = 0; x < OW_COLS; x++) expect(ROOMS.has(`ow:${x}:${y}`)).toBe(true);
    const start = ROOMS.get(START.loc)!;
    expect(isSolid(start.tiles[START.ty][START.tx])).toBe(false);
  });

  it('shared edges line up and open edges lead somewhere', () => {
    const problems: string[] = [];
    for (const room of ROOMS.values()) {
      for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
        const mine = edge(room.tiles, dir);
        const exit = room.exits.find(e => e.dir === dir);
        const n = neighborLoc(room, dir);
        if (exit) continue;
        if (!n) {
          if (mine.some(open)) problems.push(`${room.loc} ${dir}: open edge with no neighbour or exit`);
          continue;
        }
        const theirs = edge(ROOMS.get(n)!.tiles, OPP[dir]);
        mine.forEach((ch, i) => {
          if (open(ch) !== open(theirs[i])) problems.push(`${room.loc} ${dir}[${i}] '${ch}' vs ${n} '${theirs[i]}'`);
        });
      }
    }
    expect(problems).toEqual([]);
  });

  it('doors and exits point at walkable tiles in existing rooms', () => {
    const problems: string[] = [];
    for (const room of ROOMS.values()) {
      for (const d of room.doors) {
        const ch = room.tiles[d.ty]?.[d.tx] ?? '';
        if (!(DOOR_CHARS + HIDDEN_DOOR_CHARS).includes(ch)) problems.push(`${room.loc}: door at ${d.tx},${d.ty} is '${ch}', not a door tile`);
      }
      for (const t of [...room.doors, ...room.exits]) {
        const target = ROOMS.get(t.to);
        if (!target) { problems.push(`${room.loc}: target ${t.to} missing`); continue; }
        const ch = target.tiles[t.ay]?.[t.ax];
        if (!ch || isSolid(ch) || DOOR_CHARS.includes(ch)) problems.push(`${room.loc}: lands on '${ch}' at ${t.to} ${t.ax},${t.ay}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every dungeon has an entrance', () => {
    const areas = new Set([...ROOMS.values()].filter(r => r.kind === 'dungeon').map(r => r.area));
    for (const a of areas) expect(entranceOf(a), a).not.toBeNull();
  });

  it('puzzles can be solved', () => {
    const problems: string[] = [];
    for (const room of ROOMS.values()) {
      const count = (ch: string) => room.tiles.join('').split(ch).length - 1;
      if (count('+') > count('P')) problems.push(`${room.loc}: ${count('+')} plates but only ${count('P')} blocks`);
      if (count('_') && !count('Q')) problems.push(`${room.loc}: hidden bridge but no crystal`);
      if (count('|') && !count('+') && !count('I') && !room.spawns.length) problems.push(`${room.loc}: bars that can never open`);
    }
    expect(problems).toEqual([]);
  });

  it('each castle has enough keys for its locked doors', () => {
    const areas = new Set([...ROOMS.values()].filter(r => r.kind === 'dungeon').map(r => r.area));
    for (const a of areas) {
      const rooms = [...ROOMS.values()].filter(r => r.area === a);
      const keys = rooms.reduce((n, r) => n + [...r.items, ...r.rewards].filter(i => i.ch === 'K').length, 0);
      // a locked door is one or two L tiles next to each other
      let locks = 0;
      for (const r of rooms) r.tiles.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === 'L' && row[x - 1] !== 'L' && r.tiles[y - 1]?.[x] !== 'L') locks++;
      }));
      expect(keys, a).toBeGreaterThanOrEqual(locks);
    }
  });

  it('each castle has a boss and a prize', () => {
    const areas = new Set([...ROOMS.values()].filter(r => r.kind === 'dungeon').map(r => r.area));
    for (const a of areas) {
      const rooms = [...ROOMS.values()].filter(r => r.area === a);
      expect(rooms.some(r => r.spawns.some(s => s.ch === 'X')), a).toBe(true);
      expect(rooms.some(r => r.rewards.some(x => x.ch === '*' || x.ch === '5')), a).toBe(true);
    }
  });

  it('people and signs have texts', () => {
    const missing: string[] = [];
    for (const room of ROOMS.values()) {
      for (const n of room.npcs) {
        for (const k of [n.text, n.after, n.alt?.text]) if (k && !(k in sv)) missing.push(`${room.loc}: ${k}`);
        const ch = room.tiles[n.ty]?.[n.tx];
        if (!ch || isSolid(ch) || DOOR_CHARS.includes(ch)) missing.push(`${room.loc}: ${n.kind} stands on '${ch}'`);
      }
    }
    expect(missing).toEqual([]);
  });
});
