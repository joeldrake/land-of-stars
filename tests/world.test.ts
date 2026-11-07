import { describe, expect, it } from 'vitest';
import { COLS, OW_COLS, OW_ROWS, ROWS, START } from '../src/config';
import { isSolid } from '../src/game/tiles';
import { entranceOf, neighborLoc, ROOMS } from '../src/game/world';
import type { Dir } from '../src/game/types';

// Locked doors count as open for edge-matching: they open once a key is used.
const open = (ch: string) => ch === 'L' || !isSolid(ch);

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
        if (room.tiles[d.ty]?.[d.tx] !== 'D') problems.push(`${room.loc}: door at ${d.tx},${d.ty} is not a D tile`);
      }
      for (const t of [...room.doors, ...room.exits]) {
        const target = ROOMS.get(t.to);
        if (!target) { problems.push(`${room.loc}: target ${t.to} missing`); continue; }
        const ch = target.tiles[t.ay]?.[t.ax];
        if (!ch || isSolid(ch) || ch === 'D') problems.push(`${room.loc}: lands on '${ch}' at ${t.to} ${t.ax},${t.ay}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every dungeon has an entrance', () => {
    const areas = new Set([...ROOMS.values()].filter(r => r.kind === 'dungeon').map(r => r.area));
    for (const a of areas) expect(entranceOf(a), a).not.toBeNull();
  });
});
