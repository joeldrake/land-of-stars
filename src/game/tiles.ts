/**
 * Tile legend (one ASCII char per 16x16 tile). See src/world/README.md.
 * Lowercase letters / digits / symbols for enemies and items are parsed out
 * by world.ts and replaced with the room's ground tile.
 *
 * A few tiles only exist at runtime (never in the .txt files):
 *   J lit torch, U crystal that has been hit.
 */
const SOLID = new Set([
  'T', 'R', 'B', 'W', 'M', 'G', 'C', '#', 'S', 'L',
  'Z', // cracked gravestone (bomb it)
  '%', // cracked wall (bomb it); in the hills it hides a cave if there is a @door on it
  'P', // block / gravestone you can push
  '|', // bars that open when the room is solved
  'Q', 'U', // crystal switch (hit / already hit)
  '_', // hidden bridge: looks like water until a crystal is hit
  'I', 'J', // torch (unlit / lit)
  'V', // star gate (needs the star key)
  'A', // house wall
]);

/** Shots fly over these even though you can't walk there. */
const SHOT_PASSES = new Set(['W', '_']);

export function isSolid(ch: string): boolean {
  return SOLID.has(ch);
}

/** Water and hidden bridges can be crossed with wings. */
export function isWater(ch: string): boolean {
  return ch === 'W' || ch === '_';
}

/** Shots fly over water but stop at everything else that is solid. */
export function blocksShot(ch: string): boolean {
  return SOLID.has(ch) && !SHOT_PASSES.has(ch);
}

/** Tiles you walk into to go somewhere (caves, stairs, house doors). */
export const DOOR_CHARS = 'DO';
/** Tiles that hide a door until they are bombed or pushed away. */
export const HIDDEN_DOOR_CHARS = 'ZP%';

export const ENEMY_CHARS = 'sbgkXczv';
export const ITEM_CHARS = 'KH123456789*h$0';
export const GROUND_CHARS = '.,';
