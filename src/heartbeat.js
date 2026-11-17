// The player's hidden health is only ever heard: a heartbeat that starts below CONFIG.heartbeat.start, uses the
// slow sound down to fastBelow and the fast one under it, and beats more often the lower health gets.
// Runs on its own timer chain (the render loop sleeps when nothing moves).
import { CONFIG } from './config.js';
import { audioUnlocked } from './audio.js';
import { playRole } from './sfx.js';

// getHealth() -> 0..1, or null while no heartbeat should play (dead, level card...).
export function startHeartbeat(getHealth) {
  const tick = () => {
    const h = getHealth(), c = CONFIG.heartbeat;
    if (h === null || h > c.start || !audioUnlocked() || document.hidden) return void setTimeout(tick, 250);
    const fast = h < c.fastBelow;
    // k: 1 at the top of the band -> 0 at its bottom.
    const k = fast ? h / c.fastBelow : (h - c.fastBelow) / (c.start - c.fastBelow);
    const [slowest, fastest] = fast ? c.fastGapS : c.slowGapS;
    const gap = fastest + (slowest - fastest) * Math.max(0, Math.min(1, k));
    const dur = playRole(fast ? 'heartbeatFast' : 'heartbeatSlow') ?? 0.6;
    setTimeout(tick, (dur + gap) * 1000);
  };
  tick();
}
