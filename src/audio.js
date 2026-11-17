// Audio. tools/audio.mjs emits <name>.ogg (Opus) + <name>.m4a (AAC); each device fetches ONE.
// Short SFX -> decodeAudioData buffers (Web Audio), decoded at boot.
// Long ambience/music (later) -> streamed <audio> element (decoded PCM costs ~23 MB per stereo minute).
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

// Call from a user gesture (start overlay). Browsers create the context suspended.
export function unlockAudio() {
  if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
}

export function playSfx(name, volume = 1) {
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
  node.connect(ctx.destination);
  src.start(0);
}
