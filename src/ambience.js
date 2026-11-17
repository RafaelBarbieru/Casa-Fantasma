// Level ambience: the level's looping bed (world.ambience, picked by generateWorld) plus random
// one-shot sounds from CONFIG.ambience.random.pool at random intervals. One-shots use Math.random
// (not the world seed) on purpose: they should not repeat identically for the same seed.
import { CONFIG } from './config.js';
import { playLoop, playSfx, audioUnlocked } from './audio.js';

let timer = 0;
let lastShot = null;

const between = ([a, b]) => a + Math.random() * (b - a);

// Start (or switch to) the ambience of this world/level.
export function setLevelAmbience(world) {
  const a = CONFIG.ambience;
  playLoop(world.ambience, { volume: a.loopVolume, fadeIn: a.fadeInS, fadeOut: a.fadeOutS });
}

// Begin the random one-shot timer (call once, after unlockAudio()).
export function startRandomAmbience() {
  if (timer) return;
  schedule(CONFIG.ambience.random.firstDelayS);
}

function schedule(range) {
  timer = setTimeout(fire, between(range) * 1000);
}

// Plays one random one-shot now. Exported for the debug overlay.
export function playRandomAmbience() {
  const r = CONFIG.ambience.random;
  const pool = r.pool;
  if (!pool.length) return null;
  // Avoid the same sound twice in a row when there is a choice.
  const options = pool.length > 1 ? pool.filter((n) => n !== lastShot) : pool;
  const name = options[(Math.random() * options.length) | 0];
  lastShot = name;
  playSfx(name, between(r.volume));
  return name;
}

function fire() {
  const r = CONFIG.ambience.random;
  if (audioUnlocked() && !document.hidden && Math.random() < r.chance) playRandomAmbience();
  schedule(r.gapS);
}
