// Global tunables. Scene units = pixels of the 1920x1080 reference room image.
export const CONFIG = {
  sceneW: 1920,
  sceneH: 1080,

  // Backbuffer limits (perf on mobile / hi-dpi). Letterboxed viewport never exceeds maxViewportW backbuffer px.
  maxDpr: 2,
  maxViewportW: 2560,

  // Duration (s) of the shake when a locked door is tried.
  lockedShakeS: 0.35,

  // Transparent border added around item sprites so shadow + glow have room to spill (native sprite px).
  spritePad: 48,
  // Alpha threshold (0-255) for pixel-perfect hit testing.
  hitAlpha: 40,
  // Extra hit tolerance for touch, in scene px (fingers are fat).
  touchSlop: 24,

  flashlight: {
    radius: 340,        // scene px where the beam reaches darkness
    softness: 0.6,      // 0..1 fraction of radius used for the falloff edge
    ambient: 0.05,      // brightness outside the beam
    gain: 1.0,          // beam brightness multiplier
    hotspot: 0.25,      // extra brightness at the beam center
    tint: [1.0, 0.94, 0.82],
    follow: 14,         // exponential follow rate (1/s) of beam toward pointer
    handOffset: [60, 160], // light source offset from beam point (flashlight held low-right) -> drives shadow direction
  },

  shadow: {
    strength: 0.7,
    perDepth: 0.0035,   // offset = (itemCenter - lightSource) * depth * perDepth
    maxOffset: 40,      // scene px
    blurBias: 2.4,      // mip bias (blur) base
    blurPerDepth: 0.12, // extra mip bias per depth unit
  },

  glow: {
    color: [1.0, 0.86, 0.6],
    strength: 1.5,
    bias: 3.5,          // mip bias used to spread the alpha outward
    rate: 10,           // fade in/out rate (1/s)
    pulse: 0.2,         // pulse amplitude while hovered
    brighten: 0.15,     // item self-brighten while hovered
  },

  transition: {
    outS: 0.35,
    inS: 0.7,
    winOutS: 1.6,       // slow fade after the exit door
    winHoldS: 4,        // "you escaped" card before the next level (a tap skips it)
  },

  // PS1 look: the scene renders into a small framebuffer, then is upscaled with hard pixels and
  // reduced to 15-bit color (5 bits per channel) with a 4x4 ordered dither, like the console's.
  ps1: {
    enabled: true,
    width: 480,         // internal resolution (height follows 16:9). 320-640 is the PS1 range.
    colorBits: 5,       // bits per channel. 5 = PS1. 8 = no banding.
    dither: 1,          // 0..1 strength of the ordered dither
    snap: true,         // snap sprites + light to whole low-res pixels (PS1 had no sub-pixel precision)
  },

  // Maze generator (src/world.js). Ranges are [min, max] inclusive.
  maze: {
    locks: 3,              // locked doors in a level. The last one is the exit.
    startDoors: 3,         // doors in the first room
    doors: [2, 3],         // doors in every other door room
    paintings: [1, 4],     // paintings in a painting room
    roomsPerStage: [2, 4], // rooms opened up by each key (before the next locked door)
    doorRoomChance: 0.45,  // when a door leads to a new room: chance it is a door room (else paintings)
  },

  // HUD (drawn in the low-res framebuffer with a built-in pixel font).
  hud: {
    textCps: 45,        // typewriter speed, characters per second
    messageS: 3.2,      // how long a message stays after it is fully typed
    back: { x: 960, y: 1015, w: 220, h: 100 }, // "go back" arrow hotspot, scene px
  },

  // Sound effects: role -> path under assets/audio (no extension). All are decoded at boot.
  sfx: {
    itemClick: 'sfx/keypress_01',  // painting searched
    doorOpen: 'sfx/keypress_01',
    doorLocked: 'sfx/keypress_01',
    doorUnlock: 'sfx/keypress_01',
    keyFound: 'sfx/keypress_01',
    back: 'sfx/keypress_01',
  },

  // Level ambience. Names are paths under audio-src without .wav (same as sfx).
  ambience: {
    // Each level gets ONE of these as its looping background, picked at random (from the world seed).
    loops: ['ambience/unease01'],
    loopVolume: 0.7,
    fadeInS: 4,         // fade in when the level starts
    fadeOutS: 2,        // fade out of the old loop when a new level picks a different one

    // Random one-shot sounds played over the loop.
    random: {
      pool: ['ambience/monster_distant01', 'ambience/whisper01_left', 'ambience/whisper01_right'],
      firstDelayS: [20, 40], // [min, max] seconds before the first one after entering the game
      gapS: [25, 60],        // [min, max] seconds between attempts
      chance: 0.8,           // 0..1 probability that an attempt actually plays (adds irregularity)
      volume: [0.4, 0.8],    // [min, max] random volume per play
    },
  },
};
