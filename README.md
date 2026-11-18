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
  - Ghost testing: **G** makes a ghost appear in the current room, **D** takes away 20% health, **H** restores full health, **P** gives you a pill. The panel shows your hidden health and which rooms hide pills (`{pill}` next to the painting).
- `?seed=42`: always generates the same world. Use this when you want to reproduce something.
- They can be combined: `http://localhost:5173/?debug&seed=42`

## How to play
- Move the mouse (or drag a finger) to aim the flashlight. Things you can interact with glow when you point at them.
- Every level is a maze. The first room has **3 doors**. A door leads either to another door room (2 or 3 doors) or to a **painting room** (1 to 4 paintings).
- Each level has one locked **master door**. Opening it takes you to the next level, and there is no way back.
- Click a painting and it slips off one nail and swings, showing the wall behind it. Sometimes something hangs there (a key or pills): **click it to take it**. Now and then a painting falls to the floor instead and cracks, with a crash.
- Keys you hold appear at the top left, each with a small picture of the door it opens. The **master key is gold**; other keys are grey. Every locked door looks different from all the other doors in the level, so the picture tells you which one it is.
- **Level 1** has only the master door locked. From **level 2** on there are also locked **side doors**: their keys are somewhere in the level, and behind them is either the master key or nothing useful.
- Click the arrow at the bottom (**back**) to return to the room you came from.
- **The glow tells you what's left.** A warm, pulsing glow means there is still something to find there. A dull, still, grey-blue glow means there's nothing left:
  - on a painting, you've already moved it;
  - on a door, you've explored everything behind it: every painting moved, everything behind them taken, and every door opened, all the way down.

  A door with a locked door anywhere behind it that you haven't opened stays warm. So does the master door.
- Levels are always solvable.

### Ghosts
- **Level 1** has no ghosts.
- **From level 2**, some dead-end doors lead to a **ghost room**: pitch black, with nothing but a ghost.
  - When you walk in, the flashlight flickers and dies, and the ghost fades in.
  - A ghost room always has the same ghost in the same place, so remember which door it was and avoid it.
- **From level 3**, a ghost can appear in any room except the first room of the level, at any moment.
  - The flashlight dies and nothing glows any more, so you have to remember where the doors were and get out: back, or through another door.
  - The ghost stays in that room for 1 to 10 seconds after you escape, so going straight back means meeting it again.
- The higher the level, the more ghost rooms and random ghosts there are.
- **Health.** Ghosts drain it every second you share a room with them (about 8 seconds from full to dead). You hear it and see it:
  - after losing 5%, a slow heartbeat starts, about one beat a second;
  - it speeds up as health falls, switches to a fast heartbeat below 50%, and keeps getting faster towards 0;
  - the heart at the bottom left (`art-src/heart.png`) shows how much is left: the lost part turns dark grey from the top down, and the heart jumps on every "lub" and "dub" of the heartbeat sound;
  - a red glow creeps in from the screen edges once the heartbeat starts, getting stronger as health falls and throbbing with each beat.
- Health does not come back on its own (see `regenPerS`) and carries over between levels.
- **Pills** are hidden behind some paintings (never one that hides a key). Once you take them they pile up at the top right with a count; click the icon to take one. A pill heals **50% of full health**, never above 100%. Taking one always uses it up, even at full health. Pills carry over between levels and are lost when you die.
  - They are rare early on and get more common as ghosts do: none in level 1, then on average 0.35, 0.6, 1, 1.3 and 1.6 per level (level 6 and up).
- At 0% a screamer flashes on screen with a scream (`sfx/screamer_long`), and the game starts over from level 1.

### Dark rooms
- Any room except the first one of a level can be **dark**, from level 1 on. Walking in feels exactly like a ghost room: the flashlight flickers and dies. You can't tell which it is until a ghost does (or doesn't) appear.
- A dark room has a **light switch** (`art-src/light_switch.png`) somewhere on the wall, always in the same place, next to the doors and paintings but never touching them. It is invisible in the dark: you have to search the walls until you point at it and it glows. On a phone, drag your finger along the walls. Until you switch it on, nothing else in the room glows or can be clicked; clicking in the dark just tells you it's too dark.
- Switching it on lights the room from a **ceiling light**: a wide, soft pool of light from above, dimmer at the edges and near the floor. The flashlight stays off in that room. The light stays on if you leave and come back.
- Dark rooms can have doors, keys and pills like any other room, so running away from every dark room can cost you the way out.
- A ghost in a lit room puts the ceiling light out too.
- **Screamer rooms.** A dark room with nothing to find (paintings with no key or pills behind them) is sometimes a screamer room instead: it is empty except for the switch, and a moment after the light comes on, a screamer (one of `art-src/screamerNN.png`) jumps out with a short scream (`sfx/screamer_short`). It doesn't hurt you. This gets more likely every level.

`src/config.js`:
- `ghost`:
  - `roomChance`: per level, how likely a dead-end door leads to a ghost room.
  - `randomPerMin`: per level, how many random ghosts per minute spent in a room.
  - `graceS`: no random ghost in the first seconds after entering a room.
  - `lingerS`: how long an escaped ghost stays.
  - `drainPerS`: how fast health drains with a ghost in the room.
  - `regenPerS`: health regained per second away from ghosts (0 = never).
  - `lampOffS`: how long the flashlight flickers before it dies.
  - `fadeDelayS`, `fadeInS`: `[min, max]` seconds. Each time a ghost appears, it waits a random time in the first range before fading in, and fades in over a random time in the second. Together they keep you guessing whether a dark room holds a ghost.
  - `gain`: how bright the ghosts are.
  - `drift`: how much they float.
- `pills`:
  - `heal`: how much one pill heals, as a share of full health (0.5 = 50%).
  - `perLevel`: pills hidden per level. The whole number is always placed and the fraction is the chance of one more (0.35 = 35% chance of one pill; 1.5 = one pill plus a 50% chance of a second). The last value repeats.
  - Changing these never changes the rest of a seed's layout.
  - The pill picture is `art-src/health.png`; the icon's position is `hud.pills`.
- `paintings`: how a painting moves when you click it.
  - `tiltDeg`: how far a slipping painting swings, in degrees (random between the two).
  - `minDrop`: how far it also slides down at least. It slides further when it has to, so the key or pills behind it are fully visible.
  - `fallChance`: how often a painting falls to the floor and cracks instead (0.2 = 20%). A painting too close to the floor to slip far enough always falls.
  - `fallS`, `bounce`, `fallDeg`: how fast it falls, how much it bounces, how crooked it lands.
  - `fallSfxDelayS`: delay of the fall sound. 0 = when you click; set it to the same value as `fallS` to play it exactly when the painting hits the floor.
  - `crackPx`, `crackDarken`, `fallenGain`: crack thickness and darkness, and how much darker a fallen painting is.
  - The key pictures are `art-src/key.png` and `art-src/master_key.png` (pills use `health.png`); their size on the wall is `scale` in `data/items.json`.
- `heartbeat`: when it starts, when it switches to fast, and the gaps between beats. `thumps` says when the heart picture jumps within each heartbeat sound; update it if you replace those sounds.
- `healthHud`: the heart's position and size, how much it jumps per beat, how dark the lost part is, and how strong the red edge glow gets.
- `screamer`: how long it lasts and how fast it flashes (also how fast the screamer-room screamers flash).
- `darkRooms`:
  - `roomChance`: per level, how likely a room is dark (0.2 = 20%). The last value repeats.
  - `screamerChance`: per level, how likely a dark room with nothing to find is a screamer room.
  - `switchY`: the heights tried for the switch, in scene pixels (1080 = bottom of the screen); the first one with free wall space is used.
  - `switchMargin`: the minimum gap between the switch and doors or paintings.
  - `onS`: how long the ceiling light flickers before it's fully on.
  - `light`: the ceiling light. `x`, `y` = where it's brightest; `reach` = how far it spreads; `ambient` = brightness far from it; `peak` = brightness under it; `stretch` above 1 makes it fade faster towards the floor than to the sides.
  - `screamerDelayS`, `screamerS`: how long after the light comes on the screamer appears, and how long it stays.
  - The switch's size is `scale` of `light_switch` in `data/items.json`.
  - Changing these never changes the rest of a seed's layout.
- Add `?level=3` to the address to start at level 3 (for testing). With the debug panel open, **L** skips to the next level.

### The maze settings
`src/config.js` → `maze`:
- `startDoors`, `doors`: doors in the first room, and in the other door rooms (`[2, 3]` = 2 or 3).
- `paintings`: paintings in a painting room (`[1, 4]`).
- `openRooms`: how many rooms you can reach without any key. Bigger = bigger maze.
- `sideLocks: [0, 1, 2, 3]`: locked side doors in level 1, 2, 3, and 4 onwards (the last number repeats).
- `sideRooms`: how many rooms are behind each side door.
- `masterBehindChance`: when there are side doors, how often the master key is behind one of them (0.6 = 60%).
- `doorRoomChance`: how often a door leads to more doors rather than paintings.

Doors and paintings are never repeated inside the same room.
The messages ("It's locked.", ...) are at the top of `src/game.js`.
The "Level N" card between levels and how long it stays are in `src/config.js` → `transition` (`winOutS`, `winHoldS`).

## Publishing

**itch.io:** run `npm run build` and upload `dist/casa-fantasma-web.zip` as an HTML game ("This file will be played in the browser").
Recommended settings: viewport 1280×720, enable "Mobile friendly" (landscape), and enable the fullscreen button.

**Self-hosting:** upload the contents of `dist/web/` to any static web host. No server-side code is needed.

## Adding art

### Rooms: wall and floor textures
Rooms are built from **seamless textures**, not from a background image:
- The **wall** is tiled over the top 80% of the screen.
- The **floor** fills the bottom 20%, drawn in perspective so it recedes toward the wall.
- Every room picks a random wall and a random floor. The next room always has a different wall from the one you came from.

To add a texture:
- Make it **seamless** and **square, with a power-of-two size** (256×256, 512×512 or 1024×1024).
- Save it in `art-src/` as `wallNN.png` or `floorNN.png`.
- Register it in `data/surfaces.json`:

```json
"walls":  { "wall04":  { "src": "assets/wall04.webp",  "tile": 512 } },
"floors": { "floor04": { "src": "assets/floor04.webp", "tile": 640 } }
```
`tile` is how big one copy of the texture is on screen, in pixels of the 1920×1080 screen. Bigger means a larger pattern. For the floor, this is the size where it meets the wall; it grows toward the bottom of the screen.

`src/config.js` → `room`:
- `floorLine`: where the wall meets the floor (0.8 = 80% down).
- `horizonY`: the eye level. A lower number makes the floor look steeper.
- `seam`: how dark the corner where the wall meets the floor is.
- `wallMargin`: the minimum gap between a painting and the floor.

### Ghosts and screamers
- Ghost images go in `art-src/` as `ghostNN.png` (any background; black is fine, the game makes it invisible). Screamers go in as `screamerNN.png/jpg` (full screen, 16:9 like 1920x1080; they are used both when you die and in screamer rooms).
- Register them in `data/ghosts.json`:

```json
{
  "ghosts":    { "ghost01": { "src": "assets/ghost01.webp", "scale": 3 } },
  "screamers": { "screamer01": { "src": "assets/screamer01.webp" } }
}
```
`scale` is the ghost's on-screen size. Ghost images are converted without any quality loss, because their faint dark details would otherwise disappear.

### Where things go (layouts)
`data/rooms.json` has one layout per kind of room, with the **slots** where items can go:

```json
"doors":   { "slots": [ { "id": "door-left", "x": 420, "anchor": "floor", "accepts": ["door"] } ] },
"gallery": { "slots": [ { "id": "wall-1", "x": 260, "y": 420, "accepts": ["wall"] } ] }
```
- `x`, `y` are the pixel position of the item's **center** on the 1920×1080 screen.
- `"anchor": "floor"` stands the item on the floor line (its bottom edge sits where the wall meets the floor), so it needs no `y`. This is what doors use. Floor items don't glow or cast a shadow below that line.
- Wall items (paintings) are pushed up automatically if they would reach the floor.
- `scale` (optional) shrinks or enlarges items in that spot.
- `accepts` lists the kinds of items that can go there.

### Items
- Doors are items with `"placement": ["door"]` and go in `door` slots. Paintings use `"wall"`.
- A painting room needs as many `wall` slots as the most paintings it can have (4), and they must not overlap.
- Render with a **transparent background** (Film → Transparent), crop to the object, and export as **PNG with alpha** (or WebP) into `art-src/`.
- Low-resolution art is fine: the PS1 look renders the whole screen at low resolution anyway (see below). Use `scale` in `items.json` to give every door or painting a sensible size.
- Keep the lighting in the render flat or neutral. The game adds the flashlight on top.
- Register the item in `data/items.json`:

```json
"painting01": { "src": "assets/painting01.webp", "scale": 1.8, "depth": 8, "placement": ["wall"] }
```
`depth` is how far the object sticks out from the wall. A bigger value gives a bigger, softer, more mobile shadow.
`placement` must match a slot's `accepts`. Here, "wall" items only go in wall slots.

### Where images go
Put your source images in `art-src/` (PNG, JPG or WebP). `npm run dev` and `npm run build` turn them automatically into small WebP files in `assets/`, in the same folder structure: `art-src/door01.png` becomes `assets/door01.webp`. Name files by what they are (`doorNN`, `paintingNN`, `wallNN`, `floorNN`). That `.webp` path is what you write in the `data/*.json` files.
While `npm run dev` is running, a new or changed image (or sound) is converted within a second; just reload the page. Deleting a source also deletes its converted file. To redo every image, run `npm run images:force`.
Don't put anything in `assets/` yourself: it is generated, not saved in git, and may be overwritten.

File names are **case-sensitive** once online (`Painting01.webp` ≠ `painting01.webp`). `npm run build` warns you if a name doesn't match.

### A note on GLB
The game uses images, not 3D models, which is what keeps it light on phones.
Keep exporting **rendered images** from Blender (WebP) rather than GLB files. A GLB would force every player's device to render 3D in real time.

### Sounds
- Put sounds into `audio-src/`: **WAV** is best (48 kHz, 16 or 24-bit), but **OGG, MP3 and FLAC** also work. Use `audio-src/sfx/` for short effects and `audio-src/ambience/` for loops and music. You can add more folders.
- Use **lowercase names without spaces**, e.g. `audio-src/sfx/door_creak01.wav`.
- Export mono for sound effects and voice, stereo only where it matters (ambience, music). Mono files come out about half the size.
- `npm run dev` and `npm run build` convert your sounds automatically into `assets/audio/` in two formats:
  - `.ogg` (Opus), the main format;
  - `.m4a` (AAC), for older iPhones.

  Each player downloads only the one their device needs. To convert by hand, run `npm run audio`; to redo everything, run `npm run audio:force`.
- The converted files are not saved in git, only your originals (via LFS). This needs **ffmpeg** installed, which you already have.
- **Game sounds work by name.** `src/config.js` → `sfx` says which name each event uses, and every file whose name **starts with** it is used, picked at random each time without repeating the same one twice in a row. To add a variation, just drop in a file such as `audio-src/sfx/painting07.ogg`: no config change needed.

  | Name starts with | Plays when |
  |---|---|
  | `sfx/door` | a door opens (also when going back) |
  | `sfx/locked` | you try a locked door without its key |
  | `sfx/painting` | a painting slips |
  | `sfx/fall` | a painting falls to the floor and cracks |
  | `sfx/item` | you pick up a key or pills |
  | `sfx/level_end` | you open the master door |
  | `sfx/level_start` | a level begins (also the first one, when you click to enter) |
  | `sfx/ghost_spotted` | a ghost fades in |
  | `sfx/flashlight` | the flashlight dies (a ghost appears, or you walk into a dark room); also a lit room's light going out, and switching on a dark room's light |
  | `sfx/heartbeat_slow` | heartbeat, health below 95% |
  | `sfx/heartbeat_fast` | heartbeat, health below 50% |
  | `sfx/screamer_long` | health reached 0 |
  | `sfx/screamer_short` | a screamer room's screamer jumps out |
  | `sfx/healed` | you take a pill |

  Each entry can also have a `volume` (0 to 1). Long sounds (`level_start`) are set to `preload: 'one'`, so only one of them is kept in memory at a time.
- **Level ambience** is set in `src/config.js` under `ambience`:
  - It works by name, like the game sounds: drop files into `audio-src/ambience/` and they're picked up, no config change needed.
  - `loops: 'ambience/level'`: every `levelNN` file is a background loop. Each level picks one at random and plays it on repeat, never the same one as the previous level.
  - `loopVolume`, `fadeInS`, `fadeOutS`: how loud the loop is and how many seconds it takes to fade in and out.
  - `random`: occasional extra sounds over the loop that play with no event behind them.
    - `pool: 'ambience/random'`: every `randomNN` file can play.
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
- `glow`: color, intensity, pulse. `glow.explored` is the dull look for things with nothing left to find.
- `transition`: speed of the room-change fade and flicker.

## What's next
- Developer tools for placing slots visually, and for designing levels and events.
- Door/key/painting sounds, a real ending.
