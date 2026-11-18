// Level ambience: the level's looping bed (world.ambience, picked by generateWorld) plus random
// one-shot sounds from CONFIG.ambience.random.pool at random intervals. One-shots use Math.random
// (not the world seed) on purpose: they should not repeat identically for the same seed.
import { CONFIG } from './config.js';
import { playLoop, playSfx, audioUnlocked, audioNamesWithPrefix, duckLoop, primeLoop, muffleOutside } from './audio.js';

let timer = 0;
let lastShot = null;
let silent = false, onSilence = null;

// The CONFIG prefixes resolved against assets/audio/index.json (call after loadAudioIndex()).
export const ambienceLoops = () => audioNamesWithPrefix(CONFIG.ambience.loops);
export const ambiencePool = () => audioNamesWithPrefix(CONFIG.ambience.random.pool);

const between = ([a, b]) => a + Math.random() * (b - a);

// Start (or switch to) the ambience of this world/level: its loop, and its weather's loop (CONFIG.weather.loops; none
// for weather 'none' or a missing sound).
export function setLevelAmbience(world) {
  const a = CONFIG.ambience, W = CONFIG.weather;
  playLoop(world.ambience, { volume: a.loopVolume, fadeIn: a.fadeInS, fadeOut: a.fadeOutS });
  const known = (n) => n && audioNamesWithPrefix(n).includes(n);
  const name = W.loops[world.weather] ?? null;
  if (name && !known(name)) console.warn(`[casa] weather "${world.weather}": no sound named "${name}"`);
  primeLoop('weather', Object.values(W.loops).find(known));
  playLoop(known(name) ? name : null, { volume: W.loopVolume, fadeIn: W.fadeInS, fadeOut: W.fadeOutS }, 'weather');
}

// Outside sounds (weather loop, thunder, wind) clear in a room with an open window, muffled anywhere else.
export function setOutside(open) {
  muffleOutside(!open, CONFIG.weather.muffle);
}

// Begin the random one-shot and silence timers (call once, after unlockAudio()). silenceHook() is asked before
// each silence: false skips it (e.g. a menu is open); it can also bring a ghost (CONFIG.ambience.silence.ghostChance).
export function startRandomAmbience(silenceHook = null) {
  if (timer) return;
  onSilence = silenceHook;
  schedule(CONFIG.ambience.random.firstDelayS);
  setTimeout(trySilence, between(CONFIG.ambience.silence.firstDelayS) * 1000);
}

function trySilence() {
  const S = CONFIG.ambience.silence;
  if (audioUnlocked() && !document.hidden && Math.random() < S.chance) startSilence();
  setTimeout(trySilence, between(S.gapS) * 1000);
}

// The loop fades out for a while (no one-shots meanwhile), then comes back. Exported for the debug overlay.
export function startSilence() {
  const S = CONFIG.ambience.silence;
  if (silent || onSilence?.() === false) return false;
  silent = true;
  duckLoop(true, S.fadeOutS);
  setTimeout(() => {
    silent = false;
    duckLoop(false, S.fadeInS);
  }, (S.fadeOutS + between(S.holdS)) * 1000);
  return true;
}

function schedule(range) {
  timer = setTimeout(fire, between(range) * 1000);
}

// Plays one random one-shot now. Exported for the debug overlay.
export function playRandomAmbience() {
  const r = CONFIG.ambience.random;
  const pool = ambiencePool();
  if (!pool.length) return null;
  // Avoid the same sound twice in a row when there is a choice.
  const options = pool.length > 1 ? pool.filter((n) => n !== lastShot) : pool;
  const name = options[(Math.random() * options.length) | 0];
  lastShot = name;
  playSfx(name, between(r.volume), 0, 'ambience');
  return name;
}

function fire() {
  const r = CONFIG.ambience.random;
  if (audioUnlocked() && !document.hidden && !silent && Math.random() < r.chance) playRandomAmbience();
  schedule(r.gapS);
}
