import './style.css';
import { cloud } from './cloud';
import { START, VIEW_H, VIEW_W } from './config';
import { art } from './game/art';
import { Game } from './game/game';
import { Input } from './game/input';
import { newSave } from './game/save';
import { sfxState } from './game/sfx';
import { LANGS, setLang, t, type Lang } from './i18n';
import { loadSettings, SaveManager, storeSettings } from './storage';
import { Dialog } from './ui/dialog';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Started from the home screen: show the star splash a moment, then fade it out.
// (CSS shows it for display-mode standalone/fullscreen; older iOS only has navigator.standalone.)
if ((navigator as Navigator & { standalone?: boolean }).standalone) document.body.classList.add('standalone');
setTimeout(() => {
  const splash = $('splash');
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 600);
}, 1100);
const canvas = $<HTMLCanvasElement>('screen');
const frame = $('frame');
const overlay = $('overlay');

const settings = loadSettings();
setLang(settings.lang);
sfxState.enabled = settings.sound;

const input = new Input();
input.bindDpad($('dpad'));
input.bindButton($('btn-a'), 'a');
input.bindButton($('btn-b'), 'b');
input.bindButton($('btn-inv'), 'inv');
$('btn-menu').addEventListener('click', () => openSettings());

// Taps on the game screen: the mini map opens the big map, the item boxes open the bag.
canvas.addEventListener('pointerdown', e => {
  if (!game || screen !== 'game') return;
  const r = canvas.getBoundingClientRect();
  game.tap(((e.clientX - r.left) / r.width) * VIEW_W, ((e.clientY - r.top) / r.height) * VIEW_H);
});

const dialog = new Dialog($('dialog'), $('dialog-text'), $('dialog-speak'));
const saves = new SaveManager();
let game: Game | null = null;
let screen: 'title' | 'settings' | 'game' = 'title';
let settingsFrom: 'title' | 'game' = 'title';

// ------------------------------------------------------------- layout
const isTouch = () => document.body.classList.contains('touch');
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && !isTouch()) { document.body.classList.add('touch'); fit(); }
}, { capture: true });

const app = $('app');
function fit() {
  // Leave out the safe areas (iPhone notch / home bar) that #app pads away.
  const cs = getComputedStyle(app);
  let w = innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let h = innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (isTouch()) {
    if (h >= w) h *= 0.6;
    // landscape: keep room for the controls on both sides (matches the sizes in style.css)
    else w -= 2 * Math.min(190, w * 0.2);
  }
  const s = Math.min(w / VIEW_W, h / VIEW_H);
  frame.style.width = `${Math.floor(VIEW_W * s)}px`;
  frame.style.height = `${Math.floor(VIEW_H * s)}px`;
}
addEventListener('resize', fit);
fit();

// iOS Safari ignores user-scalable=no: block double-tap and pinch zoom by hand.
// Buttons and inputs are left alone (touch-action: manipulation already covers them)
// so their clicks still fire.
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = e.timeStamp;
  const target = e.target as Element | null;
  if (now - lastTouchEnd < 350 && !target?.closest('button, input, a')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}

// ------------------------------------------------------------- tiny DOM helper
type Child = Node | string | null | false;
function h(tag: string, attrs: Record<string, string | ((e: Event) => void)> = {}, children: Child[] = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k, v);
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
const btn = (label: string, onClick: () => void, cls = '') => h('button', { class: `btn ${cls}`, click: onClick }, [label]);

/** Wiping progress needs the word typed in, so a child can't do it by tapping around. */
const RESET_WORDS = ['OMSTART', 'RESTART'];
function resetConfirm(onYes: () => void, onNo: () => void) {
  const field = h('input', {
    class: 'field name', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: t('resetWord'),
  }) as HTMLInputElement;
  const yes = btn(t('reset'), () => { if (ok()) onYes(); }, 'danger') as HTMLButtonElement;
  const ok = () => RESET_WORDS.includes(field.value.trim().toLocaleUpperCase());
  const update = () => { yes.disabled = !ok(); };
  field.addEventListener('input', update);
  field.addEventListener('keydown', e => { if (e.key === 'Enter' && ok()) onYes(); });
  update();
  return h('div', { class: 'panel' }, [
    h('p', { class: 'msg' }, [t('resetConfirm')]),
    h('p', {}, [t('resetType')]),
    field,
    h('div', { class: 'row' }, [btn(t('no'), onNo, 'primary'), yes]),
  ]);
}

function show(panel: HTMLElement) {
  overlay.replaceChildren(panel);
  overlay.hidden = false;
  input.enabled = false;
  input.reset();
}

// ------------------------------------------------------------- screens
function heroCanvas() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  c.getContext('2d')!.drawImage(art.player.down[0], 0, 0);
  return c;
}

function statusLine() {
  return cloud.session ? t(`status_${saves.status}`) : t('status_local');
}

function showTitle(confirmNew = false) {
  screen = 'title';
  game?.stop();
  game = null;
  const has = !!saves.data;
  const panel = h('div', { class: 'panel' }, [
    h('h1', {}, [t('title')]),
    h('div', { class: 'hero' }, [heroCanvas()]),
    ...(confirmNew
      ? [resetConfirm(() => startGame(true), () => showTitle())]
      : [
        has ? btn(t('continue'), () => startGame(false), 'primary') : btn(t('newGame'), () => startGame(true), 'primary'),
        has && btn(t('newGame'), () => showTitle(true)),
        btn(t('settings'), () => openSettings()),
      ]),
    !isTouch() && h('p', { class: 'small' }, [t('controlsHint')]),
    h('p', { class: 'small', id: 'sync-status' }, [statusLine()]),
  ]);
  show(panel);
}

function startGame(fresh: boolean) {
  if (fresh || !saves.data) saves.save(newSave(settings.name));
  overlay.hidden = true;
  screen = 'game';
  game?.stop();
  game = new Game(canvas, input, dialog, saves.data!, {
    onSave: s => saves.save(s),
    onMenu: () => openSettings(),
  });
  input.enabled = true;
  input.reset();
  game.start();
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
}

let cloudStep: { email: string; sent: boolean; msg: string } = { email: '', sent: false, msg: '' };
let confirmReset = false;

function openSettings() {
  settingsFrom = game ? 'game' : 'title';
  if (game) game.paused = true;
  screen = 'settings';
  confirmReset = false;
  renderSettings();
}

function closeSettings() {
  if (settingsFrom === 'game' && game) {
    overlay.hidden = true;
    screen = 'game';
    game.paused = false;
    input.enabled = true;
    input.reset();
  } else showTitle();
}

function renderSettings() {
  const langRow = h('div', { class: 'row' }, LANGS.map(l =>
    btn(l.label, () => { settings.lang = l.id as Lang; setLang(l.id); storeSettings(settings); renderSettings(); },
      settings.lang === l.id ? 'selected' : '')));

  const nameInput = h('input', {
    class: 'field name', maxlength: '10', value: game?.save.name ?? saves.data?.name ?? settings.name,
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
  }) as HTMLInputElement;
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim().toLocaleUpperCase() || 'MIRA';
    nameInput.value = name;
    settings.name = name;
    storeSettings(settings);
    const save = game?.save ?? saves.data;
    if (save) { save.name = name; saves.save(save); }
  });

  const panel = h('div', { class: 'panel' }, [
    h('h1', {}, [t('settings')]),
    h('h2', {}, [t('language')]),
    langRow,
    h('h2', {}, [t('sound')]),
    h('div', { class: 'row' }, [true, false].map(on =>
      btn(on ? t('on') : t('off'), () => {
        settings.sound = on; sfxState.enabled = on; storeSettings(settings); renderSettings();
      }, settings.sound === on ? 'selected' : ''))),
    h('h2', {}, [t('name')]),
    nameInput,
    h('h2', {}, [t('cloud')]),
    ...cloudSection(),
    h('h2', {}, ['']),
    confirmReset
      ? resetConfirm(() => {
        game?.stop(); game = null;
        saves.save(newSave(settings.name));
        showTitle();
      }, () => { confirmReset = false; renderSettings(); })
      : btn(t('reset'), () => { confirmReset = true; renderSettings(); }, 'danger'),
    ...(import.meta.env.DEV ? devSection() : []),
    settingsFrom === 'game' && btn(t('toTitle'), () => { void saves.flush(); showTitle(); }),
    btn(settingsFrom === 'game' ? t('backToGame') : t('back'), closeSettings, 'primary'),
  ]);
  show(panel);
}

// Dev mode only (npm run dev). import.meta.env.DEV is false in the build, so this is dropped there.
const DEV_PLACES: [string, string, number, number][] = [
  ['START', START.loc, START.tx, START.ty],
  ['SVÄRDSGROTTAN', 'cave:sword', 7, 8],
  ['HJÄRTGROTTAN', 'cave:heart', 7, 8],
  ['TIPSGROTTAN', 'cave:hint', 7, 8],
  ['BORG 1 ENTRÉ', 'ow:13:4', 7, 5],
  ['BORG 1 INNE', 'd1:2:3', 7, 8],
  ['BOSSRUMMET', 'd1:2:0', 7, 8],
  ['FISKAREN', 'ow:12:3', 11, 4],
  ['VATTENBORGEN (SJÖN)', 'ow:13:2', 9, 8],
  ['VATTENBORGEN INNE', 'd2:1:3', 7, 8],
  ['KYRKOGÅRDEN', 'ow:2:4', 10, 4],
  ['SPÖKBORGEN INNE', 'd3:1:3', 7, 8],
  ['HEMLIGA GRAVEN', 'ow:1:5', 9, 5],
  ['STJÄRNKIKAREN', 'ow:7:2', 4, 5],
  ['SKÖLDSPRICKAN', 'ow:9:1', 6, 3],
  ['HEMLIGA ÖN', 'ow:15:7', 9, 5],
  ['STJÄRNPORTEN', 'ow:7:1', 5, 9],
  ['STJÄRNBORGEN INNE', 'd4:2:4', 7, 8],
  ['STJÄRNSLUKAREN', 'd4:2:0', 7, 8],
];

function devSection(): Child[] {
  if (!game) return [h('h2', {}, ['DEV']), h('p', { class: 'small' }, ['Starta spelet för att se fusk-knapparna.'])];
  const g = game;
  const s = g.save;
  const act = (label: string, fn: () => void, cls = '') => btn(label, () => { fn(); g.persist(); renderSettings(); }, cls);
  const go = (loc: string, tx: number, ty: number) => { g.devWarp(loc, tx, ty); closeSettings(); };
  return [
    h('h2', {}, ['DEV']),
    h('div', { class: 'row' }, [
      act(s.items.sword ? 'SVÄRD ✓' : 'SVÄRD', () => { s.items.sword = !s.items.sword; }, s.items.sword ? 'selected' : ''),
      act(s.items.staff ? 'TROLLSTAV ✓' : 'TROLLSTAV', () => { s.items.staff = !s.items.staff; }, s.items.staff ? 'selected' : ''),
    ]),
    h('div', { class: 'row' }, [
      act(s.items.bombs ? 'BOMBER ✓' : 'BOMBER', () => { s.items.bombs = !s.items.bombs; s.bombs = s.items.bombs ? 8 : 0; }, s.items.bombs ? 'selected' : ''),
      act(s.items.boomerang ? 'BUMERANG ✓' : 'BUMERANG', () => { s.items.boomerang = !s.items.boomerang; }, s.items.boomerang ? 'selected' : ''),
    ]),
    h('div', { class: 'row' }, [
      act(s.items.map ? 'KARTA ✓' : 'KARTA', () => { s.items.map = !s.items.map; }, s.items.map ? 'selected' : ''),
      act(s.items.starKey ? 'STJÄRNNYCKEL ✓' : 'STJÄRNNYCKEL', () => { s.items.starKey = !s.items.starKey; }, s.items.starKey ? 'selected' : ''),
      act(s.items.shield ? 'SKÖLD ✓' : 'SKÖLD', () => { s.items.shield = !s.items.shield; }, s.items.shield ? 'selected' : ''),
      act(s.items.crown ? 'KRONA ✓' : 'KRONA', () => { s.items.crown = !s.items.crown; }, s.items.crown ? 'selected' : ''),
      act(s.items.wings ? 'VINGAR ✓' : 'VINGAR', () => { s.items.wings = !s.items.wings; }, s.items.wings ? 'selected' : ''),
    ]),
    h('div', { class: 'row' }, [
      act('+5 NYCKLAR HÄR', () => { const a = g.room.def.area; s.keys[a] = (s.keys[a] ?? 0) + 5; }),
      act('+50 STENAR', () => { s.gems = Math.min(999, s.gems + 50); }),
    ]),
    h('div', { class: 'row' }, [
      act('FULLA HJÄRTAN', () => { s.hp = s.maxHp; }),
      act('+1 HJÄRTA', () => { s.maxHp = Math.min(32, s.maxHp + 2); s.hp = s.maxHp; }),
    ]),
    h('div', { class: 'row' }, [
      act(g.god ? 'ODÖDLIG ✓' : 'ODÖDLIG', () => { g.god = !g.god; }, g.god ? 'selected' : ''),
      btn('DÖDA ALLA', () => { g.devKillAll(); closeSettings(); }),
    ]),
    btn('ÅTERSTÄLL KISTOR, DÖRRAR, BOSS', () => { g.devResetWorld(); closeSettings(); }),
    h('p', { class: 'small' }, [`${s.pos.loc}  ·  STJÄRNOR: ${s.stars.join(', ') || '-'}`]),
    ...DEV_PLACES.map(([label, loc, tx, ty]) => btn(`→ ${label}`, () => go(loc, tx, ty))),
  ];
}

function cloudSection(): Child[] {
  if (!cloud.enabled) return [h('p', { class: 'small' }, [t('cloudOff')])];
  const msg = cloudStep.msg && h('p', { class: 'msg' }, [cloudStep.msg]);
  if (cloud.session) {
    return [
      h('p', {}, [`${t('loggedInAs')} `, h('span', { class: 'small' }, [cloud.session.user.email ?? ''])]),
      h('p', { class: 'small', id: 'sync-status' }, [statusLine()]),
      h('div', { class: 'row' }, [
        btn(t('syncNow'), () => { if (game) game.persist(); void saves.flush(); }),
        btn(t('logout'), async () => { await cloud.signOut(); cloudStep = { email: '', sent: false, msg: '' }; }),
      ]),
    ];
  }
  const email = h('input', { class: 'field', type: 'email', placeholder: t('email'), value: cloudStep.email, autocomplete: 'email' }) as HTMLInputElement;
  if (!cloudStep.sent) {
    return [
      h('p', { class: 'small' }, [t('cloudInfo')]),
      email,
      btn(t('sendCode'), async () => {
        cloudStep.email = email.value.trim();
        if (!cloudStep.email) return;
        try {
          await cloud.sendCode(cloudStep.email);
          cloudStep = { ...cloudStep, sent: true, msg: t('codeSent') };
        } catch (e) {
          cloudStep.msg = `${t('error')}: ${(e as Error).message}`;
        }
        renderSettings();
      }),
      msg,
    ];
  }
  const code = h('input', { class: 'field', inputmode: 'numeric', placeholder: t('code'), autocomplete: 'one-time-code' }) as HTMLInputElement;
  return [
    msg,
    h('p', { class: 'small' }, [cloudStep.email]),
    code,
    h('div', { class: 'row' }, [
      btn(t('back'), () => { cloudStep = { email: cloudStep.email, sent: false, msg: '' }; renderSettings(); }),
      btn(t('login'), async () => {
        try {
          await cloud.verifyCode(cloudStep.email, code.value.trim());
          cloudStep = { email: '', sent: false, msg: '' };
        } catch (e) {
          cloudStep.msg = `${t('error')}: ${(e as Error).message}`;
          renderSettings();
        }
      }, 'primary'),
    ]),
  ];
}

// ------------------------------------------------------------- events
saves.onStatus(() => {
  const el = document.getElementById('sync-status');
  if (el) el.textContent = statusLine();
});

cloud.onAuth(async () => {
  const adopted = await saves.reconcile();
  // A newer save from another device: drop back to the title so "continue" picks it up.
  if (adopted && game) showTitle();
  else if (screen === 'settings') renderSettings();
  else if (screen === 'title') showTitle();
});

addEventListener('keydown', e => {
  if (screen === 'settings' && e.code === 'Escape') closeSettings();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (game) game.persist();
  void saves.flush();
});

showTitle();
