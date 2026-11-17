// Global tunables. Scene units = pixels of the 1920x1080 reference room image.
export const CONFIG = {
  sceneW: 1920,
  sceneH: 1080,

  // Backbuffer limits (perf on mobile / hi-dpi). Letterboxed viewport never exceeds maxViewportW backbuffer px.
  maxDpr: 2,
  maxViewportW: 2560,

  // Transparent border added around item sprites so shadow + glow have room to spill (native sprite px).
  spritePad: 48,
  // Alpha threshold (0-255) for pixel-perfect hit testing.
  hitAlpha: 40,
  // Extra hit tolerance for touch, in scene px (fingers are fat).
  touchSlop: 24,

  flashlight: {
    radius: 340,        // scene px where the beam reaches darkness
    softness: 0.6,      // 0..1 fraction of radius used for the falloff edge
    ambient: 0.05,      // brightness outside the beam
    gain: 1.0,          // beam brightness multiplier
    hotspot: 0.25,      // extra brightness at the beam center
    tint: [1.0, 0.94, 0.82],
    follow: 14,         // exponential follow rate (1/s) of beam toward pointer
    handOffset: [60, 160], // light source offset from beam point (flashlight held low-right) -> drives shadow direction
  },

  shadow: {
    strength: 0.7,
    perDepth: 0.0035,   // offset = (itemCenter - lightSource) * depth * perDepth
    maxOffset: 40,      // scene px
    blurBias: 2.4,      // mip bias (blur) base
    blurPerDepth: 0.12, // extra mip bias per depth unit
  },

  glow: {
    color: [1.0, 0.86, 0.6],
    strength: 1.5,
    bias: 3.5,          // mip bias used to spread the alpha outward
    rate: 10,           // fade in/out rate (1/s)
    pulse: 0.2,         // pulse amplitude while hovered
    brighten: 0.15,     // item self-brighten while hovered
  },

  transition: {
    outS: 0.35,
    inS: 0.7,
  },
  // Sound effects: name -> path under assets/audio (no extension). All are decoded at boot.
  sfx: {
    itemClick: 'sfx/keypress_01',
  },
};
