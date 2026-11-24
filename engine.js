/* Hyperdrive engine: drives Hyperdrive's own WebAssembly build of Genesis Plus GX.
   Video (WebGL2 + filters), audio (AudioWorklet with rate control), timing,
   input, save states, battery saves, rewind and fast-forward live here. */
(() => {
'use strict';

/* ---------- minimal in-memory WASI ---------- */
function makeWasi(files, getMem) {
  const fds = new Map(); let nextFd = 4;
  const dv = () => new DataView(getMem().buffer);
  const u8 = () => new Uint8Array(getMem().buffer);
  const dec = new TextDecoder();
  const norm = p => '/' + p.replace(/^\.?\/+/, '');
  const ok = 0, EBADF = 8, ENOENT = 44, EINVAL = 28;
  return {
    fd_prestat_get(fd, p) { if (fd !== 3) return EBADF; const d = dv(); d.setUint8(p, 0); d.setUint32(p + 4, 1, true); return ok; },
    fd_prestat_dir_name(fd, p, len) { if (fd !== 3) return EBADF; u8()[p] = 47; return ok; },
    fd_fdstat_get(fd, p) {
      const d = dv(); d.setUint8(p, fd <= 2 ? 2 : fd === 3 ? 3 : 4); d.setUint16(p + 2, 0, true);
      d.setBigUint64(p + 8, 0xffffffffffffffffn, true); d.setBigUint64(p + 16, 0xffffffffffffffffn, true); return ok;
    },
    fd_fdstat_set_flags() { return ok; },
    path_open(dirfd, dirflags, pp, pl, oflags, rb, ri, fdflags, outp) {
      const path = norm(dec.decode(u8().subarray(pp, pp + pl)));
      let f = files.get(path);
      if (!f) { if (!(oflags & 1)) return ENOENT; f = new Uint8Array(0); files.set(path, f); }
      if (oflags & 8) { f = new Uint8Array(0); files.set(path, f); }
      const fd = nextFd++; fds.set(fd, {path, pos: 0}); dv().setUint32(outp, fd, true); return ok;
    },
    fd_read(fd, iovs, n, outp) {
      const h = fds.get(fd); if (!h) { dv().setUint32(outp, 0, true); return fd === 0 ? ok : EBADF; }
      const f = files.get(h.path), d = dv(), m = u8(); let total = 0;
      for (let i = 0; i < n; i++) {
        const ptr = d.getUint32(iovs + i * 8, true), len = d.getUint32(iovs + i * 8 + 4, true);
        const chunk = f.subarray(h.pos, Math.min(f.length, h.pos + len));
        m.set(chunk, ptr); h.pos += chunk.length; total += chunk.length;
        if (chunk.length < len) break;
      }
      d.setUint32(outp, total, true); return ok;
    },
    fd_write(fd, iovs, n, outp) {
      const d = dv(), m = u8(); let total = 0; const h = fds.get(fd);
      for (let i = 0; i < n; i++) {
        const ptr = d.getUint32(iovs + i * 8, true), len = d.getUint32(iovs + i * 8 + 4, true);
        const data = m.slice(ptr, ptr + len); total += len;
        if (h) {
          let f = files.get(h.path);
          if (h.pos + len > f.length) { const g = new Uint8Array(h.pos + len); g.set(f); f = g; files.set(h.path, f); }
          f.set(data, h.pos); h.pos += len;
        }
      }
      d.setUint32(outp, total, true); return h || fd <= 2 ? ok : EBADF;
    },
    fd_seek(fd, off, whence, outp) {
      const h = fds.get(fd); if (!h) return EBADF;
      const f = files.get(h.path); const o = Number(off);
      const np = whence === 0 ? o : whence === 1 ? h.pos + o : f.length + o;
      if (np < 0) return EINVAL; h.pos = np; dv().setBigUint64(outp, BigInt(np), true); return ok;
    },
    fd_tell(fd, outp) { const h = fds.get(fd); if (!h) return EBADF; dv().setBigUint64(outp, BigInt(h.pos), true); return ok; },
    fd_close(fd) { fds.delete(fd); return ok; },
    proc_exit(c) { throw new Error('core exited (' + c + ')'); }
  };
}

/* ---------- audio worklet (runs on the audio thread) ---------- */
const WORKLET = `
class HDOut extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = 44100 * 2; this.L = new Float32Array(this.cap); this.R = new Float32Array(this.cap);
    this.w = 0; this.r = 0; this.fill = 0; this.target = 0.08 * 44100; this.inRate = 44100; this.t = 0; this.n = 0;
    this.port.onmessage = e => {
      const m = e.data;
      if (m.cfg) { this.target = m.cfg.latency * this.inRate; if (m.cfg.rate) this.inRate = m.cfg.rate; return; }
      if (m.flush) { this.w = this.r = this.fill = 0; this.t = 0; return; }
      const s = m.s, frames = s.length >> 1;
      for (let i = 0; i < frames; i++) {
        if (this.fill >= this.cap - 1) { this.r = (this.r + 1) % this.cap; this.fill--; }
        this.L[this.w] = s[i * 2]; this.R[this.w] = s[i * 2 + 1]; this.w = (this.w + 1) % this.cap; this.fill++;
      }
    };
  }
  process(_, outs) {
    const o = outs[0], L = o[0], R = o[1] || o[0];
    const adj = 1 + Math.max(-0.006, Math.min(0.006, (this.fill - this.target) / this.target * 0.006));
    const step = this.inRate / sampleRate * adj;
    for (let i = 0; i < L.length; i++) {
      if (this.fill < 2) { L[i] = R[i] = 0; continue; }
      const a = this.r, b = (this.r + 1) % this.cap, f = this.t;
      L[i] = this.L[a] + (this.L[b] - this.L[a]) * f; R[i] = this.R[a] + (this.R[b] - this.R[a]) * f;
      this.t += step;
      while (this.t >= 1 && this.fill > 1) { this.t -= 1; this.r = (this.r + 1) % this.cap; this.fill--; }
    }
    if (++this.n % 20 === 0) this.port.postMessage(this.fill / this.inRate);
    return true;
  }
}
registerProcessor('hd-out', HDOut);`;

/* ---------- video ---------- */
const VS = `#version 300 es
in vec2 p; out vec2 uv; uniform vec4 rect;
void main(){ uv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(rect.xy + p * rect.zw, 0.0, 1.0); }`;
const FS_HEAD = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D T; uniform vec2 TextureSize; uniform vec2 OutputSize;
#define FragColor o
#define Texture T
#define InputSize TextureSize
`;
const FRAG = {
  sharp: `void main(){ o = vec4(texture(T, uv).rgb, 1.0); }`,
  smooth: `void main(){ o = vec4(texture(T, uv).rgb, 1.0); }`,
  scanlines: `void main(){ vec3 c = texture(T, uv).rgb; float y = uv.y * TextureSize.y;
    c *= mix(0.62, 1.08, 0.5 - 0.5 * cos(6.2831853 * y)); o = vec4(c, 1.0); }`,
  crt: `vec2 warp(vec2 p){ p = p*2.0-1.0; p *= vec2(1.0+(p.y*p.y)*0.045, 1.0+(p.x*p.x)*0.06); return p*0.5+0.5; }
    void main(){ vec2 w = warp(uv);
      if(w.x<0.0||w.y<0.0||w.x>1.0||w.y>1.0){ o = vec4(0.0,0.0,0.0,1.0); return; }
      vec2 px = vec2(0.6/TextureSize.x, 0.0);
      vec3 c = texture(T,w).rgb*0.6 + texture(T,w-px).rgb*0.2 + texture(T,w+px).rgb*0.2;
      c = pow(c, vec3(2.2)); float y = w.y*TextureSize.y;
      c *= mix(0.45, 1.25, 0.5 - 0.5*cos(6.2831853*y));
      float m = mod(gl_FragCoord.x, 3.0);
      c *= m<1.0 ? vec3(1.15,0.85,0.85) : (m<2.0 ? vec3(0.85,1.15,0.85) : vec3(0.85,0.85,1.15));
      vec2 v = w*(1.0-w.yx); c = pow(c*pow(v.x*v.y*18.0, 0.22), vec3(1.0/2.2)); o = vec4(c*1.08, 1.0); }`,
  composite: `void main(){ float dx = 1.0/TextureSize.x;
    vec3 c = texture(T,uv).rgb*0.5 + texture(T,uv-vec2(dx,0.0)).rgb*0.25 + texture(T,uv+vec2(dx,0.0)).rgb*0.25;
    c *= mix(0.88, 1.03, 0.5 - 0.5*cos(6.2831853*uv.y*TextureSize.y)); o = vec4(c, 1.0); }`
};
const LINEAR = {smooth: 1, crt: 1};

class Video {
  constructor(canvas) {
    this.cv = canvas;
    const gl = this.gl = canvas.getContext('webgl2', {alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'});
    if (!gl) throw new Error('This browser has no WebGL2, which Hyperdrive needs to draw the screen.');
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.progs = {}; this.w = 0; this.h = 0; this.tw = 0; this.th = 0; this.integer = false;
    this.setShader('sharp');
  }
  prog(name) {
    if (this.progs[name]) return this.progs[name];
    const gl = this.gl, mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS_HEAD + FRAG[name]));
    gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    return this.progs[name] = {p, rect: gl.getUniformLocation(p, 'rect'), ts: gl.getUniformLocation(p, 'TextureSize'), os: gl.getUniformLocation(p, 'OutputSize')};
  }
  setShader(name) {
    if (!FRAG[name]) name = 'sharp';
    this.shader = name;
    const gl = this.gl, f = LINEAR[name] ? gl.LINEAR : gl.NEAREST;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  }
  upload(mem, ptr, w, h, pitch) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const row = pitch >> 1;
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, row);
    const src = new Uint16Array(mem.buffer, ptr, row * (h - 1) + w);
    if (w !== this.tw || h !== this.th) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB565, w, h, 0, gl.RGB, gl.UNSIGNED_SHORT_5_6_5, src); this.tw = w; this.th = h; }
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGB, gl.UNSIGNED_SHORT_5_6_5, src);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    this.w = w; this.h = h; this.dirty = true;
  }
  draw() {
    const gl = this.gl, cv = this.cv;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(cv.clientWidth * dpr)), H = Math.max(1, Math.round(cv.clientHeight * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.tw) return;
    let dh = Math.min(H, W * 3 / 4);
    if (this.integer && dh >= this.th) dh = Math.floor(dh / this.th) * this.th;
    const dw = dh * 4 / 3;
    const pr = this.prog(this.shader);
    gl.useProgram(pr.p);
    gl.uniform4f(pr.rect, -dw / W, -dh / H, 2 * dw / W, 2 * dh / H);
    gl.uniform2f(pr.ts, this.tw, this.th); gl.uniform2f(pr.os, dw, dh);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.dirty = false;
  }
}

/* ---------- rewind: XOR deltas, zero-run compressed ---------- */
function pack(cur, prev) {
  const a = new Uint32Array(cur.buffer, cur.byteOffset, cur.length >> 2), b = new Uint32Array(prev.buffer, prev.byteOffset, prev.length >> 2);
  const out = []; let i = 0; const n = a.length;
  while (i < n) {
    let z = 0; while (i < n && a[i] === b[i]) { z++; i++; }
    let s = i; while (i < n && a[i] !== b[i] && i - s < 65535) i++;
    const lit = new Uint32Array(i - s); for (let k = s; k < i; k++) lit[k - s] = a[k] ^ b[k];
    out.push(z, lit);
  }
  return out;
}
function unpack(delta, state) { // state ^= delta, in place
  const a = new Uint32Array(state.buffer, state.byteOffset, state.length >> 2); let i = 0;
  for (let k = 0; k < delta.length; k += 2) { i += delta[k]; const lit = delta[k + 1]; for (let j = 0; j < lit.length; j++) a[i + j] ^= lit[j]; i += lit.length; }
}
const deltaBytes = d => { let n = 0; for (let k = 1; k < d.length; k += 2) n += d[k].byteLength + 8; return n; };

/* ---------- engine ---------- */
let MOD = null;
class Engine {
  static async compile(url) { if (!MOD) MOD = await WebAssembly.compile(await (await fetch(url)).arrayBuffer()); return MOD; }
  constructor(canvas) {
    this.video = new Video(canvas); this.files = new Map(); this.btn = new Uint8Array(16);
    this.running = false; this.ff = false; this.ffSpeed = 2; this.ffAudio = 'mute'; this.rw = false; this.frames = 0;
    this.rwEvery = 4; this.rwBudget = 32 << 20; this.rwOn = true; this.latency = 0.08; this.chunks = [];
    this.audioFill = 0; this.audioOn = true; this.onFrame = null;
  }
  async boot({rom, path, files = {}, vars = {}, device = 1, sram = null}) {
    const E = {}; this.E = E;
    for (const [p, d] of Object.entries(files)) this.files.set(p, d);
    this.files.set(path, rom);
    const env = {
      js_video: (ptr, w, h, pitch) => { this.last = [ptr, w, h, pitch]; this.video.upload(this.mem, ptr, w, h, pitch); },
      js_audio: (ptr, n) => { if (this.audioOn) this.chunks.push(new Int16Array(this.mem.buffer, ptr, n * 2).slice()); return n; },
      js_input: (port, dev, idx, id) => (port === 0 && dev === 1 && id < 16 ? this.btn[id] : 0)
    };
    const inst = await WebAssembly.instantiate(MOD, {wasi_snapshot_preview1: makeWasi(this.files, () => this.mem), env});
    Object.assign(E, inst.exports); this.mem = E.memory;
    if (E._initialize) E._initialize();
    for (const [k, v] of Object.entries(vars)) this.setVar(k, v, true);
    E.hd_init();
    if (!E.hd_load(this.str(path))) throw new Error('The emulator could not load this ROM.');
    E.retro_set_controller_port_device(0, device);
    this.fps = E.hd_fps(); this.rate = E.hd_rate() || 44100;
    if (sram) this.setSram(sram);
    this.stSize = E.retro_serialize_size(); this.stPtr = E.malloc(this.stSize);
    this.shPtr = E.hd_instr_shadow ? E.hd_instr_shadow() : 0; this.shLen = this.shPtr ? (E.hd_instr_shadow_size() + 3) & ~3 : 0;
    this.rwRing = []; this.rwBytes = 0; this.rwPrev = null; this.rwCount = 0;
  }
  str(s) { const b = new TextEncoder().encode(s + '\0'); const p = this.E.malloc(b.length); new Uint8Array(this.mem.buffer, p, b.length).set(b); return p; }
  setVar(k, v, quiet) { const kp = this.str(k), vp = this.str(String(v)); this.E.hd_set_var(kp, vp); this.E.free(kp); this.E.free(vp); }
  /* ----- audio ----- */
  async startAudio(ac) {
    if (!ac) return; this.ac = ac;
    try {
      if (!ac._hdMod) ac._hdMod = ac.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], {type: 'text/javascript'})));
      await ac._hdMod;
      this.node = new AudioWorkletNode(ac, 'hd-out', {outputChannelCount: [2]});
      this.node.port.onmessage = e => { this.audioFill = e.data; };
      this.node.connect(ac.destination);
      this.node.port.postMessage({cfg: {latency: this.latency, rate: this.rate || 44100}});
    } catch (e) { this.node = null; }
  }
  setLatency(sec) { this.latency = sec; this.node && this.node.port.postMessage({cfg: {latency: sec, rate: this.rate}}); }
  flushAudio() {
    if (!this.chunks.length) return;
    const n = this.chunks.reduce((a, c) => a + c.length, 0);
    let dec = this.ff ? (this.ffAudio === 'fast' ? this.ffSpeed : 0) : 1;
    if (this.rw) dec = 0;
    if (dec && this.node) {
      const out = new Float32Array(Math.ceil(n / dec / 2) * 2); let o = 0, idx = 0;
      for (const c of this.chunks) for (let i = 0; i < c.length; i += 2, idx++) if (idx % dec === 0) { out[o++] = c[i] / 32768; out[o++] = c[i + 1] / 32768; }
      this.node.port.postMessage({s: out.subarray(0, o)});
    }
    this.chunks.length = 0;
  }
  /* ----- loop ----- */
  start() {
    if (this.running) return; this.running = true; this.acc = 0; this.t0 = performance.now();
    if (this.ac && this.ac.state !== 'running') this.ac.resume().catch(() => {});
    if (this.node) this.node.port.postMessage({cfg: {latency: this.latency, rate: this.rate}});
    const tick = now => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.t0) / 1000); this.t0 = now;
      try { this.step(dt); } catch (e) { this.running = false; if (this.onError) this.onError(e); }
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.chunks.length = 0; if (this.node) this.node.port.postMessage({flush: 1}); }
  runFrame() { this.E.retro_run(); this.frames++; if (this.onFrame) this.onFrame(); }
  step(dt) {
    const E = this.E; if (!E) return;
    if (this.rw) {
      if ((this.rwTick = (this.rwTick + 1) % 2) === 0) this.rewindStep();
      this.runFrame(); this.chunks.length = 0; this.video.draw(); return;
    }
    if (this.ff) {
      for (let i = 0; i < this.ffSpeed; i++) { this.runFrame(); this.capture(); }
      this.flushAudio(); this.video.draw(); return;
    }
    this.acc += dt * this.fps;
    const lead = this.node ? this.audioFill - this.latency : 0;
    if (lead < -this.latency * 0.6) this.acc += 0.5; else if (lead > this.latency * 0.8) this.acc -= 0.5;
    let n = 0;
    while (this.acc >= 1 && n < 3) { this.runFrame(); this.capture(); this.acc -= 1; n++; }
    if (this.acc > 3) this.acc = 0;
    this.flushAudio();
    if (n || this.video.dirty) this.video.draw();
  }
  /* ----- input ----- */
  setButton(id, on) { this.btn[id] = on ? 1 : 0; }
  clearButtons() { this.btn.fill(0); }
  /* ----- states ----- */
  saveState() {
    this.E.retro_serialize(this.stPtr, this.stSize);
    const out = new Uint8Array(this.stSize + this.shLen);
    out.set(new Uint8Array(this.mem.buffer, this.stPtr, this.stSize));
    if (this.shLen) out.set(new Uint8Array(this.mem.buffer, this.shPtr, this.shLen), this.stSize);
    return out;
  }
  applyState(d) {
    const core = d.subarray(0, Math.min(d.length, this.stSize));
    new Uint8Array(this.mem.buffer, this.stPtr, this.stSize).fill(0).set(core);
    const ok = this.E.retro_unserialize(this.stPtr, core.length);
    if (this.shLen && d.length === this.stSize + this.shLen) { new Uint8Array(this.mem.buffer, this.shPtr, this.shLen).set(d.subarray(this.stSize)); this.E.hd_instr_after_load(); }
    return ok;
  }
  loadState(d) {
    if (d.length !== this.stSize && d.length !== this.stSize + this.shLen) return false;
    const ok = this.applyState(d); this.rwPrev = null; return !!ok;
  }
  getSram() { const p = this.E.retro_get_memory_data(0), n = this.E.retro_get_memory_size(0); return p && n ? new Uint8Array(this.mem.buffer, p, n).slice() : null; }
  setSram(d) { const p = this.E.retro_get_memory_data(0), n = this.E.retro_get_memory_size(0); if (p && n) new Uint8Array(this.mem.buffer, p, n).set(d.subarray(0, n)); }
  reset() { this.E.retro_reset(); this.rwPrev = null; }
  /* ----- rewind ----- */
  setRewind(on, every, budgetMB) { this.rwOn = on; this.rwEvery = every; this.rwBudget = budgetMB << 20; if (!on) { this.rwRing = []; this.rwBytes = 0; this.rwPrev = null; } }
  capture() {
    if (!this.rwOn || ++this.rwCount % this.rwEvery) return;
    const cur = this.saveState();
    if (this.rwPrev) {
      const d = pack(this.rwPrev, cur); // undoing d on cur gives prev
      const sz = deltaBytes(d); this.rwRing.push([d, sz]); this.rwBytes += sz;
      while (this.rwBytes > this.rwBudget && this.rwRing.length) this.rwBytes -= this.rwRing.shift()[1];
    }
    this.rwPrev = cur;
  }
  setRW(on) {
    if (on && (!this.rwOn || !this.rwPrev)) return false;
    this.rw = on; this.rwTick = 0;
    if (on) this.rwCur = this.rwPrev.slice();
    else { this.rwPrev = this.rwCur ? this.rwCur : this.rwPrev; this.rwCount = 0; }
    if (this.node) this.node.port.postMessage({flush: 1});
    return true;
  }
  rewindStep() {
    const e = this.rwRing.pop(); if (!e) return;
    this.rwBytes -= e[1]; unpack(e[0], this.rwCur);
    this.applyState(this.rwCur);
  }
  /* ----- instruments ----- */
  instruments() {
    const E = this.E; if (!E || !E.hd_instr_count) return [];
    const n = E.hd_instr_count(), p = E.hd_instr_table(), sz = E.hd_instr_entry_size(), dv = new DataView(this.mem.buffer), out = [];
    for (let i = 0; i < n; i++) { const b = p + i * sz; out.push({fp: dv.getUint32(b, true) >>> 0, keyons: dv.getUint32(b + 4, true), ch: dv.getUint32(b + 8, true), regs: new Uint8Array(this.mem.buffer, b + 12, 30).slice()}); }
    return out;
  }
  setInstrument(fp, regs) { new Uint8Array(this.mem.buffer, this.E.hd_instr_buf(), 30).set(regs); return !!this.E.hd_instr_set(fp >>> 0); }
  clearInstrument(fp) { this.E.hd_instr_clear(fp >>> 0); }
  clearInstruments() { this.E.hd_instr_clear_all(); }
  /* ----- misc ----- */
  async screenshot() {
    if (!this.last) return null;
    const [ptr, w, h, pitch] = this.last, row = pitch >> 1;
    const src = new Uint16Array(this.mem.buffer, ptr, row * (h - 1) + w);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const v = src[y * row + i], k = (y * w + i) * 4;
      d[k] = (v >> 11) * 255 / 31; d[k + 1] = ((v >> 5) & 63) * 255 / 63; d[k + 2] = (v & 31) * 255 / 31; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return await new Promise(r => c.toBlob(r, 'image/png'));
  }
  destroy() { this.stop(); try { this.node && this.node.disconnect(); } catch (e) {} this.node = null; this.E = null; this.files.clear(); }
}
window.HDEngine = Engine;
})();
