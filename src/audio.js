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
// 'outside' = sounds from outside the house (thunder, wind): low-pass filter -> gain -> 'sfx', muffled by
// muffleOutside() together with the 'weather' bed.
const vols = { master: 1, sfx: 1, ambience: 1 };
const OPEN_HZ = 20000; // low-pass cutoff when not muffled (transparent)
let buses = null;
function bus(name) {
  if (!buses) {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    buses = { master, sfx: ctx.createGain(), ambience: ctx.createGain() };
    buses.sfx.connect(master);
    buses.ambience.connect(master);
    buses.outside = lowpass();
    buses.outsideGain = ctx.createGain();
    buses.outside.connect(buses.outsideGain);
    buses.outsideGain.connect(buses.sfx);
  }
  return buses[name];
}

function lowpass() {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = OPEN_HZ;
  return f;
}

// Slider positions 0..1 -> gains. Squared: a rough loudness curve, so 50% sounds about half as loud.
export function setVolumes(s) {
  for (const k of ['master', 'sfx', 'ambience']) {
    vols[k] = Math.max(0, Math.min(1, s[k])) ** 2;
    if (ctx) bus(k).gain.setTargetAtTime(vols[k], ctx.currentTime, 0.02);
  }
  for (const b of beds.values()) if (!b.gain) b.el.volume = b.volume * vols.master * vols.ambience;
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

// --- Looping beds: 'level' (the level ambience) and 'weather' (wind / rain, muffled indoors: muffleOutside()).
// Each is ONE reused <audio> element, streamed (not decoded), routed through a low-pass filter and a GainNode (fades).
// Reusing elements matters on iOS: an element stays "unlocked" after its first play from a gesture (see primeLoop).
let unlocked = false;
const OUTSIDE = new Set(['weather']); // beds that muffleOutside() muffles
const muffle = { on: false, hz: 450, gain: 0.6 };
// key -> { el, gain, filter, want: { name, volume, fadeIn, fadeOut } | null (last request, kept so unlock can start
// it), name (what the element holds), token (invalidates pending swaps), ducked, prime (iOS, see primeLoop), volume
// (fallback without Web Audio: target before the mixer) }
const beds = new Map();

function getBed(key) {
  let b = beds.get(key);
  if (b) return b;
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  b = { key, el, gain: null, filter: null, want: null, name: null, token: 0, ducked: false, prime: null, volume: 0 };
  if (ctx) {
    b.filter = lowpass();
    b.gain = ctx.createGain();
    b.gain.gain.value = 0;
    ctx.createMediaElementSource(el).connect(b.filter);
    b.filter.connect(b.gain);
    b.gain.connect(bus('ambience'));
    if (OUTSIDE.has(key) && muffle.on) b.filter.frequency.value = muffle.hz;
  }
  beds.set(key, b);
  return b;
}

// Volume the bed should be at now: its requested volume, unless ducked (silences) or muffled.
const bedTarget = (b) => (!b.want || b.ducked ? 0 : b.want.volume * (OUTSIDE.has(b.key) && muffle.on ? muffle.gain : 1));

// Ramp bed volume to v over s seconds. Without Web Audio, falls back to a hard element.volume set.
function rampBed(b, v, s) {
  if (!b.gain) { b.volume = v; b.el.volume = v * vols.master * vols.ambience; return; }
  const g = b.gain.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(v, t + Math.max(0.01, s));
}

function startBed(b) {
  const want = b.want;
  if (!want || !unlocked) return;
  const token = ++b.token;
  const begin = () => {
    if (token !== b.token) return;
    if (b.name !== want.name) {
      b.name = want.name;
      b.el.src = audioUrl(want.name);
    }
    b.el.play().catch((e) => console.warn('[casa] ambience failed', want.name, e));
    rampBed(b, bedTarget(b), want.fadeIn);
  };
  if (b.name && b.name !== want.name && !b.el.paused) {
    rampBed(b, 0, want.fadeOut);
    setTimeout(begin, want.fadeOut * 1000);
  } else begin();
}

// Request a looping bed (key 'level' or 'weather'); name null = fade it out and stop. Safe to call before
// unlockAudio(): it starts on unlock. Same name as now -> keeps playing (no restart); different -> fade out, swap,
// fade in.
export function playLoop(name, { volume = 1, fadeIn = 2, fadeOut = 1.5 } = {}, key = 'level') {
  const b = getBed(key);
  b.want = name ? { name, volume, fadeIn, fadeOut } : null;
  b.ducked = false;
  if (!b.want) {
    const token = ++b.token;
    rampBed(b, 0, fadeOut);
    setTimeout(() => token === b.token && b.el.pause(), fadeOut * 1000);
    return;
  }
  if (b.name === name && !b.el.paused) { rampBed(b, bedTarget(b), fadeIn); return; }
  startBed(b);
}

// iOS: a bed with nothing to play at the first gesture (e.g. no weather on the first level) is still played once,
// silently, with this sound, so later levels may start it outside a gesture.
export function primeLoop(key, name) {
  if (name) getBed(key).prime = name;
}

// Fade every looping bed out (silent = true) or back to its volume, over s seconds. A new playLoop() also
// brings it back.
export function duckLoop(silent, s) {
  for (const b of beds.values()) {
    if (!b.want) continue;
    b.ducked = silent;
    rampBed(b, bedTarget(b), s);
  }
}

// Sounds from outside (the 'weather' bed and the 'outside' sfx bus): muffled = low-pass at hz and turned down to
// gain, as heard through the walls; otherwise clear. s = how long the change takes.
export function muffleOutside(on, { hz = 450, gain = 0.6, s = 0.5 } = {}) {
  if (on === muffle.on && hz === muffle.hz && gain === muffle.gain) return;
  Object.assign(muffle, { on, hz, gain });
  if (!ctx) {
    for (const b of beds.values()) if (OUTSIDE.has(b.key) && b.want) rampBed(b, bedTarget(b), s);
    return;
  }
  const t = ctx.currentTime, tc = Math.max(0.01, s) / 3; // setTargetAtTime gets ~95% there after 3 time constants
  bus('outside').frequency.setTargetAtTime(on ? hz : OPEN_HZ, t, tc);
  bus('outsideGain').gain.setTargetAtTime(on ? gain : 1, t, tc);
  for (const b of beds.values()) {
    if (!OUTSIDE.has(b.key)) continue;
    b.filter.frequency.setTargetAtTime(on ? hz : OPEN_HZ, t, tc);
    if (b.want) rampBed(b, bedTarget(b), s);
  }
}

export const audioUnlocked = () => unlocked;

// Call from a user gesture (start overlay). Browsers create the context suspended, and media
// elements may only start playing from a gesture.
export function unlockAudio() {
  unlocked = true;
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  for (const b of beds.values()) {
    if (b.want) startBed(b);
    else if (b.prime && !b.name) {
      b.name = b.prime;
      b.el.src = audioUrl(b.prime);
      b.el.play().then(() => !b.want && b.el.pause()).catch(() => {});
    }
  }
}

// Mobile: silence everything while the tab is in the background.
document.addEventListener('visibilitychange', () => {
  if (!unlocked) return;
  if (document.hidden) ctx?.suspend().catch(() => {});
  else ctx?.resume().catch(() => {});
  for (const b of beds.values()) {
    if (document.hidden) b.el.pause();
    else if (b.want && b.name === b.want.name) b.el.play().catch(() => {});
  }
});
