{
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHADERS = {"scanlines": {"glsl": "#if defined(VERTEX)\n#if __VERSION__ >= 130\n#define V out\n#define A in\n#else\n#define V varying\n#define A attribute\n#endif\nA vec4 VertexCoord; A vec4 TexCoord; V vec2 uv;\nuniform mat4 MVPMatrix;\nvoid main(){ gl_Position = MVPMatrix * VertexCoord; uv = TexCoord.xy; }\n#elif defined(FRAGMENT)\n#ifdef GL_ES\nprecision highp float;\n#endif\n#if __VERSION__ >= 130\n#define V in\n#define T texture\nout vec4 FragColor;\n#else\n#define V varying\n#define T texture2D\n#define FragColor gl_FragColor\n#endif\nuniform vec2 OutputSize; uniform vec2 TextureSize; uniform vec2 InputSize;\nuniform sampler2D Texture; V vec2 uv;\n\nvoid main(){\n  vec3 c = T(Texture, uv).rgb;\n  float y = uv.y * TextureSize.y;\n  float l = 0.5-0.5*cos(6.2831853*y);\n  c *= mix(0.62, 1.08, l);\n  FragColor = vec4(c, 1.0);\n}\n#endif\n", "linear": false, "scale": "viewport"}, "crt": {"glsl": "#if defined(VERTEX)\n#if __VERSION__ >= 130\n#define V out\n#define A in\n#else\n#define V varying\n#define A attribute\n#endif\nA vec4 VertexCoord; A vec4 TexCoord; V vec2 uv;\nuniform mat4 MVPMatrix;\nvoid main(){ gl_Position = MVPMatrix * VertexCoord; uv = TexCoord.xy; }\n#elif defined(FRAGMENT)\n#ifdef GL_ES\nprecision highp float;\n#endif\n#if __VERSION__ >= 130\n#define V in\n#define T texture\nout vec4 FragColor;\n#else\n#define V varying\n#define T texture2D\n#define FragColor gl_FragColor\n#endif\nuniform vec2 OutputSize; uniform vec2 TextureSize; uniform vec2 InputSize;\nuniform sampler2D Texture; V vec2 uv;\n\nvec2 warp(vec2 p){ p = p*2.0-1.0; p *= vec2(1.0+(p.y*p.y)*0.045, 1.0+(p.x*p.x)*0.06); return p*0.5+0.5; }\nvoid main(){\n  vec2 s = uv*TextureSize/InputSize;\n  vec2 w = warp(s);\n  if(w.x<0.0||w.y<0.0||w.x>1.0||w.y>1.0){ FragColor=vec4(0.0,0.0,0.0,1.0); return; }\n  vec2 t = w*InputSize/TextureSize;\n  vec2 px = vec2(0.6/TextureSize.x, 0.0);\n  vec3 c = T(Texture,t).rgb*0.6 + T(Texture,t-px).rgb*0.2 + T(Texture,t+px).rgb*0.2;\n  c = pow(c, vec3(2.2));\n  float y = t.y*TextureSize.y;\n  float l = 0.5-0.5*cos(6.2831853*y);\n  c *= mix(0.45, 1.25, l);\n  float m = mod(gl_FragCoord.x, 3.0);\n  vec3 mask = m<1.0 ? vec3(1.15,0.85,0.85) : (m<2.0 ? vec3(0.85,1.15,0.85) : vec3(0.85,0.85,1.15));\n  c *= mask;\n  vec2 v = w*(1.0-w.yx); float vig = pow(v.x*v.y*18.0, 0.22);\n  c = pow(c*vig, vec3(1.0/2.2));\n  FragColor = vec4(c*1.08, 1.0);\n}\n#endif\n", "linear": false, "scale": "viewport"}, "composite": {"glsl": "#if defined(VERTEX)\n#if __VERSION__ >= 130\n#define V out\n#define A in\n#else\n#define V varying\n#define A attribute\n#endif\nA vec4 VertexCoord; A vec4 TexCoord; V vec2 uv;\nuniform mat4 MVPMatrix;\nvoid main(){ gl_Position = MVPMatrix * VertexCoord; uv = TexCoord.xy; }\n#elif defined(FRAGMENT)\n#ifdef GL_ES\nprecision highp float;\n#endif\n#if __VERSION__ >= 130\n#define V in\n#define T texture\nout vec4 FragColor;\n#else\n#define V varying\n#define T texture2D\n#define FragColor gl_FragColor\n#endif\nuniform vec2 OutputSize; uniform vec2 TextureSize; uniform vec2 InputSize;\nuniform sampler2D Texture; V vec2 uv;\n\nvoid main(){\n  float dx = 1.0/TextureSize.x;\n  vec3 c = T(Texture,uv).rgb*0.5 + T(Texture,uv-vec2(dx,0.0)).rgb*0.25 + T(Texture,uv+vec2(dx,0.0)).rgb*0.25;\n  float y = uv.y*TextureSize.y;\n  c *= mix(0.88, 1.03, 0.5-0.5*cos(6.2831853*y));\n  FragColor = vec4(c, 1.0);\n}\n#endif\n", "linear": false, "scale": "viewport"}, "smooth": {"glsl": "#if defined(VERTEX)\n#if __VERSION__ >= 130\n#define V out\n#define A in\n#else\n#define V varying\n#define A attribute\n#endif\nA vec4 VertexCoord; A vec4 TexCoord; V vec2 uv;\nuniform mat4 MVPMatrix;\nvoid main(){ gl_Position = MVPMatrix * VertexCoord; uv = TexCoord.xy; }\n#elif defined(FRAGMENT)\n#ifdef GL_ES\nprecision highp float;\n#endif\n#if __VERSION__ >= 130\n#define V in\n#define T texture\nout vec4 FragColor;\n#else\n#define V varying\n#define T texture2D\n#define FragColor gl_FragColor\n#endif\nuniform vec2 OutputSize; uniform vec2 TextureSize; uniform vec2 InputSize;\nuniform sampler2D Texture; V vec2 uv;\n\nvoid main(){ FragColor = vec4(T(Texture, uv).rgb, 1.0); }\n#endif\n", "linear": true, "scale": "viewport"}};
const CORE_DIR = 'Genesis Plus GX';
const B = {B:0,Y:1,MODE:2,START:3,UP:4,DOWN:5,LEFT:6,RIGHT:7,C:8,Yg:9,X:10,Z:11};
// Genesis button -> libretro index used by the core
const GEN = [['A',1],['B',0],['C',8],['X',10],['Y',9],['Z',11],['Start',3],['Mode',2]];

/* ---------------- settings ---------------- */
const DEF = {shader:'sharp', integer:false, pad:'auto', region:'auto', sprites:false,
  ffMode:'hold', ffSpeed:2, ffAudio:'mute', rewind:'std', opacity:.85, size:1, layout:{p:{},l:{}},
  map:{1:2,0:0,8:1,10:4,9:3,11:5,3:9,2:8}, lockId:null};
let S = {...DEF};
try { const j = JSON.parse(localStorage.getItem('hd.settings') || '{}'); S = {...DEF, ...j, layout:{p:{},l:{},...(j.layout||{})}, map:{...DEF.map, ...(j.map||{})}}; } catch (e) {}
const saveS = () => { try { localStorage.setItem('hd.settings', JSON.stringify(S)); } catch (e) {} };

/* ---------------- storage: IndexedDB with in-memory fallback ---------------- */
const STORES = ['games','roms','sram','states','files'];
const mem = Object.fromEntries(STORES.map(s => [s, new Map()]));
let idb = null;
const dbReady = new Promise(res => {
  try {
    const rq = indexedDB.open('hyperdrive', 1);
    rq.onupgradeneeded = () => STORES.forEach(s => rq.result.objectStoreNames.contains(s) || rq.result.createObjectStore(s));
    rq.onsuccess = () => { idb = rq.result; res(); };
    rq.onerror = rq.onblocked = () => res();
  } catch (e) { res(); }
});
const tx = (store, mode, fn) => new Promise((res, rej) => {
  const t = idb.transaction(store, mode); const r = fn(t.objectStore(store));
  t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
});
const DB = {
  async get(s, k) { await dbReady; if (!idb) return mem[s].get(k); try { return await tx(s, 'readonly', o => o.get(k)); } catch (e) { return mem[s].get(k); } },
  async put(s, k, v) { await dbReady; mem[s].set(k, v); if (!idb) return; try { await tx(s, 'readwrite', o => o.put(v, k)); } catch (e) { toast('Storage is full — this item lives only until you close the page'); } },
  async del(s, k) { await dbReady; mem[s].delete(k); if (idb) try { await tx(s, 'readwrite', o => o.delete(k)); } catch (e) {} },
  async all(s) { await dbReady; if (!idb) return [...mem[s].values()]; try { return await tx(s, 'readonly', o => o.getAll()); } catch (e) { return [...mem[s].values()]; } },
  async keys(s) { await dbReady; if (!idb) return [...mem[s].keys()]; try { return await tx(s, 'readonly', o => o.getAllKeys()); } catch (e) { return [...mem[s].keys()]; } }
};
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ---------------- downloads capability ---------------- */
let DL = null;
(async () => { try { if (window.claude && window.claude.use) DL = await window.claude.use('downloads'); } catch (e) {} })();
// outside the Claude viewer (self-hosted), save files with a normal browser download
if (!(window.claude && window.claude.use)) DL = {save: async ({filename, data}) => { const a = document.createElement('a'); a.href = URL.createObjectURL(data); a.download = filename; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }};
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------------- ROM handling ---------------- */
const ROM_EXT = ['md','bin','gen','smd','68k'];
async function unzip(buf) {
  const u = new Uint8Array(buf), v = new DataView(buf), out = [];
  let e = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Not a readable zip');
  let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    const ext = name.split('.').pop().toLowerCase();
    if (!ROM_EXT.includes(ext) || name.endsWith('/')) continue;
    const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true);
    const comp = u.subarray(ds, ds + csize);
    let data;
    if (method === 0) data = comp.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    out.push({name: name.split('/').pop(), data});
  }
  return out;
}
function headerView(d) {
  // .smd interleaved: 512-byte header, 16 KB blocks with odd bytes first
  if (d.length % 16384 === 512 && d[8] === 0xAA && d[9] === 0xBB) {
    const blk = d.subarray(512, 512 + 16384), o = new Uint8Array(16384);
    for (let i = 0; i < 8192; i++) { o[i * 2 + 1] = blk[i]; o[i * 2] = blk[i + 8192]; }
    return {h: o, size: d.length - 512};
  }
  return {h: d, size: d.length};
}
function parseRom(fname, d) {
  const {h, size} = headerView(d);
  const str = (a, b) => String.fromCharCode(...h.subarray(a, b)).replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
  const title = (str(0x150, 0x180) + ' ' + str(0x120, 0x150)).toUpperCase();
  let kind = null;
  if (title.includes('SONIC & KNUCKLES') || title.includes('SONIC AND KNUCKLES')) kind = size >= 0x400000 ? 's3k' : 'sk';
  else if (title.includes('SONIC THE HEDGEHOG 3')) kind = 's3';
  else if (title.includes('SONIC THE HEDGEHOG 2')) kind = 's2';
  const base = fname.replace(/\.[^.]+$/, '');
  let name = base.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ').trim() || str(0x150, 0x180) || 'Untitled';
  const tags = (base.match(/\(([^)]*)\)/g) || []).join(' ');
  let region = /USA|World|Americas/i.test(tags) ? 'US' : /Japan/i.test(tags) ? 'JP' : /Europe/i.test(tags) ? 'EU' : '';
  if (!region) { const r = str(0x1F0, 0x1F3); region = /U/.test(r) ? 'US' : /J/.test(r) ? 'JP' : /E/.test(r) ? 'EU' : ''; }
  return {name, kind, region, size};
}
async function hashId(d) {
  try { const b = await crypto.subtle.digest('SHA-1', d); return [...new Uint8Array(b)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let h = 2166136261; for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16) + d.length.toString(16); }
}
const LIVERY = ['#c8102e','#1f4fd1','#c99a2e','#1d9a5b','#7a3cc9','#e86a17','#0e8a9a','#b8327a'];
async function importFiles(files) {
  let added = 0, skipped = 0;
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const ext = f.name.split('.').pop().toLowerCase();
      const items = ext === 'zip' ? await unzip(buf) : [{name: f.name, data: new Uint8Array(buf)}];
      if (!items.length) { skipped++; continue; }
      for (const it of items) {
        if (it.data.length < 0x200 || it.data.length > 0xA00000) { skipped++; continue; }
        const id = await hashId(it.data);
        if (await DB.get('games', id)) { skipped++; continue; }
        const info = parseRom(it.name, it.data);
        const g = {id, file: it.name, ext: (it.name.split('.').pop() || 'md').toLowerCase(), ...info, added: Date.now(), played: 0, lastLock: false,
          color: LIVERY[parseInt(id.slice(0, 4), 16) % LIVERY.length]};
        if (!ROM_EXT.includes(g.ext)) g.ext = 'md';
        await DB.put('roms', id, it.data);
        await DB.put('games', id, g);
        if (g.kind === 'sk' && !S.lockId) { S.lockId = id; saveS(); toast('Sonic & Knuckles set as your lock-on cartridge'); }
        added++;
      }
    } catch (e) { skipped++; }
  }
  if (added || skipped) toast(added ? `Added ${added} game${added > 1 ? 's' : ''}${skipped ? `, skipped ${skipped}` : ''}` : 'Nothing new to add');
  renderLib();
}
$('#pick').addEventListener('change', e => { importFiles([...e.target.files]); e.target.value = ''; });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); if (!Emu.M && e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]); });

/* ---------------- library ---------------- */
const urls = [];
const blobUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const ago = t => { if (!t) return 'Never played'; const s = (Date.now() - t) / 1000; return s < 60 ? 'Just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const kindTag = g => g.kind === 's3k' ? '<i class="s3">S3&amp;K</i>' : g.id === S.lockId ? '<i class="lk">Lock-on</i>' : '';
const canLock = g => S.lockId && g.id !== S.lockId && g.kind !== 'sk' && g.kind !== 's3k';
let GAMES = [];
function cartHTML(g) {
  const art = g.shot ? `<div class="art" style="background-image:url(${blobUrl(g.shot)})"></div>` : `<div class="art gen"><b>${esc(g.name)}</b></div>`;
  return `<div class="cart" data-id="${esc(g.id)}" role="button" tabindex="0" aria-label="Play ${esc(g.name)}">
    <div class="shell"><div class="label" style="--lc:${esc(g.color)}">${art}
      <div class="strip"><span class="t">${esc(g.name)}</span><span class="m">${g.region ? `<i>${esc(g.region)}</i>` : ''}${kindTag(g)}<span>${esc(ago(g.played))}</span></span></div></div></div>
    <button class="more" data-more="${esc(g.id)}" aria-label="Options for ${esc(g.name)}"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button></div>`;
}
async function renderLib() {
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  GAMES = (await DB.all('games')).sort((a, b) => (b.played - a.played) || a.name.localeCompare(b.name));
  const el = $('#libBody');
  if (!GAMES.length) {
    el.innerHTML = `<div class="empty">
      <svg viewBox="0 0 340 170" aria-hidden="true"><defs><linearGradient id="pl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a2a2f"/><stop offset="1" stop-color="#111113"/></linearGradient></defs>
      <rect x="10" y="60" width="320" height="100" rx="18" fill="url(#pl)" stroke="#333"/>
      ${Array.from({length: 18}, (_, i) => `<rect x="${30 + i * 8}" y="78" width="4" height="60" rx="2" fill="#0a0a0b"/>`).join('')}
      <rect x="190" y="70" width="120" height="22" rx="6" fill="#0a0a0b"/><rect x="200" y="76" width="100" height="10" rx="3" fill="#1d1d21"/>
      <g><rect x="212" y="4" width="76" height="76" rx="6" fill="#1b1b1e" stroke="#3a3a40"/><rect x="222" y="14" width="56" height="44" rx="3" fill="#ff2b2b"/><path d="M228 50h20M232 44h20M236 38h20" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/></g>
      <circle cx="44" cy="146" r="5" fill="#ff2b2b"/><text x="56" y="150" fill="#e9b949" font-family="Russo One" font-size="12">16-BIT</text></svg>
      <h2>Slot in a cartridge</h2>
      <p>Add your Genesis / Mega Drive ROMs (.md, .bin, .gen, .smd, or zipped). They're kept in this browser, so they're here next time.</p>
      <label class="btn red" for="pick">Add ROMs</label></div>`;
    return;
  }
  const last = GAMES[0].played ? GAMES[0] : null;
  let h = '';
  if (last) {
    const lockable = canLock(last);
    h += `<section class="cont"><div class="shot">${last.shot ? `<img alt="" src="${blobUrl(last.shot)}">` : `<div class="label" style="--lc:${esc(last.color)};height:100%"><div class="art gen"><b>${esc(last.name)}</b></div></div>`}</div>
      <div><div class="eyebrow">Continue · ${esc(ago(last.played))}</div><h2>${esc(last.lastLock && lockable ? last.name + ' & Knuckles' : last.name)}</h2>
      <p>Battery save loads automatically. Your save states are in the in-game menu.</p>
      <div class="row"><button class="btn red" data-play="${esc(last.id)}" data-lock="${last.lastLock && lockable ? 1 : 0}">Play</button>
      ${lockable ? `<button class="btn" data-play="${esc(last.id)}" data-lock="${last.lastLock ? 0 : 1}">${last.lastLock ? 'Play without lock-on' : 'Play locked onto S&amp;K'}</button>` : ''}
      <button class="btn ghost" data-more="${esc(last.id)}">Options</button></div></div></section>`;
  }
  h += `<div class="shelf-h"><h3>Cartridges</h3><span>${GAMES.length} game${GAMES.length > 1 ? 's' : ''}</span></div><div class="grid">${GAMES.map(cartHTML).join('')}</div>`;
  el.innerHTML = h;
}
const findGame = id => GAMES.find(g => g.id === id);
let lpTimer = 0, lpFired = false;
$('#libBody').addEventListener('pointerdown', e => {
  const c = e.target.closest('.cart'); lpFired = false;
  if (c && !e.target.closest('.more')) lpTimer = setTimeout(() => { lpFired = true; gameSheet(findGame(c.dataset.id)); }, 550);
});
['pointerup', 'pointercancel', 'pointermove'].forEach(t => $('#libBody').addEventListener(t, e => { if (t !== 'pointermove' || Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clearTimeout(lpTimer); }));
$('#libBody').addEventListener('contextmenu', e => { if (e.target.closest('.cart')) e.preventDefault(); });
$('#libBody').addEventListener('click', e => {
  const m = e.target.closest('[data-more]'); if (m) return gameSheet(findGame(m.dataset.more));
  const p = e.target.closest('[data-play]'); if (p) return play(findGame(p.dataset.play), p.dataset.lock === '1');
  const c = e.target.closest('.cart'); if (c && !lpFired) { const g = findGame(c.dataset.id); play(g, g.lastLock && canLock(g)); }
});
$('#libBody').addEventListener('keydown', e => { const c = e.target.closest('.cart'); if (c && e.key === 'Enter') { const g = findGame(c.dataset.id); play(g, g.lastLock && canLock(g)); } });

/* ---------------- sheets ---------------- */
let sheetClose = null;
function sheet(html, onClose) {
  closeSheet(true);
  const host = $('#sheetHost');
  host.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const scrim = host.firstChild;
  scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
  sheetClose = onClose || null;
  return scrim.firstChild;
}
function closeSheet(silent) {
  const had = $('#sheetHost').firstChild; $('#sheetHost').innerHTML = '';
  const f = sheetClose; sheetClose = null;
  if (had && f && !silent) f();
}
const I = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V5h8v4M9 15h6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M6 10l6 6 6-6M4 21h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V9M6 14l6-6 6 6M4 3h16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>'
};
async function gameSheet(g) {
  if (!g) return;
  const hasSram = !!(await DB.get('sram', g.id));
  const lockG = S.lockId && findGame(S.lockId);
  const el = sheet(`<h3>${esc(g.name)}</h3>
    <p class="sub">${esc(g.file)} · ${(g.size / 1048576).toFixed(g.size < 1048576 ? 2 : 1)} MB${g.region ? ' · ' + esc(g.region) : ''}${g.kind === 's3k' ? ' · Combined Sonic 3 & Knuckles dump, runs as-is' : ''}</p>
    <div class="list">
      <button class="item" data-a="play">${I.play}Play</button>
      ${canLock(g) ? `<button class="item" data-a="lock">${I.lock}<span>Play locked onto ${esc(lockG.name)}<small>${g.kind === 's3' ? 'Sonic 3 & Knuckles: the full combined game' : g.kind === 's2' ? 'Knuckles in Sonic 2 — also needs the Sonic 2 patch ROM in Settings' : 'Other games show the "no way" screen, or Blue Sphere'}</small></span></button>` : ''}
      ${g.kind === 'sk' ? `<button class="item" data-a="setlock">${I.lock}<span>${g.id === S.lockId ? 'This is your lock-on cartridge' : 'Use as lock-on cartridge'}<small>Lets you play Sonic 3 or Sonic 2 locked onto it</small></span></button>` : ''}
      <button class="item" data-a="rename">${I.edit}Rename</button>
      ${hasSram && DL ? `<button class="item" data-a="export">${I.down}<span>Export battery save<small>Downloads a .srm file</small></span></button>` : ''}
      <label class="item">${I.up}<span>Import battery save<small>Use a .srm from another emulator</small></span><input type="file" class="hide" data-a="import"></label>
      <button class="item danger" data-a="del">${I.trash}<span>Delete game<small>Removes the ROM, battery save and save states</small></span></button>
    </div>`);
  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'play') { closeSheet(); play(g, false); }
    if (a === 'lock') { closeSheet(); play(g, true); }
    if (a === 'setlock') { S.lockId = g.id; saveS(); closeSheet(); toast('Lock-on cartridge set'); renderLib(); }
    if (a === 'rename') {
      const it = e.target.closest('[data-a]');
      it.outerHTML = `<form class="row" data-f="rn"><input class="txt" maxlength="80" value="${esc(g.name)}" aria-label="New name" style="flex:1"><button class="btn red">Save</button></form>`;
      const f = el.querySelector('[data-f=rn]'); const inp = f.querySelector('input'); inp.focus(); inp.select();
      f.addEventListener('submit', async ev => { ev.preventDefault(); const v = inp.value.trim(); if (v) { g.name = v; await DB.put('games', g.id, g); } closeSheet(); renderLib(); });
    }
    if (a === 'export') {
      const d = await DB.get('sram', g.id);
      try { await DL.save({filename: g.file.replace(/\.[^.]+$/, '') + '.srm', data: new Blob([d])}); } catch (err) { toast('Download was cancelled'); }
    }
    if (a === 'del') {
      const it = e.target.closest('[data-a]');
      if (!it.dataset.sure) { it.dataset.sure = 1; it.querySelector('span').firstChild.textContent = 'Tap again to delete'; return; }
      for (const s of ['games', 'roms', 'sram']) await DB.del(s, g.id);
      await DB.del('sram', g.id + '-sk');
      for (const k of await DB.keys('states')) if (String(k).startsWith(g.id)) await DB.del('states', k);
      if (S.lockId === g.id) { S.lockId = null; saveS(); }
      closeSheet(); renderLib(); toast('Deleted');
    }
  });
  el.querySelector('[data-a=import]').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    await DB.put('sram', g.id, new Uint8Array(await f.arrayBuffer())); closeSheet(); toast('Battery save imported');
  });
}

/* ---------------- emulator ---------------- */
let wasmMod = null;
const Emu = {M: null, g: null, lock: false, fn: {}, paused: false, ff: false, rw: false, sramSig: '', timer: 0, romPath: ''};
const keyOf = () => Emu.g.id + (Emu.lock ? '-sk' : '');
function cfgText() {
  const rw = S.rewind === 'long' ? [60, 1] : [24, 2];
  return [
    'savefile_directory = "/data/saves"', 'system_directory = "/system"', 'screenshot_directory = "/"', 'video_gpu_screenshot = false',
    'audio_latency = 96', 'video_vsync = true', 'video_smooth = false', 'video_font_enable = false', 'input_joypad_driver = "null"',
    'pause_nonactive = false', 'autosave_interval = 0', 'block_sram_overwrite = false', 'savestate_auto_save = false', 'savestate_auto_load = false',
    `rewind_enable = true`, `rewind_buffer_size = "${rw[0]}"`, `rewind_granularity = "${rw[1]}"`,
    `fastforward_ratio = "${S.ffSpeed}"`, `audio_fastforward_mute = ${S.ffAudio === 'mute'}`, `audio_fastforward_speedup = ${S.ffAudio === 'fast'}`,
    `video_scale_integer = ${!!S.integer}`, `input_libretro_device_p1 = "${S.pad === '6' ? 513 : S.pad === '3' ? 257 : 1}"`
  ].join('\n') + '\n';
}
const coreOpts = () => ({
  genesis_plus_gx_system_hw: 'mega drive / genesis',
  genesis_plus_gx_region_detect: S.region,
  genesis_plus_gx_no_sprite_limit: S.sprites ? 'enabled' : 'disabled',
  genesis_plus_gx_lock_on: Emu.lock ? 'sonic & knuckles' : 'disabled'
});
function mkdirp(FS, p) { let c = ''; for (const s of p.split('/').filter(Boolean)) { c += '/' + s; try { FS.mkdir(c); } catch (e) {} } }
async function play(g, lock) {
  if (!g || Emu.M) return;
  closeSheet(true);
  $('#lib').classList.add('hide'); $('#play').classList.remove('hide');
  $('#ttl').textContent = g.name + (lock ? ' + S&K' : '');
  const bootEl = $('#boot'); bootEl.classList.remove('hide'); bootEl.textContent = 'Slotting cartridge…';
  Emu.g = g; Emu.lock = !!lock; Emu.paused = false;
  layoutPad();
  try {
    if (typeof EJS_Runtime !== 'function') throw new Error('The emulator core did not load.');
    const rom = await DB.get('roms', g.id);
    if (!rom) throw new Error('This ROM is missing from storage. Delete it and add it again.');
    let sk = null, sk2 = null;
    if (lock) { sk = await DB.get('roms', S.lockId); sk2 = await DB.get('files', 'sk2chip'); if (!sk) throw new Error('The lock-on cartridge is missing.'); }
    if (!wasmMod) { bootEl.textContent = 'Warming up the 68000…'; wasmMod = await WebAssembly.compile(await (await fetch('core/genesis_plus_gx_libretro.wasm')).arrayBuffer()); bootEl.textContent = 'Slotting cartridge…'; }
    const cv = document.createElement('canvas'); cv.id = 'cv'; $('#screen').prepend(cv);
    const M = await EJS_Runtime({
      noInitialRun: true, canvas: cv, parent: $('#screen'), callbacks: {}, arguments: [], preRun: [], postRun: [],
      print: () => {}, printErr: () => {},
      instantiateWasm: (imports, done) => { WebAssembly.instantiate(wasmMod, imports).then(inst => done(inst, wasmMod)); return {}; },
      getSavExt: () => '.srm'
    });
    Emu.M = M;
    const c = (n, r, a) => M.cwrap(n, r, a);
    Emu.fn = {
      input: c('simulate_input', 'null', ['number', 'number', 'number']), loop: c('toggleMainLoop', 'null', ['number']),
      stateInfo: c('save_state_info', 'string', []), loadState: c('load_state', 'number', ['string', 'number']),
      shot: c('cmd_take_screenshot', '', []), setVar: c('ejs_set_variable', 'null', ['string', 'string']),
      restart: c('system_restart', '', []), shader: c('shader_enable', 'null', ['number']),
      savePath: c('save_file_path', 'string', []), saveFiles: c('cmd_savefiles', '', []), refreshSaves: c('refresh_save_files', 'null', []),
      ff: c('toggle_fastforward', 'null', ['number']), ffRatio: c('set_ff_ratio', 'null', ['number']), rewind: c('toggle_rewind', 'null', ['number']),
      kb: c('ejs_set_keyboard_enabled', 'null', ['number'])
    };
    const FS = M.FS;
    ['/home/web_user/.config/retroarch', '/data/saves/' + CORE_DIR, '/system', '/shader'].forEach(p => mkdirp(FS, p));
    FS.writeFile('/home/web_user/.config/retroarch/retroarch.cfg', cfgText());
    M.callbacks.setupCoreSettingFile = p => { mkdirp(FS, p.split('/').slice(0, -1).join('/')); FS.writeFile(p, Object.entries(coreOpts()).map(([k, v]) => `${k} = "${v}"`).join('\n') + '\n'); };
    if (sk) FS.writeFile('/system/sk.bin', sk);
    if (sk2) FS.writeFile('/system/sk2chip.bin', sk2);
    const base = 'g' + g.id + (lock ? '-sk' : '');
    Emu.romPath = '/' + base + '.' + g.ext;
    FS.writeFile(Emu.romPath, rom);
    const sram = await DB.get('sram', keyOf());
    if (sram) FS.writeFile(`/data/saves/${CORE_DIR}/${base}.srm`, sram);
    M.callMain([Emu.romPath]);
    M.resumeMainLoop();
    Emu.fn.kb(0);
    Emu.fn.ffRatio(S.ffSpeed);
    const sp = Emu.fn.savePath();
    if (sram && sp && sp !== `/data/saves/${CORE_DIR}/${base}.srm`) { mkdirp(FS, sp.split('/').slice(0, -1).join('/')); FS.writeFile(sp, sram); Emu.fn.refreshSaves(); }
    Emu.sramSig = sig(sram);
    applyShader();
    bootEl.classList.add('hide');
    requestAnimationFrame(layoutPad);
    g.played = Date.now(); g.lastLock = !!lock; DB.put('games', g.id, g);
    Emu.timer = setInterval(syncSram, 10000);
    toast(lock ? 'Locked onto Sonic & Knuckles' : 'Ready');
  } catch (e) {
    bootEl.innerHTML = `<div><p>${esc(e.message || e)}</p><button class="btn red" id="bootBack">Back to library</button></div>`;
    $('#bootBack').onclick = () => quit(true);
  }
}
const sig = d => d ? d.length + ':' + Array.from({length: 64}, (_, i) => d[Math.floor(i * d.length / 64)]).join('.') + ':' + d.reduce((a, b, i) => (a + b * (i % 251 + 1)) | 0, 0) : '';
async function syncSram() {
  const M = Emu.M; if (!M || !Emu.g) return;
  try {
    Emu.fn.saveFiles();
    const p = Emu.fn.savePath();
    if (!p || !M.FS.analyzePath(p).exists) return;
    const d = M.FS.readFile(p); const s = sig(d);
    if (s !== Emu.sramSig) { Emu.sramSig = s; await DB.put('sram', keyOf(), d.slice()); }
  } catch (e) {}
}
async function grabShot() {
  const M = Emu.M; if (!M) return null;
  try { M.FS.unlink('/screenshot.png'); } catch (e) {}
  try { Emu.fn.shot(); } catch (e) { return null; }
  for (let i = 0; i < 30; i++) {
    await sleep(40);
    try { M.FS.stat('/screenshot.png'); await sleep(20); return new Blob([M.FS.readFile('/screenshot.png')], {type: 'image/png'}); } catch (e) {}
  }
  return null;
}
async function quit(force) {
  const M = Emu.M, g = Emu.g;
  clearInterval(Emu.timer);
  releaseAll();
  if (M && !force) {
    if (Emu.paused) { Emu.fn.loop(1); Emu.paused = false; await sleep(60); }
    await syncSram();
    const shot = await grabShot();
    if (shot && g) { g.shot = shot; await DB.put('games', g.id, g); }
  }
  if (M) { try { Emu.fn.loop(0); } catch (e) {} try { M.abort(); } catch (e) {} }
  Emu.M = null; Emu.g = null; Emu.fn = {}; Emu.ff = Emu.rw = false;
  $('#cv')?.remove(); closeSheet(true); editMode(false);
  $('#play').classList.add('hide'); $('#lib').classList.remove('hide');
  $('#bFf').classList.remove('on'); $('#rw').classList.remove('on');
  renderLib();
}
function pause(on) {
  if (!Emu.M || Emu.paused === on) return;
  Emu.paused = on; releaseAll();
  if (on) { setFF(false); setRW(false); }
  try { Emu.fn.loop(on ? 0 : 1); } catch (e) {}
}
function applyShader() {
  if (!Emu.M) return;
  const FS = Emu.M.FS, k = S.shader, sh = SHADERS[k];
  try { FS.unlink('/shader/shader.glslp'); } catch (e) {}
  if (!sh) { Emu.fn.shader(0); return; }
  FS.writeFile(`/shader/${k}.glsl`, sh.glsl);
  FS.writeFile('/shader/shader.glslp', `shaders = 1\nshader0 = "${k}.glsl"\nfilter_linear0 = ${sh.linear}\nscale_type0 = viewport\n`);
  Emu.fn.shader(1);
}
function audioKick() { try { const a = Emu.M?.AL?.currentCtx?.audioCtx; if (a && a.state !== 'running') a.resume(); } catch (e) {} }
document.addEventListener('pointerdown', audioKick, true);
document.addEventListener('keydown', audioKick, true);
document.addEventListener('visibilitychange', () => {
  if (!Emu.M) return;
  if (document.hidden) { syncSram(); pause(true); }
  else if (!$('#sheetHost').firstChild) pause(false);
});
window.addEventListener('pagehide', () => syncSram());

/* ---------------- states ---------------- */
async function saveState(slot) {
  if (!Emu.M) return;
  try {
    const st = Emu.fn.stateInfo().split('|');
    if (st[2] !== '1') throw new Error();
    const data = Emu.M.HEAPU8.slice(+st[1], +st[1] + +st[0]);
    const wasPaused = Emu.paused; if (wasPaused) Emu.fn.loop(1);
    const png = await grabShot(); if (wasPaused) Emu.fn.loop(0);
    await DB.put('states', keyOf() + ':' + slot, {data, png, t: Date.now()});
    toast(slot === 'q' ? 'Quick-saved' : `Saved to slot ${slot}`);
    return true;
  } catch (e) { toast('Could not save state'); }
}
async function loadState(slot) {
  if (!Emu.M) return;
  const s = await DB.get('states', keyOf() + ':' + slot);
  if (!s) { toast(slot === 'q' ? 'No quick save yet' : 'That slot is empty'); return; }
  try { Emu.M.FS.unlink('/game.state'); } catch (e) {}
  Emu.M.FS.writeFile('/game.state', s.data);
  Emu.fn.loadState('game.state', 0);
  toast(slot === 'q' ? 'Quick-loaded' : `Loaded slot ${slot}`);
  return true;
}

/* ---------------- fast-forward / rewind ---------------- */
function setFF(on) { if (!Emu.M || Emu.ff === on) return; Emu.ff = on; Emu.fn.ff(on ? 1 : 0); $('#bFf').classList.toggle('on', on); }
function setRW(on) { if (!Emu.M || Emu.rw === on) return; Emu.rw = on; Emu.fn.rewind(on ? 1 : 0); $('#rw').classList.toggle('on', on); $('#bRw').classList.toggle('on', on); }
const ffLabel = () => { $('#ffx').textContent = S.ffSpeed + '×'; };
ffLabel();
function holdBtn(el, down, up) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); down(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, () => up()));
}
holdBtn($('#bRw'), () => setRW(true), () => setRW(false));
holdBtn($('#bFf'), () => S.ffMode === 'hold' ? setFF(true) : setFF(!Emu.ff), () => { if (S.ffMode === 'hold') setFF(false); });
$('#bQs').onclick = () => saveState('q');
$('#bQl').onclick = () => loadState('q');
$('#bMenu').onclick = () => gameMenu();

/* ---------------- input aggregation ---------------- */
const held = new Map();
function press(src, idx, on) {
  let s = held.get(idx); if (!s) held.set(idx, s = new Set());
  const was = s.size > 0; on ? s.add(src) : s.delete(src);
  const now = s.size > 0;
  if (now !== was && Emu.M && !Emu.paused) try { Emu.fn.input(0, idx, now ? 1 : 0); } catch (e) {}
}
function releaseAll(prefix) {
  for (const [idx, s] of held) for (const src of [...s]) if (!prefix || src.startsWith(prefix)) press(src, idx, false);
  document.querySelectorAll('.fb.on,.pill.on').forEach(b => b.classList.remove('on'));
  $('#dpad').removeAttribute('data-dir'); $('#dpad .cross').style.transform = '';
}

/* ---------------- touch pad ---------------- */
const pad = $('#pad');
const orient = () => innerWidth > innerHeight ? 'l' : 'p';
function layoutPad() {
  pad.style.setProperty('--po', S.opacity);
  const o = orient(), r = pad.getBoundingClientRect();
  const W = r.width, H = r.height;
  let sc = S.size;
  if (o === 'p') sc *= Math.max(.6, Math.min(1.25, H / 270, W / 400));
  else sc *= Math.max(.6, Math.min(1.15, H / 380));
  pad.style.setProperty('--ps', sc.toFixed(3));
  const sa = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
  const ds = 150 * sc, fw = 210 * sc, fh = 150 * sc;
  const cw = $('#center').offsetWidth, ch = $('#center').offsetHeight;
  const def = o === 'p'
    ? {dpad: [W * .05, Math.max(10, H * .4 - ds / 2)], face: [W - fw - W * .05 + 8 * sc, Math.max(24, H * .4 - fh / 2 + 8 * sc)], center: [(W - cw) / 2, H - ch - 16 * sc - sa('--sab')]}
    : {dpad: [Math.max(16, sa('--sal') + 8), H - ds - H * .1], face: [W - fw - Math.max(16, sa('--sar') + 8) + 8 * sc, H - fh - H * .1], center: [(W - cw) / 2, H - ch - 12]};
  if (o === 'p' && H < ds + ch + 40) def.center[1] = 8;
  for (const k of ['dpad', 'face', 'center']) {
    const el = document.querySelector(`[data-k=${k}]`), off = S.layout[o][k] || {x: 0, y: 0};
    const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.min(Math.max(def[k][0] + off.x, -w * .3), W - w * .7), y = Math.min(Math.max(def[k][1] + off.y, -h * .3), H - h * .7);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
}
addEventListener('resize', () => { if (Emu.g) layoutPad(); });
const pts = new Map();
function dpadDir(p) {
  const r = $('#dpad').getBoundingClientRect();
  const dx = p.clientX - (r.left + r.width / 2), dy = p.clientY - (r.top + r.height / 2);
  const dead = r.width * .12, dirs = new Set();
  if (Math.hypot(dx, dy) > dead) {
    const sec = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    [[B.RIGHT], [B.RIGHT, B.DOWN], [B.DOWN], [B.DOWN, B.LEFT], [B.LEFT], [B.LEFT, B.UP], [B.UP], [B.UP, B.RIGHT]][sec].forEach(d => dirs.add(d));
  }
  return dirs;
}
function setDpad(id, dirs) {
  for (const d of [4, 5, 6, 7]) press('t' + id, d, dirs.has(d));
  const any = [...pts.values()].some(p => p.kind === 'dpad' && p.dirs.size);
  const el = $('#dpad');
  if (!any) { el.removeAttribute('data-dir'); $('#dpad .cross').style.transform = ''; return; }
  el.dataset.dir = 1;
  const tx = (dirs.has(7) ? 1 : 0) - (dirs.has(6) ? 1 : 0), ty = (dirs.has(5) ? 1 : 0) - (dirs.has(4) ? 1 : 0);
  $('#dpad .cross').style.transform = `perspective(300px) rotateX(${-ty * 14}deg) rotateY(${tx * 14}deg)`;
}
function btnAt(x, y) { const el = document.elementFromPoint(x, y); return el && el.closest('#pad [data-b]'); }
function setBtn(id, el) {
  const p = pts.get(id); if (!p) return;
  if (p.el === el) return;
  if (p.el) { press('t' + id, +p.el.dataset.b, false); if (![...pts.values()].some(q => q !== p && q.el === p.el)) p.el.classList.remove('on'); }
  p.el = el;
  if (el) { press('t' + id, +el.dataset.b, true); el.classList.add('on'); }
}
let editing = false, drag = null;
pad.addEventListener('pointerdown', e => {
  if (pad.classList.contains('gp')) { pad.classList.remove('gp'); $('#play').classList.remove('gpm'); requestAnimationFrame(layoutPad); return; }
  const ctl = e.target.closest('.ctl'); if (!ctl) return;
  e.preventDefault();
  if (editing) { drag = {k: ctl.dataset.k, x: e.clientX, y: e.clientY, o: {...(S.layout[orient()][ctl.dataset.k] || {x: 0, y: 0})}}; pad.setPointerCapture(e.pointerId); return; }
  try { pad.setPointerCapture(e.pointerId); } catch (er) {}
  if (ctl.id === 'dpad') { const p = {kind: 'dpad', dirs: dpadDir(e)}; pts.set(e.pointerId, p); setDpad(e.pointerId, p.dirs); }
  else { pts.set(e.pointerId, {kind: 'btn', el: null}); setBtn(e.pointerId, btnAt(e.clientX, e.clientY)); }
});
pad.addEventListener('pointermove', e => {
  if (drag) { const o = orient(); S.layout[o][drag.k] = {x: drag.o.x + e.clientX - drag.x, y: drag.o.y + e.clientY - drag.y}; layoutPad(); return; }
  const p = pts.get(e.pointerId); if (!p) return;
  if (p.kind === 'dpad') { const d = dpadDir(e); if ([...d].join() !== [...p.dirs].join()) { p.dirs = d; setDpad(e.pointerId, d); } }
  else setBtn(e.pointerId, btnAt(e.clientX, e.clientY));
});
const endPt = e => {
  if (drag) { drag = null; saveS(); return; }
  const p = pts.get(e.pointerId); if (!p) return;
  if (p.kind === 'dpad') { p.dirs = new Set(); setDpad(e.pointerId, p.dirs); } else setBtn(e.pointerId, null);
  pts.delete(e.pointerId);
};
['pointerup', 'pointercancel'].forEach(t => pad.addEventListener(t, endPt));
pad.addEventListener('contextmenu', e => e.preventDefault());
function editMode(on) {
  editing = on;
  document.querySelectorAll('#pad .ctl').forEach(c => c.classList.toggle('edit', on));
  $('#editbar').classList.toggle('hide', !on);
  if (Emu.M) pause(on);
}
$('#editDone').onclick = () => { saveS(); editMode(false); };
$('#editReset').onclick = () => { S.layout[orient()] = {}; saveS(); layoutPad(); };

/* ---------------- keyboard ---------------- */
const KEYS = {ArrowUp: 4, KeyW: 4, ArrowDown: 5, KeyS: 5, ArrowLeft: 6, KeyA: 6, ArrowRight: 7, KeyD: 7, KeyJ: 1, KeyK: 0, KeyL: 8, KeyU: 10, KeyI: 9, KeyO: 11, Enter: 3, KeyM: 2};
function onKey(e, down) {
  if (!Emu.M || e.target.closest && e.target.closest('input,textarea')) return;
  if (e.code === 'Escape' && down) { $('#sheetHost').firstChild ? closeSheet() : gameMenu(); return; }
  if ($('#sheetHost').firstChild) return;
  if (e.code in KEYS) { e.preventDefault(); if (!e.repeat) press('k', KEYS[e.code], down); return; }
  if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; if (S.ffMode === 'hold') setFF(down); else if (down) setFF(!Emu.ff); }
  if (e.code === 'Backspace') { e.preventDefault(); setRW(down); }
  if (down && e.code === 'F2') { e.preventDefault(); saveState('q'); }
  if (down && e.code === 'F4') { e.preventDefault(); loadState('q'); }
}
addEventListener('keydown', e => onKey(e, true));
addEventListener('keyup', e => onKey(e, false));
addEventListener('blur', () => releaseAll('k'));

/* ---------------- gamepad ---------------- */
let gpPrev = [], waitMap = null, chord = false;
function pollPads() {
  requestAnimationFrame(pollPads);
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const gp = pads[0]; if (!gp) return;
  const bt = gp.buttons.map(b => b.pressed || b.value > .5);
  const edge = i => bt[i] && !gpPrev[i];
  if (bt.some(Boolean) && !pad.classList.contains('gp')) { pad.classList.add('gp'); $('#play').classList.add('gpm'); releaseAll('t'); }
  if (waitMap != null) {
    const i = bt.findIndex((v, k) => v && !gpPrev[k]);
    if (i >= 0 && i !== 6 && i !== 7 && i < 16) { for (const k in S.map) if (S.map[k] === i) S.map[k] = S.map[waitMap]; S.map[waitMap] = i; saveS(); waitMap = null; renderMap(); }
    gpPrev = bt; return;
  }
  const view = bt[8];
  if (view && (edge(9) || edge(4) || edge(5))) {
    chord = true; press('g', 2, false);
    if (edge(9)) { $('#sheetHost').firstChild ? closeSheet() : gameMenu(); }
    if (edge(5)) saveState('q');
    if (edge(4)) loadState('q');
  }
  if (!view) chord = false;
  if (Emu.M && !$('#sheetHost').firstChild) {
    for (const [g, b] of Object.entries(S.map)) {
      if (+b === 8) press('g', +g, view && !chord);
      else if (!(view && (b === 9 || b === 4 || b === 5))) press('g', +g, !!bt[b]);
    }
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    press('g', 4, !!bt[12] || ay < -.5); press('g', 5, !!bt[13] || ay > .5);
    press('g', 6, !!bt[14] || ax < -.5); press('g', 7, !!bt[15] || ax > .5);
    if (bt[7] !== gpPrev[7]) { if (S.ffMode === 'hold') setFF(!!bt[7]); else if (bt[7]) setFF(!Emu.ff); }
    if (bt[6] !== gpPrev[6]) setRW(!!bt[6]);
  }
  gpPrev = bt;
}
requestAnimationFrame(pollPads);
addEventListener('gamepaddisconnected', () => { releaseAll('g'); pad.classList.remove('gp'); $('#play').classList.remove('gpm'); });

/* ---------------- toast ---------------- */
let toastT = 0;
function toast(m) {
  const t = Emu.g ? $('#toast') : null;
  if (!t) { let lt = $('#ltoast'); if (!lt) { lt = document.createElement('div'); lt.id = 'ltoast'; lt.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#1f1f23;border:1px solid #333;padding:10px 16px;border-radius:12px;font-weight:600;z-index:60;pointer-events:none;transition:opacity .2s;max-width:90vw;text-align:center'; document.body.append(lt); }
    lt.textContent = m; lt.style.opacity = 1; clearTimeout(lt._t); lt._t = setTimeout(() => lt.style.opacity = 0, 2400); return; }
  t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600);
}

/* ---------------- menus ---------------- */
const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button data-set="${k}" data-v="${esc(v)}" aria-pressed="${String(S[k]) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
const tog = k => `<button class="tog" role="switch" data-tog="${k}" aria-checked="${!!S[k]}" aria-label="${k}"></button>`;
const restartNote = '<small>Takes effect when the game next starts</small>';
function displayHTML(inGame) {
  return `<div class="field"><div class="lb">Filter<small>${{sharp: 'Crisp pixels, no processing', smooth: 'Soft bilinear scaling', scanlines: 'Dark gaps between lines, like a TV', crt: 'Curved tube, scanlines, RGB mask', composite: 'Blends dithering into fake transparency (Sonic waterfalls)'}[S.shader]}</small></div></div>
    ${seg('shader', [['sharp', 'Sharp'], ['smooth', 'Smooth'], ['scanlines', 'Scanlines'], ['crt', 'CRT'], ['composite', 'Composite']])}
    <div class="field"><div class="lb">Integer scaling<small>Whole-number pixel sizes, so no uneven pixels. ${inGame ? 'Applies on restart' : ''}</small></div>${tog('integer')}</div>`;
}
function controlsHTML(inGame) {
  return `<div class="sec">Controller</div>
    <div class="field"><div class="lb">Pad type<small>6-button for X/Y/Z games. Auto suits most. ${inGame ? 'Applies on restart' : ''}</small></div>${seg('pad', [['auto', 'Auto'], ['3', '3-btn'], ['6', '6-btn']])}</div>
    <div class="sec">Touch controls</div>
    <div class="field"><label for="rs">Size</label><input type="range" id="rs" min=".7" max="1.4" step=".05" value="${S.size}" data-range="size"></div>
    <div class="field"><label for="ro">Opacity</label><input type="range" id="ro" min=".2" max="1" step=".05" value="${S.opacity}" data-range="opacity"></div>
    ${inGame ? `<div class="field"><div class="lb">Layout<small>Drag the D-pad, buttons and Start/Mode where you want them</small></div><button class="btn" data-act="edit">Edit layout</button></div>` : ''}
    <div class="sec">Speed</div>
    <div class="field"><div class="lb">Fast-forward button</div>${seg('ffMode', [['hold', 'Hold'], ['toggle', 'Toggle']])}</div>
    <div class="field"><div class="lb">Fast-forward speed</div>${seg('ffSpeed', [[2, '2×'], [4, '4×'], [8, '8×']])}</div>
    <div class="field"><div class="lb">Sound while fast</div>${seg('ffAudio', [['mute', 'Mute'], ['fast', 'Sped up']])}</div>
    <div class="field"><div class="lb">Rewind length<small>Extended uses more memory. ${inGame ? 'Applies on restart' : ''}</small></div>${seg('rewind', [['std', 'Standard'], ['long', 'Extended']])}</div>
    <div class="sec">Gamepad (Xbox layout) — tap a button, then press it on the controller</div>
    <div class="map" id="map"></div>
    <p class="sub" style="margin-top:10px">LT hold = rewind · RT = fast-forward · View + Start = menu · View + RB = quick save · View + LB = quick load. View alone is Mode.<br>Keyboard: WASD/arrows, J K L = A B C, U I O = X Y Z, Enter = Start, M = Mode, Space = fast-forward, Backspace = rewind, F2/F4 = quick save/load, Esc = menu.</p>`;
}
const GPN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];
function renderMap() {
  const m = $('#map'); if (!m) return;
  m.innerHTML = GEN.map(([n, i]) => `<button data-map="${i}" class="${waitMap === i ? 'wait' : ''}">${n}<span>${waitMap === i ? 'Press…' : GPN[S.map[i]] || '#' + S.map[i]}</span></button>`).join('');
}
function systemHTML(inGame) {
  return `<div class="field"><div class="lb">Region<small>${inGame ? 'Changing it resets the console' : 'Auto reads the cartridge'}</small></div>${seg('region', [['auto', 'Auto'], ['ntsc-u', 'US'], ['ntsc-j', 'Japan'], ['pal', 'Europe']])}</div>
    <div class="field"><div class="lb">Remove sprite limit<small>Stops sprite flicker. A few games use the limit on purpose.</small></div>${tog('sprites')}</div>
    ${inGame ? `<div class="list" style="margin-top:12px">
      <button class="item" data-act="restart">${I.play}<span>Restart game<small>Reloads with all settings applied. Battery save is kept.</small></span></button>
      <button class="item" data-act="reset">${I.up}<span>Reset console<small>Like pressing the Reset button</small></span></button>
      <button class="item danger" data-act="quit">${I.trash}<span>Quit to library<small>Saves your battery save first</small></span></button></div>` : ''}`;
}
async function lockHTML() {
  const sk = S.lockId && findGame(S.lockId), sk2 = await DB.get('files', 'sk2chip');
  const opts = GAMES.filter(g => g.kind === 'sk' || g.id === S.lockId);
  return `<div class="field"><div class="lb">Lock-on cartridge<small>${sk ? esc(sk.name) : 'Add your Sonic & Knuckles ROM and it\'s picked up automatically'}</small></div>
      ${opts.length ? `<select class="txt" style="width:auto;min-height:44px" data-lk><option value="">None</option>${opts.map(g => `<option value="${esc(g.id)}" ${g.id === S.lockId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="field"><div class="lb">Sonic 2 patch ROM<small>${sk2 ? 'Loaded (' + Math.round(sk2.length / 1024) + ' KB)' : 'Optional: sk2chip.bin, only for Knuckles in Sonic 2'}</small></div>
      <label class="btn">${sk2 ? 'Replace' : 'Add'}<input type="file" class="hide" data-sk2></label></div>
    <p class="sub" style="margin-top:8px">With a lock-on cartridge set, Sonic 3 shows a "Play locked onto S&K" option. Combined "Sonic 3 & Knuckles" dumps don't need this.</p>`;
}
function bindSettings(el, inGame, rerender) {
  el.addEventListener('click', async e => {
    const s = e.target.closest('[data-set]');
    if (s) {
      const k = s.dataset.set; let v = s.dataset.v; if (k === 'ffSpeed') v = +v;
      S[k] = v; saveS();
      if (k === 'shader') applyShader();
      if (k === 'ffSpeed') { Emu.M && Emu.fn.ffRatio(v); ffLabel(); }
      if (k === 'region' && Emu.M) { Emu.fn.setVar('genesis_plus_gx_region_detect', v); Emu.fn.restart(); toast('Console reset for new region'); }
      rerender();
    }
    const t = e.target.closest('[data-tog]');
    if (t) {
      const k = t.dataset.tog; S[k] = !S[k]; saveS();
      if (k === 'sprites' && Emu.M) Emu.fn.setVar('genesis_plus_gx_no_sprite_limit', S.sprites ? 'enabled' : 'disabled');
      rerender();
    }
    const mp = e.target.closest('[data-map]'); if (mp) { waitMap = +mp.dataset.map; renderMap(); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'edit') { sheetClose = null; closeSheet(true); editMode(true); }
    if (a === 'reset') { Emu.fn.restart(); closeSheet(); toast('Console reset'); }
    if (a === 'quit') { sheetClose = null; closeSheet(true); quit(); }
    if (a === 'restart') { const g = Emu.g, l = Emu.lock; sheetClose = null; closeSheet(true); await quit(); play(g, l); }
  });
  el.addEventListener('input', e => {
    const r = e.target.closest('[data-range]'); if (!r) return;
    S[r.dataset.range] = +r.value; saveS(); layoutPad();
  });
  el.addEventListener('change', async e => {
    if (e.target.matches('[data-lk]')) { S.lockId = e.target.value || null; saveS(); renderLib(); rerender(); }
    if (e.target.matches('[data-sk2]')) { const f = e.target.files[0]; if (f) { await DB.put('files', 'sk2chip', new Uint8Array(await f.arrayBuffer())); toast('Sonic 2 patch ROM saved'); rerender(); } }
  });
  renderMap();
}
let libTab = 'display';
async function libSettings() {
  const tabs = [['display', 'Display'], ['controls', 'Controls'], ['system', 'System'], ['lockon', 'Lock-on']];
  const body = libTab === 'display' ? displayHTML(false) : libTab === 'controls' ? controlsHTML(false) : libTab === 'system' ? systemHTML(false) : await lockHTML();
  const el = sheet(`<h3>Settings</h3><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === libTab}">${l}</button>`).join('')}</div><div>${body}</div>`, () => { waitMap = null; });
  el.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { libTab = t.dataset.tab; waitMap = null; libSettings(); } });
  bindSettings(el, false, libSettings);
}
$('#setBtn').onclick = libSettings;

let gameTab = 'states';
async function gameMenu() {
  if (!Emu.M) return;
  pause(true);
  const tabs = [['states', 'States'], ['display', 'Display'], ['controls', 'Controls'], ['system', 'System']];
  let body = '';
  if (gameTab === 'states') {
    const k = keyOf(); const rows = [];
    for (let i = 1; i <= 8; i++) rows.push([i, await DB.get('states', k + ':' + i)]);
    const q = await DB.get('states', k + ':q');
    body = `<p class="sub">Quick save: ${q ? esc(ago(q.t)) : 'empty'} — use the top-bar buttons. Saving over a used slot needs a second tap.</p>
      <div class="slots">${rows.map(([i, s]) => `<div class="slot"><div class="th" ${s && s.png ? `style="background-image:url(${blobUrl(s.png)})"` : ''}>${s ? '' : 'Empty'}</div>
      <div class="in"><b>Slot ${i}</b><span>${s ? esc(ago(s.t)) : ''}</span><div class="acts"><button data-sv="${i}" ${s ? 'data-used="1"' : ''}>Save</button><button data-ld="${i}" ${s ? '' : 'disabled'}>Load</button></div></div></div>`).join('')}</div>`;
  } else body = gameTab === 'display' ? displayHTML(true) : gameTab === 'controls' ? controlsHTML(true) : systemHTML(true);
  const el = sheet(`<h3>${esc(Emu.g.name)}${Emu.lock ? ' + S&amp;K' : ''}</h3><p class="sub">Paused</p>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === gameTab}">${l}</button>`).join('')}</div><div>${body}</div>
    <div class="row" style="margin-top:16px"><button class="btn red" data-act="resume" style="flex:1">Resume</button></div>`, () => { waitMap = null; pause(false); });
  el.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { gameTab = t.dataset.tab; waitMap = null; gameMenu(); } });
  el.addEventListener('click', async e => {
    if (e.target.closest('[data-act=resume]')) return closeSheet();
    const sv = e.target.closest('[data-sv]');
    if (sv) {
      if (sv.dataset.used && !sv.dataset.sure) { sv.dataset.sure = 1; sv.textContent = 'Overwrite?'; sv.classList.add('sv'); return; }
      if (await saveState(sv.dataset.sv)) gameMenu();
    }
    const ld = e.target.closest('[data-ld]');
    if (ld && await loadState(ld.dataset.ld)) closeSheet();
  });
  if (gameTab !== 'states') bindSettings(el, true, gameMenu);
}

renderLib();
}
