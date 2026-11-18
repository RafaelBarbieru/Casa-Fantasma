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
- `?lang=es` (or `?lang=en`): plays in that language.
- `?seed=42`: always generates the same world. Use this when you want to reproduce something.
- They can be combined: `http://localhost:5173/?debug&seed=42`

## Main menu and options
The "Click to enter" screen also shows a warning about loud noises and flickering lights, and points to the Epilepsy mode option.

After "Click to enter", the main menu appears over the dimmed first room (the ambience is already playing, and the flashlight follows the pointer behind the menu).
- **START** begins level 1. **HOW TO PLAY** is a short tutorial (8 pages: the goal, controls, paintings, posters, dark rooms, levers, ghosts, health). Each page has a small picture made from the game's own art (a door with its key, glowing doors, a slipped painting, a torn poster, a switch glowing in the dark, a door with a row of levers, a ghost, the heart and pills). The text is in `src/locales/` (`tutorial`) and the pictures in `src/tutorial.js`; they use the art by name (`door07`, `painting02`, `poster01`, `door09`, `lever_base`, `lever_handle`, `ghost01`, ...), so renaming or removing one of those leaves a gap in its picture. **OPTIONS** opens the settings:
  - **Audio:** volume sliders for **Master** (everything), **Ambience** (the level loop and the random ambience sounds) and **SFX** (every other sound, including the menu's). Click or drag along a slider; it moves in 5% steps.
  - **Game → Epilepsy mode:** no flickering or flashing light. The flashlight and the ceiling lights fade instead of flickering, ghosts don't shimmer, screamers appear as a still image (no flashing or shaking), and the red screen edge and the heart don't throb with the heartbeat (the heart still jumps).
  - **Game → Language:** English or Español. The first time, the game picks the browser's language (Spanish browsers get Spanish, anything else English).
- Settings are saved in the browser and remembered next time.
- Keyboard: arrow keys (or WASD) move and change values (and turn the tutorial's pages), **Enter** or **Space** clicks, **Escape** goes back.
- **Pause menu:** press **Escape** or click the pause button at the top right during the game (switching to another tab or app also pauses). It has **RESUME**, **OPTIONS** and **QUIT** (back to the main menu; the run is lost and the next START is a new level 1). The game is frozen while paused, ghosts included. The tutorial is only in the main menu.
- **Stats screen:** when a run ends (you die, or you get out of level 10) a screen shows how long the run took, the level you reached, how many ghosts you escaped (leaving a room with a ghost in it, once per ghost per room) and how many grams of pills you took (1 pill = 1 gram), with a joke about the pills. **MAIN MENU** (or Enter / Escape) goes to the main menu. QUIT from the pause menu skips it. Paused time does not count. The jokes are in `src/locales/` (`jokes`); which one shows is decided in `pillJoke()` at the top of `src/menu.js`.
- Sounds: `sfx/ui_select` when you point at an option, `sfx/ui_submit` (one at random) when you click one. Both are always converted to mono.
- The menu's look (colours, positions) is at the top of `src/menu.js`.

## Languages and text
Every piece of text the player sees (start screen, messages, menus, tutorial, stats jokes) is in `src/locales/`: `en.js` (English) and `es.js` (Spanish). To change a line, edit it in both files. Lists like `locked: [...]` are alternatives picked at random, so you can add or remove lines freely.

To add a language: copy `en.js` to e.g. `fr.js`, translate the text (keep the left-hand names like `locked:` as they are), and ask for it to be added to the language list. Anything left untranslated shows in English. The in-game pixel font only has capital letters, digits, common punctuation and the Spanish accented letters (Á É Í Ó Ú Ü Ñ ¿ ¡); other letters need new glyphs.

## How to play
- The current level is shown at the top of the screen, and the pause button at the top right (`hud.level` and `hud.pause` in `src/config.js` set their positions; the pills moved a little to the left to make room).
- Move the mouse (or drag a finger) to aim the flashlight. Things you can interact with glow when you point at them.
- Every level is a maze. The first room has **3 doors**. A door leads either to another door room (2 or 3 doors) or to a **painting room** (1 to 4 paintings or posters).
- Each level has one locked **master door**. Opening it takes you to the next level, and there is no way back.
- A run has **10 levels**. The master door of level 10 shows "You got out." and then the stats screen (a placeholder until there is a real ending). `levels` at the top of `src/config.js` sets the count.

### Difficulty
Levels 1-5 ease you in. Levels 6-10 get much harder: things go wrong more and more often up to level 10. The basics never change between levels: health, how fast a ghost hurts you, how much a pill heals, how long a ghost stays, how long you have to react. All of it is in `src/config.js`, as lists with **one value per level** (the first value is level 1, the last one is level 10). Roughly, from level 5 to level 10:
- the maze grows from about 16 to about 30 rooms (more locked side doors, more rooms behind them, a lever room on every level 10);
- random ghosts come more than twice as often (`ghost.randomPerMin`), ghost rooms are about 3 times as common, and a silence brings a ghost twice as often;
- pills barely become more common (1.6 to 1.9 per level);
- more dark rooms, screamer rooms, faces behind paintings, false alarms, long darks, storms, gusts and faces in the windows.

To change one level, change its value in the list. Lists shorter than 10 repeat their last value; a single value (not a list) applies to every level.
- Click a painting and it slips off one nail and swings, showing the wall behind it. Sometimes something hangs there (a key or pills): **click it to take it**. Now and then a painting falls to the floor instead and cracks, with a crash.
- **Posters** have to be scratched off: every click tears a piece away (with a scratching sound), ripping outward from a random spot on the poster's edge. A poster takes between 3 and 8 clicks. A key or pills hidden under it can be taken as soon as it is fully uncovered, which is sometimes early and sometimes only with the last scratch. The last scratch tears the poster apart with a louder ripping sound; a few scraps stay on the wall.
- Keys you hold appear at the top left, each with a small picture of the door it opens. The **master key is gold**; other keys are grey. Every locked door looks different from all the other doors in the level, so the picture tells you which one it is.
- **Level 1** has only the master door locked. From **level 2** on there are also locked **side doors**: their keys are somewhere in the level, and behind them is either the master key or nothing useful.
- Click the arrow at the bottom (**back**) to return to the room you came from.
- **The glow tells you what's left.** A warm, pulsing glow means there is still something to find there. A dull, still, grey-blue glow means there's nothing left:
  - on a painting, you've already moved it; on a poster, you've torn it apart;
  - on a door, you've explored everything behind it: every painting moved, everything behind them taken, and every door opened, all the way down.

  A door with a locked door anywhere behind it that you haven't opened stays warm. So does the master door.
- Levels are always solvable.

### Scares
- **False alarms.** From level 2, the flashlight sometimes flickers and dies exactly as when a ghost comes (same sound, nothing glows), stays dark for a second or two, then flickers back on, and nothing happens. Never in the first room of a level or in a ghost room. In a lit dark room it is the ceiling light that goes. Debug: **F**.
- **Faces behind paintings.** From level 3, a painting with nothing behind it sometimes hides a face instead: a quick screamer with `sfx/screamer_short`, like a screamer room's. It doesn't hurt you.
- **The long dark.** Sometimes, going through a door (not back), the screen stays black for a second or two longer before the next room shows. Half the time one of the random ambience sounds (`ambience/randomNN`) plays in it. You can also add sounds named `sfx/door_wait...` (a creak, a breath): one of them plays every time.
- **Silences.** Now and then the background ambience fades out completely for 10 to 20 seconds (no random sounds either), then fades back in. Sometimes a ghost comes during the silence, but only where random ghosts can appear (from level 3). Debug: **Q**.

### Ghosts
- **Level 1** has no ghosts.
- **From level 2**, some dead-end doors lead to a **ghost room**: pitch black, with nothing but a ghost.
  - When you walk in, the flashlight flickers and dies, and the ghost fades in.
  - A ghost room always has the same ghost in the same place, so remember which door it was and avoid it.
- **From level 3**, a ghost can appear in any room except the first room of the level, at any moment.
  - The flashlight dies and nothing glows any more, so you have to remember where the doors were and get out: back, or through another door.
  - The ghost stays in that room for 1 to 2 seconds after you escape, so going straight back means meeting it again.
- The higher the level, the more ghost rooms and random ghosts there are.
- **Health.** Ghosts drain it every second you share a room with them (about 8 seconds from full to dead). You hear it and see it:
  - after losing 5%, a slow heartbeat starts, about one beat a second;
  - it speeds up as health falls, switches to a fast heartbeat below 50%, and keeps getting faster towards 0;
  - the heart at the bottom left (`art-src/heart.png`) shows how much is left: the lost part turns dark grey from the top down, and the heart jumps on every "lub" and "dub" of the heartbeat sound;
  - a red glow creeps in from the screen edges once the heartbeat starts, getting stronger as health falls and throbbing with each beat.
- Health does not come back on its own (see `regenPerS`) and carries over between levels.
- **Pills** are hidden behind some paintings (never one that hides a key). Once you take them they pile up at the top right with a count; click the icon to take one. A pill heals **50% of full health**, never above 100%. Taking one always uses it up, even at full health. Pills carry over between levels and are lost when you die.
  - They are rare early on and get a little more common as ghosts do: none in level 1, then on average 0.35, 0.6, 1, 1.3, 1.6, 1.6, 1.7, 1.8 and 1.9.
- At 0% a screamer flashes on screen with a scream (`sfx/screamer_long`), then the stats screen shows, then the main menu; START begins a new run from level 1.

### Dark rooms
- Any room except the first one of a level can be **dark**, from level 1 on. Walking in feels exactly like a ghost room: the flashlight flickers and dies. You can't tell which it is until a ghost does (or doesn't) appear.
- A dark room has a **light switch** (`art-src/light_switch.png`) somewhere on the wall, always in the same place, next to the doors and paintings but never touching them. It is invisible in the dark: you have to search the walls until you point at it and it glows. On a phone, drag your finger along the walls. Until you switch it on, nothing else in the room glows or can be clicked; clicking in the dark just tells you it's too dark.
- Switching it on lights the room from a **ceiling light**: a wide, soft pool of light from above, dimmer at the edges and near the floor. The flashlight stays off in that room. The light stays on if you leave and come back.
- Dark rooms can have doors, keys and pills like any other room, so running away from every dark room can cost you the way out.
- A ghost in a lit room puts the ceiling light out too.
- **Screamer rooms.** A dark room with nothing to find (paintings with no key or pills behind them) is sometimes a screamer room instead: it is empty except for the switch, and a moment after the light comes on, a screamer (one of `art-src/screamerNN.png`) jumps out with a short scream (`sfx/screamer_short`). It doesn't hurt you. There are none on levels 1 and 2; from level 3 they get more likely every level.

### Lever rooms
- From level 3, a level sometimes has a **lever room**: one door and a row of 5 levers (`art-src/lever_base.png` for the plate, `art-src/lever_handle.png` for the handle that moves). All levers start **up**.
- The door opens only when the levers are set to its secret combination, for example up, down, down, down, up. It can be any mix, including all up (the door just opens) or all down. Click a lever to flip it (`sfx/lever01`, `sfx/lever02`...), then click the door to try.
- Wrong: `sfx/lever_fail` plays, the door jolts, and a moment later every lever snaps back up. Right: `sfx/lever_success` plays as you go through, and the levers stay where they are for the rest of the level.
- The lever door never needs a key and is never the master door. Behind it there are a few more rooms: sometimes the **gold key** is there, otherwise nothing important.
- A lever room can also be dark, like any other room.
- **The clue:** the combination is painted on the wall as a row of red arrows (left to right, up = lever up, down = lever down), hidden behind one painting or poster somewhere in the level, never behind the lever door itself. It may be behind a locked side door. It is never behind a painting that hides a key or pills, and that room is never a screamer room. The arrows are drawn by the game (no art file); they can't be clicked. Without the clue the door can still be found by trying combinations.
- The debug panel shows the combination (`^` = up, `v` = down) next to the lever door, the clue next to its painting, and which room holds the clue.

`src/config.js` → `levers`:
- `roomChance`: per level, how likely the level has a lever room (0 on levels 1 and 2). The last value repeats.
- `masterChance`: how likely the gold key is behind the lever door.
- `clueChance`: how likely the combination is painted behind a painting or poster (1 = always, 0 = never). `clue.scale`: arrow size; `clue.fit`: the arrows shrink to at most this share of the painting's width and height; `clue.paint`: their colour (RGB).
- `count`: how many levers (at most the lever spots in the `levers` layout of `data/rooms.json`).
- `pullS`: how long a lever takes to move. `resetDelayS`, `resetS`: after a wrong try, how long the levers wait before snapping up, and how fast they snap.
- `travel`: how far up and down the handle sits from the middle of the plate. `bulge`: how much bigger the handle looks halfway (as it turns towards you).
- The levers' size is `scale` of `lever_base` and `lever_handle` in `data/items.json` (keep them equal); their positions are the `lever-1`...`lever-5` spots of the `levers` layout.
- Levels 1 and 2 keep exactly the same layouts as before for a given seed.

### Windows and weather
- Some rooms have one or two **windows** (`art-src/window.png`) on any level. Windows only go where there is no door: in painting rooms (in a free painting spot) and in ghost rooms. Through the glass you see the night sky, and an open window lets a little cold moonlight into the room.
- Each window has two wooden **shutters** (`art-src/window_door.png`, the right one mirrored) hidden behind the frame. They start open (folded flat, invisible).
- Every level has a **weather**: none, windy or storm. Windy plays `ambience/wind_loop`, storm plays `ambience/rain_loop`, all the time, on top of the level's ambience loop. In a room with an open window it sounds clear. Anywhere else it sounds muffled, as if heard through the walls (thunder and wind sounds too).
- **Windy:** in a room with open windows, a gust comes now and then (`sfx/wind_gust`). Exactly 0.8 s into it, at the gust's loudest point, the shutters swing in from both sides and slam shut in the middle with a bang (`sfx/window_close`), then spring back a little. They stay shut for the rest of the level: the moonlight is gone and the room is muffled from then on. If you leave mid-gust, they slam behind you.
- **Storm:** thunder now and then, in any room (`sfx/thunder`). Where a window is open, the lightning flashes the room bright through it. Sometimes a **face** is standing outside the window, a black silhouette only visible in the flash (drawn by the game, no art file). Leave the room within 1.5 s (any door, or back) or a short screamer jumps out (`sfx/screamer_short`, no damage).
- In epilepsy mode the lightning is one soft swell instead of flashes.
- Debug: the panel shows the weather and which rooms have windows (`x2` = two, `(shut)`). **W** = a gust now (in a room with open windows), **T** = thunder, **Shift+T** = thunder with a face at the window. Test seeds (level 1): `?seed=4` is windy, with a window in room 2 (the `door05` door of the first room); `?seed=7` is a storm, with a window in room 3 (the `door08` door).

`src/config.js` → `windows`:
- `roomChance`: how likely a painting or ghost room has a window (when it has a free painting spot). `twoChance`: how likely it has two.
- `light`: the moonlight: `color`, `amount` (brightness), `reach` (scene px), `drop` (how far below the window its centre is).
- `sky`: how bright the sky behind the glass is.
- `lightning`: at the flash's peak the window light gets `amount` brighter, `reach` times wider, and turns `color`; the sky gets `sky` brighter.
- The window's size is `scale` of `window` in `data/items.json`. The shutters always fit the window, whatever their own `scale`.

`src/config.js` → `weather`:
- `chances`: relative odds of each weather (`{ none: 1, windy: 1, storm: 1 }` = a third each; `windy: 0` = never windy).
- `loops`: the sound for each weather (exact names). `loopVolume`, `fadeInS`, `fadeOutS`: as for the level ambience.
- `muffle`: how muffled outside sounds are in rooms without an open window: `hz` (lower = duller), `gain` (volume), `s` (how fast it changes when you change rooms).
- `gustPerMin`: per level, gusts per minute in a room with open windows. `gustGraceS`: none in the first seconds in a room.
- `slamAtS`: when the shutters hit, in seconds from the start of the gust sound (change it if you replace `wind_gust`). `swingS`: how long they take to swing in (they land exactly at `slamAtS`). `bounceS`, `bounce`: the little spring back after the hit.
- `thunderPerMin`: per level, thunder per minute. `thunderGraceS`: none in the first seconds in a room.
- `faceChance`: per level, how likely a thunder brings a face (in a room with an open window). `escapeS`: seconds you have to get out.
- Adding windows and weather didn't change any seed's layout.

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
  - `screamerChance`: per level, how likely a painting with nothing behind it hides a face (0.05 = 5%; 0 on levels 1 and 2). `screamerDelayS`: how long after the click it jumps out.
- `falseAlarm`:
  - `perMin`: per level, how many false alarms per minute spent in a room (0 = never; level 1 has none).
  - `graceS`: none in the first seconds after entering a room or after another false alarm.
  - `darkS`: `[min, max]` seconds the light stays off. Keep it longer than a ghost takes to appear (`ghost.fadeDelayS`), so you can't tell too early.
  - `backS`: how long the light takes to flicker back on.
- `transition`: `waitChance` = per level, how likely a door gives the long dark; `waitS` = `[min, max]` seconds of it; `waitAmbience` = how likely a random ambience sound plays in it (0.5 = half the time). (`outS`, `inS`: the normal fade between rooms.)
  - The key pictures are `art-src/key.png` and `art-src/master_key.png` (pills use `health.png`); their size on the wall is `scale` in `data/items.json`.
- `posters`: how posters tear.
  - `scratches`: how many clicks it takes to destroy a poster (random between the two, inclusive).
  - `lootAt`: how much of the poster has to be torn off before the hidden key or pills are uncovered, as a share (random between the two). `1` means only when the poster is destroyed; `[0.3, 1]` makes it anything from early on to the very last scratch.
  - `leftover`: how much of the poster stays on the wall as scraps when it's destroyed (0.25 = about a quarter).
  - `jagged`: how ragged the torn edge is. `rim`, `paper`: width and colour of the pale torn-paper edge.
  - `tearS`: how fast each piece tears off. `shake`: how much the poster jolts on each click.
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
  - `screamerDelayS`, `screamerS`: how long after the light comes on the screamer appears, and how long it stays (also for the faces behind paintings).
  - The switch's size is `scale` of `light_switch` in `data/items.json`.
  - Changing these never changes the rest of a seed's layout.
- Add `?level=3` to the address to start at level 3 (for testing). With the debug panel open, **L** skips to the next level.

### The maze settings
`src/config.js` → `maze`:
- `startDoors`, `doors`: doors in the first room, and in the other door rooms (`[2, 3]` = 2 or 3).
- `paintings`: paintings in a painting room (`[1, 4]`).
- `openRooms`: how many rooms you can reach without any key, one `[min, max]` per level. Bigger = bigger maze.
- `sideLocks`: locked side doors, one number per level (0 on level 1, 5 on level 10).
- `sideRooms`: how many rooms are behind each side door, one `[min, max]` per level.
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
- The `levers` layout is only used for lever rooms: one `door` spot and the `lever` spots, left to right.

### Items
- Doors are items with `"placement": ["door"]` and go in `door` slots. Paintings use `"wall"`.
- Posters are wall items too, with `"kind": "poster"` added, which makes them tear instead of slipping. They are mixed in with the paintings at random. Give them a small `depth` (1): they lie flat on the wall.

```json
"poster01": { "src": "assets/poster01.webp", "scale": 2.8, "depth": 1, "placement": ["wall"], "kind": "poster" }
```
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
Put your source images in `art-src/` (PNG, JPG or WebP). `npm run dev` and `npm run build` turn them automatically into small WebP files in `assets/`, in the same folder structure: `art-src/door01.png` becomes `assets/door01.webp`. Name files by what they are (`doorNN`, `paintingNN`, `posterNN`, `wallNN`, `floorNN`). That `.webp` path is what you write in the `data/*.json` files.
While `npm run dev` is running, a new or changed image (or sound) is converted within a second; just reload the page. Deleting a source also deletes its converted file. To redo every image, run `npm run images:force`.
Don't put anything in `assets/` yourself: it is generated, not saved in git, and may be overwritten.

File names are **case-sensitive** once online (`Painting01.webp` ≠ `painting01.webp`). `npm run build` warns you if a name doesn't match.

### A note on GLB
The game uses images, not 3D models, which is what keeps it light on phones.
Keep exporting **rendered images** from Blender (WebP) rather than GLB files. A GLB would force every player's device to render 3D in real time.

### Sounds
- Put sounds into `audio-src/`: **WAV** is best (48 kHz, 16 or 24-bit), but **OGG, MP3 and FLAC** also work. Use `audio-src/sfx/` for short effects and `audio-src/ambience/` for loops and music. You can add more folders.
- Use **lowercase names without spaces**, e.g. `audio-src/sfx/door_creak01.wav`.
- Export mono for sound effects and voice, stereo only where it matters (ambience, music). Mono files come out about half the size. Everything is converted to 48 kHz, and sounds named `ui_...` are always made mono.
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
  | `sfx/poster_scratch` | a piece of a poster is scratched off |
  | `sfx/poster_tear` | the last scratch destroys a poster |
  | `sfx/item` | you pick up a key or pills |
  | `sfx/level_end` | you open the master door |
  | `sfx/level_start` | a level begins (also the first one, when you click START) |
  | `sfx/ghost_spotted` | a ghost fades in |
  | `sfx/flashlight` | the flashlight dies (a ghost appears, or you walk into a dark room); also a lit room's light going out, and switching on a dark room's light |
  | `sfx/heartbeat_slow` | heartbeat, health below 95% |
  | `sfx/heartbeat_fast` | heartbeat, health below 50% |
  | `sfx/screamer_long` | health reached 0 |
  | `sfx/screamer_short` | a screamer room's screamer jumps out, or a face behind a painting |
  | `sfx/door_wait` | the long dark between two rooms (optional: no files = silent) |
  | `sfx/healed` | you take a pill |
  | `sfx/lever0` | a lever is pulled up or down (`lever01`, `lever02`...; not `lever_fail`/`lever_success`) |
  | `sfx/lever_fail` | a lever door is tried with the wrong combination |
  | `sfx/lever_success` | a lever door is tried with the right combination |
  | `sfx/wind_gust` | a gust of wind (windy weather); the shutters slam 0.8 s into it |
  | `sfx/window_close` | the shutters slam shut |
  | `sfx/thunder` | thunder and lightning (storm) |
  | `sfx/ui_select` | menu: pointing at an option (or moving with the arrow keys) |
  | `sfx/ui_submit` | menu: clicking an option |

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
  - The weather loops (`ambience/wind_loop`, `ambience/rain_loop`) are set in `weather.loops`, not here. Their names don't start with `level` or `random`, so they are never picked as a level loop or a random sound.
  - `silence`: the loop sometimes fades out completely, then comes back.
    - `firstDelayS`, `gapS`, `chance`: when it is tried, like the random sounds.
    - `holdS`: `[min, max]` seconds of silence. `fadeOutS`, `fadeInS`: how long the loop takes to go and to come back.
    - `ghostChance`: how likely a ghost comes during the silence, `ghostDelayS` seconds after it starts (only where random ghosts can appear).
    - Debug: **Q** starts one right away.
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
- Door/key/painting sounds, a real ending (level 10 currently just says "You got out.").
