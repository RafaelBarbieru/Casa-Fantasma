// GLSL ES 1.00 (WebGL1) — runs on every WebGL-capable phone/tablet/desktop.
// The light "mask" (flashlight + the ceiling light of a lit dark room + moonlight from up to two windows) is evaluated per-fragment in every draw
// (lightAt) instead of a separate fullscreen darkening pass: same look, zero extra overdraw.

export const VS = `
attribute vec2 aPos;
uniform vec4 uRect;   // scene px: x, y, w, h (top-left origin)
uniform vec2 uScene;  // scene size px
uniform vec3 uRot;    // rotation (radians, clockwise on screen) around pivot x, y (scene px). 0 = none
varying vec2 vUv;
varying vec2 vP;
void main() {
  vec2 p = uRect.xy + aPos * uRect.zw - uRot.yz;
  float rc = cos(uRot.x), rs = sin(uRot.x);
  p = uRot.yz + vec2(rc * p.x - rs * p.y, rs * p.x + rc * p.y);
  vP = p;
  vUv = aPos;
  vec2 c = p / uScene * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
varying vec2 vP;
uniform sampler2D uTex;
uniform vec4 uLight;   // beam x, y (scene px), radius, exposure
uniform vec4 uLightP;  // ambient, softness, hotspot, gain
uniform vec4 uRoomLight;  // ceiling light x, y (scene px), reach px, amount (0 = off)
uniform vec3 uRoomLightP; // ambient, peak, vertical stretch
uniform vec4 uWin0;    // window light: x, y (scene px), reach px, amount (0 = none)
uniform vec4 uWin1;
uniform vec3 uWinC;    // window light colour (cold moonlight, whiter in a lightning flash)
uniform vec3 uTint;
uniform float uNoise;  // 1 = add the fine noise dither, 0 = off (the PS1 post pass dithers instead)
float winAt(vec4 w, vec2 p) {
  float k = 1.0 - smoothstep(0.0, 1.0, length((p - w.xy) * vec2(0.85, 1.0)) / w.z);
  return w.w * k * k;
}
vec3 lightAt(vec2 p) {
  float d = length(p - uLight.xy) / uLight.z;
  float spot = 1.0 - smoothstep(1.0 - uLightP.y, 1.0, d);
  float hot = 1.0 - smoothstep(0.0, 0.5, d);
  float flash = (uLightP.x + spot * (uLightP.w + uLightP.z * hot)) * uLight.w;
  // Ceiling light: a wide, soft pool from above. Never reaches full brightness at the edges.
  float r = length((p - uRoomLight.xy) * vec2(1.0, uRoomLightP.z)) / uRoomLight.z;
  float room = (uRoomLightP.x + uRoomLightP.y * (1.0 - smoothstep(0.0, 1.0, r))) * uRoomLight.w;
  return uTint * (flash + room) + uWinC * (winAt(uWin0, p) + winAt(uWin1, p));
}
// Interleaved gradient noise: kills banding in the dark gradients (full-res mode only).
float dither() {
  return uNoise * (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
}
`;

// Room background, all procedural from two tiling textures:
//   wall (uTex) repeats flat above the floor line; floor (uFloor) below it in perspective. The floor row at
//   screen y is at depth z = d0 / (y - horizon), so texels grow toward the bottom and the tile lines converge
//   on (scene centre, horizon). Both are sampled unconditionally (no texture fetch inside a branch -> mip-safe).
export const FS_BG = HEAD + `
uniform sampler2D uFloor;
uniform vec4 uRoom;  // floor line y, horizon y, wall tile px, floor tile px
uniform vec3 uSeam;  // darkening at the floor line: strength, width px; + vanishing point x
void main() {
  float fy = uRoom.x, d0 = fy - uRoom.y;
  vec3 wall = texture2D(uTex, vP / uRoom.z).rgb;
  float z = d0 / max(vP.y - uRoom.y, d0);
  vec2 fuv = vec2((vP.x - uSeam.z) * z, d0 * z) / uRoom.w;
  vec3 floorC = texture2D(uFloor, fuv).rgb;
  vec3 c = vP.y < fy ? wall : floorC;
  c *= 1.0 - uSeam.x * exp(-abs(vP.y - fy) / uSeam.y);
  gl_FragColor = vec4(c * lightAt(vP) + dither(), 1.0);
}`;

// One draw per item: drop shadow (offset, mip-blurred alpha) + outer glow (mip-dilated alpha) + sprite.
// Output is premultiplied; blend ONE, ONE_MINUS_SRC_ALPHA.
export const FS_ITEM = HEAD + `
uniform vec4 uShadow;  // uv offset x, y, mip bias, strength
uniform vec4 uGlow;    // rgb, amount (0 = off)
uniform vec2 uGlowP;   // mip bias, self-brighten
uniform float uClip;   // texture v below which glow + shadow are cut (floor items); > 1 = no cut
uniform vec4 uFx;      // self-lit 0..1 (ignores the flashlight), opacity, brightness, additive 0..1 (ghosts)
uniform vec4 uCrack;   // cracks (fallen paintings): impact point u, v; amount 0..1 (0 = none); seed
uniform vec3 uCrackP;  // line width (uv of the height), darkening, texture aspect w/h
uniform vec4 uTear;    // torn posters: rip start point (box coords 0..1), threshold (0 = untorn), noise seed
uniform vec4 uTearB;   // art box in texture uv: x, y, w, h (box coords = (uv - xy) / zw)
uniform vec4 uTearP;   // box aspect w/h, max distance from the start point, edge jaggedness, paper rim width
uniform vec3 uTearC;   // colour of the torn paper rim
// Jagged rays out of the impact point. Only runs for a cracked item (uniform branch, no texture fetch inside).
float crack(vec2 uv) {
  vec2 q = (uv - uCrack.xy) * vec2(uCrackP.z, 1.0) + 1e-4;
  float r = length(q), a = atan(q.y, q.x), c = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float h = fract(sin(fi * 12.9898 + uCrack.w) * 43758.5453);
    float len = 0.12 + 0.3 * h;
    float da = mod(a - fi * 0.8976 - h * 0.6 - uCrack.w + sin(r * 37.0 + fi * 5.1) * 0.15 + 3.14159, 6.28318) - 3.14159;
    c = max(c, step(abs(da) * r, uCrackP.x * (1.0 - r / len)) * step(r, len));
  }
  return c;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}
// Tear field: distance from the rip's start point (0 there, ~1 at the far corner) + jagged noise. Paper whose field is
// below the threshold is gone. src/game.js tearAt() is the same without the noise (hit test, loot placement).
float tearField(vec2 uv) {
  vec2 q = (uv - uTearB.xy) / uTearB.zw;
  vec2 a = vec2(uTearP.x, 1.0);
  float d = length((q - uTear.xy) * a) / uTearP.y;
  vec2 n = q * a + uTear.w;
  return d + uTearP.z * (0.65 * vnoise(n * 7.0) + 0.35 * vnoise(n * 23.0) - 0.5);
}
void main() {
  vec4 s = texture2D(uTex, vUv);
  // Torn poster: cut the paper away (uniform branch; the texture fetches below stay outside it).
  float keepSh = 1.0, keepGlow = 1.0, rim = 0.0;
  if (uTear.z > 0.0) {
    float f = tearField(vUv);
    float keep = step(uTear.z, f);
    rim = keep * (1.0 - step(uTear.z + uTearP.w, f)) * s.a;
    keepGlow = smoothstep(uTear.z - 0.08, uTear.z + 0.02, f);
    keepSh = step(uTear.z, tearField(vUv - uShadow.xy));
    s *= keep;
  }
  float under = (1.0 - s.a) * step(vUv.y, uClip);
  float sh = texture2D(uTex, vUv - uShadow.xy, uShadow.z).a * uShadow.w * under * keepSh;
  vec3 L = mix(lightAt(vP), vec3(1.0), uFx.x);
  float Lm = min(max(L.r, max(L.g, L.b)), 1.0);
  vec3 col = s.rgb * L * uFx.z * (1.0 + uGlowP.y * uGlow.a);
  if (uCrack.z > 0.0) col *= 1.0 - crack(vUv) * uCrack.z * uCrackP.y;
  col = mix(col, uTearC * L * s.a, rim);
  if (uGlow.a > 0.001) {
    float b = texture2D(uTex, vUv, uGlowP.x).a * keepGlow;
    float g = smoothstep(0.0, 0.5, b) * under * uGlow.a;
    col += uGlow.rgb * g * (0.3 + 0.7 * Lm);
  }
  gl_FragColor = vec4(col + dither() * s.a, (s.a + sh) * (1.0 - uFx.w)) * uFx.y;
}`;

// HUD layer: premultiplied canvas texture, no lighting.
export const FS_HUD = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() {
  gl_FragColor = texture2D(uTex, vUv);
}`;

// PS1 post pass: the low-res framebuffer is drawn to the screen with nearest filtering, and each low-res
// pixel is reduced to uPs1.x levels per channel using a 4x4 ordered (Bayer) dither, like the PS1's 15-bit output.
export const FS_POST = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;   // framebuffer size px
uniform vec2 uPs1;   // levels - 1 per channel, dither strength
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 px = floor(vUv * uRes);
  // The framebuffer's row 0 is the bottom; scene uv has y down.
  vec3 c = texture2D(uTex, vec2(px.x + 0.5, uRes.y - px.y - 0.5) / uRes).rgb;
  float d = (bayer4(px) - 0.5) * uPs1.y;
  c = clamp(floor(c * uPs1.x + 0.5 + d) / uPs1.x, 0.0, 1.0);
  gl_FragColor = vec4(c, 1.0);
}`;
