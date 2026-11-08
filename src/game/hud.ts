import { COLS, HUD_H, OW_COLS, OW_ROWS, ROOM_H, ROOM_W, ROWS, VIEW_W } from '../config';
import { t } from '../i18n';
import { art, MAP_COLORS } from './art';
import type { Game, Slot } from './game';
import { locInfo, ROOMS } from './world';

type G = CanvasRenderingContext2D;
type Img = HTMLCanvasElement;

/** Parts of the HUD you can tap: the mini map opens the big map, the item boxes open the inventory. */
export const HUD_TAP = {
  map: { x: 0, y: 0, w: 76, h: HUD_H },
  items: { x: 118, y: 0, w: 56, h: HUD_H },
};

/** Inventory slots, 4 per row. */
export const INV_SLOTS: Slot[] = ['staff', 'bombs', 'boomerang', 'sword', 'shield', 'map', 'starKey', 'wings', 'crown', 'stars'];
export const INV_COLS = 5;
const SLOT = 30, GAP = 10, INV_X = (ROOM_W - (INV_COLS * SLOT + (INV_COLS - 1) * GAP)) / 2, INV_Y = 32;
const slotPos = (i: number) => ({ x: INV_X + (i % INV_COLS) * (SLOT + GAP), y: INV_Y + Math.floor(i / INV_COLS) * (SLOT + GAP) });

/** Which slot is at a point inside the room area, or -1. */
export function invSlotAt(x: number, y: number): number {
  for (let i = 0; i < INV_SLOTS.length; i++) {
    const p = slotPos(i);
    if (x >= p.x - 4 && x < p.x + SLOT + 4 && y >= p.y - 4 && y < p.y + SLOT + 4) return i;
  }
  return -1;
}

function slotImage(slot: Slot): Img {
  switch (slot) {
    case 'staff': return art.item['2'];
    case 'bombs': return art.bomb;
    case 'boomerang': return art.item['4'];
    case 'sword': return art.item['1'];
    case 'shield': return art.item['6'];
    case 'map': return art.item['9'];
    case 'starKey': return art.item['7'];
    case 'wings': return art.item['5'];
    case 'crown': return art.item['8'];
    case 'stars': return art.item['*'];
  }
}

const owns = (game: Game, slot: Slot) => slot === 'stars' ? game.save.stars.length > 0 : game.save.items[slot];

function drawMiniMap(g: G, game: Game) {
  const def = game.room.def;
  const x0 = 8, y0 = 8, w = 64, h = 32;
  g.fillStyle = '#444';
  g.fillRect(x0, y0, w, h);
  if (def.kind === 'ow') {
    const cw = w / OW_COLS, ch = h / OW_ROWS;
    const goal = game.guide.goal;
    if (goal && game.showGuide && Math.floor(game.time * 3) % 2 === 0) {
      const [gx, gy] = goal.loc.split(':').slice(1).map(Number);
      g.fillStyle = '#ffe14d';
      g.fillRect(x0 + gx * cw, y0 + gy * ch + 0.5, cw - 1, ch - 1);
    }
    g.fillStyle = '#7cff5a';
    g.fillRect(x0 + def.gx * cw, y0 + def.gy * ch + 0.5, cw - 1, ch - 1);
  } else if (def.kind === 'dungeon') {
    g.fillStyle = '#000';
    g.fillRect(x0, y0, w, h);
    const rooms = [...ROOMS.values()].filter(r => r.area === def.area);
    const minX = Math.min(...rooms.map(r => r.gx)), minY = Math.min(...rooms.map(r => r.gy));
    const rows = Math.max(...rooms.map(r => r.gy)) - minY + 1;
    const step = Math.min(7, Math.floor((h - 2) / rows));
    for (const r of rooms) {
      g.fillStyle = r.loc === def.loc ? '#7cff5a' : '#2f6fb0';
      g.fillRect(x0 + 4 + (r.gx - minX) * 9, y0 + 2 + (r.gy - minY) * step, 7, step - 2);
    }
  }
  if (game.save.items.map) {
    // a little scroll in the corner: tap me
    g.drawImage(art.item['9'], x0 + w - 6, y0 + h - 5);
  }
}

function counter(g: G, img: Img, n: number, x: number, y: number) {
  g.drawImage(img, x + Math.floor((8 - img.width) / 2), y + Math.floor((10 - img.height) / 2));
  g.fillStyle = '#fff';
  g.fillText(`x${n}`, x + 10, y + 1);
}

function itemBox(g: G, label: string, x: number, img: Img | null) {
  g.strokeStyle = label === 'A' ? '#e84a4a' : '#4a7ae8';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, 12.5, 19, 27);
  g.fillStyle = '#000';
  g.fillRect(x + 6, 8, 8, 8);
  g.fillStyle = '#fff';
  g.fillText(label, x + 7, 8);
  if (img) g.drawImage(img, x + Math.floor((20 - img.width) / 2), 17);
}

export function drawHud(g: G, game: Game) {
  const s = game.save;
  g.fillStyle = '#000';
  g.fillRect(0, 0, VIEW_W, HUD_H);
  g.font = 'bold 8px monospace';
  g.textBaseline = 'top';

  drawMiniMap(g, game);
  const area = game.room.def.area;
  counter(g, art.item.$, s.gems, 80, 4);
  counter(g, art.item.K, s.keys[area] ?? 0, 80, 15);
  counter(g, art.item['*'], s.stars.length, 80, 26);
  if (s.items.bombs) counter(g, art.bomb, s.bombs, 80, 37);

  const b = game.bItem();
  itemBox(g, 'B', 124, b ? slotImage(b) : null);
  itemBox(g, 'A', 148, s.items.sword ? art.item['1'] : null);

  const hearts = Math.ceil(s.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const x = 176 + (i % 7) * 8, y = 16 + Math.floor(i / 7) * 9;
    const full = s.hp >= (i + 1) * 2, half = s.hp === i * 2 + 1;
    g.drawImage(full || half ? art.heart : art.heartEmpty, x, y);
    if (half) g.drawImage(art.heartEmpty, 4, 0, 3, 6, x + 4, y, 3, 6);
  }
}

function centerText(g: G, text: string, y: number, color = '#fff') {
  g.fillStyle = color;
  g.fillText(text, Math.round((ROOM_W - g.measureText(text).width) / 2), y);
}

function panel(g: G) {
  g.fillStyle = 'rgba(0,0,0,0.92)';
  g.fillRect(0, 0, ROOM_W, ROOM_H);
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.strokeRect(5, 5, ROOM_W - 10, ROOM_H - 10);
  g.textBaseline = 'top';
}

/** The inventory: everything you have found. Pick what goes on B. */
export function drawInventory(g: G, game: Game) {
  panel(g);
  g.font = 'bold 10px monospace';
  centerText(g, t('inventory'), 12, '#ffd34d');
  const blink = Math.floor(game.time * 3) % 2 === 0;
  const b = game.bItem();
  INV_SLOTS.forEach((slot, i) => {
    const p = slotPos(i);
    const have = owns(game, slot);
    g.fillStyle = have ? '#2a2a5a' : '#111';
    g.fillRect(p.x, p.y, SLOT, SLOT);
    g.strokeStyle = slot === b ? '#4a7ae8' : slot === 'sword' && have ? '#e84a4a' : '#555';
    g.lineWidth = 2;
    g.strokeRect(p.x, p.y, SLOT, SLOT);
    if (have) {
      const img = slotImage(slot);
      const k = img.width > 12 ? 1 : 2;
      g.drawImage(img, Math.round(p.x + (SLOT - img.width * k) / 2), Math.round(p.y + (SLOT - img.height * k) / 2), img.width * k, img.height * k);
      g.font = 'bold 8px monospace';
      g.fillStyle = '#fff';
      if (slot === 'bombs') g.fillText(`${game.save.bombs}`, p.x + SLOT - 8, p.y + SLOT - 9);
      if (slot === 'stars') g.fillText(`${game.save.stars.length}`, p.x + SLOT - 8, p.y + SLOT - 9);
    }
    // Button badges: blue B on the chosen B item, red A on the sword (always on A).
    const badge = slot === b ? ['B', '#4a7ae8'] : slot === 'sword' && have ? ['A', '#e84a4a'] : null;
    if (badge) {
      g.font = 'bold 8px monospace';
      g.fillStyle = badge[1];
      g.fillRect(p.x - 3, p.y - 3, 9, 9);
      g.fillStyle = '#fff';
      g.fillText(badge[0], p.x - 1, p.y - 2);
    }
    if (i === game.invCursor && blink) {
      g.strokeStyle = '#fff';
      g.strokeRect(p.x - 3, p.y - 3, SLOT + 6, SLOT + 6);
    }
  });
  const slot = INV_SLOTS[game.invCursor];
  g.font = 'bold 11px monospace';
  centerText(g, owns(game, slot) ? t(`item_${slot}`) : '?', 124);
  g.font = 'bold 8px monospace';
  if (owns(game, slot)) {
    const isB = slot === 'staff' || slot === 'bombs' || slot === 'boomerang';
    const hint = game.txt(isB ? 'inv_pick' : slot === 'map' ? 'inv_map' : slot === 'sword' ? 'inv_sword' : 'inv_info');
    centerText(g, hint, 144, '#aaa');
  }
}

let worldCanvas: Img | null = null;
/** The whole overworld with one pixel per tile (256 x 88). */
function worldImage(): Img {
  if (worldCanvas) return worldCanvas;
  const c = document.createElement('canvas');
  c.width = OW_COLS * COLS;
  c.height = OW_ROWS * ROWS;
  const g = c.getContext('2d')!;
  for (const r of ROOMS.values()) {
    if (r.kind !== 'ow') continue;
    r.tiles.forEach((row, ty) => [...row].forEach((ch, tx) => {
      g.fillStyle = MAP_COLORS[ch] ?? '#74c44f';
      g.fillRect(r.gx * COLS + tx, r.gy * ROWS + ty, 1, 1);
    }));
  }
  worldCanvas = c;
  return c;
}

/** Where on the overworld a place is: an overworld screen, or the door that leads into a cave/castle. */
function owSpot(loc: string): [number, number] | null {
  const info = locInfo(loc);
  for (const r of ROOMS.values()) {
    if (r.kind !== 'ow') continue;
    for (const d of r.doors) {
      const to = locInfo(d.to);
      if ((info.kind === 'dungeon' && to.area === info.area) || d.to === loc) return [r.gx * COLS + d.tx, r.gy * ROWS + d.ty];
    }
  }
  return null;
}

/** The big map of the whole land. Castles show a star, gold when it has been won. */
export function drawWorldMap(g: G, game: Game) {
  panel(g);
  g.font = 'bold 10px monospace';
  centerText(g, t('map_title'), 12, '#ffd34d');
  const img = worldImage();
  const ox = 0, oy = 30;
  g.drawImage(img, ox, oy);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 1; x < OW_COLS; x++) g.fillRect(ox + x * COLS, oy, 1, img.height);
  for (let y = 1; y < OW_ROWS; y++) g.fillRect(ox, oy + y * ROWS, img.width, 1);

  const s = game.save;
  const seenAreas = new Set<string>();
  for (const r of ROOMS.values()) {
    if (r.kind !== 'ow') continue;
    for (const d of r.doors) {
      const ch = r.tiles[d.ty][d.tx];
      // hidden doors stay secret until found
      if ((ch === 'Z' || ch === 'P' || ch === '%') && !s.flags[`open:${r.loc}:${d.tx},${d.ty}`]) continue;
      const to = locInfo(d.to);
      const x = ox + r.gx * COLS + d.tx, y = oy + r.gy * ROWS + d.ty;
      if (to.kind === 'dungeon') {
        if (seenAreas.has(to.area)) continue;
        seenAreas.add(to.area);
        const star = art.item['*'];
        g.save();
        if (!s.stars.includes(to.area)) g.globalAlpha = 0.45;
        g.drawImage(star, x - 5, y - 5);
        g.restore();
      } else {
        g.fillStyle = '#fff';
        g.fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle = '#000';
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  const def = game.room.def;
  const here = def.kind === 'ow'
    ? [def.gx * COLS + Math.floor((game.player.x + 8) / 16), def.gy * ROWS + Math.floor((game.player.y + 11) / 16)]
    : owSpot(def.loc);
  // the next goal: a big blinking star with a ring around it
  const goal = game.guide.goal;
  if (goal) {
    const [gx, gy] = goal.loc.split(':').slice(1).map(Number);
    const x = ox + gx * COLS + goal.tx, y = oy + gy * ROWS + goal.ty;
    const r = 5 + Math.floor(game.time * 6) % 3;
    g.strokeStyle = '#ffe14d';
    g.lineWidth = 1;
    g.strokeRect(x - r + 0.5, y - r + 0.5, r * 2, r * 2);
    g.drawImage(art.item['*'], x - 5, y - 5);
  }
  if (here && Math.floor(game.time * 4) % 2 === 0) {
    g.fillStyle = '#ff3a5a';
    g.fillRect(ox + here[0] - 2, oy + here[1] - 2, 5, 5);
  }

  g.font = 'bold 8px monospace';
  const ly = oy + img.height + 10;
  g.fillStyle = '#ff3a5a';
  g.fillRect(40, ly, 5, 5);
  g.fillStyle = '#fff';
  g.fillText(t('map_you'), 50, ly - 1);
  g.drawImage(art.item['*'], 110, ly - 3);
  g.fillText(t('map_castle'), 125, ly - 1);
  if (goal) {
    g.strokeStyle = '#ffe14d';
    g.strokeRect(180.5, ly - 2.5, 7, 7);
    g.fillStyle = '#ffe14d';
    g.fillText(t('map_goal'), 192, ly - 1);
  }
  g.fillStyle = '#aaa';
  centerText(g, t('map_close'), ROOM_H - 20, '#aaa');
}
