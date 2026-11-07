import { en } from './en';
import { sv } from './sv';

export type Lang = 'sv' | 'en';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'sv', label: 'SVENSKA' },
  { id: 'en', label: 'ENGLISH' },
];

const dicts: Record<Lang, Record<string, string>> = { sv, en };
let lang: Lang = 'sv';

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
}
export const getLang = () => lang;
export const speechLang = () => (lang === 'sv' ? 'sv-SE' : 'en-US');

export function t(key: string, params: Record<string, string | number> = {}): string {
  let s = dicts[lang][key] ?? dicts.sv[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s.toLocaleUpperCase(speechLang());
}
