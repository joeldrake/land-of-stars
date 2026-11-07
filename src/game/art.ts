/**
 * All graphics are generated in code: sprites from tiny ASCII pixel maps,
 * tiles from a few drawing primitives. No image files needed.
 */
import { TILE } from '../config';
import { P_DOWN, PLAYER_PAL, STAR, STAR_PAL, sym, type Pal } from './sprites';
import type { Dir } from './types';
import type { AreaKind } from './world';

type Img = HTMLCanvasElement;

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


const CRAB_PAL: Pal = { o: '#3a0a0a', r: '#e0503a', R: '#ff9a7a', w: '#ffffff', e: '#000000' };
const CRAB_A = sym([
  '........', '........', '.oo.....', 'oRro....', 'orro....', '.oro..ow', '..oo..oe', '...ooooo',
  '..orRrrr', '.orrrrrr', 'oorrrrrr', '.orrrrrr', '..oooooo', '..o.o..o', '.o..o..o', '........',
]);
const CRAB_B = withRows(CRAB_A, { 2: '................', 3: '.oo..........oo.', 4: 'oRro........orRo', 13: '...o.o..o.o.o...', 14: '..o..o..o..o..o.' });

const GHOST_PAL: Pal = { o: '#3a3a5a', w: '#f0f4ff', W: '#b8c0e0', e: '#202040', m: '#6a4a8a' };
const GHOST_A = sym([
  '........', '.....ooo', '....owww', '...owwww', '..owwwww', '..owweew', '..owweew', '.owwwwww',
  '.owwwwmm', '.owwwwww', '.owwwwww', '.oWwwwww', '.oWWwwww', '.oWWWwWw', '.oo.oWoW', '.....o.o',
]);
const GHOST_B = withRows(GHOST_A, { 14: '.ooWo.oWWo.oWoo.', 15: '...o...oo...o...' });

const SPARK_PAL: Pal = { y: '#ffe14d', w: '#ffffff', o: '#c07a00' };
const SPARK_A = sym([
  '........', '........', '.......o', '.......y', '...o...y', '....o.yw', '.....yww', '..oyywww',
  '..oyywww', '.....yww', '....o.yw', '...o...y', '.......y', '.......o', '........', '........',
]);
const SPARK_B = sym([
  '........', '........', '........', '....o...', '.....o.y', '......yy', '......yw', '...yyyww',
  '...yyyww', '......yw', '......yy', '.....o.y', '....o...', '........', '........', '........',
]);

const EATER_PAL: Pal = { o: '#0a0420', p: '#4a2a8a', P: '#7a5ac8', y: '#ffe14d', e: '#ff3a5a', t: '#ffffff', m: '#1a0a30' };
const EATER_A = sym([
  '.......o', '......op', '......oP', 'o....opp', 'pooooppp', '.oPpppPp', '..oppeep', '..opppep',
  '..oppppp', '.oppmmmm', '.opmtmtm', 'oppmmmmm', 'oppppppp', 'opp.oppp', 'oo...opp', '......oo',
]);
const EATER_B = withRows(EATER_A, { 10: '.opmmmmmmmmmmpo.', 9: '.oppmtmtmtmtmpo.' });

/** People share one shape: hat, face, beard/hair, clothes. */
const MAN = sym([
  '........', '.....ooo', '....ohhh', '...ohhhh', '..oooooo', '...okkkk', '...okekk', '...okkkk',
  '....obbb', '...odddd', '..okdddd', '..okdddd', '...odddd', '...odddd', '...odddd', '....oooo',
]);
const WIZARD = sym([
  '.......o', '......oh', '.....ohh', '.....ohy', '....ohhh', '...ohhhh', '..oooooo', '...okkkk',
  '...okekk', '...obbbb', '..odbbbb', '.okddbbd', '.oddddd', '.odddddd', '.odddddd', '..oooooo',
]);
const SIGN = sym([
  '........', '........', '.ooooooo', '.owwwwww', '.owlllll', '.owwwwww', '.owllllw', '.owwwwww',
  '.ooooooo', '.......o', '.......o', '.......o', '.......o', '.......o', '......oo', '........',
]);
const STAR_CHILD = sym([
  '.......o', '......oy', '.....oyY', 'oooooyyY', 'oyYyyyyy', '.oyyyyyy', '..oyyeyy', '..oyyeyy',
  '..oryyyy', '..oyyymy', '..oyyyym', '.oyyyyyy', '.oyyyooy', 'oyyoo.oy', 'oyo....o', 'oo......',
]);
const FAIRY = sym([
  '........', '.....ooo', '....oyyy', 'w..oyyyy', 'ww.oyyyy', 'wwwoykkk', 'wwwwokek', '.wwwokkk',
  '..wwookr', '...odddd', '..oddddd', '.odddDdd', '.odddddd', '..oooooo', '....ok..', '....oo..',
]);
const CROWN = ['y..y..y', 'y.yyy.y', 'yyyyyyy', 'yryyyry', 'yyyyyyy'];
const SHOVEL = ['..o', '..o', '..o', '..o', '..o', '..o', '..o', '.ooo', 'oggg', 'oggg', '.gg.'];

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
const BOMB = [
  '......yy', '.....y..', '....o...', '..oooo..', '.oWoooo.', 'oWoooooo', 'oooooooo', 'oooooooo',
  '.oooooo.', '..oooo..',
];
const BOOMERANG = [
  'oooo....', 'oyyyo...', 'oyYyyo..', '.oyyyo..', '..oyyyo.', '...oyyo.', '..oyyo..', '.oyyo...',
  'oyyo....', 'ooo.....',
];
const MAP = [
  'ooooooooo', 'owwwwwwwo', 'owgwwbbwo', 'owggwbwwo', 'owwgwwwro', 'owwwgwwwo', 'owbwwggwo', 'owwwwwwwo',
  'ooooooooo',
];
const STAR_KEY = [
  '...y...', '..yYy..', 'yyyYyyy', '.yyYyy.', '.yy.yy.', '...y...', '...y...', '...yyy.',
  '...y...', '...yy..', '...y...',
];
const WINGS = [
  'w.............w', 'ww...........ww', 'wWw.........wWw', 'wWWw.......wWWw', '.wWWw.....wWWw.',
  '.wWWWw.y.wWWWw.', '..wwWWwywWWww..', '....wwwywww....', '.......y.......',
];
const SHIELD = [
  'ooooooooo', 'obbbybbbo', 'obbbybbbo', 'obyyyyybo', 'obbbybbbo', 'obbbybbbo', '.obbybbo.', '..obbbo..', '...ooo...',
];
const SHIELD_SMALL = ['ooooo', 'obybo', 'oyyyo', 'obybo', '.obo.', '..o..'];


const FLAG_A = ['oyrrrrr.', 'orrryrr.', 'orryyyr.', 'orrryrr.', 'orrrrr..', 'o.......', 'o.......', 'o.......', 'o.......', 'o.......'];
const FLAG_B = ['o.rrrrrr', 'orrrryrr', 'orrryyyr', 'orrrryrr', 'o.rrrrrr', 'o.......', 'o.......', 'o.......', 'o.......', 'o.......'];

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
      c: [sprite(CRAB_A, CRAB_PAL), sprite(CRAB_B, CRAB_PAL)],
      z: [sprite(GHOST_A, GHOST_PAL), sprite(GHOST_B, GHOST_PAL)],
      v: [sprite(SPARK_A, SPARK_PAL), sprite(SPARK_B, SPARK_PAL)],
      XC: [sprite(CRAB_A, { ...CRAB_PAL, r: '#c0302a', R: '#ff7050' }), sprite(CRAB_B, { ...CRAB_PAL, r: '#c0302a', R: '#ff7050' })],
      XG: [sprite(GHOST_A, { ...GHOST_PAL, w: '#d8e8ff', W: '#8090c0' }), sprite(GHOST_B, { ...GHOST_PAL, w: '#d8e8ff', W: '#8090c0' })],
      XS: [sprite(EATER_A, EATER_PAL), sprite(EATER_B, EATER_PAL)],
    } as Record<string, [Img, Img]>,
    npc: {
      granny: sprite(GRANNY, GRANNY_PAL),
      digger: (() => {
        const c = sprite(MAN, { o: '#1a1410', h: '#3a3a3a', k: '#f2c8a0', e: '#1a1410', b: '#b0b0b0', d: '#5a4a3a' });
        c.getContext('2d')!.drawImage(sprite(SHOVEL, { o: '#7a4a20', g: '#a0a0a8' }), 13, 5);
        return c;
      })(),
      fisher: sprite(MAN, { o: '#1a1410', h: '#ffd34d', k: '#f2c8a0', e: '#1a1410', b: '#f2c8a0', d: '#3a6ab0' }),
      stargazer: sprite(WIZARD, { o: '#1a1030', h: '#4a3aa0', y: '#ffe14d', k: '#f2c8a0', e: '#1a1030', b: '#f0f0f0', d: '#6a4ac0' }),
      sign: sprite(SIGN, { o: '#4a2a10', w: '#c8964a', l: '#6a4520' }),
      fairy: sprite(FAIRY, { o: '#4a2a5a', y: '#ffe680', k: '#f5d0b0', e: '#2a1a30', r: '#e0606e', d: '#ff9ad0', D: '#ffffff', w: '#c8f0ff' }),
      // friends who move in once a castle is won
      slimey: (() => {
        const c = sprite(SLIME_A, { o: '#2a7030', g: '#9df08a', G: '#e0ffd0', e: '#101010', w: '#ffffff' });
        const g = c.getContext('2d')!;
        g.fillStyle = '#ff5a9a';
        g.fillRect(9, 5, 2, 3); g.fillRect(13, 5, 2, 3); g.fillRect(11, 6, 2, 1);
        g.fillStyle = '#ff9ac0';
        g.fillRect(4, 11, 2, 1); g.fillRect(10, 11, 2, 1);
        return c;
      })(),
      crabby: (() => {
        const c = sprite(CRAB_A, { o: '#5a2a0a', r: '#ff9a3a', R: '#ffd0a0', w: '#ffffff', e: '#000000' });
        const g = c.getContext('2d')!;
        g.fillStyle = '#5a2a0a';
        g.fillRect(6, 10, 1, 1); g.fillRect(7, 11, 2, 1); g.fillRect(9, 10, 1, 1);
        return c;
      })(),
      ghosty: (() => {
        const c = sprite(GHOST_A, { o: '#6a6a9a', w: '#ffffff', W: '#d8e0ff', e: '#202040', m: '#ff7aa0' });
        const g = c.getContext('2d')!;
        g.fillStyle = '#ffb0c8';
        g.fillRect(3, 7, 2, 1); g.fillRect(11, 7, 2, 1);
        return c;
      })(),
      starry: sprite(STAR_CHILD, { o: '#a07000', y: '#ffd34d', Y: '#fffbe0', e: '#3a2a00', r: '#ff9ac0', m: '#c04060' }),
    } as Record<string, Img>,
    flag: [0, 1].map(f => sprite(f ? FLAG_B : FLAG_A, { o: '#3a2a1a', r: '#e8303a', y: '#ffe14d' })) as [Img, Img],
    shieldSmall: sprite(SHIELD_SMALL, { o: '#2a2a3a', b: '#3a6ae0', y: '#ffd34d' }),
    bomb: sprite(BOMB, { o: '#3a4a8a', W: '#c8d4ff', y: '#ffb030' }),
    heart: sprite(HEART, { r: '#e8303a', w: '#ffd0d0' }),
    heartEmpty: sprite(HEART, { r: '#4a2a2a', w: '#4a2a2a' }),
    item: {
      h: sprite(HEART, { r: '#e8303a', w: '#ffd0d0' }),
      H: sprite(HEART_BIG, { r: '#e8303a', w: '#ffd0d0' }),
      $: sprite(GEM, { o: '#0a3a4a', c: '#3fd8f0', C: '#e0ffff' }),
      K: sprite(KEY, { y: '#ffd34d' }),
      '1': sprite(SWORD, { w: '#e8f0ff', W: '#a0b0d0', y: '#ffd34d', b: '#7a4a20' }),
      '2': sprite(STAFF, { y: '#ffe066', p: '#ff7af0', b: '#8a5a2a' }),
      '*': sprite(STAR, STAR_PAL),
      '3': sprite(BOMB, { o: '#3a4a8a', W: '#c8d4ff', y: '#ffb030' }),
      '0': sprite(BOMB, { o: '#3a4a8a', W: '#c8d4ff', y: '#ffb030' }),
      '4': sprite(BOOMERANG, { o: '#5a2a00', y: '#ff9a2a', Y: '#ffe0a0' }),
      '5': sprite(WINGS, { w: '#ffffff', W: '#bfe4ff', y: '#ffe14d' }),
      '7': sprite(STAR_KEY, { y: '#ffd34d', Y: '#ffffff' }),
      '6': sprite(SHIELD, { o: '#2a2a3a', b: '#3a6ae0', y: '#ffd34d' }),
      '8': sprite(CROWN, { y: '#ffd34d', r: '#ff4a8a' }),
      '9': sprite(MAP, { o: '#6a4520', w: '#f4e4b8', g: '#4caf50', b: '#3d7fe0', r: '#e8303a' }),
    } as Record<string, Img>,
  };
}

export const art = buildArt();

// ---------------------------------------------------------------- tiles
/** Small colour per tile for the big world map. */
export const MAP_COLORS: Record<string, string> = {
  '.': '#74c44f', ',': '#e9d28e', F: '#74c44f', T: '#2f7d32', B: '#3f9f45', R: '#8d8d8d', M: '#a0703f',
  W: '#3d7fe0', _: '#3d7fe0', '=': '#a8743a', G: '#c4c4c4', Z: '#c4c4c4', P: '#c4c4c4', C: '#b0b0c0',
  '%': '#a0703f', D: '#000000', O: '#5a3418', A: '#b03a2a', V: '#ffd34d', Q: '#7ac0ff', U: '#ffe14d',
};

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
  wood: '#b07a44', woodD: '#7a4e26', woodL: '#d09a5c',
  iron: '#3a3a44', ironL: '#8a8a9a',
};

/** Castle colours. Each castle gets its own look; the key is the castle id (d1, d2, ...). */
interface Theme { floor: string; floorD: string; floorL: string; wall: string; wallL: string; wallD: string; block: string }
const THEMES: Record<string, Theme> = {
  d1: { floor: '#3c6e8c', floorD: '#2e5670', floorL: '#4e86a8', wall: '#22435e', wallL: '#3a6a90', wallD: '#152c3f', block: '#6a9ac0' },
  d2: { floor: '#2f8a86', floorD: '#22706c', floorL: '#5cc0b0', wall: '#145450', wallL: '#2a8a80', wallD: '#0a3432', block: '#7ad8c8' },
  d3: { floor: '#4a4058', floorD: '#3a3046', floorL: '#6a5a80', wall: '#2a2234', wallL: '#4a3e5c', wallD: '#16121e', block: '#8a7aa8' },
  d4: { floor: '#262a5c', floorD: '#1c1f48', floorL: '#ffe14d', wall: '#12143a', wallL: '#3a3e8a', wallD: '#08091e', block: '#c0b060' },
};
const theme = (id: string) => THEMES[id] ?? THEMES.d1;

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

function crack(g: G, c: string) {
  rect(g, 7, 2, 1, 3, c); rect(g, 6, 5, 1, 2, c); rect(g, 7, 7, 1, 2, c); rect(g, 8, 9, 1, 2, c);
  rect(g, 5, 7, 1, 1, c); rect(g, 9, 8, 1, 1, c); rect(g, 8, 11, 1, 1, c);
}

function paintTile(g: G, kind: AreaKind, ch: string, variant: number, th: string) {
  const T = theme(th);
  const house = kind === 'cave' && th === 'house';
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
      } else if (house) {
        rect(g, 0, 0, 16, 16, C.wood);
        for (let y = 3; y < 16; y += 4) rect(g, 0, y, 16, 1, C.woodD);
        rect(g, (variant * 5 + 3) % 14, 0, 1, 3, C.woodD); rect(g, (variant * 7 + 9) % 14, 8, 1, 3, C.woodD);
      } else if (kind === 'cave') {
        rect(g, 0, 0, 16, 16, C.caveFloor);
        speckle(g, 7 + variant, 6, C.caveFloorD);
      } else {
        rect(g, 0, 0, 16, 16, T.floor);
        rect(g, 0, 0, 16, 1, T.floorD); rect(g, 0, 0, 1, 16, T.floorD);
        rect(g, 3, 3, 1, 1, T.floorL); rect(g, 11, 11, 1, 1, T.floorL);
      }
      return;
    case ',':
      rect(g, 0, 0, 16, 16, C.sand);
      speckle(g, 3 + variant * 17, 5, C.sandD);
      return;
    case 'F': {
      paintTile(g, kind, '.', 0, th);
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
    case 'Z':
      paintTile(g, kind, 'G', 0, th);
      crack(g, '#2a2a2a');
      return;
    case 'P':
      if (kind === 'dungeon') {
        bevel(g, T.block, '#ffffff', T.wallD);
        rect(g, 5, 5, 6, 6, T.wallL);
        rect(g, 6, 6, 4, 4, T.block);
      } else {
        // a gravestone like the others, but with scrape marks: it has been moved before
        paintTile(g, kind, 'G', 0, th);
        rect(g, 0, 15, 3, 1, C.rockD); rect(g, 13, 15, 3, 1, C.rockD);
      }
      return;
    case '%':
      if (kind === 'ow') {
        cliff(g);
        crack(g, '#3a2210');
        rect(g, 6, 6, 3, 3, C.cliffD);
        return;
      }
      bricks(g, T.wall, T.wallD, T.wallL);
      crack(g, '#000000');
      rect(g, 6, 6, 3, 3, T.wallD);
      return;
    case '+':
      paintTile(g, kind, '.', variant, th);
      rect(g, 2, 2, 12, 12, T.wallD);
      rect(g, 3, 3, 10, 10, '#c0a040');
      rect(g, 3, 3, 10, 1, '#ffe080'); rect(g, 3, 3, 1, 10, '#ffe080');
      rect(g, 7, 5, 2, 6, '#806020'); rect(g, 5, 7, 6, 2, '#806020');
      return;
    case '|':
      paintTile(g, kind, '.', variant, th);
      rect(g, 0, 1, 16, 2, C.iron); rect(g, 0, 13, 16, 2, C.iron);
      for (let x = 1; x < 16; x += 4) { rect(g, x, 0, 2, 16, C.iron); rect(g, x, 0, 1, 16, C.ironL); }
      return;
    case 'Q':
    case 'U': {
      const [a, b, c] = ch === 'Q' ? ['#2a6ae0', '#7ac0ff', '#ffffff'] : ['#c08a00', '#ffe14d', '#ffffff'];
      rect(g, 4, 13, 8, 3, C.rockD); rect(g, 5, 12, 6, 1, C.rock);
      for (let y = 0; y < 11; y++) {
        const w = y < 5 ? y + 1 : 11 - y;
        rect(g, 8 - w, 1 + y, w * 2, 1, a);
        if (w > 1) rect(g, 9 - w, 1 + y, w - 1, 1, b);
      }
      rect(g, 6, 4, 1, 2, c); rect(g, 5, 5, 1, 1, c);
      return;
    }
    case '_':
      paintTile(g, kind, 'W', 0, th);
      return;
    case 'I':
    case 'J':
      rect(g, 6, 9, 4, 6, C.rockD); rect(g, 4, 14, 8, 2, C.rockD);
      rect(g, 3, 6, 10, 3, C.iron); rect(g, 4, 7, 8, 1, C.ironL);
      if (ch === 'J') {
        rect(g, 5, 2, 6, 4, '#ff6a20'); rect(g, 6, 0, 4, 3, '#ffb030'); rect(g, 7, 3, 2, 3, '#fff0a0');
      }
      return;
    case 'V':
      bricks(g, C.brick, C.brickD, C.brickL);
      rect(g, 2, 0, 12, 16, '#8a6a10');
      rect(g, 3, 0, 10, 16, '#ffd34d');
      for (let x = 4; x < 13; x += 3) rect(g, x, 0, 1, 16, '#c09a20');
      rect(g, 7, 4, 2, 7, '#ffffff'); rect(g, 5, 6, 6, 2, '#ffffff'); rect(g, 6, 9, 1, 2, '#ffffff'); rect(g, 9, 9, 1, 2, '#ffffff');
      return;
    case 'A':
      rect(g, 0, 0, 16, 16, C.wood);
      for (let y = 3; y < 16; y += 4) rect(g, 0, y, 16, 1, C.woodD);
      rect(g, 0, 0, 16, 2, '#b03a2a'); rect(g, 0, 2, 16, 1, '#7a2016');
      rect(g, 5, 6, 6, 5, '#7ac0ff'); rect(g, 7, 6, 1, 5, C.woodD); rect(g, 5, 8, 6, 1, C.woodD);
      return;
    case 'O':
      rect(g, 0, 0, 16, 16, C.wood);
      rect(g, 0, 0, 16, 2, '#b03a2a'); rect(g, 0, 2, 16, 1, '#7a2016');
      rect(g, 3, 4, 10, 12, C.woodD);
      rect(g, 4, 5, 8, 11, '#5a3418');
      rect(g, 10, 10, 1, 2, '#ffd34d');
      return;
    case 'M':
      cliff(g);
      return;
    case '#':
      if (kind === 'dungeon') bricks(g, T.wall, T.wallD, T.wallL);
      else if (house) {
        rect(g, 0, 0, 16, 16, '#4a2c14');
        for (let y = 0; y < 16; y += 4) rect(g, 0, y, 16, 1, '#2e1a0a');
        rect(g, (variant * 5) % 16, 0, 1, 16, '#2e1a0a');
      } else if (kind === 'cave') {
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
      paintTile(g, kind, 'W', 0, th);
      rect(g, 0, 2, 16, 12, C.plank);
      for (let y = 2; y < 14; y += 3) rect(g, 0, y, 16, 1, C.plankD);
      rect(g, 0, 1, 16, 1, C.plankD); rect(g, 0, 14, 16, 1, C.plankD);
      return;
    case 'C':
      bricks(g, C.brick, C.brickD, C.brickL);
      return;
    case 'S':
      if (kind === 'dungeon') bevel(g, T.wallL, T.block, T.wallD);
      else bevel(g, C.rock, C.rockL, C.rockD);
      return;
    case 'L':
      bricks(g, T.wall, T.wallD, T.wallL);
      rect(g, 2, 0, 12, 16, C.plankD);
      rect(g, 3, 0, 10, 16, C.plank);
      rect(g, 3, 5, 10, 1, C.plankD); rect(g, 3, 11, 10, 1, C.plankD);
      rect(g, 7, 6, 2, 2, '#ffd34d'); rect(g, 7, 8, 2, 3, '#111');
      return;
    case 'D':
      if (kind === 'dungeon') {
        rect(g, 0, 0, 16, 16, '#0b1620');
        for (let y = 2; y < 16; y += 4) rect(g, 1, y, 14, 2, T.wallL);
      } else if (kind === 'cave') {
        rect(g, 0, 0, 16, 16, '#000');
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
export function tileImage(kind: AreaKind, ch: string, variant = 0, th = ''): Img {
  const key = `${kind}:${th}:${ch}:${variant}`;
  let c = tileCache.get(key);
  if (!c) {
    c = canvas(TILE, TILE);
    paintTile(c.getContext('2d')!, kind, ch, variant, th);
    tileCache.set(key, c);
  }
  return c;
}

/** Paints a whole room (ground first, then the tile on top) into a 256x176 canvas. */
export function paintRoom(kind: AreaKind, ground: string, tiles: string[][], th: string, into?: Img): Img {
  const c = into ?? canvas(tiles[0].length * TILE, tiles.length * TILE);
  const g = c.getContext('2d')!;
  tiles.forEach((row, ty) => row.forEach((ch, tx) => {
    const v = (tx * 7 + ty * 13) % 3;
    g.drawImage(tileImage(kind, ground, v, th), tx * TILE, ty * TILE);
    if (ch !== ground) g.drawImage(tileImage(kind, ch, ch === '+' || ch === '|' ? v : 0, th), tx * TILE, ty * TILE);
  }));
  return c;
}
