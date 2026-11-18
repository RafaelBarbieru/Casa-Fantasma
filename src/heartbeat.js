// The player's hidden health: a heartbeat that starts below CONFIG.heartbeat.start, uses the slow sound down to
// fastBelow and the fast one under it, and beats more often the lower health gets. The HUD heart (hud.js) pulses
// with each beat through beatEnvelope(). Runs on its own timer chain (the render loop sleeps when nothing moves).
import { CONFIG } from './config.js';
import { audioUnlocked } from './audio.js';
import { playRole } from './sfx.js';

let last = null; // { at: performance.now() ms, role } of the latest beat

// getHealth() -> 0..1, or null while no heartbeat should play (dead, level card...).
// onBeat() is called right after each beat starts (main wakes the render loop so the heart can pulse).
export function startHeartbeat(getHealth, onBeat = () => {}) {
  const tick = () => {
    const h = getHealth(), c = CONFIG.heartbeat;
    if (h === null || h > c.start || !audioUnlocked() || document.hidden) return void setTimeout(tick, 250);
    const fast = h < c.fastBelow;
    // k: 1 at the top of the band -> 0 at its bottom.
    const k = fast ? h / c.fastBelow : (h - c.fastBelow) / (c.start - c.fastBelow);
    const [slowest, fastest] = fast ? c.fastGapS : c.slowGapS;
    const gap = fastest + (slowest - fastest) * Math.max(0, Math.min(1, k));
    const role = fast ? 'heartbeatFast' : 'heartbeatSlow';
    const dur = playRole(role) ?? 0.6;
    last = { at: performance.now(), role };
    onBeat();
    setTimeout(tick, (dur + gap) * 1000);
  };
  tick();
}

// 0..1 visual "thump" at time `now` (performance.now() ms): one quick swell per thump listed in
// CONFIG.heartbeat.thumps for the sound that played. 0 when no beat is in progress.
export function beatEnvelope(now) {
  if (!last) return 0;
  const { attackS, decayS } = CONFIG.heartbeat.pulse;
  const t = (now - last.at) / 1000;
  let e = 0;
  for (const [at, strength] of CONFIG.heartbeat.thumps[last.role] ?? []) {
    const u = t - at;
    if (u < 0 || u > attackS + decayS) continue;
    const v = u < attackS ? u / attackS : 1 - (u - attackS) / decayS;
    e = Math.max(e, strength * v * v * (3 - 2 * v)); // smoothstep: soft in, soft out
  }
  return e;
}
