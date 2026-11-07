export const TILE = 16;
export const COLS = 16;
export const ROWS = 11;
export const ROOM_W = COLS * TILE; // 256
export const ROOM_H = ROWS * TILE; // 176
export const HUD_H = 48;
export const VIEW_W = ROOM_W;
export const VIEW_H = ROOM_H + HUD_H; // 224
/** Backing-store multiplier so sprites and HUD text stay crisp when CSS scales the canvas. */
export const RENDER_SCALE = 3;
export const OW_COLS = 16;
export const OW_ROWS = 8;
export const START = { loc: 'ow:7:7', tx: 7, ty: 5 };
export const STEP = 1 / 60;
