// Boot + on-demand render loop.
import { Renderer } from './renderer.js';
import { loadDB, loadAssets } from './assets.js';
import { generateWorld, seedFromUrl, levelFromUrl } from './world.js';
import { attachInput } from './input.js';
import { Game } from './game.js';
import { Debug } from './debug.js';
import { Hud } from './hud.js';
import { loadSfx, unlockAudio, audioUnlocked, loadAudioIndex } from './audio.js';
import { initSfx, playRole } from './sfx.js';
import { startHeartbeat } from './heartbeat.js';
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

  const [db] = await Promise.all([loadDB(), loadAudioIndex()]);
  const [assets] = await Promise.all([
    loadAssets(db, (p) => (status.textContent = `Loading ${Math.round(p * 100)}%`)),
    initSfx(),
    loadSfx(CONFIG.ambience.random.pool),
  ]);

  const game = new Game({ db, assets });
  const hud = new Hud(assets.sprites);
  const newWorld = (seed, level) =>
    generateWorld(seed, db, { ambience: CONFIG.ambience.loops, maze: CONFIG.maze, ghost: CONFIG.ghost, level });
  // A level is a whole new world: the previous one (its rooms and any keys) is gone, so there is no way back.
  const startLevel = (seed, level) => {
    game.setWorld(newWorld(seed, level));
    setLevelAmbience(game.world);
    if (audioUnlocked()) playRole('levelStart'); // the first level's sound plays on the start-overlay tap
    console.info('[casa] level', level, 'seed', game.world.seed, game.world);
    wake();
  };
  game.onWorldEnd = () => startLevel((game.world.seed + 1) >>> 0, game.world.level + 1);
  // Health 0 -> screamer -> start over from level 1 with a new maze and full health.
  game.onDeath = () => {
    game.health = 1;
    startLevel((Math.random() * 2 ** 32) >>> 0, 1);
  };
  game.onSfx = (role, delay) => playRole(role, delay);
  const debug = new Debug({
    game, renderer, playRandomAmbience,
    regenerate: () => startLevel((Math.random() * 2 ** 32) >>> 0, game.world.level),
    nextLevel: () => game.onWorldEnd(),
  });
  game.onRoomChange = () => debug.refresh();
  if (new URLSearchParams(location.search).has('debug')) window.casa = { game, renderer, assets, db }; // console access
  game.setWorld(newWorld(seedFromUrl(), levelFromUrl()));
  setLevelAmbience(game.world); // queued; starts on the start-overlay gesture
  console.info('[casa] level', game.world.level, 'seed', game.world.seed, game.world);

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
    else {
      last = 0;
      // The loop sleeps when nothing moves; a random ghost must still be able to appear on time.
      if (game.spawnAt !== null) {
        clearTimeout(ghostTimer);
        ghostTimer = setTimeout(wake, Math.max(0, game.spawnAt - performance.now()) + 5);
      }
    }
  };
  let ghostTimer = 0;
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
    playRole('levelStart');
    startHeartbeat(() => (game.phase === 'dead' || game.phase === 'end' ? null : game.health));
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
