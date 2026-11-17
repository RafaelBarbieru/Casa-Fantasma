// Global tunables. Scene units = pixels of the 1920x1080 reference room image.
export const CONFIG = {
  sceneW: 1920,
  sceneH: 1080,

  // Backbuffer limits (perf on mobile / hi-dpi). Letterboxed viewport never exceeds maxViewportW backbuffer px.
  maxDpr: 2,
  maxViewportW: 2560,

  // Rooms are built from tiling textures (data/surfaces.json): wall on top, floor in perspective below.
  room: {
    floorLine: 0.8,     // where the wall meets the floor, as a fraction of the screen height from the top
    horizonY: 500,      // eye level (scene px). The floor's lines converge here; lower = steeper floor
    seam: [0.55, 40],   // darkening where wall meets floor: [strength 0..1, width in scene px]
    wallMargin: 30,     // wall items (paintings) keep at least this many px above the floor line
  },

  // When a key is found, the item sound plays this long after the painting sound.
  itemSfxDelayS: 0.35,

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
    // Glow for things with nothing left to find: a searched painting, or a door whose rooms behind it have all
    // been fully explored (every painting searched, every door opened). Duller and still.
    explored: {
      color: [0.55, 0.62, 0.7],
      strength: 0.6,
      pulse: 0,
      brighten: 0.03,
    },
  },

  transition: {
    outS: 0.35,
    inS: 0.7,
    winOutS: 1.6,       // slow fade after the master door
    winHoldS: 3,        // "Level N" card before the next level starts (a tap skips it)
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
  // Every level has ONE master door (its key takes you to the next level). From level 2 on there are also
  // side doors: locked rooms whose key is somewhere in the level; behind one of them may be the master key,
  // the others hold nothing useful.
  maze: {
    startDoors: 3,         // doors in the first room
    doors: [2, 3],         // doors in every other door room
    paintings: [1, 4],     // paintings in a painting room
    openRooms: [3, 6],     // rooms reachable without any key (not counting the first room)
    sideRooms: [1, 3],     // rooms behind each locked side door
    sideLocks: [0, 1, 2, 3], // locked side doors per level: level 1, 2, 3, 4+ (the last value repeats)
    masterBehindChance: 0.6, // with side doors: chance the master key is behind one of them
    doorRoomChance: 0.45,  // when a door leads to a new room: chance it is a door room (else paintings)
  },

  // HUD (drawn in the low-res framebuffer with a built-in pixel font).
  hud: {
    textCps: 45,        // typewriter speed, characters per second
    messageS: 3.2,      // how long a message stays after it is fully typed
    back: { x: 960, y: 1015, w: 220, h: 100 }, // "go back" arrow hotspot, scene px
    pills: { x: 1800, y: 75, w: 240, h: 130 },  // pill icon + count (top right) and its tap hotspot, scene px
  },

  // Sound effects: role -> every sound whose name (path in audio-src/, no extension) starts with `files`.
  // One is picked at random each time. preload: 'all' (default, short sounds) | 'one' (long sounds, keeps one
  // decoded at a time) | 'none' (not decoded until first played). Optional volume 0..1. See src/sfx.js.
  sfx: {
    door: { files: 'sfx/door' },                // opening a door (also going back)
    locked: { files: 'sfx/locked' },            // trying a locked door without its key
    painting: { files: 'sfx/painting' },        // looking behind a painting
    item: { files: 'sfx/item' },                // picking up an item (a key)
    levelEnd: { files: 'sfx/level_end' },       // the master door opens
    levelStart: { files: 'sfx/level_start', preload: 'one' }, // a level begins
    flashlight: { files: 'sfx/flashlight' },     // the flashlight dies when a ghost appears
    ghostSpotted: { files: 'sfx/ghost_spotted', preload: 'one' }, // the ghost fades in
    heartbeatSlow: { files: 'sfx/heartbeat_slow' },
    heartbeatFast: { files: 'sfx/heartbeat_fast' },
    screamer: { files: 'sfx/screamer' },        // health reached 0
    healed: { files: 'sfx/healed' },            // a pill is taken
  },

  // Ghosts (data/ghosts.json). Per-level lists: index 0 = level 1, the last value repeats.
  ghost: {
    roomChance: [0, 0.3, 0.35, 0.4, 0.45, 0.5], // chance a dead-end door leads to a ghost-only (black) room.
                                                 // Levels with a chance > 0 get at least one when possible.
    randomPerMin: [0, 0, 1, 1.5, 2, 2.5],       // random ghost appearances per minute spent in a room (not the
                                                 // first room of a level, not ghost rooms). 0 = never.
    graceS: 2,          // no random ghost in the first seconds after entering a room
    lingerS: [1, 10],   // after you escape a random ghost, it stays in that room this long (random in range)
    drainPerS: 0.12,    // health lost per second in a room with a ghost (0.12 = dead in ~8 s)
    regenPerS: 0,       // health regained per second away from ghosts (0 = never heals)
    lampOffS: 0.3,      // the flashlight flickers this long, then dies
    fadeDelayS: 0.4,    // then the ghost starts to fade in...
    fadeInS: 1.5,       // ...over this long
    gain: 3.2,          // ghost brightness (the art is very dark; the PS1 color reduction eats faint detail)
    drift: 10,          // slow floating movement, scene px
  },

  // Pills (art: data/items.json "health"), hidden behind paintings that hold no key. They are kept until used
  // (also across levels; lost on death). Tapping the pill icon at the top right takes one.
  pills: {
    heal: 0.5,          // health restored per pill, as a fraction of FULL health (capped at 100%)
    // Pills hidden per level (index 0 = level 1, the last value repeats). The whole part is always placed, the
    // fraction is the chance of one more: 0.35 = a 35% chance of one pill, 1.5 = one pill plus a 50% chance of a
    // second. Kept rare early (one pill heals most of the way) and rising with the ghosts (config.ghost).
    perLevel: [0, 0.35, 0.6, 1, 1.3, 1.6],
  },

  // Hidden health is only heard: nothing above `start`; slow heartbeat down to `fastBelow`, fast heartbeat below.
  // Gap between beats (s) goes from the first value to the second as health falls through each band.
  heartbeat: {
    start: 0.95,
    fastBelow: 0.5,
    slowGapS: [1.0, 0.3],
    fastGapS: [0.6, 0.05],
  },

  // Health 0: a screamer image (data/ghosts.json) flashes while a screamer sound plays, then the game restarts at level 1.
  screamer: {
    holdS: 3.2,
    flashHz: 12,
  },

  // Level ambience. Like sfx, every sound whose name (path in audio-src/, no extension) starts with the prefix is used.
  ambience: {
    // Each level gets ONE of these as its looping background, picked at random (from the world seed),
    // never the same one as the previous level (when there are at least two).
    loops: 'ambience/level',
    loopVolume: 0.7,
    fadeInS: 4,         // fade in when the level starts
    fadeOutS: 2,        // fade out of the old loop when a new level picks a different one

    // Random one-shot sounds played over the loop, with no event behind them.
    random: {
      pool: 'ambience/random',
      firstDelayS: [20, 40], // [min, max] seconds before the first one after entering the game
      gapS: [25, 60],        // [min, max] seconds between attempts
      chance: 0.8,           // 0..1 probability that an attempt actually plays (adds irregularity)
      volume: [0.4, 0.8],    // [min, max] random volume per play
    },
  },
};
