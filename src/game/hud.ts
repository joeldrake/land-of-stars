import { HUD_H, OW_COLS, OW_ROWS, VIEW_W } from '../config';
import { art } from './art';
import type { Game } from './game';
import { ROOMS } from './world';

type G = CanvasRenderingContext2D;

function drawMap(g: G, game: Game) {
  const def = game.room.def;
  const x0 = 8, y0 = 8, w = 64, h = 32;
  g.fillStyle = '#444';
  g.fillRect(x0, y0, w, h);
  if (def.kind === 'ow') {
    const cw = w / OW_COLS, ch = h / OW_ROWS;
    g.fillStyle = '#7cff5a';
    g.fillRect(x0 + def.gx * cw, y0 + def.gy * ch + 0.5, cw - 1, ch - 1);
  } else if (def.kind === 'dungeon') {
    g.fillStyle = '#000';
    g.fillRect(x0, y0, w, h);
    const rooms = [...ROOMS.values()].filter(r => r.area === def.area);
    const minX = Math.min(...rooms.map(r => r.gx)), minY = Math.min(...rooms.map(r => r.gy));
    for (const r of rooms) {
      g.fillStyle = r.loc === def.loc ? '#7cff5a' : '#2f6fb0';
      g.fillRect(x0 + 4 + (r.gx - minX) * 9, y0 + 2 + (r.gy - minY) * 7, 7, 5);
    }
  }
}

function counter(g: G, img: HTMLCanvasElement, n: number, x: number, y: number) {
  g.drawImage(img, x + Math.floor((8 - img.width) / 2), y + Math.floor((10 - img.height) / 2));
  g.fillStyle = '#fff';
  g.fillText(`x${n}`, x + 10, y + 1);
}

function itemBox(g: G, label: string, x: number, img: HTMLCanvasElement | null) {
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

  drawMap(g, game);
  counter(g, art.item.$, s.gems, 80, 6);
  counter(g, art.item.K, s.keys, 80, 19);
  counter(g, art.item['*'], s.stars.length, 80, 32);

  itemBox(g, 'B', 124, s.items.staff ? art.item['2'] : null);
  itemBox(g, 'A', 148, s.items.sword ? art.item['1'] : null);

  const hearts = Math.ceil(s.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const x = 176 + (i % 7) * 8, y = 16 + Math.floor(i / 7) * 9;
    const full = s.hp >= (i + 1) * 2, half = s.hp === i * 2 + 1;
    g.drawImage(full || half ? art.heart : art.heartEmpty, x, y);
    if (half) g.drawImage(art.heartEmpty, 4, 0, 3, 6, x + 4, y, 3, 6);
  }
}
