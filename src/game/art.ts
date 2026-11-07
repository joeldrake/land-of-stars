/**
 * All graphics are generated in code: sprites from tiny ASCII pixel maps,
 * tiles from a few drawing primitives. No image files needed.
 */
import { TILE } from '../config';
import type { Dir } from './types';
import type { AreaKind } from './world';

type Img = HTMLCanvasElement;
type Pal = Record<string, string>;

function canvas(w: number, h: number): Img {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function sprite(rows: string[], pal: Pal): Img {
  const w = Math.max(...rows.map(r => r.length));
  const c = canvas(w, rows.length);
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = pal[ch];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }));
  return c;
}

/** Mirror 8-wide half rows into 16-wide symmetric rows. */
const sym = (half: string[]) => half.map(r => {
  const l = r.padEnd(8, '.').slice(0, 8);
  return l + [...l].reverse().join('');
});
const withRows = (rows: string[], over: Record<number, string>) => rows.map((r, i) => over[i] ?? r);

function flipH(src: Img): Img {
  const c = canvas(src.width, src.height);
  const g = c.getContext('2d')!;
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------- player
const PLAYER_PAL: Pal = {
  o: '#2b1810', h: '#a0522d', H: '#d08850', k: '#f5c9a0', e: '#2b1810', r: '#e0606e',
  d: '#e84a8a', D: '#b02e64', s: '#5a3418', y: '#ffd34d',
};
const P_DOWN = sym([
  '......oo', '....oohh', '...ohHhh', '..ohhhhh', 'oohhhhhh', 'ohhohkkk', 'ohhokekk', '.oookkkk',
  '....okkr', '...odddd', '..okdddd', '..okdDdd', '...odddd', '..oddddd', '....oko.', '....sss.',
]);
const P_UP = sym([
  '......oo', '....oohh', '...ohhhh', '..ohhHhh', 'oohhhhhh', 'ohhohhhh', 'ohhohhhh', '.ooohhhh',
  '....oohh', '...odddd', '..okdddd', '..okdDdd', '...odddd', '..oddddd', '....oko.', '....sss.',
]);
const LEGS_B = { 14: '....oko...ooo...', 15: '....sss.........' };
const P_RIGHT = [
  '......oooo......',
  '....oohhhhoo....',
  '...ohhhhhhhho...',
  '..ohhHhhhhhhho..',
  '..ohhhhhhkkkko..',
  'oohhhhhhkkkkko..',
  'ohhohhhhkkekko..',
  'ohho.ohhkkkkko..',
  '.oo...ookkkro...',
  '.....oddddddo...',
  '....odddddkko...',
  '....oddDdddo....',
  '....odddddddo...',
  '...oddddddddo...',
  '.....oko.oko....',
  '.....sss.sss....',
];
const P_RIGHT_B = withRows(P_RIGHT, { 14: '....oko...oko...', 15: '....sss...sss...' });

// ---------------------------------------------------------------- enemies
const SLIME_PAL: Pal = { o: '#14501e', g: '#3ec04a', G: '#9df08a', e: '#101010', w: '#ffffff' };
const SLIME_A = sym([
  '........', '........', '........', '........', '........', '......oo', '....oogg', '...ogGgg',
  '..ogGggg', '..oggweg', '.ogggweg', '.ogggggg', 'oggggggg', 'oggggggg', '.ooooooo', '........',
]);
const SLIME_B = ['................', ...SLIME_A.slice(0, 13), 'oooooooooooooooo', '................'];

const BAT_PAL: Pal = { o: '#1a0f2a', p: '#7a4fc0', P: '#b48cf0', r: '#ff4040' };
const BAT_A = sym([
  '........', '........', '........', '........', 'o.......', 'oo....oo', 'opo..opp', 'oppoopPp',
  '.opppprp', '..oppppp', '...ooopp', '......oo', '........', '........', '........', '........',
]);
const BAT_B = sym([
  '........', '........', '........', '........', '........', '........', '......oo', '......op',
  '..oooopp', '.opppprp', 'opppoppp', 'opo..opp', 'oo....oo', '........', '........', '........',
]);

const GOBLIN_PAL: Pal = { o: '#2a1408', g: '#d98a3a', G: '#a85f20', w: '#ffffff', e: '#000000', a: '#6b4a2a', A: '#8c6a44' };
const GOBLIN_HALF = [
  '........', '....oooo', '...ogggg', 'oo.ogggg', 'ogoggggg', '.oogweGg', '...ogggg', '...ogwGG',
  '....oggg', '..oaaaaa', '.ogaAaaa', '.ogaaaaa', '..oaaaaa', '...oaaoo', '...ogo..', '...ooo..',
];
const GOBLIN_A = sym(GOBLIN_HALF);
const GOBLIN_B = withRows(GOBLIN_A, { 14: '...ogo....ogo...', 15: '...ooo....ooo...' });

const SKEL_PAL: Pal = { o: '#202020', w: '#f0f0e8', g: '#a0a0a0', e: '#000000' };
const SKEL_A = sym([
  '........', '.....ooo', '....owww', '...owwww', '...oweew', '...oweew', '...owwww', '....owgw',
  '.....ooo', '...oowww', '..owogwg', '..o.owgw', '....ogww', '.....oww', '....owo.', '....oo..',
]);
const SKEL_B = withRows(SKEL_A, { 14: '...owo....owo...', 15: '...oo......oo...' });

const GRANNY_PAL: Pal = { o: '#2a1a20', h: '#d8d8e0', k: '#f2c8a0', e: '#2a1a20', r: '#d0707a', d: '#7a4fb0', w: '#f4f4f4' };
const GRANNY = sym([
  '........', '......oo', '....oohh', '...ohhhh', '...ohhhh', '..ohhkkk', '..ohkekk', '...okkkk',
  '....okkr', '...odddd', '..oddddd', '.okdwwww', '.oddwwww', '.odddddd', '.odddddd', '..oooooo',
]);

// ---------------------------------------------------------------- items
const HEART = ['.rr.rr.', 'rwrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
const HEART_BIG = ['.rrr.rrr.', 'rwwrrrrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'];
const GEM = ['..ooo..', '.oCcco.', 'oCcccco', 'occccco', '.occco.', '..oco..', '...o...'];
const KEY = ['.yyy.', 'y...y', 'y...y', '.yyy.', '..y..', '..y..', '..yyy', '..y..', '..yy.', '..y..'];
const SWORD = [
  '...w...', '..wWw..', '..wWw..', '..wWw..', '..wWw..', '..wWw..', '..wWw..', '..wWw..',
  '..wWw..', 'yyyyyyy', '.yyyyy.', '...b...', '...b...', '...b...', '..yyy..',
];
const STAFF = [
  '...y...', '..yyy..', 'yyypyyy', '.yyyyy.', '.yy.yy.', '...b...', '...b...', '...b...',
  '...b...', '...b...', '...b...', '...b...', '...b...', '...b...', '..bbb..',
];
const STAR = [
  '.....y.....', '....yyy....', '....yYy....', 'yyyyyYyyyyy', '.yyyYYYyyy.', '..yyyYyyy..',
  '...yyyyy...', '...yy.yy...', '..yy...yy..', '..y.....y..', '.y.......y.',
];

function buildArt() {
  const pl = (rows: string[]) => sprite(rows, PLAYER_PAL);
  const right: [Img, Img] = [pl(P_RIGHT), pl(P_RIGHT_B)];
  const player: Record<Dir, [Img, Img]> = {
    down: [pl(P_DOWN), pl(withRows(P_DOWN, LEGS_B))],
    up: [pl(P_UP), pl(withRows(P_UP, LEGS_B))],
    right,
    left: [flipH(right[0]), flipH(right[1])],
  };
  return {
    player,
    enemy: {
      s: [sprite(SLIME_A, SLIME_PAL), sprite(SLIME_B, SLIME_PAL)],
      b: [sprite(BAT_A, BAT_PAL), sprite(BAT_B, BAT_PAL)],
      g: [sprite(GOBLIN_A, GOBLIN_PAL), sprite(GOBLIN_B, GOBLIN_PAL)],
      k: [sprite(SKEL_A, SKEL_PAL), sprite(SKEL_B, SKEL_PAL)],
      X: [sprite(SLIME_A, { ...SLIME_PAL, g: '#4cc0a0', G: '#b0ffe8', o: '#0c4038' }),
        sprite(SLIME_B, { ...SLIME_PAL, g: '#4cc0a0', G: '#b0ffe8', o: '#0c4038' })],
    } as Record<string, [Img, Img]>,
    npc: { granny: sprite(GRANNY, GRANNY_PAL) } as Record<string, Img>,
    heart: sprite(HEART, { r: '#e8303a', w: '#ffd0d0' }),
    heartEmpty: sprite(HEART, { r: '#4a2a2a', w: '#4a2a2a' }),
    item: {
      h: sprite(HEART, { r: '#e8303a', w: '#ffd0d0' }),
      H: sprite(HEART_BIG, { r: '#e8303a', w: '#ffd0d0' }),
      $: sprite(GEM, { o: '#0a3a4a', c: '#3fd8f0', C: '#e0ffff' }),
      K: sprite(KEY, { y: '#ffd34d' }),
      '1': sprite(SWORD, { w: '#e8f0ff', W: '#a0b0d0', y: '#ffd34d', b: '#7a4a20' }),
      '2': sprite(STAFF, { y: '#ffe066', p: '#ff7af0', b: '#8a5a2a' }),
      '*': sprite(STAR, { y: '#ffe14d', Y: '#fffbe0' }),
    } as Record<string, Img>,
  };
}

export const art = buildArt();

// ---------------------------------------------------------------- tiles
const C = {
  grass: '#74c44f', grassD: '#5aa83c', grassL: '#93d96a',
  sand: '#e9d28e', sandD: '#cdb26a',
  tree: '#2f7d32', treeL: '#4caf50', treeD: '#1b4d1e', trunk: '#6b4423',
  bush: '#3f9f45', bushL: '#6cc96a', bushD: '#22602a',
  rock: '#8d8d8d', rockL: '#c4c4c4', rockD: '#555555',
  cliff: '#a0703f', cliffL: '#c7935a', cliffD: '#6b4523',
  water: '#3d7fe0', waterL: '#8fc0ff',
  brick: '#8a8a9a', brickD: '#5a5a6a', brickL: '#b0b0c0',
  plank: '#a8743a', plankD: '#6e4a22',
  caveFloor: '#2a1d14', caveFloorD: '#1c130d', caveWall: '#6b4a2e', caveWallD: '#3e2a19', caveWallL: '#8a6440',
  dFloor: '#3c6e8c', dFloorD: '#2e5670', dFloorL: '#4e86a8', dWall: '#22435e', dWallL: '#3a6a90', dWallD: '#152c3f',
};

type G = CanvasRenderingContext2D;
const rect = (g: G, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function disc(g: G, cx: number, cy: number, r: number, c: string) {
  g.fillStyle = c;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) g.fillRect(x, y, 1, 1);
  }
}
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function speckle(g: G, seed: number, n: number, color: string, w = 1, h = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) rect(g, Math.floor(r() * (TILE - w + 1)), Math.floor(r() * (TILE - h + 1)), w, h, color);
}
function bricks(g: G, base: string, dark: string, light: string) {
  rect(g, 0, 0, 16, 16, base);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    rect(g, 0, y + 3, 16, 1, dark);
    rect(g, 0, y, 16, 1, light);
    const off = row % 2 ? 4 : 0;
    for (let x = off; x < 16; x += 8) rect(g, x, y, 1, 3, dark);
  }
}
function bevel(g: G, base: string, light: string, dark: string) {
  rect(g, 1, 1, 14, 14, base);
  rect(g, 1, 1, 14, 2, light);
  rect(g, 1, 1, 2, 14, light);
  rect(g, 1, 13, 14, 2, dark);
  rect(g, 13, 1, 2, 14, dark);
}
function cliff(g: G) {
  rect(g, 0, 0, 16, 16, C.cliff);
  rect(g, 0, 0, 16, 1, C.cliffL);
  for (const [y, x0] of [[4, 0], [9, 5], [14, 2]]) rect(g, x0, y, 10, 1, C.cliffD);
  rect(g, 3, 5, 1, 4, C.cliffD);
  rect(g, 11, 10, 1, 4, C.cliffD);
  rect(g, 8, 1, 4, 1, C.cliffL);
}

function paintTile(g: G, kind: AreaKind, ch: string, variant: number) {
  switch (ch) {
    case '.':
      if (kind === 'ow') {
        rect(g, 0, 0, 16, 16, C.grass);
        const r = rng(11 + variant * 31);
        for (let i = 0; i < 3; i++) {
          const x = Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
          rect(g, x, y, 1, 1, C.grassD); rect(g, x + 2, y, 1, 1, C.grassD); rect(g, x + 1, y + 1, 1, 1, C.grassD);
        }
        speckle(g, 5 + variant, 2, C.grassL);
      } else if (kind === 'cave') {
        rect(g, 0, 0, 16, 16, C.caveFloor);
        speckle(g, 7 + variant, 6, C.caveFloorD);
      } else {
        rect(g, 0, 0, 16, 16, C.dFloor);
        rect(g, 0, 0, 16, 1, C.dFloorD); rect(g, 0, 0, 1, 16, C.dFloorD);
        rect(g, 3, 3, 1, 1, C.dFloorL); rect(g, 11, 11, 1, 1, C.dFloorL);
      }
      return;
    case ',':
      rect(g, 0, 0, 16, 16, C.sand);
      speckle(g, 3 + variant * 17, 5, C.sandD);
      return;
    case 'F': {
      paintTile(g, kind, '.', 0);
      const flowers: [number, number, string][] = [[3, 3, '#ffffff'], [10, 5, '#ffe14d'], [5, 10, '#ff7a9a'], [12, 12, '#ffffff']];
      for (const [x, y, c] of flowers) {
        rect(g, x, y - 1, 1, 1, c); rect(g, x - 1, y, 3, 1, c); rect(g, x, y + 1, 1, 1, c); rect(g, x, y, 1, 1, '#ffcc00');
      }
      return;
    }
    case 'T':
      rect(g, 6, 12, 4, 4, C.trunk);
      disc(g, 8, 7, 7.6, C.treeD);
      disc(g, 8, 7, 6.6, C.tree);
      disc(g, 6, 5, 3, C.treeL);
      rect(g, 9, 9, 2, 1, C.treeD); rect(g, 4, 9, 1, 1, C.treeD);
      return;
    case 'B':
      disc(g, 8, 9, 7, C.bushD);
      disc(g, 8, 9, 6, C.bush);
      disc(g, 6, 7, 2.5, C.bushL);
      rect(g, 10, 11, 1, 1, C.bushD);
      return;
    case 'R':
      disc(g, 8, 9, 7, C.rockD);
      disc(g, 8, 8.5, 6, C.rock);
      disc(g, 6, 6, 2.4, C.rockL);
      return;
    case 'G':
      disc(g, 8, 6, 4.5, C.rockD);
      rect(g, 3, 6, 10, 9, C.rockD);
      disc(g, 8, 6, 3.6, C.rock);
      rect(g, 4, 6, 8, 8, C.rock);
      rect(g, 7, 5, 2, 7, C.rockD); rect(g, 5, 7, 6, 2, C.rockD);
      rect(g, 2, 14, 12, 2, C.rockD);
      return;
    case 'M':
      cliff(g);
      return;
    case '#':
      if (kind === 'dungeon') bricks(g, C.dWall, C.dWallD, C.dWallL);
      else if (kind === 'cave') {
        rect(g, 0, 0, 16, 16, C.caveWall);
        speckle(g, 21, 8, C.caveWallD, 2, 1);
        speckle(g, 22, 5, C.caveWallL);
      } else cliff(g);
      return;
    case 'W': {
      rect(g, 0, 0, 16, 16, C.water);
      for (const [x, y] of [[2, 4], [9, 10], [11, 3]]) {
        rect(g, x, y, 2, 1, C.waterL); rect(g, x + 2, y - 1, 2, 1, C.waterL);
      }
      return;
    }
    case '=':
      paintTile(g, kind, 'W', 0);
      rect(g, 0, 2, 16, 12, C.plank);
      for (let y = 2; y < 14; y += 3) rect(g, 0, y, 16, 1, C.plankD);
      rect(g, 0, 1, 16, 1, C.plankD); rect(g, 0, 14, 16, 1, C.plankD);
      return;
    case 'C':
      bricks(g, C.brick, C.brickD, C.brickL);
      return;
    case 'S':
      if (kind === 'dungeon') bevel(g, C.dWallL, '#6a9ac0', C.dWallD);
      else bevel(g, C.rock, C.rockL, C.rockD);
      return;
    case 'L':
      bricks(g, C.dWall, C.dWallD, C.dWallL);
      rect(g, 2, 0, 12, 16, C.plankD);
      rect(g, 3, 0, 10, 16, C.plank);
      rect(g, 3, 5, 10, 1, C.plankD); rect(g, 3, 11, 10, 1, C.plankD);
      rect(g, 7, 6, 2, 2, '#ffd34d'); rect(g, 7, 8, 2, 3, '#111');
      return;
    case 'D':
      if (kind === 'dungeon') {
        rect(g, 0, 0, 16, 16, '#0b1620');
        for (let y = 2; y < 16; y += 4) rect(g, 1, y, 14, 2, C.dWallL);
      } else {
        cliff(g);
        disc(g, 8, 7, 5, '#000');
        rect(g, 3, 7, 10, 9, '#000');
      }
      return;
    default:
      rect(g, 0, 0, 16, 16, '#ff00ff');
  }
}

const tileCache = new Map<string, Img>();
export function tileImage(kind: AreaKind, ch: string, variant = 0): Img {
  const key = `${kind}:${ch}:${variant}`;
  let c = tileCache.get(key);
  if (!c) {
    c = canvas(TILE, TILE);
    paintTile(c.getContext('2d')!, kind, ch, variant);
    tileCache.set(key, c);
  }
  return c;
}

/** Paints a whole room (ground first, then the tile on top) into a 256x176 canvas. */
export function paintRoom(kind: AreaKind, ground: string, tiles: string[][], into?: Img): Img {
  const c = into ?? canvas(tiles[0].length * TILE, tiles.length * TILE);
  const g = c.getContext('2d')!;
  tiles.forEach((row, ty) => row.forEach((ch, tx) => {
    const v = (tx * 7 + ty * 13) % 3;
    g.drawImage(tileImage(kind, ground, v), tx * TILE, ty * TILE);
    if (ch !== ground) g.drawImage(tileImage(kind, ch, 0), tx * TILE, ty * TILE);
  }));
  return c;
}
