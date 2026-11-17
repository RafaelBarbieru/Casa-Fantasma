# Casa Fantasma

A point-and-click horror game that runs in the browser and uses art pre-rendered in Blender.
No game engine is involved: it's plain JavaScript and WebGL, so it loads fast and runs on phones, tablets and computers.

## Running it

You need [Node.js](https://nodejs.org) (any recent version). Nothing has to be installed with npm.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the game at http://localhost:5173 |
| `npm run dev:lan` | Same, but also prints an address you can open on a **phone or tablet on the same Wi-Fi** |
| `npm run build` | Creates `dist/casa-fantasma-web.zip`, ready to upload to itch.io |
| `npm run preview` | Plays the built version (what players will get) |

Double-clicking `index.html` will **not** work. Browsers block it, so always use `npm run dev`.

### Useful URL options
- `?debug`: shows the debug panel (seed, room, item, slot positions). You can also press the **`** key at any time.
  - The panel lists what's in the current room (where each door leads, which are locked, which painting hides a key) and where every key is.
  - With the panel open: **N** generates a new random level, **K** gives you every key, **B** jumps back to the first room.
- `?seed=42`: always generates the same world. Use this when you want to reproduce something.
- They can be combined: `http://localhost:5173/?debug&seed=42`

## How to play
- Move the mouse (or drag a finger) to aim the flashlight. Things you can interact with glow when you point at them.
- Every level is a maze. The first room has **3 doors**. A door leads either to another door room (2 or 3 doors) or to a **painting room** (1 to 4 paintings).
- Some doors are **locked**. Click a painting to look behind it: sometimes there's a key. Keys you hold appear at the top left, each with a small picture of the door it opens. Every locked door looks different from all the other doors in the level, so the picture tells you which one it is.
- Click the arrow at the bottom (**back**) to return to the room you came from.
- One of the locked doors is the way out. Open it to escape, and a new level is generated.
- The levels are always solvable: each key is found before the door it opens, in a room you can reach.

### The maze settings
`src/config.js` → `maze`:
- `locks`: how many locked doors a level has (the last one is the exit).
- `startDoors`, `doors`: doors in the first room, and in the other door rooms (`[2, 3]` = 2 or 3).
- `paintings`: paintings in a painting room (`[1, 4]`).
- `roomsPerStage`: how many new rooms each key opens up before the next locked door. Bigger = bigger maze.
- `doorRoomChance`: how often a door leads to more doors rather than paintings.

Doors and paintings are never repeated inside the same room.
The messages ("It's locked.", ...) are at the top of `src/game.js`.
Sounds for doors, keys and the back arrow are in `src/config.js` → `sfx`. They all use `keypress_01` until you have real ones.

## Publishing

**itch.io:** run `npm run build` and upload `dist/casa-fantasma-web.zip` as an HTML game ("This file will be played in the browser").
Recommended settings: viewport 1280×720, enable "Mobile friendly" (landscape), and enable the fullscreen button.

**Self-hosting:** upload the contents of `dist/web/` to any static web host. No server-side code is needed.

## Adding art

### Rooms (backgrounds)
- Render at **1920×1080**, export as **PNG** (or WebP), and put it in `art-src/rooms/`.
- Rooms are only scenery. The player can't click them.
- Register the room in `data/rooms.json` with the **slots** where items can go:

```json
"room01": {
  "src": "assets/rooms/room01.webp",
  "slots": [
    { "id": "wall-left", "x": 460, "y": 480, "accepts": ["wall"] },
    { "id": "wall-high", "x": 720, "y": 280, "scale": 0.85, "accepts": ["wall"] }
  ]
}
```
`x`, `y` are the pixel position of the item's **center** in the 1920×1080 image. You can read them straight off the render in Blender or any image editor.
`scale` (optional) shrinks or enlarges items in that spot, which is useful for perspective. `accepts` lists the kinds of items that can go there.

### Items
- Doors are items with `"placement": ["door"]` and go in `door` slots. Paintings use `"wall"`.
- Doors are drawn flat on the wall, so all door slots in a room should sit on the same line (same `y`).
- A painting room needs as many `wall` slots as the most paintings it can have (4), and they must not overlap.
- Render with a **transparent background** (Film → Transparent), crop to the object, and export as **PNG with alpha** (or WebP) into `art-src/items/`.
- Render them with the same camera and lens as the room so the perspective matches.
- Low-resolution art is fine: the PS1 look renders the whole screen at low resolution anyway (see below). Use `scale` in `items.json` to give every door or painting a sensible size.
- Keep the lighting in the render flat or neutral. The game adds the flashlight on top.
- Register the item in `data/items.json`:

```json
"painting01": { "src": "assets/items/painting01.webp", "scale": 1.4, "depth": 8, "placement": ["wall"] }
```
`depth` is how far the object sticks out from the wall. A bigger value gives a bigger, softer, more mobile shadow.
`placement` must match a slot's `accepts`. Here, "wall" items only go in wall slots.

### Where images go
Put your source images in `art-src/` (PNG, JPG or WebP). `npm run dev` and `npm run build` turn them automatically into small WebP files in `assets/`, in the same folder structure: `art-src/items/door01.png` becomes `assets/items/door01.webp`. That `.webp` path is what you write in the `data/*.json` files.
While `npm run dev` is running, a new or changed image (or sound) is converted within a second; just reload the page. Deleting a source also deletes its converted file. To redo every image, run `npm run images:force`.
Don't put anything in `assets/` yourself: it is generated, not saved in git, and may be overwritten.

File names are **case-sensitive** once online (`Painting01.webp` ≠ `painting01.webp`). `npm run build` warns you if a name doesn't match.

### A note on GLB
The game uses images, not 3D models, which is what keeps it light on phones.
Keep exporting **rendered images** from Blender (WebP) rather than GLB files. A GLB would force every player's device to render 3D in real time.

### Sounds
- Export **WAV** files (48 kHz, 16 or 24-bit) into `audio-src/`. Use `audio-src/sfx/` for short effects and `audio-src/ambience/` for loops and music. You can add more folders.
- Use **lowercase names without spaces**, e.g. `audio-src/sfx/door_creak01.wav`.
- Export mono for sound effects and voice, stereo only where it matters (ambience, music). Mono files come out about half the size.
- `npm run dev` and `npm run build` convert your WAVs automatically into `assets/audio/` in two formats:
  - `.ogg` (Opus), the main format;
  - `.m4a` (AAC), for older iPhones.

  Each player downloads only the one their device needs. To convert by hand, run `npm run audio`; to redo everything, run `npm run audio:force`.
- The converted files are not saved in git, only your WAVs (via LFS). This needs **ffmpeg** installed, which you already have.
- Which sound plays for what is set in `src/config.js` under `sfx`. For example, `itemClick: 'sfx/keypress_01'` plays when you click an item. Write the path inside `audio-src/` without `.wav`.
- **Level ambience** is set in `src/config.js` under `ambience`:
  - `loops`: the background loops. Each level picks one of them at random and plays it on repeat. Add more names to the list to get more variety.
  - `loopVolume`, `fadeInS`, `fadeOutS`: how loud the loop is and how many seconds it takes to fade in and out.
  - `random`: occasional extra sounds over the loop (whispers, distant monster...).
    - `pool`: which sounds can play.
    - `gapS: [25, 60]`: wait between 25 and 60 seconds between attempts.
    - `firstDelayS`: the wait before the first one.
    - `chance`: how likely each attempt is to actually play (1 = always).
    - `volume: [min, max]`: each play gets a random volume in this range.
  - With the debug overlay open (`?debug`), press **A** to hear a random one right away.
- Loops: cut at a silent or zero-crossing point so they don't click when they repeat, and keep loudness roughly even across files.

## Tweaking the look
All visual settings live in `src/config.js`, and you can change them freely:
- `ps1`: the PlayStation 1 look. The game is drawn at a low resolution, then enlarged with hard pixels and reduced to PS1 colors with the console's checkerboard-like dithering.
  - `width`: the internal resolution (480 = 480×270). Lower is crunchier (320 is very PS1); 640 is cleaner.
  - `colorBits`: 5 is the PS1's color depth. Raise it to 8 to remove the color banding.
  - `dither`: 0 to 1, how strong the dithering is.
  - `snap`: objects move in whole big pixels, like on the PS1.
  - `enabled: false` turns the whole effect off.
- `flashlight`: beam size (`radius`), edge softness, how dark the darkness is (`ambient`), color tint, and how quickly the beam follows the pointer.
- `shadow`: strength, blur, how far shadows move with the light.
- `glow`: color, intensity, pulse.
- `transition`: speed of the room-change fade and flicker.

## What's next
- Developer tools for placing slots visually, and for designing levels and events.
- Door/key/painting sounds, separate backgrounds for door rooms and painting rooms, a real ending.
