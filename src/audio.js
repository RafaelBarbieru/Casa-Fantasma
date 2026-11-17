// Audio format selection. tools/audio.mjs emits <name>.ogg (Opus) + <name>.m4a (AAC); each device fetches ONE.
// Not wired into gameplay yet. Plan: short SFX -> decodeAudioData buffers (Web Audio);
// long ambience/music -> streamed <audio> element (decoded PCM costs ~23 MB per stereo minute).
let ext = null;

export function audioExt() {
  if (ext) return ext;
  const a = document.createElement('audio');
  ext = a.canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a';
  return ext;
}

// name is relative to assets/audio without extension, e.g. 'sfx/creak01'
export const audioUrl = (name) => `assets/audio/${name}.${audioExt()}`;
