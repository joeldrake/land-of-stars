/**
 * Tile legend (one ASCII char per 16x16 tile). See src/world/README.md.
 * Lowercase letters / digits / symbols for enemies and items are parsed out
 * by world.ts and replaced with the room's ground tile.
 */
const SOLID = new Set(['T', 'R', 'B', 'W', 'M', 'G', 'C', '#', 'S', 'L']);

export function isSolid(ch: string): boolean {
  return SOLID.has(ch);
}

/** Shots fly over water but stop at everything else that is solid. */
export function blocksShot(ch: string): boolean {
  return SOLID.has(ch) && ch !== 'W';
}

export const ENEMY_CHARS = 'sbgkX';
export const ITEM_CHARS = 'KH12*h$';
export const GROUND_CHARS = '.,';
