#!/usr/bin/env node
/**
 * Draws the app icons (the heroine) and the iPhone/iPad splash screens (a star) from the
 * same pixel data the game uses (src/game/sprites.ts). No image tools or packages needed.
 *
 *   npm run icons
 *
 * Writes into public/ and updates the marked blocks in index.html.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { P_DOWN, PLAYER_PAL, SKY, STAR, STAR_PAL } from '../src/game/sprites.ts';

const root = new URL('..', import.meta.url).pathname;
const pub = `${root}public/`;

// ------------------------------------------------------------------ tiny PNG writer
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

class Image {
  constructor(w, h, bg) {
    this.w = w; this.h = h;
    this.px = Buffer.alloc(w * h * 4);
    if (bg) this.rect(0, 0, w, h, bg);
  }
  rect(x, y, w, h, hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        const i = (yy * this.w + xx) * 4;
        this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b; this.px[i + 3] = 255;
      }
    }
  }
  /** Draw pixel-art rows, each pixel as a `scale`-sized square. */
  sprite(rows, pal, x, y, scale) {
    rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
      if (pal[ch]) this.rect(x + rx * scale, y + ry * scale, scale, scale, pal[ch]);
    }));
  }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0;
      this.px.copy(raw, y * (this.w * 4 + 1) + 1, y * this.w * 4, (y + 1) * this.w * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ------------------------------------------------------------------ the pictures
const TWINKLE = ['.y.', 'yYy', '.y.'];
const TW_PAL = { y: '#ffe14d', Y: '#ffffff' };

/**
 * The heroine on a night sky with a few twinkles. `grid` is how many "big pixels" wide the
 * picture is; a bigger grid leaves more margin (maskable icons need a safe zone).
 */
function heroIcon(size, grid = 22, bg = SKY) {
  const img = new Image(size, size, bg);
  const s = Math.floor(size / grid);
  const off = Math.floor((size - grid * s) / 2);
  const at = (gx, gy) => [off + gx * s, off + gy * s];
  const c = Math.floor((grid - 16) / 2);
  if (bg) {
    for (const [gx, gy] of [[c - 2, c - 1], [c + 15, c], [c + 16, c + 12]]) img.sprite(TWINKLE, TW_PAL, ...at(gx, gy), s);
  }
  img.sprite(P_DOWN, PLAYER_PAL, ...at(c, c + 2), s);
  return img;
}

/** A big star in the middle of the night sky. */
function starSplash(w, h) {
  const img = new Image(w, h, SKY);
  const s = Math.max(2, Math.floor(Math.min(w, h) * 0.32 / 11));
  const x = Math.floor((w - 11 * s) / 2), y = Math.floor((h - 11 * s) / 2);
  img.sprite(STAR, STAR_PAL, x, y, s);
  const t = Math.max(2, Math.floor(s / 3));
  for (const [fx, fy] of [[0.18, 0.22], [0.8, 0.3], [0.25, 0.75], [0.72, 0.8], [0.5, 0.12]]) {
    img.sprite(TWINKLE, TW_PAL, Math.floor(w * fx), Math.floor(h * fy), t);
  }
  return img;
}

// ------------------------------------------------------------------ write files
const write = (name, img) => writeFileSync(pub + name, img.png());

write('icon-192.png', heroIcon(192));
write('icon-512.png', heroIcon(512));
write('icon-maskable-512.png', heroIcon(512, 30)); // hero inside the 80% safe zone
write('apple-touch-icon.png', heroIcon(180));
write('favicon-32.png', heroIcon(32, 16, null)); // just her, 2x, on transparent

// SVG favicon: crisp at any size in browsers that support it.
const svgRects = (rows, pal, ox = 0, oy = 0) => rows.flatMap((row, y) => [...row].map((ch, x) =>
  pal[ch] ? `<rect x="${x + ox}" y="${y + oy}" width="1" height="1" fill="${pal[ch]}"/>` : '')).join('');
writeFileSync(pub + 'icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${svgRects(P_DOWN, PLAYER_PAL)}</svg>\n`);

// iPhone / iPad splash screens: [css width, css height, device pixel ratio], portrait.
const DEVICES = [
  [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [360, 780, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
  [744, 1133, 2], [820, 1180, 2], [810, 1080, 2], [834, 1194, 2], [1024, 1366, 2],
];
mkdirSync(pub + 'splash', { recursive: true });
const links = [];
for (const [cw, ch, dpr] of DEVICES) {
  for (const land of [false, true]) {
    const w = (land ? ch : cw) * dpr, h = (land ? cw : ch) * dpr;
    const name = `splash/star-${w}x${h}.png`;
    write(name, starSplash(w, h));
    const media = `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${land ? 'landscape' : 'portrait'})`;
    links.push(`  <link rel="apple-touch-startup-image" media="${media}" href="./${name}" />`);
  }
}

// ------------------------------------------------------------------ index.html blocks
const head = [
  '  <link rel="icon" href="./icon.svg" type="image/svg+xml" />',
  '  <link rel="icon" href="./favicon-32.png" type="image/png" sizes="32x32" />',
  '  <link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
  ...links,
].join('\n');
// The in-game star splash (shown when started from the home screen) uses the same star.
const splashSvg = `<svg viewBox="0 0 11 11" shape-rendering="crispEdges" aria-hidden="true">${svgRects(STAR, STAR_PAL)}</svg>`;

const htmlPath = root + 'index.html';
let html = readFileSync(htmlPath, 'utf8');
const put = (name, content) => {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(html)) throw new Error(`index.html is missing <!-- ${name}:start --> ... <!-- ${name}:end -->`);
  html = html.replace(re, `$1\n${content}\n  $2`);
};
put('icons', head);
put('splash', `    ${splashSvg}`);
writeFileSync(htmlPath, html);
console.log(`icons + ${links.length} splash screens written`);
