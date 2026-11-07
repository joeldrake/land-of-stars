import { cloud } from './cloud';
import { normalizeSave, type SaveData } from './game/save';
import type { Lang } from './i18n';

const SAVE_KEY = 'land-of-stars:save:v1';
const SETTINGS_KEY = 'land-of-stars:settings:v1';

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

function readJson(k: string): unknown {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; }
}
function writeJson(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota */ }
}

export interface Settings { lang: Lang; name: string }

export function loadSettings(): Settings {
  const s = readJson(SETTINGS_KEY) as Partial<Settings> | null;
  const navSv = (navigator.language || 'sv').toLowerCase().startsWith('sv');
  return { lang: s?.lang ?? (navSv ? 'sv' : 'en'), name: s?.name ?? 'MIRA' };
}
export function storeSettings(s: Settings) { writeJson(SETTINGS_KEY, s); }

/**
 * Keeps one save slot in localStorage and mirrors it to Supabase when logged in.
 * Newest `updatedAt` wins; the database also refuses to overwrite a newer row.
 */
export class SaveManager {
  data: SaveData | null = normalizeSave(readJson(SAVE_KEY));
  status: SyncStatus = 'local';
  private timer = 0;
  private listeners = new Set<() => void>();

  onStatus(cb: () => void) { this.listeners.add(cb); }
  private setStatus(s: SyncStatus) { this.status = s; this.listeners.forEach(cb => cb()); }

  save(s: SaveData) {
    s.updatedAt = Date.now();
    this.data = s;
    writeJson(SAVE_KEY, s);
    if (cloud.session) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.flush(), 1500);
    }
  }

  async flush() {
    clearTimeout(this.timer);
    if (!cloud.session || !this.data) return;
    this.setStatus('syncing');
    try {
      await cloud.push(this.data);
      this.setStatus('synced');
    } catch (e) {
      console.warn('cloud push failed', e);
      this.setStatus('error');
    }
  }

  /** Pull the remote save; adopt it if newer, otherwise upload ours. Returns true if the remote one was adopted. */
  async reconcile(): Promise<boolean> {
    if (!cloud.session) { this.setStatus('local'); return false; }
    this.setStatus('syncing');
    try {
      const remote = await cloud.pull();
      if (remote && (!this.data || remote.updatedAt > this.data.updatedAt)) {
        this.data = remote;
        writeJson(SAVE_KEY, remote);
        this.setStatus('synced');
        return true;
      }
      if (this.data) await cloud.push(this.data);
      this.setStatus('synced');
    } catch (e) {
      console.warn('cloud sync failed', e);
      this.setStatus('error');
    }
    return false;
  }
}
