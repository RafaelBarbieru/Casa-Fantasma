// Locale system. Every player-facing string lives in src/locales/<lang>.js (en.js is the reference shape). L() = the
// current locale: settings.lang if set (Options > Language), else the browser's language, else English. Keys missing
// from a locale fall back to English. No DOM deps except applyDom(), so game.js still runs headless.
// Adding a language: copy en.js to locales/<code>.js, translate, import it into RAW below (and check hud.js has glyphs
// for its letters).
import { settings } from './settings.js';
import en from './locales/en.js';
import es from './locales/es.js';

const RAW = { en, es };
export const LANGS = Object.keys(RAW); // order of Options > Language

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (base, over) => {
  if (over === undefined) return base;
  if (!isPlain(base) || !isPlain(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
};
const LOCALES = Object.fromEntries(LANGS.map((k) => [k, merge(en, RAW[k])]));

let detected = null;
function browserLang() {
  if (detected) return detected;
  const nav = globalThis.navigator;
  for (const l of nav?.languages ?? [nav?.language]) {
    const code = String(l ?? '').slice(0, 2).toLowerCase();
    if (RAW[code]) return (detected = code);
  }
  return (detected = 'en');
}

export const lang = () => (RAW[settings.lang] ? settings.lang : browserLang());
export const L = () => LOCALES[lang()];

// The language d steps away from the current one (Options > Language arrows).
export const cycleLang = (d) => LANGS[(LANGS.indexOf(lang()) + d + LANGS.length) % LANGS.length];

// index.html: <html lang> and every [data-i18n="key"] element's text (keys of L().dom).
export function applyDom(doc = document) {
  doc.documentElement.lang = lang();
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const s = L().dom[el.dataset.i18n];
    if (typeof s === 'string') el.textContent = s;
  }
}
