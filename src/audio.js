// Audio. tools/audio.mjs emits <name>.ogg (Opus) + <name>.m4a (AAC); each device fetches ONE.
// Short SFX -> decodeAudioData buffers (Web Audio), decoded at boot.
// Long ambience/music -> streamed <audio> element via playLoop() (decoded PCM costs ~23 MB per stereo minute).
let ext = null;

export function audioExt() {
  if (ext) return ext;
  const a = document.createElement('audio');
  ext = a.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
  return ext;
}

// name is relative to assets/audio without extension, e.g. 'sfx/creak01'
export const audioUrl = (name) => `assets/audio/${name}.${audioExt()}`;

const AC = window.AudioContext || window.webkitAudioContext;
const ctx = AC ? new AC() : null;
const buffers = new Map();

// Mixer: every sound -> 'sfx' or 'ambience' bus -> 'master' bus -> speakers. setVolumes() drives the bus gains
// (main menu > Options). vols holds the gains too, for the no-Web-Audio fallback (bed element volume).
const vols = { master: 1, sfx: 1, ambience: 1 };
let buses = null;
function bus(name) {
  if (!buses) {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    buses = { master, sfx: ctx.createGain(), ambience: ctx.createGain() };
    buses.sfx.connect(master);
    buses.ambience.connect(master);
  }
  return buses[name];
}

// Slider positions 0..1 -> gains. Squared: a rough loudness curve, so 50% sounds about half as loud.
export function setVolumes(s) {
  for (const k of ['master', 'sfx', 'ambience']) {
    vols[k] = Math.max(0, Math.min(1, s[k])) ** 2;
    if (ctx) bus(k).gain.setTargetAtTime(vols[k], ctx.currentTime, 0.02);
  }
  if (bed && !bed.gain) bed.el.volume = bedVolume * vols.master * vols.ambience;
}

// Fetch + decode SFX. Missing/undecodable files only warn, so audio never blocks the game.
export async function loadSfx(names) {
  if (!ctx) return;
  await Promise.all(names.map(async (name) => {
    try {
      const res = await fetch(audioUrl(name));
      if (!res.ok) throw new Error(res.status);
      const data = await res.arrayBuffer();
      // Callback form for old Safari (no promise-returning decodeAudioData).
      buffers.set(name, await new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)));
    } catch (e) {
      console.warn('[casa] sfx failed', name, e);
    }
  }));
}

export const hasSfx = (name) => buffers.has(name);
export const unloadSfx = (name) => buffers.delete(name);

// Every sound name tools/audio.mjs produced (assets/audio/index.json), e.g. 'sfx/painting03'.
let index = [];
export async function loadAudioIndex() {
  try {
    const r = await fetch('assets/audio/index.json');
    if (!r.ok) throw new Error(r.status);
    index = await r.json();
  } catch (e) {
    console.warn('[casa] no audio index (run npm run audio)', e);
  }
}
export const audioNamesWithPrefix = (prefix) => index.filter((n) => n.startsWith(prefix));

// delay: seconds from now (sample-accurate, so stacked sounds don't mask each other). Returns the duration (s).
// to: mixer bus, 'sfx' or 'ambience'.
export function playSfx(name, volume = 1, delay = 0, to = 'sfx') {
  const buf = buffers.get(name);
  if (!ctx || !buf) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  let node = src;
  if (volume !== 1) {
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    node = g;
  }
  node.connect(bus(to));
  src.start(delay > 0 ? ctx.currentTime + delay : 0);
  return buf.duration;
}

// --- Looping bed (level ambience): ONE reused <audio> element, streamed (not decoded), routed through a
// GainNode for fades. Reusing one element matters on iOS: it stays "unlocked" after the first gesture play.
let unlocked = false;
let bed = null;      // { el, gain }
let bedWant = null;  // { name, volume, fadeIn, fadeOut }: last requested bed (kept so unlock can start it)
let bedName = null;  // what the element currently holds
let bedToken = 0;    // invalidates pending swaps when a newer request arrives
let bedVolume = 0;   // target volume of the fallback (no Web Audio) path, before the mixer

function getBed() {
  if (bed) return bed;
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  let gain = null;
  if (ctx) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gain);
    gain.connect(bus('ambience'));
  }
  return (bed = { el, gain });
}

// Ramp bed volume to v over s seconds. Without Web Audio, falls back to a hard element.volume set.
function rampBed(v, s) {
  const { el, gain } = getBed();
  if (!gain) { bedVolume = v; el.volume = v * vols.master * vols.ambience; return; }
  const g = gain.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + Math.max(0.01, s));
}

function startBed() {
  const want = bedWant;
  if (!want || !unlocked) return;
  const b = getBed();
  const token = ++bedToken;
  const begin = () => {
    if (token !== bedToken) return;
    if (bedName !== want.name) {
      bedName = want.name;
      b.el.src = audioUrl(want.name);
    }
    b.el.play().catch((e) => console.warn('[casa] ambience failed', want.name, e));
    rampBed(want.volume, want.fadeIn);
  };
  if (bedName && bedName !== want.name && !b.el.paused) {
    rampBed(0, want.fadeOut);
    setTimeout(begin, want.fadeOut * 1000);
  } else begin();
}

// Request the looping ambience. Safe to call before unlockAudio(): it starts on unlock.
// Same name as the current bed -> keeps playing (no restart); different -> fade out, swap, fade in.
export function playLoop(name, { volume = 1, fadeIn = 2, fadeOut = 1.5 } = {}) {
  bedWant = name ? { name, volume, fadeIn, fadeOut } : null;
  if (!bedWant) {
    ++bedToken;
    if (bed) rampBed(0, fadeOut);
    return;
  }
  if (bedName === name && bed && !bed.el.paused) { rampBed(volume, fadeIn); return; }
  startBed();
}

// Fade the looping ambience out (silent = true) or back to its volume, over s seconds. A new playLoop() also
// brings it back.
export function duckLoop(silent, s) {
  if (!bed || !bedWant) return;
  rampBed(silent ? 0 : bedWant.volume, s);
}

export const audioUnlocked = () => unlocked;

// Call from a user gesture (start overlay). Browsers create the context suspended, and media
// elements may only start playing from a gesture.
export function unlockAudio() {
  unlocked = true;
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  startBed();
}

// Mobile: silence everything while the tab is in the background.
document.addEventListener('visibilitychange', () => {
  if (!unlocked) return;
  if (document.hidden) {
    ctx?.suspend().catch(() => {});
    bed?.el.pause();
  } else {
    ctx?.resume().catch(() => {});
    if (bedWant && bed && bedName === bedWant.name) bed.el.play().catch(() => {});
  }
});
