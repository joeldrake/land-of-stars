/**
 * Pixel data shared by the game (art.ts) and the icon generator (scripts/generate-icons.mjs).
 * Plain data and tiny helpers only, no DOM, so Node can import it too.
 */
export type Pal = Record<string, string>;

/** Mirror 8-wide half rows into 16-wide symmetric rows. */
export const sym = (half: string[]) => half.map(r => {
  const l = r.padEnd(8, '.').slice(0, 8);
  return l + [...l].reverse().join('');
});

export const PLAYER_PAL: Pal = {
  o: '#2b1810', h: '#a0522d', H: '#d08850', k: '#f5c9a0', e: '#2b1810', r: '#e0606e',
  d: '#e84a8a', D: '#b02e64', s: '#5a3418', y: '#ffd34d',
};

/** The heroine facing the player. */
export const P_DOWN = sym([
  '......oo', '....oohh', '...ohHhh', '..ohhhhh', 'oohhhhhh', 'ohhohkkk', 'ohhokekk', '.oookkkk',
  '....okkr', '...odddd', '..okdddd', '..okdDdd', '...odddd', '..oddddd', '....oko.', '....sss.',
]);

export const STAR = [
  '.....y.....', '....yyy....', '....yYy....', 'yyyyyYyyyyy', '.yyyYYYyyy.', '..yyyYyyy..',
  '...yyyyy...', '...yy.yy...', '..yy...yy..', '..y.....y..', '.y.......y.',
];
export const STAR_PAL: Pal = { y: '#ffe14d', Y: '#fffbe0' };

/** Night sky used behind the icons and the splash screen. */
export const SKY = '#0d0d14';
