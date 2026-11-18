// Sound roles: CONFIG.sfx maps a role ('door', 'painting', ...) to a name prefix under assets/audio. Every sound
// whose name starts with that prefix (from assets/audio/index.json) is in the role's pool, so dropping
// audio-src/sfx/painting07.ogg into the folder adds it automatically. play(role) picks one at random and avoids
// repeating the previous pick.
// preload: 'all'  = decode the whole pool at boot (short sounds)
//          'one'  = keep ONE random sound decoded; after it plays, swap in another (long sounds: saves memory)
//          'none' = registered only; decoded the first time it is played (it then plays late, once)
// bus: mixer bus (src/audio.js), 'sfx' by default; 'outside' = muffled with the weather where no window is open
import { CONFIG } from './config.js';
import { loadSfx, playSfx, hasSfx, unloadSfx, audioNamesWithPrefix } from './audio.js';

const roles = new Map(); // role -> { names, preload, volume, bus, last }
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export async function initSfx() {
  const jobs = [];
  for (const [role, def] of Object.entries(CONFIG.sfx)) {
    const names = audioNamesWithPrefix(def.files);
    if (!names.length) console.warn(`[casa] sfx "${role}": no sounds start with "${def.files}"`);
    const r = { names, preload: def.preload ?? 'all', volume: def.volume ?? 1, bus: def.bus ?? 'sfx', last: null };
    roles.set(role, r);
    if (r.preload === 'all') jobs.push(names);
    if (r.preload === 'one' && names.length) jobs.push([pick(names)]);
  }
  await loadSfx([...new Set(jobs.flat())]);
}

// delay in seconds. Returns the played sound's duration (s), or undefined if nothing played.
export function playRole(role, delay = 0) {
  const r = roles.get(role);
  if (!r || !r.names.length) return;
  const ready = r.names.filter(hasSfx);
  if (!ready.length) {
    // Nothing decoded yet ('none', or the 'one' load failed): decode one and play it when it's ready.
    const name = pick(r.names);
    loadSfx([name]).then(() => playSfx(name, r.volume, 0, r.bus));
    return;
  }
  const options = ready.length > 1 ? ready.filter((n) => n !== r.last) : ready;
  const name = pick(options);
  r.last = name;
  const dur = playSfx(name, r.volume, delay, r.bus);
  if (r.preload === 'one' && r.names.length > 1) {
    // Swap: decode a different one for next time, then free this one (a playing source keeps its own buffer).
    const next = pick(r.names.filter((n) => n !== name));
    loadSfx([next]).then(() => unloadSfx(name));
  }
  return dur;
}
