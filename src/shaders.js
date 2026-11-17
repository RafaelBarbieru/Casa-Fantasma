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
float lightAt(vec2 p) {
  float d = length(p - uLight.xy) / uLight.z;
  float spot = 1.0 - smoothstep(1.0 - uLightP.y, 1.0, d);
  float hot = 1.0 - smoothstep(0.0, 0.5, d);
  return (uLightP.x + spot * (uLightP.w + uLightP.z * hot)) * uLight.w;
}
// Interleaved gradient noise: kills banding in the dark gradients.
float dither() {
  return (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
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
