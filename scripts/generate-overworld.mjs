#!/usr/bin/env node
/**
 * One-shot scaffolding: generates src/world/overworld/<x>_<y>.txt (16x8 screens).
 * After generation the .txt files are the source of truth — edit them by hand.
 * Re-running requires --force and overwrites hand edits.
 *
 * Guarantees: the open tiles on a shared edge match on both sides, every
 * opening and door is reachable from the middle of its screen, and the whole
 * world is connected (spanning tree from the start screen).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'src', 'world', 'overworld');
const force = process.argv.includes('--force');
if (existsSync(OUT) && readdirSync(OUT).some(f => f.endsWith('.txt')) && !force) {
  console.error('Overworld files already exist. Use --force to overwrite (hand edits will be lost).');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const W = 16, H = 8, C = 16, R = 11;
const START = [7, 7];

// Biome per screen. M=mountains S=sand F=forest G=meadow P=plains C=graveyard L=lake
const BIOMES = [
  'MMMMMMMMMMMMMMMM',
  'MMMMSSSMMMMMLLLM',
  'FFFMSSSMMGGLLLLL',
  'FFFGGGGGGGGGLLLL',
  'FFCGGGGGGGGGGLLL',
  'FCCGGPPPPGGGGGLL',
  'FFFGPPPPPPGGGGGL',
  'FFFFPPPPPPPGGGLL',
];

const SPEC = {
  P: { name: 'plains', ground: '.', walls: ['T'], obst: ['B', 'T', 'F', 'F'], density: 0.06, enemies: ['s', 'g'] },
  G: { name: 'meadow', ground: '.', walls: ['B', 'T'], obst: ['B', 'F', 'F', 'T'], density: 0.08, enemies: ['s', 'g', 'b'] },
  F: { name: 'forest', ground: '.', walls: ['T'], obst: ['T', 'T', 'B'], density: 0.13, enemies: ['s', 'b', 'g'] },
  M: { name: 'mountains', ground: ',', walls: ['M'], obst: ['R', 'R', 'M'], density: 0.1, enemies: ['g', 'b'] },
  S: { name: 'sand', ground: ',', walls: ['R', 'M'], obst: ['R'], density: 0.05, enemies: ['g', 's'] },
  C: { name: 'graveyard', ground: '.', walls: ['T'], obst: [], density: 0, graves: true, enemies: ['k', 'b'] },
  L: { name: 'lake', ground: '.', walls: ['W'], obst: ['F'], density: 0.04, lake: true, enemies: ['s'] },
};

const FEATURES = {
  '7,7': { kind: 'cave', tx: 11, ty: 2, to: 'cave:sword 7,9' },
  '5,6': { kind: 'cave', tx: 4, ty: 2, to: 'cave:hint 7,9' },
  '2,6': { kind: 'cave', tx: 7, ty: 2, to: 'cave:heart 7,9' },
  '13,4': { kind: 'castle', tx: 7, ty: 3, to: 'd1:2:3 7,9' },
};

const SOLID = new Set(['T', 'R', 'B', 'W', 'M', 'G', 'C', '#', 'S', 'L', 'D']);

function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = s => mulberry(hash('stjarnorna:' + s));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const key = (x, y) => `${x},${y}`;

// ---------- edges between screens ----------
const vEdges = new Map(); // between (x,y) and (x+1,y): rows open
const hEdges = new Map(); // between (x,y) and (x,y+1): cols open

function gapFor(kind, k) {
  const r = rngFor(kind + k);
  if (kind === 'h') {
    const len = 2 + Math.floor(r() * 3);
    return { start: 2 + Math.floor(r() * (C - 3 - len)), len };
  }
  const len = 2 + Math.floor(r() * 2);
  return { start: 2 + Math.floor(r() * (R - 3 - len)), len };
}
function openEdge(x, y, dx, dy) {
  if (dx === 1) vEdges.set(key(x, y), gapFor('v', key(x, y)));
  else if (dx === -1) vEdges.set(key(x - 1, y), gapFor('v', key(x - 1, y)));
  else if (dy === 1) hEdges.set(key(x, y), gapFor('h', key(x, y)));
  else hEdges.set(key(x, y - 1), gapFor('h', key(x, y - 1)));
}

{
  const r = rngFor('tree');
  const visited = new Set([key(...START)]);
  const stack = [START];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && !visited.has(key(nx, ny)));
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = pick(r, opts);
    openEdge(x, y, dx, dy);
    visited.add(key(nx, ny));
    stack.push([nx, ny]);
  }
  const r2 = rngFor('extra');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= W || ny >= H) continue;
      const mountain = BIOMES[y][x] === 'M' || BIOMES[ny][nx] === 'M';
      if (r2() < (mountain ? 0.25 : 0.55)) openEdge(x, y, dx, dy);
    }
  }
  // the start screen is open in every direction (except off the bottom of the map)
  openEdge(START[0], START[1], 1, 0);
  openEdge(START[0], START[1], -1, 0);
  openEdge(START[0], START[1], 0, -1);
}

function sides(x, y) {
  return {
    top: y > 0 ? hEdges.get(key(x, y - 1)) : undefined,
    bottom: hEdges.get(key(x, y)),
    left: x > 0 ? vEdges.get(key(x - 1, y)) : undefined,
    right: vEdges.get(key(x, y)),
  };
}

// ---------- path helpers ----------
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const onEdge = (tx, ty) => tx === 0 || ty === 0 || tx === C - 1 || ty === R - 1;

function reachable(g, sx, sy) {
  const seen = new Set();
  if (SOLID.has(g[sy][sx])) return seen;
  const q = [[sx, sy]];
  seen.add(key(sx, sy));
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      if (seen.has(key(nx, ny)) || SOLID.has(g[ny][nx])) continue;
      seen.add(key(nx, ny));
      q.push([nx, ny]);
    }
  }
  return seen;
}

/** Cheapest path from (sx,sy) to the centre; never crosses locked tiles or other edge tiles. */
function carve(g, sx, sy, locked, ground) {
  const cost = new Map([[key(sx, sy), 0]]);
  const prev = new Map();
  const open = [[0, sx, sy]];
  let end = null;
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [c, x, y] = open.shift();
    if ((x === 7 || x === 8) && y === 5) { end = [x, y]; break; }
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
      if (onEdge(nx, ny) || locked.has(key(nx, ny))) continue;
      const nc = c + (SOLID.has(g[ny][nx]) ? 5 : 1);
      if (nc < (cost.get(key(nx, ny)) ?? Infinity)) {
        cost.set(key(nx, ny), nc);
        prev.set(key(nx, ny), [x, y]);
        open.push([nc, nx, ny]);
      }
    }
  }
  let cur = end;
  while (cur) {
    const [x, y] = cur;
    if (SOLID.has(g[y][x])) g[y][x] = g[y][x] === 'W' ? '=' : ground;
    cur = prev.get(key(x, y));
  }
}

// ---------- screen builder ----------
function build(x, y) {
  const b = BIOMES[y][x];
  const sp = SPEC[b];
  const r = rngFor(`screen${x},${y}`);
  const ground = sp.ground;
  const g = Array.from({ length: R }, () => Array(C).fill(ground));
  const s = sides(x, y);
  const th = {
    top: 1 + (r() < 0.5 ? 1 : 0), bottom: 1 + (r() < 0.5 ? 1 : 0),
    left: 1 + (r() < 0.4 ? 1 : 0), right: 1 + (r() < 0.4 ? 1 : 0),
  };
  const wall = () => pick(r, sp.walls);

  for (let ty = 0; ty < R; ty++) for (let tx = 0; tx < C; tx++) {
    if (ty < th.top || ty >= R - th.bottom || tx < th.left || tx >= C - th.right) g[ty][tx] = wall();
  }

  const gapTiles = [];
  const cols = gap => Array.from({ length: gap.len }, (_, i) => gap.start + i);
  if (s.top) for (const c of cols(s.top)) { for (let ty = 0; ty <= th.top; ty++) g[ty][c] = ground; gapTiles.push([c, 0]); }
  if (s.bottom) for (const c of cols(s.bottom)) { for (let ty = R - 1 - th.bottom; ty < R; ty++) g[ty][c] = ground; gapTiles.push([c, R - 1]); }
  if (s.left) for (const rr of cols(s.left)) { for (let tx = 0; tx <= th.left; tx++) g[rr][tx] = ground; gapTiles.push([0, rr]); }
  if (s.right) for (const rr of cols(s.right)) { for (let tx = C - 1 - th.right; tx < C; tx++) g[rr][tx] = ground; gapTiles.push([C - 1, rr]); }

  // interior decoration
  for (let ty = 2; ty <= R - 3; ty++) for (let tx = 2; tx <= C - 3; tx++) {
    if (r() < sp.density) {
      const o = pick(r, sp.obst);
      g[ty][tx] = o;
      if (r() < 0.35 && tx + 1 <= C - 3) g[ty][tx + 1] = o;
    }
  }
  if (sp.graves) {
    for (const ty of [3, 5, 7]) for (const tx of [3, 5, 7, 9, 11, 12]) if (r() < 0.7) g[ty][tx] = 'G';
  }
  if (sp.lake) {
    const blobs = 1 + Math.floor(r() * 2);
    for (let i = 0; i < blobs; i++) {
      const cx = 3 + Math.floor(r() * 10), cy = 3 + Math.floor(r() * 5), rad = 1.2 + r() * 1.6;
      for (let ty = 2; ty <= R - 3; ty++) for (let tx = 2; tx <= C - 3; tx++) {
        if ((tx - cx) ** 2 + ((ty - cy) * 1.3) ** 2 <= rad * rad) g[ty][tx] = 'W';
      }
    }
  }

  // features (caves / castles)
  const locked = new Set();
  const targets = gapTiles.slice();
  const f = FEATURES[key(x, y)];
  if (f) {
    const lock = (tx, ty, ch) => { g[ty][tx] = ch; locked.add(key(tx, ty)); };
    if (f.kind === 'cave') {
      for (let ty = f.ty - 1; ty <= f.ty; ty++) for (let tx = f.tx - 1; tx <= f.tx + 1; tx++) lock(tx, ty, 'M');
    } else {
      for (let ty = f.ty - 2; ty <= f.ty; ty++) for (let tx = f.tx - 3; tx <= f.tx + 3; tx++) lock(tx, ty, 'C');
    }
    lock(f.tx, f.ty, 'D');
    for (let tx = f.tx - 1; tx <= f.tx + 1; tx++) lock(tx, f.ty + 1, ground);
    targets.push([f.tx, f.ty + 1]);
  }

  g[5][7] = ground; g[5][8] = ground;
  for (const [tx, ty] of targets) {
    if (!reachable(g, 7, 5).has(key(tx, ty))) carve(g, tx, ty, locked, ground);
  }

  // enemies
  const isStart = x === START[0] && y === START[1];
  const nearStart = Math.abs(x - START[0]) + Math.abs(y - START[1]) <= 1;
  if (!isStart && !f) {
    const reach = reachable(g, 7, 5);
    const n = nearStart ? 1 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3) + (b === 'M' ? 1 : 0);
    const kinds = nearStart ? ['s'] : sp.enemies;
    const cands = [];
    for (let ty = 2; ty <= R - 3; ty++) for (let tx = 3; tx <= C - 4; tx++) {
      if (!reach.has(key(tx, ty)) || g[ty][tx] !== ground) continue;
      if (gapTiles.some(([gx, gy]) => Math.abs(gx - tx) + Math.abs(gy - ty) < 4)) continue;
      cands.push([tx, ty]);
    }
    for (let i = 0; i < n && cands.length; i++) {
      const [tx, ty] = cands.splice(Math.floor(r() * cands.length), 1)[0];
      g[ty][tx] = pick(r, kinds);
    }
  }

  const lines = [`// Overworld ${x},${y} - ${sp.name}`];
  if (f) lines.push(`@door ${f.tx},${f.ty} -> ${f.to}`);
  lines.push(...g.map(row => row.join('')));
  writeFileSync(join(OUT, `${x}_${y}.txt`), lines.join('\n') + '\n');
}

for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) build(x, y);
console.log(`Wrote ${W * H} screens to ${OUT}`);
