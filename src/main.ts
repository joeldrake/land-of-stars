import './style.css';
import { cloud } from './cloud';
import { VIEW_H, VIEW_W } from './config';
import { art } from './game/art';
import { Game } from './game/game';
import { Input } from './game/input';
import { newSave } from './game/save';
import { sfxState } from './game/sfx';
import { LANGS, setLang, t, type Lang } from './i18n';
import { loadSettings, SaveManager, storeSettings } from './storage';
import { Dialog } from './ui/dialog';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
$('btn-menu').addEventListener('click', () => openSettings());

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

function fit() {
  let w = innerWidth, h = innerHeight;
  if (isTouch()) {
    if (h >= w) h *= 0.6;
    else w -= 2 * Math.min(220, w * 0.24);
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
    settingsFrom === 'game' && btn(t('toTitle'), () => { void saves.flush(); showTitle(); }),
    btn(settingsFrom === 'game' ? t('backToGame') : t('back'), closeSettings, 'primary'),
  ]);
  show(panel);
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
