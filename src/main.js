// Boot + on-demand render loop.
import { Renderer } from './renderer.js';
import { loadDB, loadAssets } from './assets.js';
import { generateWorld, seedFromUrl } from './world.js';
import { attachInput } from './input.js';
import { Game } from './game.js';
import { Debug } from './debug.js';
import { Hud } from './hud.js';
import { loadSfx, unlockAudio, playSfx } from './audio.js';
import { CONFIG } from './config.js';
import { setLevelAmbience, startRandomAmbience, playRandomAmbience } from './ambience.js';

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const status = document.getElementById('status');

async function boot() {
  const renderer = Renderer.create(canvas);
  if (!renderer) {
    status.textContent = 'This browser does not support WebGL.';
    return;
  }

  const db = await loadDB();
  const [assets] = await Promise.all([
    loadAssets(db, (p) => (status.textContent = `Loading ${Math.round(p * 100)}%`)),
    loadSfx([...new Set([...Object.values(CONFIG.sfx), ...CONFIG.ambience.random.pool])]),
  ]);

  const game = new Game({ db, assets });
  const hud = new Hud(assets.sprites);
  const newWorld = (seed) => generateWorld(seed, db, { ambience: CONFIG.ambience.loops, maze: CONFIG.maze });
  const regenerate = (seed) => {
    game.setWorld(newWorld(seed ?? (game.world.seed + 1) >>> 0));
    setLevelAmbience(game.world);
    wake();
  };
  game.onWorldEnd = () => regenerate();
  game.onSfx = (role) => CONFIG.sfx[role] && playSfx(CONFIG.sfx[role]);
  const debug = new Debug({ game, renderer, regenerate: () => regenerate((Math.random() * 2 ** 32) >>> 0), playRandomAmbience });
  game.onRoomChange = () => debug.refresh();
  game.setWorld(newWorld(seedFromUrl()));
  setLevelAmbience(game.world); // queued; starts on the start-overlay gesture
  console.info('[casa] seed', game.world.seed, game.world);

  // --- loop: renders only while something changes (battery-friendly on mobile)
  let raf = 0, last = 0, dirty = true;
  const loop = (t) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    const busy = game.update(dt);
    const draw = busy || dirty;
    if (draw) {
      hud.update(game.hudState());
      renderer.draw(game.frame(), hud);
    }
    dirty = false;
    debug.tick(dt, draw);
    if (busy || debug.on) raf = requestAnimationFrame(loop);
    else last = 0;
  };
  function wake() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(loop);
  }

  const onResize = () => {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    debug.refresh();
    wake();
  };
  addEventListener('resize', onResize);
  visualViewport?.addEventListener('resize', onResize);
  new ResizeObserver(onResize).observe(canvas);
  renderer.onRestore = wake;
  addEventListener('keydown', wake);
  onResize();

  attachInput(canvas, (x, y) => renderer.cssToScene(x, y), {
    move: (p, k) => { game.pointerMove(p, k); wake(); },
    down: (p, k) => { game.pointerDown(p, k); wake(); },
    tap: (p, k) => { game.tap(p, k); wake(); },
    leave: () => { game.pointerLeave(); wake(); },
  });

  // Click/tap to start: gives us a user gesture (needed later for audio + fullscreen on mobile).
  status.textContent = matchMedia('(pointer: coarse)').matches ? 'Tap to enter' : 'Click to enter';
  overlay.classList.add('ready');
  overlay.addEventListener('pointerdown', () => {
    overlay.classList.add('hidden');
    unlockAudio();
    startRandomAmbience();
    if (matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen?.().catch(() => {});
    game.enterRoom(game.roomIndex); // restart flicker-in now that the player is looking
    wake();
  }, { once: true });
}

boot().catch((e) => {
  console.error(e);
  status.textContent = 'Failed to start: ' + e.message;
});
