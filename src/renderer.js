// Minimal raw-WebGL1 renderer. Dumb by design: game.js builds a frame description, this draws it.
// PS1 mode (CONFIG.ps1.enabled): the scene + HUD are drawn into a small framebuffer (ps1.width x 16:9),
// then one post pass upscales it to the letterbox with hard pixels and 15-bit ordered-dither color.
import { CONFIG } from './config.js';
import { VS, FS_BG, FS_ITEM, FS_HUD, FS_POST } from './shaders.js';

const NO_FX = [0, 1, 1, 0];
const NO_ROT = [0, 0, 0];
const NO_CRACK = [0, 0, 0, 0];

export class Renderer {
  static create(canvas) {
    const r = new Renderer(canvas);
    return r.init() ? r : null;
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.lost = false;
    this.onRestore = null;
    // View = letterbox mapping. bw/bh backbuffer px; x/y/w/h viewport (gl coords); top = viewport top offset (DOM coords).
    this.view = { bw: 1, bh: 1, dpr: 1, x: 0, y: 0, w: 1, h: 1, top: 0, scale: 1 };
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.init();
      this.onRestore?.();
    });
  }

  init() {
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
    const gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    this.gl = gl;
    this.lost = false;
    this.textures = new WeakMap();
    this.fb = null;     // { fbo, tex, w, h } low-res target, created on first PS1 draw
    this.hudTex = null; // recreated after context loss
    this.pBg = this._program(VS, FS_BG);
    this.pItem = this._program(VS, FS_ITEM);
    this.pHud = this._program(VS, FS_HUD);
    this.pPost = this._program(VS, FS_POST);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    return true;
  }

  _program(vsSrc, fsSrc) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  // source: HTMLImageElement | HTMLCanvasElement. mip/repeat require POT size.
  texture(source, mip, repeat = false) {
    let t = this.textures.get(source);
    if (t) return t;
    const gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.textures.set(source, t);
    return t;
  }

  // Low-res render target for PS1 mode.
  _target() {
    const gl = this.gl;
    const w = CONFIG.ps1.width, h = Math.round((w * CONFIG.sceneH) / CONFIG.sceneW);
    if (this.fb && this.fb.w === w && this.fb.h === h) return this.fb;
    if (this.fb) {
      gl.deleteFramebuffer(this.fb.fbo);
      gl.deleteTexture(this.fb.tex);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (this.fb = { fbo, tex, w, h });
  }

  // HUD canvas -> texture, re-uploaded only when its version changes.
  _hud(hud) {
    const gl = this.gl;
    if (!this.hudTex) {
      this.hudTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      this.hudVer = -1;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.hudTex);
    if (this.hudVer !== hud.version) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hud.canvas);
      this.hudVer = hud.version;
    }
  }

  // cssW/cssH = canvas CSS size. Returns true if the backbuffer changed.
  resize(cssW, cssH) {
    const { sceneW, sceneH, maxDpr, maxViewportW } = CONFIG;
    let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const fitCss = Math.min(cssW / sceneW, cssH / sceneH);
    if (sceneW * fitCss * dpr > maxViewportW) dpr = maxViewportW / (sceneW * fitCss);
    const bw = Math.max(1, Math.round(cssW * dpr)), bh = Math.max(1, Math.round(cssH * dpr));
    const v = this.view;
    const changed = bw !== v.bw || bh !== v.bh;
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    const scale = Math.min(bw / sceneW, bh / sceneH);
    const w = Math.round(sceneW * scale), h = Math.round(sceneH * scale);
    const x = (bw - w) >> 1, y = (bh - h) >> 1;
    Object.assign(v, { bw, bh, dpr, x, y, w, h, top: bh - y - h, scale: w / sceneW });
    return changed;
  }

  // CSS px (relative to canvas) -> scene px
  cssToScene(cx, cy) {
    const v = this.view;
    return { x: (cx * v.dpr - v.x) / v.scale, y: (cy * v.dpr - v.top) / v.scale };
  }

  sceneToCss(sx, sy) {
    const v = this.view;
    return { x: (sx * v.scale + v.x) / v.dpr, y: (sy * v.scale + v.top) / v.dpr };
  }

  _common(prog, light) {
    const gl = this.gl, u = prog.u, f = CONFIG.flashlight;
    gl.useProgram(prog.p);
    gl.uniform2f(u.uScene, CONFIG.sceneW, CONFIG.sceneH);
    gl.uniform4f(u.uLight, light.x, light.y, light.r, light.exposure);
    gl.uniform4f(u.uLightP, f.ambient, f.softness, f.hotspot, f.gain);
    gl.uniform3f(u.uTint, f.tint[0], f.tint[1], f.tint[2]);
    gl.uniform1f(u.uNoise, CONFIG.ps1.enabled ? 0 : 1);
    gl.uniform1i(u.uTex, 0);
  }

  // frame = { light:{x,y,r,exposure}, bg: { wall, floor, wallTile, floorTile } | null,
//           items: [{ sprite, rect:[x,y,w,h], shadow:[ux,uy,bias,str], glow:[r,g,b,a], glowP:[bias,brighten], clip,
//                     fx?, rot?:[radians, pivotX, pivotY], crack?:[u, v, amount, seed] }] }
  // hud = Hud (canvas + version) or null
  draw(frame, hud) {
    if (this.lost) return;
    const gl = this.gl, v = this.view, ps1 = CONFIG.ps1;
    gl.viewport(0, 0, v.bw, v.bh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    let fb = null;
    if (ps1.enabled) {
      fb = this._target();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo);
      gl.viewport(0, 0, fb.w, fb.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // No sub-pixel precision: snap sprites and the beam to whole low-res pixels.
      if (ps1.snap) {
        const px = CONFIG.sceneW / fb.w, snap = (n) => Math.round(n / px) * px;
        frame = {
          ...frame,
          light: { ...frame.light, x: snap(frame.light.x), y: snap(frame.light.y) },
          items: frame.items.map((it) => ({ ...it, rect: [snap(it.rect[0]), snap(it.rect[1]), it.rect[2], it.rect[3]] })),
        };
      }
    } else gl.viewport(v.x, v.y, v.w, v.h);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);

    if (frame.bg?.wall && frame.bg.floor) {
      const bg = frame.bg, u = this.pBg.u, r = CONFIG.room;
      gl.disable(gl.BLEND);
      this._common(this.pBg, frame.light);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(bg.floor, true, true));
      gl.uniform1i(u.uFloor, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(bg.wall, true, true));
      gl.uniform4f(u.uRoom, CONFIG.sceneH * r.floorLine, r.horizonY, bg.wallTile, bg.floorTile);
      gl.uniform3f(u.uSeam, r.seam[0], r.seam[1], CONFIG.sceneW / 2);
      gl.uniform4f(u.uRect, 0, 0, CONFIG.sceneW, CONFIG.sceneH);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (frame.items.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const p = this.pItem, u = p.u;
      this._common(p, frame.light);
      for (const it of frame.items) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture(it.sprite.canvas, true));
        gl.uniform4fv(u.uRect, it.rect);
        gl.uniform4fv(u.uShadow, it.shadow);
        gl.uniform4fv(u.uGlow, it.glow);
        gl.uniform2fv(u.uGlowP, it.glowP);
        gl.uniform1f(u.uClip, it.clip ?? 2);
        gl.uniform4fv(u.uFx, it.fx ?? NO_FX);
        gl.uniform3fv(u.uRot, it.rot ?? NO_ROT);
        gl.uniform4fv(u.uCrack, it.crack ?? NO_CRACK);
        if (it.crack) gl.uniform3f(u.uCrackP, CONFIG.paintings.crackPx / it.rect[3], CONFIG.paintings.crackDarken, it.rect[2] / it.rect[3]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    // Full-scene overlay image (the screamer): plain textured quad, unlit.
    if (frame.overlay) {
      gl.disable(gl.BLEND);
      gl.useProgram(this.pHud.p);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(frame.overlay.img, false));
      gl.uniform2f(this.pHud.u.uScene, CONFIG.sceneW, CONFIG.sceneH);
      gl.uniform4fv(this.pHud.u.uRect, frame.overlay.rect);
      gl.uniform1i(this.pHud.u.uTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (hud) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pHud.p);
      this._hud(hud);
      gl.uniform2f(this.pHud.u.uScene, CONFIG.sceneW, CONFIG.sceneH);
      gl.uniform4f(this.pHud.u.uRect, 0, 0, CONFIG.sceneW, CONFIG.sceneH);
      gl.uniform1i(this.pHud.u.uTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (fb) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(v.x, v.y, v.w, v.h);
      gl.disable(gl.BLEND);
      const u = this.pPost.u;
      gl.useProgram(this.pPost.p);
      gl.bindTexture(gl.TEXTURE_2D, fb.tex);
      gl.uniform2f(u.uScene, CONFIG.sceneW, CONFIG.sceneH);
      gl.uniform4f(u.uRect, 0, 0, CONFIG.sceneW, CONFIG.sceneH);
      gl.uniform2f(u.uRes, fb.w, fb.h);
      gl.uniform2f(u.uPs1, 2 ** ps1.colorBits - 1, ps1.dither);
      gl.uniform1i(u.uTex, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
}
