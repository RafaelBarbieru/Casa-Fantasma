// Global tunables. Scene units = pixels of the 1920x1080 reference room image.
// Per-level values: a list where index 0 = level 1 and the last value repeats; a single value applies to every level.
export const atLevel = (v, level) => (Array.isArray(v) ? v[Math.min(Math.max(level, 1), v.length) - 1] : v);

export const CONFIG = {
  // Levels in a run. Finishing the last one ends the game (an "escaped" card, then the main menu).
  // Every per-level list below has one value per level (1..10): levels 1-5 ease you in, 6-10 get hard fast.
  // Difficulty rises only through chances and rates (how often things go wrong) and maze size; base values like
  // health, damage, healing and time to react stay the same on every level.
  levels: 10,

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

  // Paintings (src/game.js). Tapping one makes it slip off a nail and swing, uncovering the wall behind it; a key or
  // pill hidden there then has to be tapped to take it. Some paintings fall to the floor and crack instead (sfx fall).
  paintings: {
    tiltDeg: [18, 30],  // how far a slipping painting swings (random in range, random side). It hangs from the nail
                        // on the other side, and the free side drops: the item behind is on that side.
    minDrop: 25,        // it also slides down at least this many scene px (more when needed to uncover the item)
    lootMargin: 14,     // gap kept between the uncovered item and the slipped painting, scene px
    lootTop: 18,        // the hidden item sits this far below the painting's top edge, scene px
    tiltS: 0.9,         // slip + swing animation
    fallChance: 0.05,    // chance a painting falls to the floor and cracks instead (also when it can't slip far enough)
    fallDeg: [3, 10],   // tilt of a fallen painting
    fallS: 0.3,         // fall time (it accelerates)
    bounceS: 0.22,      // small bounce after hitting the floor...
    bounce: 16,         // ...this high, scene px
    floorSink: 28,      // its lowest corner rests this far below the floor line (in front of the wall)
    fallSfxDelayS: 0,   // delay of the fall sound after the tap (fallS = exactly at impact)
    crackPx: 5,         // crack line width, scene px (one PS1 pixel is 4)
    crackDarken: 0.85,  // 0..1 how dark the cracks are
    fallenGain: 0.8,    // a fallen painting is a bit darker
  },

  // False alarms: the light flickers and dies exactly as when a ghost comes (same sound), stays dark a moment, then
  // comes back and nothing happens. Not in a level's first room or ghost rooms. Per-level lists: index 0 = level 1.
  falseAlarm: {
    perMin: [0, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2], // false alarms per minute spent in a room (0 = never)
    graceS: 3,          // never in the first seconds after entering a room (or right after another one)
    darkS: [1.2, 2.8],  // [min, max] seconds the light stays off; longer than a ghost takes to show up
    backS: 0.7,         // the light flickers back on over this long
  },

  // Posters (data/items.json "kind": "poster", src/game.js). Each tap scratches a piece off, ripping outward from a
  // random point on the poster's edge; once the hidden key or pill is uncovered it can be taken. When a poster has
  // no scratches left it is destroyed: a few scraps stay on the wall, and it glows dull like a moved painting.
  posters: {
    scratches: [3, 8],  // taps it takes to destroy a poster (random in range, inclusive, rolled on the first tap)
    lootAt: [0.3, 1],   // where the hidden item sits, as the share of the poster that must be torn to uncover it
                        // (random in range). 1 = only once the poster is destroyed.
    leftover: 0.25,     // share of the poster still on the wall when destroyed (0 = torn off completely)
    jagged: 0.18,       // how ragged the torn edge is (0 = a smooth curve)
    rim: 0.02,          // width of the light torn-paper edge (0 = none)
    paper: [0.5, 0.46, 0.37], // colour of that edge (the flashlight brightens it)
    tearS: 0.35,        // how fast each scratch tears its piece off
    shake: 0.4,         // how much the poster jolts on each scratch (0..1 of a locked door's shake)
  },

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
    outS: 0.25,
    inS: 0.5,
    winOutS: 1.5,       // slow fade after the master door
    winHoldS: 2,        // "Level N" card before the next level starts (a tap skips it)
    // Sometimes, going through a door (not back), the screen stays black a while before the next room shows
    // (sfx doorWait plays then, if it has sounds). Per level (index 0 = level 1, the last value repeats).
    waitChance: [0.0, 0.1, 0.1, 0.2, 0.2, 0.25, 0.25, 0.3, 0.35, 0.4],
    waitS: [0.5, 2.5],  // [min, max] seconds of black
    waitAmbience: 0.5,  // chance one of the random ambience sounds (ambience.random.pool) plays in that black
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

  // Maze generator (src/world.js). Ranges are [min, max] inclusive. openRooms, sideRooms, sideLocks: per level.
  // Every level has ONE master door (its key takes you to the next level). From level 2 on there are also
  // side doors: locked rooms whose key is somewhere in the level; behind one of them may be the master key,
  // the others hold nothing useful.
  maze: {
    startDoors: 3,         // doors in the first room
    doors: [2, 3],         // doors in every other door room
    paintings: [1, 4],     // paintings in a painting room
    // rooms reachable without any key (not counting the first room)
    openRooms: [[3, 6], [3, 6], [3, 6], [3, 6], [3, 6], [4, 7], [4, 7], [5, 8], [5, 8], [6, 9]],
    // rooms behind each locked side door
    sideRooms: [[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [2, 3], [2, 3], [2, 4], [2, 4]],
    sideLocks: [0, 1, 2, 3, 3, 3, 4, 4, 4, 5], // locked side doors
    masterBehindChance: 0.6, // with side doors: chance the master key is behind one of them
    doorRoomChance: 0.45,  // when a door leads to a new room: chance it is a door room (else paintings)
  },

  // HUD (drawn in the low-res framebuffer with a built-in pixel font).
  hud: {
    textCps: 45,        // typewriter speed, characters per second
    messageS: 3.2,      // how long a message stays after it is fully typed
    back: { x: 960, y: 1015, w: 220, h: 100 }, // "go back" arrow hotspot, scene px
    pills: { x: 1720, y: 75, w: 200, h: 130 },  // pill icon + count (top right) and its tap hotspot, scene px
    pause: { x: 1872, y: 48, w: 96, h: 96 },    // pause button (top right corner) and its tap hotspot, scene px
    level: { x: 960, y: 40 },                   // "LEVEL N" label (centre), scene px
  },

  // Sound effects: role -> every sound whose name (path in audio-src/, no extension) starts with `files`.
  // One is picked at random each time. preload: 'all' (default, short sounds) | 'one' (long sounds, keeps one
  // decoded at a time) | 'none' (not decoded until first played). Optional volume 0..1. See src/sfx.js.
  sfx: {
    door: { files: 'sfx/door' },                // opening a door (also going back)
    locked: { files: 'sfx/locked' },            // trying a locked door without its key
    painting: { files: 'sfx/painting' },        // a painting slips
    fall: { files: 'sfx/fall' },                // a painting falls to the floor and cracks
    posterScratch: { files: 'sfx/poster_scratch' }, // a piece of a poster is scratched off
    posterTear: { files: 'sfx/poster_tear' },   // the last scratch destroys a poster
    item: { files: 'sfx/item' },                // picking up a key or pills
    levelEnd: { files: 'sfx/level_end' },       // the master door opens
    levelStart: { files: 'sfx/level_start', preload: 'one' }, // a level begins
    flashlight: { files: 'sfx/flashlight' },     // the flashlight dies (a ghost appears, or you enter a dark room)
    ghostSpotted: { files: 'sfx/ghost_spotted', preload: 'one' }, // the ghost fades in
    heartbeatSlow: { files: 'sfx/heartbeat_slow' },
    heartbeatFast: { files: 'sfx/heartbeat_fast' },
    screamer: { files: 'sfx/screamer_long' },   // health reached 0
    screamerShort: { files: 'sfx/screamer_short' }, // jumpscare when the light comes on in a screamer room
    doorWait: { files: 'sfx/door_wait' },       // the long black pause between rooms (transition.waitChance), e.g. a creak
    lightSwitch: { files: 'sfx/flashlight' },   // a dark room's light switch is turned on (same click as the flashlight)
    healed: { files: 'sfx/healed' },            // a pill is taken
    lever: { files: 'sfx/lever0' },             // a lever is pulled up or down (lever01, lever02...; not lever_fail)
    leverFail: { files: 'sfx/lever_fail' },     // lever door tried with the wrong combination: the levers snap up
    leverSuccess: { files: 'sfx/lever_success' }, // lever door tried with the right combination: it opens
    // Weather (CONFIG.weather). bus 'outside': muffled like the weather loop where no window is open.
    windGust: { files: 'sfx/wind_gust', bus: 'outside' },       // a gust of wind (windy weather)
    windowClose: { files: 'sfx/window_close', bus: 'outside' }, // the gust slams the shutters
    thunder: { files: 'sfx/thunder', bus: 'outside' },          // thunder + lightning (storm)
    uiSelect: { files: 'sfx/ui_select' },       // menu: pointing at an option (or arrow keys)
    uiSubmit: { files: 'sfx/ui_submit' },       // menu: clicking an option
  },

  // Ghosts (data/ghosts.json). Per-level lists: index 0 = level 1, the last value repeats.
  ghost: {
    roomChance: [0, 0.3, 0.35, 0.4, 0.45, 0.5, 0.56, 0.62, 0.69, 0.75], // chance a dead-end door leads to a ghost-only (black) room.
                                                 // Levels with a chance > 0 get at least one when possible.
    randomPerMin: [0, 0, 1, 1.5, 2, 2.5, 3.2, 4, 5, 6], // random ghost appearances per minute spent in a room (not the
                                                 // first room of a level, not ghost rooms). 0 = never.
    rampPerMin: [0, 0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5], // the longer you stay in a room, the likelier a random ghost: its rate
                                                 // (randomPerMin) rises by this much per minute spent there (after graceS).
                                                 // Only where randomPerMin > 0. 0 = steady rate.
    graceS: 2,          // no random ghost in the first seconds after entering a room
    lingerS: [1.0, 2.0],    // after you escape a random ghost, it stays in that room this long (random in range)
    drainPerS: 0.12,    // health lost per second in a room with a ghost (0.12 = dead in ~8 s)
    regenPerS: 0,       // health regained per second away from ghosts (0 = never heals)
    lampOffS: 0.3,      // the flashlight flickers this long, then dies
    // Random in range for every ghost, so a ghost room can't be told from a dark room by how fast the ghost comes:
    fadeDelayS: [0.25, 1.0], // [min, max] seconds after the flashlight starts dying before the ghost starts to fade in...
    fadeInS: [0.1, 0.5],    // ...[min, max] seconds the fade-in takes
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
    perLevel: [0, 0.35, 0.6, 1, 1.3, 1.6, 1.6, 1.7, 1.8, 1.9],
  },

  // Heartbeat sound: nothing above `start`; slow heartbeat down to `fastBelow`, fast heartbeat below.
  // Gap between beats (s) goes from the first value to the second as health falls through each band.
  heartbeat: {
    start: 0.95,
    fastBelow: 0.5,
    slowGapS: [1.0, 0.3],
    fastGapS: [0.6, 0.05],
    // When each sound's "lub" and "dub" hit (s from the start of the sound) and how hard the HUD heart jumps for
    // each (0..1). Measured from audio-src/sfx/heartbeat_*.wav; update if those sounds are replaced.
    thumps: {
      heartbeatSlow: [[0, 0.55], [0.3, 1]],
      heartbeatFast: [[0, 0.55], [0.19, 1]],
    },
    pulse: { attackS: 0.05, decayS: 0.22 }, // shape of one visual thump
  },

  // Health on screen (art: data/items.json "heart"), bottom left. The heart drains from the top as health falls
  // (the lost part goes dark and grey) and jumps with every heartbeat. Below the heartbeat's `start`, a red
  // vignette creeps in from the screen edges, stronger as health falls, and throbs with the beat.
  healthHud: {
    x: 100, y: 975,     // heart centre, scene px
    size: 36,           // heart height, HUD px (the HUD is ps1.width wide: 480)
    beatScale: 0.18,    // extra size at the peak of a thump
    drained: 0.3,       // brightness of the lost part (0 = black)
    vignette: 0.55,     // vignette opacity at zero health (0 = off)
    vignetteBeat: 0.35, // extra opacity at the peak of a thump (scaled by how low health is)
  },

  // Dark rooms (src/world.js + src/game.js). The flashlight dies when you walk in, exactly like in a ghost room, so you
  // can't tell them apart at first. A light switch (data/items.json "light_switch") hangs somewhere on the wall,
  // invisible in the dark: it  // glows when the pointer is over it, and nothing else in the room can be used until it is turned on. Then a ceiling
  // light comes on (the flashlight stays off). Per-level lists: index 0 = level 1, the last value repeats.
  darkRooms: {
    roomChance: [0.2, 0.2, 0.25, 0.25, 0.3, 0.32, 0.35, 0.38, 0.42, 0.45], // chance any room except the first is dark (doors, keys and all)
    screamerChance: [0, 0, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5], // (none on levels 1-2) chance a dark room with nothing to find (paintings, no key or
                                                 // pill behind them) is a screamer room instead: empty but for the
                                                 // switch, and a screamer jumps out when the light comes on
    switchY: [560, 640, 720], // heights tried for the switch (scene px, centre), first one with room to spare wins
    switchMargin: 30,   // min gap between the switch and the room's doors/paintings, scene px
    onS: 0.7,           // the ceiling light flickers on over this long
    // Ceiling light: brightest at (x, y) near the top of the screen, fading over `reach` scene px to `ambient`.
    // stretch > 1 makes it fall off faster downward than sideways.
    light: { x: 960, y: 40, reach: 1300, ambient: 0.16, peak: 1.0, stretch: 1.1 },
    screamerDelayS: 0.35, // screamer rooms: the light is on this long before the screamer jumps out...
    screamerS: 1.1,       // ...and it stays on screen this long (no damage)
  },

  // Lever rooms (src/world.js + src/game.js, layout "levers" in data/rooms.json). One door and a row of levers
  // (art: data/items.json "lever_base" + "lever_handle"), all starting up. The door only opens when the levers are
  // set to its secret combination (random per level, any mix of up and down, even all up or all down). A wrong try
  // plays lever_fail and every lever snaps back up; the right one plays lever_success and they stay where they are.
  // Per-level lists: index 0 = level 1, the last value repeats.
  levers: {
    roomChance: [0, 0, 0.5, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 1], // chance a level has a lever room
    masterChance: 0.5, // chance the master (gold) key is behind the lever door; otherwise nothing important is
    count: 5,           // levers in the room (at most the lever slots of the "levers" layout)
    pullS: 0.22,        // how long a lever takes to go up or down
    resetDelayS: 0.3,   // after a wrong try, the levers wait this long before snapping back up...
    resetS: 0.12,       // ...and snap up this fast
    travel: 0.27,       // how far the handle sits from the middle of the base, up or down (share of the base height)
    bulge: 0.15,        // the handle looks this much bigger halfway (pointing at you), 0 = a flat slide
    // The combination, painted as a row of arrows (up = lever up, left -> right) on the wall behind one painting or
    // poster somewhere outside the lever region. Drawn by the game itself (src/assets.js makeClueSprite).
    clueChance: 1,      // chance a level's lever room has its clue somewhere (0 = never, guess it)
    clue: {
      scale: 1.6,       // arrow size (1 = 36 x 70 scene px per arrow)...
      fit: [0.75, 0.4], // ...but at most this share of the hiding painting's width and height
      paint: [150, 24, 18], // paint colour (RGB 0-255)
    },
  },

  // Windows (src/world.js + src/game.js, art: data/items.json "window" + "window_door"). Only on walls without doors:
  // painting rooms (in a free painting spot) and ghost rooms, on any level. The glass shows the night sky and lets a
  // little cold light into the room. Behind the frame hang two wooden shutters, open (folded flat against the wall,
  // invisible) until the wind slams them (weather.windy).
  windows: {
    roomChance: 0.45,   // chance a painting or ghost room has a window (when it has a free painting spot)...
    twoChance: 0.35,    // ...and chance it has two (when it has two free spots)
    // Moonlight from an open window: a soft pool around it, centred `drop` scene px below the window's centre.
    light: { color: [0.45, 0.55, 0.85], amount: 0.3, reach: 650, drop: 120 },
    sky: 0.6,           // brightness of the night sky seen through the glass
    // Lightning (weather.storm): at its peak the window light gets this much brighter and whiter, and reaches
    // `reach` times further; the sky gets `sky` brighter.
    lightning: { color: [0.85, 0.9, 1.0], amount: 2.4, reach: 1.8, sky: 9 },
  },

  // Weather: every level gets one (picked from the world seed). Its loop plays all the time; in a room with an open
  // window it sounds clear, anywhere else muffled, as if through the walls. Per-level lists: index 0 = level 1, the
  // last value repeats.
  weather: {
    // Relative odds of each weather, per level: later levels are stormier.
    chances: [
      { none: 1, windy: 1, storm: 1 }, { none: 1, windy: 1, storm: 1 }, { none: 1, windy: 1, storm: 1 },
      { none: 1, windy: 1.5, storm: 1.5 }, { none: 1, windy: 1.5, storm: 1.5 }, { none: 0.8, windy: 2, storm: 2 },
      { none: 0.8, windy: 2, storm: 2.5 }, { none: 0.6, windy: 2.5, storm: 2.5 }, { none: 0.4, windy: 2.5, storm: 3 },
      { none: 0.3, windy: 2.5, storm: 3 },
    ],
    loops: { windy: 'ambience/wind_loop', storm: 'ambience/rain_loop' }, // exact sound names (path in audio-src/)
    loopVolume: 0.8,
    fadeInS: 4,
    fadeOutS: 2,
    // Muffled = low-pass filtered at `hz` and turned down to `gain`; `s` = how fast it changes when you change rooms.
    // Also applies to the thunder and the wind sounds (CONFIG.sfx roles with bus: 'outside').
    muffle: { hz: 450, gain: 0.6, s: 0.6 },
    // Windy: in a room with open windows a gust comes now and then (sfx windGust). slamAtS seconds into it the
    // shutters slam shut (sfx windowClose): they swing in over swingS and land exactly then, then bounce a little.
    // They stay shut for the rest of the level: no more light from that room's windows, and it is muffled.
    gustPerMin: [6, 7, 8, 10, 11, 13, 15, 16, 18, 20], // gusts per minute spent in a room with open windows
    gustGraceS: 3,      // never in the first seconds after entering a room
    slamAtS: 0.8,       // when the shutters hit (s from the start of the gust sound; sfx/wind_gust peaks there)
    swingS: 0.14,
    bounceS: 0.22,
    bounce: 0.08,       // share of the way they spring back open after the hit
    // Storm: thunder now and then in any room (sfx thunder). Where a window is open the lightning lights the room up,
    // and sometimes (faceChance) a face is outside the window. If you're still in the room escapeS seconds later, a
    // screamer jumps out (sfx screamerShort, no damage).
    thunderPerMin: [2, 3, 3, 4, 4, 4, 5, 5, 6, 6],
    thunderGraceS: 4,
    faceChance: [0, 0, 0.4, 0.4, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9],
    escapeS: 1.5,
  },

  // Health 0: a screamer image (data/ghosts.json) flashes while a screamer sound plays, then the main menu shows (START begins a new run at level 1).
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

    // Silences: now and then the background loop fades out completely (no one-shots either), then comes back.
    // Sometimes a random ghost follows (only where random ghosts can appear: config.ghost.randomPerMin).
    silence: {
      firstDelayS: [60, 120], // [min, max] seconds after START before the first try
      gapS: [70, 160],        // [min, max] seconds between tries
      chance: 0.7,            // 0..1 probability that a try actually goes silent
      holdS: [10, 22],        // [min, max] seconds of silence
      fadeOutS: 2.5,          // the loop fades out over this long...
      fadeInS: 5,             // ...and back in over this long
      ghostChance: [0.35, 0.35, 0.35, 0.35, 0.35, 0.42, 0.5, 0.58, 0.65, 0.75], // chance a random ghost comes during the silence (per level)...
      ghostDelayS: [3, 8],    // ...this many seconds after it starts
    },
  },
};
