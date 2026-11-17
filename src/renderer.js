// Minimal raw-WebGL1 renderer. Dumb by design: game.js builds a frame description, this draws it.
import { CONFIG } from './config.js';
import { VS, FS_BG, FS_ITEM } from './shaders.js';

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
    this.pBg = this._program(VS, FS_BG);
    this.pItem = this._program(VS, FS_ITEM);
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

  // source: HTMLImageElement | HTMLCanvasElement. mip=true requires POT size.
  texture(source, mip) {
    let t = this.textures.get(source);
    if (t) return t;
    const gl = this.gl;
    t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
    gl.uniform1i(u.uTex, 0);
  }

  // frame = { light:{x,y,r,exposure}, bg: Image, items: [{ sprite, rect:[x,y,w,h], shadow:[ux,uy,bias,str], glow:[r,g,b,a], glowP:[bias,brighten] }] }
  draw(frame) {
    if (this.lost) return;
    const gl = this.gl, v = this.view;
    gl.viewport(0, 0, v.bw, v.bh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(v.x, v.y, v.w, v.h);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);

    if (frame.bg) {
      gl.disable(gl.BLEND);
      this._common(this.pBg, frame.light);
      gl.bindTexture(gl.TEXTURE_2D, this.texture(frame.bg, false));
      gl.uniform4f(this.pBg.u.uRect, 0, 0, CONFIG.sceneW, CONFIG.sceneH);
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
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
  }
}
