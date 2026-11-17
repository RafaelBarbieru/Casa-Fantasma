// GLSL ES 1.00 (WebGL1) — runs on every WebGL-capable phone/tablet/desktop.
// The flashlight "mask" is evaluated per-fragment in every draw (lightAt) instead of a separate
// fullscreen darkening pass: same look, zero extra overdraw.

export const VS = `
attribute vec2 aPos;
uniform vec4 uRect;   // scene px: x, y, w, h (top-left origin)
uniform vec2 uScene;  // scene size px
varying vec2 vUv;
varying vec2 vP;
void main() {
  vec2 p = uRect.xy + aPos * uRect.zw;
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
uniform vec3 uTint;
uniform float uNoise;  // 1 = add the fine noise dither, 0 = off (the PS1 post pass dithers instead)
float lightAt(vec2 p) {
  float d = length(p - uLight.xy) / uLight.z;
  float spot = 1.0 - smoothstep(1.0 - uLightP.y, 1.0, d);
  float hot = 1.0 - smoothstep(0.0, 0.5, d);
  return (uLightP.x + spot * (uLightP.w + uLightP.z * hot)) * uLight.w;
}
// Interleaved gradient noise: kills banding in the dark gradients (full-res mode only).
float dither() {
  return uNoise * (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
}
`;

export const FS_BG = HEAD + `
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  gl_FragColor = vec4(c * uTint * lightAt(vP) + dither(), 1.0);
}`;

// One draw per item: drop shadow (offset, mip-blurred alpha) + outer glow (mip-dilated alpha) + sprite.
// Output is premultiplied; blend ONE, ONE_MINUS_SRC_ALPHA.
export const FS_ITEM = HEAD + `
uniform vec4 uShadow;  // uv offset x, y, mip bias, strength
uniform vec4 uGlow;    // rgb, amount (0 = off)
uniform vec2 uGlowP;   // mip bias, self-brighten
void main() {
  vec4 s = texture2D(uTex, vUv);
  float under = 1.0 - s.a;
  float sh = texture2D(uTex, vUv - uShadow.xy, uShadow.z).a * uShadow.w * under;
  float L = lightAt(vP);
  vec3 col = s.rgb * uTint * L * (1.0 + uGlowP.y * uGlow.a);
  if (uGlow.a > 0.001) {
    float b = texture2D(uTex, vUv, uGlowP.x).a;
    float g = smoothstep(0.0, 0.5, b) * under * uGlow.a;
    col += uGlow.rgb * g * (0.3 + 0.7 * min(L, 1.0));
  }
  gl_FragColor = vec4(col + dither() * s.a, s.a + sh);
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
