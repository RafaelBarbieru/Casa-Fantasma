// Player settings (main menu > Options), kept in localStorage. No DOM deps beyond the guarded storage access, so
// game.js / hud.js can read `settings` directly (headless checks still work). main.js applies the volumes.
const KEY = 'casa-fantasma.settings';

export const settings = {
  master: 1,       // 0..1 slider positions (audio.setVolumes maps them to gain)
  ambience: 1,
  sfx: 1,
  epilepsy: false, // true: no light flickering (flashlight, ceiling lights, ghost shimmer, screamers, heartbeat throb)
  lang: null,      // locale code (i18n.js LANGS) chosen in Options; null = follow the browser's language
};

const DEFAULTS = { ...settings };

export function loadSettings() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return;
    for (const k of Object.keys(DEFAULTS)) {
      const v = saved[k];
      if (typeof DEFAULTS[k] === 'number' && Number.isFinite(v)) settings[k] = Math.max(0, Math.min(1, v));
      if (typeof DEFAULTS[k] === 'boolean' && typeof v === 'boolean') settings[k] = v;
      if (k === 'lang' && typeof v === 'string') settings[k] = v; // i18n.js ignores unknown codes
    }
  } catch {}
}

export function saveSettings() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {}
}
