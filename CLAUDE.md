# Casa Fantasma — notes for Claude

Point-and-click horror game built from pre-rendered art. **No engine, no runtime dependencies, no bundler.**
Vanilla ES modules plus raw WebGL1. Targets: itch.io (zip upload), self-hosting, and phone/tablet/desktop browsers.
Roles: the user owns the art and design and does not read the code, so optimise the code for my own maintenance, not for their reading.
The user-facing docs are in README.md; keep them in sync when workflows change.

## Hard constraints
- No game engine or framework. Small, self-written modules are fine. Prefer zero npm deps; if a build step is ever needed, use esbuild only.
- Every path must be **relative** (no leading `/`). itch.io serves the game from a CDN subpath.
- Paths are **case-sensitive** on itch.io and Linux hosts. `npm run build` checks the `src` paths in `data/*.json` for exact case.
- ES modules need HTTP, not `file://`. Use `npm run dev`.
- Mobile first: render on demand, cap DPR (`CONFIG.maxDpr`) and backbuffer width (`maxViewportW`). Handle touch through Pointer Events.
- GLSL ES 1.00 / WebGL1 only, so it runs everywhere. Item textures are padded to POT so mipmaps work.

## Art pipeline (as delivered)
The user said "GLB", but they actually deliver **pre-rendered WebP**:
- Rooms: `assets/rooms/*.webp`, opaque, 1920×1080. This equals the scene coordinate space (`CONFIG.sceneW/H`).
- Items: `assets/items/*.webp`, with alpha, cropped. On screen size = native px × `item.scale` × `slot.scale`.
Do not add a 3D runtime unless the user explicitly asks for one.

## Layout
```
index.html          canvas, start overlay, rotate hint, debug CSS
src/main.js         boot, on-demand rAF loop (wake()), resize, input wiring, world regeneration
src/config.js       ALL tunables (flashlight, shadow, glow, transitions, perf caps)
src/renderer.js     WebGL1: 2 programs (bg, item), 1 unit quad VBO, texture cache (WeakMap by source), letterbox view, context-loss restore
src/shaders.js      GLSL. lightAt() = flashlight mask, evaluated per fragment in every draw (no fullscreen pass)
src/game.js         state: room, light follow, hover/glow, transitions ('in'|'idle'|'out'), hit test, frame() -> draw list
src/input.js        Pointer Events -> move/down/tap/leave in scene coords. Touch moves the light only while the finger is down
src/world.js        generateWorld(seed, db): pure function, seeded. Reusable by a future editor
src/rng.js          mulberry32
src/assets.js       loadDB (data/*.json), loadImage, makeSprite (POT pad + alpha hit mask)
src/debug.js        overlay (` key or ?debug): seed, room, fps, slot markers; N = new world, S = skip room
data/items.json     { id: { src, scale, depth, placement:[tags] } }
data/rooms.json     { id: { src, slots:[{ id, x, y, scale?, accepts:[tags] }] } }   (x, y = item center, scene px)
tools/serve.mjs     static dev server (--lan, --port=, --dir=)
tools/build.mjs     validate paths -> dist/web -> dist/casa-fantasma-web.zip (hand-written zip writer, deflate)
```

## Rendering model
- One draw for the background (blending off), then one draw per item (premultiplied, `ONE, ONE_MINUS_SRC_ALPHA`).
- Item shader, all in one pass:
  - sprite × light;
  - drop shadow = alpha sampled at `uv - offset` with mip bias (blur), drawn only outside the sprite;
  - outer glow = alpha at a high mip bias, outside the sprite, added on top.
- Shadow offset = `(itemCenter - (beam + handOffset)) * depth * perDepth`, clamped to `maxOffset`. It is computed per frame in `game.frame()`.
- Hit test uses the per-pixel alpha mask in native sprite px. Touch also samples 8 points at `touchSlop`.
- The loop runs only while `game.update()` returns busy (light easing, transition, glow) or while debug is on. Input and resize call `wake()`.
- The letterbox is "contain" at 16:9. Portrait on touch devices shows a rotate hint.

## World generation
- Seed comes from `?seed=N`, or is random. The game logs `[casa] seed`.
- Items are shuffled, and each item gets one room. The room template is chosen from those with a compatible slot. Consecutive rooms avoid the same slot id.
- When the item in the last room is clicked, the world regenerates with `seed+1`. This is a placeholder for an ending.

## Next likely work
- Developer tools: slot editor (drag slots on the room, write rooms.json) and an event/trigger editor. Keep `world.js` and the data formats editor-friendly.
- Per-room asset loading or preloading once the asset count grows (right now everything loads up front).
- Inventory, audio (the start overlay already provides the user gesture), multiple items per room, depth sorting.

## Verify
`npm run dev`, then open `http://localhost:5173/?debug&seed=42`. Seed 42 currently puts painting03 at wall-high in room 1 and painting01 at wall-right in room 2.
`npm run build` should print ✓ lines. Test the zip with `npm run preview`.
