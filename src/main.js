// Boot + on-demand render loop.
import { Renderer } from './renderer.js';
import { loadDB, loadAssets, addClueSprites } from './assets.js';
import { generateWorld, seedFromUrl, levelFromUrl } from './world.js';
import { attachInput } from './input.js';
import { Game } from './game.js';
import { DEV } from './dev.js';
import { Hud } from './hud.js';
import { loadSfx, unlockAudio, audioUnlocked, loadAudioIndex, setVolumes } from './audio.js';
import { initSfx, playRole } from './sfx.js';
import { startHeartbeat, beatEnvelope } from './heartbeat.js';
import { CONFIG, atLevel } from './config.js';
import { setLevelAmbience, startRandomAmbience, playRandomAmbience, startSilence, ambienceLoops, ambiencePool, setOutside } from './ambience.js';
import { Menu } from './menu.js';
import { settings, loadSettings } from './settings.js';
import { L, applyDom } from './i18n.js';

const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');
const status = document.getElementById('status');

loadSettings();
setVolumes(settings);
// ?lang=es: play in that language (it is saved along with the settings the next time an option changes).
settings.lang = new URLSearchParams(location.search).get('lang') ?? settings.lang;
applyDom();

async function boot() {
  const renderer = Renderer.create(canvas);
  if (!renderer) {
    status.textContent = L().dom.noWebgl;
    return;
  }

  const [db] = await Promise.all([loadDB(), loadAudioIndex()]);
  const [assets] = await Promise.all([
    loadAssets(db, (p) => (status.textContent = L().dom.loadingPct(Math.round(p * 100)))),
    initSfx(),
    loadSfx(ambiencePool()),
  ]);

  const game = new Game({ db, assets });
  const hud = new Hud(assets.sprites);
  // avoidAmbience: the previous level's loop, so two levels in a row never share one.
  const newWorld = (seed, level, avoidAmbience = null) => generateWorld(seed, db, {
    ambience: ambienceLoops(), avoidAmbience, maze: CONFIG.maze, ghost: CONFIG.ghost, pills: CONFIG.pills, dark: CONFIG.darkRooms, levers: CONFIG.levers, crooked: CONFIG.crooked, traps: CONFIG.traps,
    windows: CONFIG.windows, weather: atLevel(CONFIG.weather.chances, level), level,
  });
  // A level is a whole new world: the previous one (its rooms and any keys) is gone, so there is no way back.
  // sound: false when the main menu is shown next (its START plays it).
  const startLevel = (seed, level, sound = true) => {
    const world = newWorld(seed, level, game.world?.ambience);
    addClueSprites(world, assets.sprites);
    game.setWorld(world);
    setLevelAmbience(game.world);
    if (sound && audioUnlocked()) playRole('levelStart');
    console.info('[casa] level', level, 'seed', game.world.seed, game.world);
    wake();
  };
  // After the "Level N" card: the next level, or, after the last one's "You got out." card, the run's stats screen.
  game.onWorldEnd = () => (game.isLastLevel() ? toMainMenu(true) : startLevel((game.world.seed + 1) >>> 0, game.world.level + 1));
  // A new run: level 1 with a new maze, full health and no pills (after death or QUIT: see toMainMenu).
  const newRun = (sound) => {
    game.health = 1;
    game.pills = 0;
    game.run = { at: performance.now(), ghosts: 0, grams: 0 };
    startLevel((Math.random() * 2 ** 32) >>> 0, 1, sound);
  };
  game.onDeath = () => toMainMenu(false); // health 0 -> screamer -> stats screen -> main menu (a new run, START begins it)
  game.onSfx = (role, delay) => {
    playRole(role, delay);
    // The long dark between rooms sometimes brings one of the random ambience sounds.
    if (role === 'doorWait' && Math.random() < CONFIG.transition.waitAmbience) playRandomAmbience();
  };
  // Debug overlay + cheat keys: dev only (the release build has no debug.js).
  const debug = DEV ? new (await import('./debug.js')).Debug({
    game, renderer, playRandomAmbience, startSilence,
    regenerate: () => startLevel((Math.random() * 2 ** 32) >>> 0, game.world.level),
    nextLevel: () => game.onWorldEnd(),
  }) : null;
  // Outside sounds (weather loop, thunder, wind) are clear only in a room with an open window.
  game.onRoomChange = () => {
    debug?.refresh();
    setOutside(game.outsideOpen());
  };

  // Menus. Main: after the start overlay, over the dimmed start room (the game runs behind it: the flashlight follows
  // the pointer, nothing in the room reacts). START begins the first level. Pause: Esc or the HUD pause button once
  // the game has started; the game is frozen (no update) until RESUME.
  let started = false, heartbeat = false, pausedAt = 0;
  const backToGame = () => {
    hud.sig = ''; // the menu drew into the HUD canvas: force the game HUD to redraw
    if (menuPointer) game.pointerMove(menuPointer.p, menuPointer.k); // so hover works without moving first
    wake();
  };
  const menu = new Menu({
    w: hud.w, h: hud.h,
    art: { wall: assets.surfaces.get('wall02'), floor: assets.surfaces.get('floor01') }, // tutorial pictures
    onSfx: (role) => playRole(role),
    onChange: () => { setVolumes(settings); applyDom(); wake(); },
    onStart: () => {
      started = true;
      game.run.at = performance.now(); // the run's clock starts now, not when the menu came up
      playRole('levelStart');
      if (!heartbeat) startHeartbeat(() => (menu.open || game.phase === 'dead' || game.phase === 'end' ? null : game.health), wake);
      heartbeat = true;
      // Silences only while playing; sometimes a random ghost comes during one.
      startRandomAmbience(() => {
        if (!started || menu.open || game.phase !== 'idle') return false;
        const S = CONFIG.ambience.silence, [a, b] = S.ghostDelayS;
        if (Math.random() < atLevel(S.ghostChance, game.world.level)) game.hurryGhost((a + Math.random() * (b - a)) * 1000);
        wake();
      });
      game.enterRoom(game.roomIndex); // restart flicker-in now that the player is looking
      backToGame();
    },
    onResume: () => {
      game.shiftClock(performance.now() - pausedAt);
      backToGame();
    },
    onQuit: () => toMainMenu(),
  });
  // Back to the main menu with a fresh run behind it. START plays levelStart, so no sound here.
  // escaped: true (last level done) / false (died) shows the run's stats first; undefined (QUIT) goes straight there.
  function toMainMenu(escaped) {
    const stats = escaped === undefined ? null : {
      escaped, level: game.world.level, levels: CONFIG.levels, ms: performance.now() - game.run.at,
      ghosts: game.run.ghosts, grams: game.run.grams, held: game.pills,
    };
    started = false;
    newRun(false);
    if (stats) menu.showStats(stats);
    else menu.show('main');
    wake();
  }
  const pause = (sound) => {
    if (!started || menu.open || game.phase === 'dead') return;
    pausedAt = performance.now();
    game.hover = null;
    pauseHover = false;
    menu.show('pause');
    if (sound) playRole('uiSubmit');
    wake();
  };
  // The tab going to the background pauses too (the loop stops there, but the ghost timers run on the wall clock).
  document.addEventListener('visibilitychange', () => document.hidden && pause(false));
  let menuPointer = null, pauseHover = false;
  const aim = (p, k) => { if (!started) { game.light.tx = p.x; game.light.ty = p.y; } menuPointer = { p, k }; };
  const pb = CONFIG.hud.pause;
  const onPause = (p) => Math.abs(p.x - pb.x) <= pb.w / 2 && Math.abs(p.y - pb.y) <= pb.h / 2;
  if (DEV && new URLSearchParams(location.search).has('debug')) window.casa = { game, renderer, assets, db }; // console access
  const world = newWorld(seedFromUrl(), levelFromUrl());
  addClueSprites(world, assets.sprites);
  game.setWorld(world);
  setLevelAmbience(game.world); // queued; starts on the start-overlay gesture
  console.info('[casa] level', game.world.level, 'seed', game.world.seed, game.world);

  // --- loop: renders only while something changes (battery-friendly on mobile)
  let raf = 0, last = 0, dirty = true;
  const loop = (t) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 1 / 60;
    last = t;
    const pulse = Math.round(beatEnvelope(performance.now()) * 20) / 20; // HUD heart thump
    const paused = started && menu.open;
    const busy = !paused && (game.update(dt) || pulse > 0);
    const draw = busy || dirty;
    if (draw) {
      if (menu.open) menu.draw(hud);
      else hud.update({ ...game.hudState(), pulse, pause: game.phase === 'dead' ? null : { hover: pauseHover } });
      renderer.draw(game.frame(), hud);
    }
    dirty = false;
    debug?.tick(dt, draw);
    if (busy || debug?.on) raf = requestAnimationFrame(loop);
    else {
      last = 0;
      // The loop sleeps when nothing moves; a random ghost or a false alarm must still come on time.
      const at = game.nextTimer();
      if (at !== null) {
        clearTimeout(ghostTimer);
        ghostTimer = setTimeout(wake, Math.max(0, at - performance.now()) + 5);
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
    debug?.refresh();
    wake();
  };
  addEventListener('resize', onResize);
  visualViewport?.addEventListener('resize', onResize);
  new ResizeObserver(onResize).observe(canvas);
  renderer.onRestore = wake;
  addEventListener('keydown', (e) => {
    if (menu.open) {
      if (menu.key(e)) e.preventDefault();
      wake();
      return;
    }
    if (e.code === 'Escape' && !e.repeat) pause(true);
    // Space = back arrow (keyboard players). Only once the start overlay is gone; ignore auto-repeat.
    if (e.code === 'Space') {
      e.preventDefault(); // no page scroll / button activation
      if (!e.repeat && overlay.classList.contains('hidden')) game.back();
    }
    wake();
  });
  onResize();

  attachInput(canvas, (x, y) => renderer.cssToScene(x, y), {
    move: (p, k) => {
      if (menu.open) { menu.move(p, k); aim(p, k); } else {
        pauseHover = k !== 'touch' && onPause(p);
        game.pointerMove(p, k);
      }
      wake();
    },
    down: (p, k) => { if (menu.open) { menu.down(p, k); aim(p, k); } else game.pointerDown(p, k); wake(); },
    up: () => { if (menu.open) { menu.up(); wake(); } },
    tap: (p, k) => {
      if (menu.open) menu.tap(p, k);
      else if (onPause(p)) { menuPointer = { p, k }; pause(true); } else game.tap(p, k);
      wake();
    },
    leave: () => { if (menu.open) menu.select(null); else { pauseHover = false; game.pointerLeave(); } wake(); },
  });

  // Click/tap to start: gives us a user gesture (needed later for audio + fullscreen on mobile).
  status.textContent = matchMedia('(pointer: coarse)').matches ? L().dom.tapToEnter : L().dom.clickToEnter;
  overlay.classList.add('ready');
  overlay.addEventListener('pointerdown', () => {
    overlay.classList.add('hidden');
    unlockAudio(); // the level's ambience starts here, under the menu
    if (matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen?.().catch(() => {});
    menu.show();
    wake();
  }, { once: true });
}

boot().catch((e) => {
  console.error(e);
  status.textContent = L().dom.failed(e.message);
});
