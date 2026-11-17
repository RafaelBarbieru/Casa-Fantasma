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
  - With the panel open, **N** generates a new random world and **S** skips to the next room.
- `?seed=42`: always generates the same world. Use this when you want to reproduce something.
- They can be combined: `http://localhost:5173/?debug&seed=42`

## How to play (prototype)
- Move the mouse (or drag a finger) to aim the flashlight.
- An item you can interact with glows when you point at it.
- Click or tap the item. The flashlight flickers off, and in the next room another item appears somewhere else on the wall.
- After the last item, a new set of rooms is generated.

## Publishing

**itch.io:** run `npm run build` and upload `dist/casa-fantasma-web.zip` as an HTML game ("This file will be played in the browser").
Recommended settings: viewport 1280×720, enable "Mobile friendly" (landscape), and enable the fullscreen button.

**Self-hosting:** upload the contents of `dist/web/` to any static web host. No server-side code is needed.

## Adding art

### Rooms (backgrounds)
- Render at **1920×1080**, export as **WebP**, and put it in `assets/rooms/`.
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
- Render with a **transparent background** (Film → Transparent), crop to the object, and export as **WebP with alpha** into `assets/items/`.
- Render them with the same camera and lens as the room so the perspective matches.
- For the sharpest result, render items at the pixel size they will have on screen and set `"scale": 1`. The current paintings are 256 px and get enlarged ×1.4, so they look slightly soft.
- Keep the lighting in the render flat or neutral. The game adds the flashlight on top.
- Register the item in `data/items.json`:

```json
"painting01": { "src": "assets/items/painting01.webp", "scale": 1.4, "depth": 8, "placement": ["wall"] }
```
`depth` is how far the object sticks out from the wall. A bigger value gives a bigger, softer, more mobile shadow.
`placement` must match a slot's `accepts`. Here, "wall" items only go in wall slots.

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
- Loops: cut at a silent or zero-crossing point so they don't click when they repeat, and keep loudness roughly even across files.

## Tweaking the look
All visual settings live in `src/config.js`, and you can change them freely:
- `flashlight`: beam size (`radius`), edge softness, how dark the darkness is (`ambient`), color tint, and how quickly the beam follows the pointer.
- `shadow`: strength, blur, how far shadows move with the light.
- `glow`: color, intensity, pulse.
- `transition`: speed of the room-change fade and flicker.

## What's next
- Developer tools for placing slots visually, and for designing levels and events.
- Inventory, sound, multiple items per room, real puzzle logic.
