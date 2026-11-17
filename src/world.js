// Procedural world generation. Pure data in -> pure data out (no DOM/GL), so a future editor can reuse it.
import { createRng, randomSeed } from './rng.js';

const fits = (slot, item) => (slot.accepts || []).some((t) => (item.placement || []).includes(t));

// world = { seed, rooms: [{ template, item, slot }] }
// Each item appears in exactly one room; consecutive rooms avoid reusing the same slot id.
export function generateWorld(seed, db) {
  const rng = createRng(seed);
  const rooms = [];
  let prevSlot = null;
  for (const itemId of rng.shuffle(Object.keys(db.items))) {
    const item = db.items[itemId];
    const templates = Object.keys(db.rooms).filter((id) => db.rooms[id].slots.some((s) => fits(s, item)));
    if (!templates.length) {
      console.warn(`[world] no room slot accepts item "${itemId}" (placement ${JSON.stringify(item.placement)})`);
      continue;
    }
    const templateId = rng.pick(templates);
    const all = db.rooms[templateId].slots.filter((s) => fits(s, item));
    const fresh = all.filter((s) => s.id !== prevSlot);
    const slot = rng.pick(fresh.length ? fresh : all);
    prevSlot = slot.id;
    rooms.push({ template: templateId, item: itemId, slot: slot.id });
  }
  return { seed: seed >>> 0, rooms };
}

export function seedFromUrl() {
  const s = new URLSearchParams(location.search).get('seed');
  if (s !== null && /^\d+$/.test(s)) return Number(s) >>> 0;
  return randomSeed();
}
