// Unified pointer input (mouse / touch / pen) via Pointer Events. Emits scene-space coordinates.
// handlers: move(p, kind), down(p, kind), up(p, kind), tap(p, kind), leave(kind)   kind = 'mouse' | 'touch' | 'pen'
const TAP_MAX_MOVE = 14; // css px
const TAP_MAX_MS = 600;

export function attachInput(el, toScene, h) {
  let active = null; // { id, sx, sy, t, kind }
  const local = (e) => {
    const r = el.getBoundingClientRect();
    return { cx: e.clientX - r.left, cy: e.clientY - r.top };
  };
  const scene = (e) => {
    const { cx, cy } = local(e);
    return toScene(cx, cy);
  };

  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { cx, cy } = local(e);
    active = { id: e.pointerId, sx: cx, sy: cy, t: performance.now(), kind: e.pointerType };
    try { el.setPointerCapture(e.pointerId); } catch {}
    h.down?.(toScene(cx, cy), e.pointerType);
  });

  el.addEventListener('pointermove', (e) => {
    if (!e.isPrimary) return;
    // Touch only moves the light while the finger is down; mouse/pen always do.
    if (e.pointerType === 'touch' && (!active || active.id !== e.pointerId)) return;
    h.move?.(scene(e), e.pointerType);
  });

  el.addEventListener('pointerup', (e) => {
    if (!active || active.id !== e.pointerId) return;
    const { cx, cy } = local(e);
    const moved = Math.hypot(cx - active.sx, cy - active.sy);
    const dt = performance.now() - active.t;
    const kind = active.kind;
    active = null;
    h.up?.(toScene(cx, cy), kind);
    // Mouse: any click without a drag. Touch/pen: short tap.
    if (moved <= TAP_MAX_MOVE && (kind === 'mouse' || dt <= TAP_MAX_MS)) h.tap?.(toScene(cx, cy), kind);
  });

  el.addEventListener('pointercancel', (e) => {
    if (!active || active.id !== e.pointerId) return;
    active = null;
    h.up?.(scene(e), e.pointerType);
  });
  el.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') h.leave?.(e.pointerType);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
