// English strings: the reference locale. Every other locale has the same shape; any key it leaves out falls back to
// this file (i18n.js). Arrays of lines = one picked at random. Functions take the numbers they show.
// HUD/menu text uses the pixel font (hud.js GLYPHS): letters, digits, accented Spanish capitals and . , ' ! ? ¿ ¡ - : / % < > ( ).
export default {
  name: 'ENGLISH', // shown in Options > Language

  // index.html start overlay + rotate hint (elements with data-i18n), and boot messages from main.js.
  dom: {
    loading: 'Loading',
    loadingPct: (p) => `Loading ${p}%`,
    clickToEnter: 'Click to enter',
    tapToEnter: 'Tap to enter',
    noWebgl: 'This browser does not support WebGL.',
    failed: (msg) => `Failed to start: ${msg}`,
    warningTitle: 'Warning',
    warning1: 'This game contains loud noises, sudden screams and flickering, flashing lights, which may trigger seizures in people with photosensitive epilepsy.',
    warning2: 'Flickering lights can be turned off in Options > Game > Epilepsy mode.',
    rotate: 'Rotate your device',
  },

  // In-game message box (game.js) and the centred cards.
  game: {
    locked: ["It's locked.", 'The door is locked.', "It won't open."],
    lockedHint: ['Locked. You have a key, but not for this door.'],
    unlock: ['The key turns. The door opens.'],
    unlockMaster: ['The key turns. There is no way back.'],
    lootFound: ['Something was hidden behind the painting.', 'There is something behind it.'],
    posterLoot: ['Something was hidden under the poster.', 'There is something under the paper.'],
    clueFound: ['Arrows are painted on the wall behind it.', 'Someone painted arrows on the wall.'],
    clueUnder: ['There are arrows painted under the poster.', 'Someone painted arrows under the paper.'],
    posterNothing: ['Nothing under it.', 'Only bare wall underneath.'],
    torn: ['There is nothing left to tear.', 'Only scraps are left.'],
    nothing: ['Nothing behind it.', 'Only dust behind the frame.', 'Nothing.'],
    fell: ['The painting crashes to the floor.', 'It falls and cracks.'],
    searched: ['You already looked behind this one.'],
    lootLeft: ['Something is still there, on the wall.'],
    keyTaken: ['You take the key.'],
    masterTaken: ['You take the key. It is heavy, and gold.'],
    pillTaken: ['You take the pills.'],
    healed: ['You swallow a pill. You feel better.'],
    leverWrong: ['Nothing happens. The levers snap back up.', 'The door does not budge. The levers spring back.'],
    leverRight: ['Something clicks inside the door.', 'The levers lock in place. The door opens.'],
    leversStuck: ["The levers won't move any more."],
    linkedIntro: ['The levers are wired to each other. The door opens when they are all down.'],
    linkedShut: ["It won't open. Every lever has to be down.", 'Shut tight. The levers are not all down.'],
    linkedRight: ['Every lever is down. Something clicks inside the door.'],
    crookedIntro: ['The paintings hang crooked, tied to each other. The door stays shut while they do.'],
    crookedShut: ["It won't open while the paintings hang crooked.", 'Shut tight. The paintings are still crooked.'],
    crookedRight: ['Every painting hangs straight. Something clicks inside the door.'],
    crookedStuck: ['It hangs straight now. Better leave it.'],
    trapLevers: ['A trapdoor in the floor, and a row of levers.'],
    trapWired: ['A trapdoor in the floor. The levers are wired to each other: it opens when they are all down.'],
    trapCrooked: ['A trapdoor in the floor. The paintings hang crooked, tied to each other: it stays shut while they do.'],
    trapWrong: ['Nothing happens. The levers snap back up.', 'The trapdoor does not budge. The levers spring back.'],
    trapLoot: ['The trapdoor bangs open. Something lies inside.'],
    trapEmpty: ['The trapdoor bangs open. There is nothing inside.', 'The trapdoor bangs open. Only dust and cold air.'],
    trapLootLeft: ['Something is still down there.'],
    trapNothing: ['Nothing down there.', 'Only darkness down there.'],
    dark: ["It's too dark to see anything.", 'There must be a light switch somewhere.', 'You feel along the wall.'],
    level: (n) => `Level ${n}`,
    escaped: 'You got out.',
  },

  // HUD labels (hud.js).
  hud: {
    level: (n) => `LEVEL ${n}`,
    use: 'USE',
    back: 'BACK',
  },

  // Menus (menu.js).
  menu: {
    title: 'CASA FANTASMA',
    start: 'START',
    howToPlay: 'HOW TO PLAY',
    options: 'OPTIONS',
    paused: 'PAUSED',
    resume: 'RESUME',
    quit: 'QUIT',
    quitHint: 'BACK TO THE MAIN MENU. THIS RUN WILL BE LOST.',
    audio: 'AUDIO',
    master: 'MASTER',
    ambience: 'AMBIENCE',
    sfx: 'SFX',
    game: 'GAME',
    epilepsy: 'EPILEPSY MODE',
    epilepsyHint: 'NO FLICKERING OR FLASHING LIGHTS',
    language: 'LANGUAGE',
    on: 'ON',
    off: 'OFF',
    back: 'BACK',
    mainMenu: 'MAIN MENU',
    // Stats screen
    gotOut: 'YOU GOT OUT',
    died: 'YOU DIED',
    time: 'TIME',
    timeValue: (min, sec) => `${min} MIN ${sec} S`,
    level: 'LEVEL',
    levelValue: (level, levels) => `${level} OF ${levels}`,
    ghosts: 'GHOSTS ESCAPED',
    pills: 'PILLS INGESTED',
    grams: (g) => `${g} ${g === 1 ? 'GRAM' : 'GRAMS'}`,
    // The verdict on the pills taken (menu.js pillJoke picks one).
    jokes: {
      diedHolding: (held) => `Died with ${held} in your pocket. Saving them for later?`,
      none: 'Not a single one. Very brave, or very stupid.',
      few: 'A responsible adult. Your doctor is proud.',
      dose: 'The recommended dose. More or less.',
      many: 'Your pharmacist knows you by name.',
      lots: 'Hypochondriac. Ghosts are not contagious.',
    },
  },

  // How to play pages, by tutorial.js page id.
  tutorial: {
    house: {
      title: 'THE HOUSE',
      text: [
        'Every level is a maze of rooms. One door in each level is the master door: find its gold key and go through. There is no way back.',
        'Other doors may be locked too. Their keys are hidden somewhere in the level.',
        'Keys you hold are shown at the top left, next to a picture of the door they open.',
      ],
    },
    controls: {
      title: 'CONTROLS',
      text: [
        'Move the mouse, or drag a finger, to aim your flashlight. Anything you can use glows when you point at it. Click or tap to use it.',
        'To go back to the room you came from, click the arrow at the bottom or press SPACE.',
        'A warm glow means there is still something to interact with. A dull blue glow means there is nothing left.',
        'Press ESC or the pause button at the top right to pause the game.',
      ],
      backKey: 'BACK: SPACE',
      pauseKey: 'PAUSE: ESC',
    },
    paintings: {
      title: 'PAINTINGS',
      text: ['Click a painting to move it and uncover what it hides behind it.'],
    },
    posters: {
      title: 'POSTERS',
      text: [
        'Posters have to be torn off the wall. Every click scratches a piece away.',
        "Items under a poster can be taken as soon as it is uncovered, but the room won't appear completed until you scratch the entire poster.",
      ],
    },
    dark: {
      title: 'DARK ROOMS',
      text: [
        'In some rooms your flashlight dies the moment you walk in.',
        "Search the walls for the light switch. You can't see it, but it glows when you point at it. Nothing else in the room can be used until the light is on.",
        'Dark rooms may contain important items or a passage to the master door. Running from all of them can cost you the way out.',
      ],
    },
    levers: {
      title: 'LEVERS',
      text: [
        'A level may have a room with one door and a row of levers. All the levers start up.',
        'The door only opens with the levers set the right way: some up, some down.',
        'Click a lever to flip it, then try the door. If it is wrong, every lever snaps back up.',
        'Get it right and the door opens. The right way may be painted on a wall, behind a painting or a poster.',
      ],
    },
    wired: {
      title: 'WIRED LEVERS',
      text: [
        'In some lever rooms a cable hangs between the levers. They are wired together, and there is no clue to find.',
        'Pulling a lever also flips the ones next to it. They start mixed up. Get every lever down and the door opens by itself.',
        'Think fast. The longer you stay in a room, the likelier something finds you.',
      ],
    },
    trapdoors: {
      title: 'TRAPDOORS',
      text: [
        'Some puzzle rooms have no door. Their levers or crooked paintings open a trapdoor in the floor instead.',
        'Inside there may be a key, the gold key, pills, or nothing at all.',
        'Plain levers open a trapdoor the same way as a door: set them and click the trapdoor. Their arrows are painted somewhere in the level.',
      ],
    },
    crooked: {
      title: 'CROOKED PAINTINGS',
      text: [
        'Some rooms have a shut door and a row of crooked paintings, tied together with cord.',
        'Click a painting to turn it one step: straight, leaning right, leaning left, straight again. The paintings tied to it turn too.',
        'Hang every painting straight and the door opens. Take too long and something may join you.',
      ],
    },
    ghosts: {
      title: 'GHOSTS',
      text: [
        'Some doors lead to a pitch black room with a ghost in it. The ghost is always there: remember the door and stay away.',
        'A ghost can appear in any room at any time. When your light dies and a face appears, get out: go back or through another door.',
      ],
    },
    health: {
      title: 'HEALTH',
      text: [
        'Your heart is at the bottom left. It drains while a ghost is near, and it does not heal on its own. Listen to it beat.',
        'Pills you find are kept at the top right. Click them to take one and heal. Health and pills carry over to the next level.',
        'If your heart stops, you are sent back to the main menu and start again from level 1.',
      ],
    },
  },
};
