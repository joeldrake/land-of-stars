/**
 * Small 8-bit style sound effects made with Web Audio. No sound files.
 *
 * Mobile browsers only start audio after a real user action (tap/click/key),
 * so the AudioContext is created/resumed on the first such event.
 */
type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export const sfxState = { enabled: true };

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') void ctx.resume();
}
for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
  addEventListener(ev, unlock, { capture: true, passive: true });
}

/** One tone. `at` and `dur` are in seconds from now; `to` slides the pitch. */
function tone(freq: number, at: number, dur: number, wave: Wave = 'square', vol = 0.5, to?: number) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(at: number, dur: number, vol = 0.4, filterFrom = 4000, filterTo = 400) {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(filterFrom, t0);
  f.frequency.exponentialRampToValueAtTime(filterTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Notes played one after another: [frequency, length]. */
function melody(notes: [number, number][], wave: Wave = 'square', vol = 0.4) {
  let at = 0;
  for (const [f, d] of notes) {
    if (f) tone(f, at, d * 0.95, wave, vol);
    at += d;
  }
}

// Note frequencies (Hz)
const N = {
  C4: 262, E4: 330, G4: 392, A4: 440,
  C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988,
  C6: 1047, E6: 1319, G6: 1568,
};

const sounds = {
  sword: () => { noise(0, 0.12, 0.25, 6000, 800); tone(900, 0, 0.08, 'square', 0.12, 300); },
  magic: () => { tone(400, 0, 0.25, 'triangle', 0.5, 1600); tone(800, 0.03, 0.22, 'square', 0.08, 2400); },
  hit: () => { tone(220, 0, 0.08, 'square', 0.35, 110); noise(0, 0.06, 0.2); },
  kill: () => { noise(0, 0.25, 0.4, 3000, 200); tone(300, 0, 0.2, 'square', 0.2, 60); },
  hurt: () => { tone(180, 0, 0.25, 'square', 0.45, 70); tone(190, 0, 0.25, 'sawtooth', 0.15, 75); },
  gem: () => melody([[N.B5, 0.06], [N.E6, 0.14]], 'square', 0.3),
  heart: () => melody([[N.C5, 0.06], [N.E5, 0.06], [N.G5, 0.12]], 'triangle', 0.6),
  key: () => melody([[N.G5, 0.06], [N.C6, 0.06], [N.E6, 0.06], [N.G6, 0.14]], 'square', 0.25),
  unlock: () => { tone(150, 0, 0.12, 'square', 0.3); tone(220, 0.12, 0.18, 'square', 0.3); noise(0.1, 0.15, 0.2, 1500, 200); },
  locked: () => { tone(110, 0, 0.12, 'square', 0.3); tone(104, 0.14, 0.18, 'square', 0.3); },
  item: () => melody([[N.C5, 0.1], [N.E5, 0.1], [N.G5, 0.1], [N.C6, 0.35]], 'square', 0.3),
  star: () => {
    melody([[N.C5, 0.12], [N.E5, 0.12], [N.G5, 0.12], [N.C6, 0.12], [N.G5, 0.12], [N.C6, 0.5]], 'square', 0.28);
    melody([[N.C4, 0.24], [N.G4, 0.24], [N.E4, 0.24], [N.C4, 0.5]], 'triangle', 0.5);
  },
  bossDie: () => { noise(0, 0.9, 0.5, 5000, 100); tone(400, 0, 0.9, 'square', 0.2, 40); },
  die: () => melody([[N.A5, 0.15], [N.F5, 0.15], [N.D5, 0.15], [N.A4, 0.45]], 'triangle', 0.6),
  door: () => { tone(300, 0, 0.12, 'triangle', 0.4, 150); },
  bombPut: () => { tone(500, 0, 0.06, 'square', 0.2, 300); noise(0.02, 0.1, 0.1, 6000, 3000); },
  bomb: () => { noise(0, 0.7, 0.6, 2500, 60); tone(120, 0, 0.5, 'square', 0.3, 30); },
  boomerang: () => { tone(600, 0, 0.12, 'triangle', 0.25, 900); tone(900, 0.12, 0.12, 'triangle', 0.25, 600); },
  push: () => { noise(0, 0.25, 0.25, 800, 200); },
  click: () => { tone(880, 0, 0.05, 'square', 0.25); tone(1320, 0.06, 0.08, 'square', 0.25); },
  torch: () => { noise(0, 0.35, 0.3, 1500, 4000); tone(300, 0, 0.3, 'triangle', 0.2, 600); },
  crystal: () => melody([[N.E6, 0.08], [N.G6, 0.08], [N.E6, 0.08], [N.G6, 0.2]], 'triangle', 0.4),
  clang: () => { tone(1400, 0, 0.15, 'square', 0.2, 1200); tone(1900, 0, 0.15, 'square', 0.12, 1700); },
  /** Something hidden appeared: a short rising jingle. */
  secret: () => melody([[N.G5, 0.1], [N.B5, 0.1], [N.D5 * 2, 0.1], [N.G6, 0.3]], 'square', 0.25),
  menu: () => { tone(660, 0, 0.05, 'square', 0.2); },
  cut: () => { noise(0, 0.12, 0.3, 5000, 1500); },
};

export type Sound = keyof typeof sounds;

export function play(name: Sound) {
  if (!sfxState.enabled || !ctx || ctx.state !== 'running') return;
  sounds[name]();
}
