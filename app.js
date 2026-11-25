{
'use strict';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CORE_DIR = 'Genesis Plus GX';
const B = {B:0,Y:1,MODE:2,START:3,UP:4,DOWN:5,LEFT:6,RIGHT:7,C:8,Yg:9,X:10,Z:11};
// Genesis button -> libretro index used by the core
const GEN = [['A',1],['B',0],['C',8],['X',10],['Y',9],['Z',11],['Start',3],['Mode',2]];

/* ---------------- settings ---------------- */
const DEF = {shader:'sharp', integer:false, pad:'auto', region:'auto', sprites:false,
  ffMode:'hold', ffSpeed:2, ffAudio:'mute', rewind:'std', chip:'mame (ym2612)', audio:'normal', fps:false, opacity:.85, size:1, layout:{p:{},l:{}},
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
const BOOT_LOGO = `<svg class="bl" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="url(#hdRibs)"/>
<g class="h"><g transform="translate(52 50) skewX(-12) translate(-50 -50)"><path d="M29 22h17v23h12V22h17v56H58V57H46v21H29z" fill="#ff2b2b"/><path d="M29 22h17v2.5H29zM58 22h17v2.5H58z" fill="#ff7070"/>
<rect x="20" y="58.5" width="62" height="2" fill="#121214"/><rect x="20" y="64.5" width="62" height="3" fill="#121214"/><rect x="20" y="71.5" width="62" height="4" fill="#121214"/></g></g>
<g class="tr" fill="#ff2b2b"><rect x="8" y="61" width="14" height="3" rx="1.5"/><rect x="4" y="68" width="16" height="3.5" rx="1.75"/><rect x="10" y="75.5" width="9" height="2.5" rx="1.25"/></g></svg>`;
const bootMsg = m => { const p = $('#bootMsg'); if (p) p.textContent = m; };
window.HDDebug = () => Emu;
const ENGINE = 'hd2';
const CORE_URL = 'core/hyperdrive-core.wasm';
const Emu = {M: null, g: null, lock: false, paused: false, ff: false, rw: false, sramSig: '', timer: 0};
const keyOf = () => Emu.g.id + (Emu.lock ? '-sk' : '');
const coreVars = () => ({
  genesis_plus_gx_system_hw: 'mega drive / genesis',
  genesis_plus_gx_region_detect: S.region,
  genesis_plus_gx_no_sprite_limit: S.sprites ? 'enabled' : 'disabled',
  genesis_plus_gx_lock_on: Emu.lock ? 'sonic & knuckles' : 'disabled',
  genesis_plus_gx_ym2612: S.chip
});
const padDevice = () => S.pad === '6' ? 513 : S.pad === '3' ? 257 : 1;
let AC = null;
function ensureAudio() {
  try {
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) { try { AC = new C({sampleRate: 44100, latencyHint: 'interactive'}); } catch (e) { AC = new C(); } } }
    if (AC && AC.state !== 'running') AC.resume().catch(() => {});
  } catch (e) {}
  return AC;
}
function applyEngineSettings() {
  const M = Emu.M; if (!M) return;
  M.video.setShader(S.shader); M.video.integer = !!S.integer; M.video.dirty = true;
  M.ffSpeed = S.ffSpeed; M.ffAudio = S.ffAudio;
  M.setLatency(S.audio === 'stable' ? 0.14 : 0.08);
  M.setRewind(S.rewind !== 'off', S.rewind === 'long' ? 2 : 4, S.rewind === 'long' ? 64 : 32);
}
async function play(g, lock) {
  if (!g || Emu.M) return;
  ensureAudio();
  closeSheet(true);
  $('#lib').classList.add('hide'); $('#play').classList.remove('hide');
  $('#ttl').textContent = g.name + (lock ? ' + S&K' : '');
  const bootEl = $('#boot'); bootEl.classList.remove('hide'); bootEl.innerHTML = BOOT_LOGO + '<p id="bootMsg">Slotting cartridge…</p>';
  Emu.g = g; Emu.lock = !!lock; Emu.paused = false; Emu.ff = Emu.rw = false;
  layoutPad();
  try {
    if (typeof HDEngine !== 'function') throw new Error('The emulator engine did not load.');
    const rom = await DB.get('roms', g.id);
    if (!rom) throw new Error('This ROM is missing from storage. Delete it and add it again.');
    const files = {};
    if (lock) {
      const sk = await DB.get('roms', S.lockId), sk2 = await DB.get('files', 'sk2chip');
      if (!sk) throw new Error('The lock-on cartridge is missing.');
      files['/system/sk.bin'] = sk; if (sk2) files['/system/sk2chip.bin'] = sk2;
    }
    bootMsg('Warming up the 68000…');
    await HDEngine.compile(CORE_URL);
    bootMsg('Slotting cartridge…');
    const cv = document.createElement('canvas'); cv.id = 'cv'; $('#screen').prepend(cv);
    const M = new HDEngine(cv); Emu.M = M;
    M.onError = e => { toast('The emulator stopped: ' + (e.message || e)); };
    const sram = await DB.get('sram', keyOf());
    await M.boot({rom, path: '/g' + g.id + (lock ? '-sk' : '') + '.' + g.ext, files, vars: coreVars(), device: padDevice(), sram});
    await M.startAudio(ensureAudio());
    applyEngineSettings();
    Emu.sramSig = sig(M.getSram());
    if (Emu.paused) {} else M.start();
    bootEl.classList.add('hide');
    requestAnimationFrame(layoutPad);
    g.played = Date.now(); g.lastLock = !!lock; DB.put('games', g.id, g);
    Emu.timer = setInterval(syncSram, 10000);
    Emu.fpsLast = [M.frames, performance.now()];
    clearInterval(Emu.fpsT); Emu.fpsT = setInterval(fpsTick, 1000);
    Codes.attach([files['/system/sk.bin'], rom]);
    Instr.attach();
    toast(lock ? 'Locked onto Sonic & Knuckles' : 'Ready');
  } catch (e) {
    bootEl.innerHTML = BOOT_LOGO + `<div><p>${esc(e.message || e)}</p><button class="btn red" id="bootBack">Back to library</button></div>`;
    $('#bootBack').onclick = () => quit(true);
  }
}
const sig = d => d ? d.length + ':' + Array.from({length: 64}, (_, i) => d[Math.floor(i * d.length / 64)]).join('.') + ':' + d.reduce((a, b, i) => (a + b * (i % 251 + 1)) | 0, 0) : '';
async function syncSram() {
  const M = Emu.M; if (!M || !Emu.g || !M.E) return;
  try {
    const d = M.getSram(); if (!d) return;
    const s = sig(d);
    if (s !== Emu.sramSig) { Emu.sramSig = s; await DB.put('sram', keyOf(), d); }
  } catch (e) {}
}
async function grabShot() { try { return Emu.M ? await Emu.M.screenshot() : null; } catch (e) { return null; } }
async function quit(force) {
  const M = Emu.M, g = Emu.g;
  clearInterval(Emu.timer); clearInterval(Emu.fpsT); $('#fps').classList.add('hide');
  releaseAll();
  Instr.detach();
  if (M && M.E && !force) {
    await syncSram();
    const shot = await grabShot();
    if (shot && g) { g.shot = shot; await DB.put('games', g.id, g); }
  }
  if (M) { try { M.destroy(); } catch (e) {} }
  Emu.M = null; Emu.g = null; Emu.ff = Emu.rw = false; Emu.paused = false;
  $('#cv')?.remove(); closeSheet(true); editMode(false);
  $('#play').classList.add('hide'); $('#lib').classList.remove('hide');
  $('#bFf').classList.remove('on'); $('#rw').classList.remove('on'); $('#bRw').classList.remove('on');
  renderLib();
}
function pause(on) {
  if (!Emu.M || Emu.paused === on) return;
  Emu.paused = on; releaseAll();
  if (on) { setFF(false); setRW(false); Emu.M.stop(); }
  else { ensureAudio(); Emu.M.start(); }
}
function audioKick() { if (Emu.M) ensureAudio(); }
document.addEventListener('pointerdown', audioKick, true);
document.addEventListener('keydown', audioKick, true);
document.addEventListener('visibilitychange', () => {
  if (!Emu.M) return;
  if (document.hidden) { syncSram(); pause(true); }
  else if (!$('#sheetHost').firstChild && !editing) pause(false);
});
window.addEventListener('pagehide', () => syncSram());

function fpsTick() {
  const el = $('#fps');
  if (!Emu.M || !S.fps) { el.classList.add('hide'); return; }
  const f = Emu.M.frames, t = performance.now(), [f0, t0] = Emu.fpsLast; Emu.fpsLast = [f, t];
  const v = Emu.paused ? 0 : (f - f0) * 1000 / (t - t0);
  el.textContent = Emu.paused ? 'paused' : Math.round(v) + ' fps';
  el.style.color = Emu.ff || v >= 58 ? '#5ed38a' : v >= 50 ? '#e9b949' : '#ff6b6b';
  el.classList.remove('hide');
}

/* ---------------- states ---------------- */
async function saveState(slot) {
  if (!Emu.M) return;
  try {
    const data = Emu.M.saveState();
    const png = await grabShot();
    await DB.put('states', keyOf() + ':' + slot, {data, png, t: Date.now(), engine: ENGINE});
    toast(slot === 'q' ? 'Quick-saved' : `Saved to slot ${slot}`);
    return true;
  } catch (e) { toast('Could not save state'); }
}
async function loadState(slot) {
  if (!Emu.M) return;
  const s = await DB.get('states', keyOf() + ':' + slot);
  if (!s) { toast(slot === 'q' ? 'No quick save yet' : 'That slot is empty'); return; }
  if (s.engine !== ENGINE) { toast('That state is from the old engine and can’t be loaded'); return; }
  if (!Emu.M.loadState(s.data)) { toast('Could not load that state'); return; }
  toast(slot === 'q' ? 'Quick-loaded' : `Loaded slot ${slot}`);
  return true;
}

/* ---------------- fast-forward / rewind ---------------- */
function setFF(on) { if (!Emu.M || Emu.ff === on) return; Emu.ff = on; Emu.M.ff = on; $('#bFf').classList.toggle('on', on); }
function setRW(on) {
  if (!Emu.M || Emu.rw === on) return;
  if (on && S.rewind === 'off') { toast('Rewind is off (Menu → Controls → Performance)'); return; }
  if (on && !Emu.M.setRW(true)) return;
  if (!on) Emu.M.setRW(false);
  Emu.rw = on; $('#rw').classList.toggle('on', on); $('#bRw').classList.toggle('on', on);
}
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
  if (now !== was && Emu.M) Emu.M.setButton(idx, now && !Emu.paused);
  if (now && !was && Emu.M) Codes.input(idx);
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
  if (!Emu.M || e.target.closest && e.target.closest('input,textarea,select')) return;
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

/* ---------------- no accidental zoom (iOS ignores user-scalable=no) ---------------- */
['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault(), {passive: false}));
document.addEventListener('dblclick', e => e.preventDefault(), {passive: false});
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 350 && !e.target.closest('input,select,textarea,label,#ins,.sheet')) e.preventDefault();
  lastTouchEnd = now;
}, {passive: false});

/* ---------------- secret codes: Konami code = shield (Sonic 3 / S&K / S3&K) ---------------- */
const Codes = (() => {
  const KONAMI = [4, 4, 5, 5, 6, 7, 6, 7, 0, 1];          // up up down down left right left right B A
  const SHIELDS = {4: 'Fire Shield', 5: 'Lightning Shield', 6: 'Bubble Shield'};
  // zone id -> shield bit, by the hazards each zone throws at you
  const ZONE = {0: 4, 1: 6, 2: 4, 3: 5, 4: 5, 5: 5, 6: 6, 7: 5, 8: 5, 9: 4, 10: 5, 11: 5};
  const RAM = {player: 0xFFB000, gameMode: 0xFFF600, zone: 0xFFFE10, superFlag: 0xFFFE19};
  let seq = [], shield = null;
  // 68000 code the game's monitors run: bset #0,$2B(a1) / bset #b,$2B(a1) / move.l #Obj,(Shield).w / move.w a1,(Shield+parent).w
  function scan(bytes) {
    const found = {};
    const lim = Math.min(bytes.length, 0x400000) - 24;
    for (let i = 0; i < lim; i += 2) {
      if (bytes[i] !== 0x08 || bytes[i + 1] !== 0xE9 || bytes[i + 2] || bytes[i + 3] || bytes[i + 4] || bytes[i + 5] !== 0x2B) continue;
      if (bytes[i + 6] !== 0x08 || bytes[i + 7] !== 0xE9 || bytes[i + 8] || bytes[i + 10] || bytes[i + 11] !== 0x2B) continue;
      const bit = bytes[i + 9]; if (!SHIELDS[bit] || found[bit]) continue;
      if (bytes[i + 12] !== 0x21 || bytes[i + 13] !== 0xFC || bytes[i + 20] !== 0x31 || bytes[i + 21] !== 0xC9) continue;
      const obj = ((bytes[i + 14] << 24) | (bytes[i + 15] << 16) | (bytes[i + 16] << 8) | bytes[i + 17]) >>> 0;
      const slot = 0xFF0000 | (bytes[i + 18] << 8) | bytes[i + 19], parent = 0xFF0000 | (bytes[i + 22] << 8) | bytes[i + 23];
      found[bit] = {obj, slot, parent};
    }
    return found[4] && found[5] && found[6] ? found : null;
  }
  const plain = d => { const {h} = headerView(d); if (h.length === d.length) return d;
    const n = Math.floor((d.length - 512) / 16384), out = new Uint8Array(n * 16384);
    for (let b = 0; b < n; b++) { const blk = d.subarray(512 + b * 16384, 512 + (b + 1) * 16384); for (let i = 0; i < 8192; i++) { out[b * 16384 + i * 2 + 1] = blk[i]; out[b * 16384 + i * 2] = blk[i + 8192]; } }
    return out; };
  function attach(roms) { seq = []; shield = null; for (const r of roms) { if (r && (shield = scan(plain(r)))) break; } }
  function give() {
    const M = Emu.M; if (!M || !shield) return;
    if (M.r8(RAM.gameMode) !== 0x0C || !M.r32(RAM.player) || M.r8(RAM.player + 5) !== 2) { toast('Shields only work while you’re in a level'); return; }
    if (M.r8(RAM.superFlag)) { toast('You’re already super'); return; }
    const underwater = M.r8(RAM.player + 0x2A) & 0x40;
    const bit = underwater ? 6 : (ZONE[M.r8(RAM.zone)] ?? 5), s = shield[bit];
    M.w8(RAM.player + 0x2B, (M.r8(RAM.player + 0x2B) & 0x8E) | 1 | (1 << bit));
    M.w32(s.slot, s.obj);
    M.w16(s.parent, RAM.player & 0xFFFF);
    toast(SHIELDS[bit]);
  }
  function input(idx) {
    if (!shield) return;
    seq.push(idx); if (seq.length > KONAMI.length) seq.shift();
    if (seq.length === KONAMI.length && seq.every((v, i) => v === KONAMI[i])) { seq = []; give(); }
  }
  return {attach, input};
})();

/* ---------------- instruments drawer ---------------- */
const Instr = (() => {
  const B = window.HDBank;
  let open = false, timer = 0, map = {}, sel = null, cat = 'Bass', key = null, lastN = -1;
  const lit = new Map(), prevKeys = new Map();
  const el = $('#ins'), list = $('#insList');
  const hex = fp => (fp >>> 0).toString(16).padStart(8, '0');
  const CH = m => [0, 1, 2, 3, 4, 5].filter(i => m & (1 << i)).map(i => 'FM' + (i + 1)).join(' · ');
  const regsFor = e => e && e.preset && B.byId(e.preset) ? B.regs(B.byId(e.preset)) : e && e.regs ? Uint8Array.from(e.regs) : null;
  const label = e => e ? (e.preset ? (B.byId(e.preset)?.name || 'Preset') : e.name || 'Game instrument') : '';
  async function persist() { if (key) await DB.put('files', 'instr:' + key, map); }
  async function attach() {
    key = keyOf(); sel = null; lastN = -1; lit.clear(); prevKeys.clear();
    map = (await DB.get('files', 'instr:' + key)) || {};
    const M = Emu.M; if (!M || !M.E || !M.E.hd_instr_set) { $('#bIns').classList.add('hide'); return; }
    $('#bIns').classList.remove('hide');
    for (const [fp, e] of Object.entries(map)) { const r = regsFor(e); if (r) M.setInstrument(parseInt(fp, 16), r); }
    M.E.hd_instr_enable(S.instrOn === false ? 0 : 1);
    $('#insOn').setAttribute('aria-checked', String(S.instrOn !== false));
  }
  function detach() { show(false); key = null; }
  function show(on) {
    open = on; el.classList.toggle('hide', !on); $('#bIns').setAttribute('aria-expanded', String(on));
    clearInterval(timer);
    if (on) { lastN = -1; render(); timer = setInterval(poll, 120); }
  }
  function render() {
    const M = Emu.M; if (!M) return;
    const all = M.instruments(); lastN = all.length;
    const swapped = all.filter(x => map[hex(x.fp)]).length;
    $('#insSub').textContent = all.length ? `${all.length} heard so far${swapped ? ` · ${swapped} swapped` : ''}` : 'Listening…';
    if (!all.length) { list.innerHTML = '<p class="iempty">Play some music — each FM instrument shows up here the first time the game uses it. Drums, voices and the PSG beeps aren’t FM, so they don’t appear.</p>'; return; }
    list.innerHTML = all.map((x, i) => {
      const k = hex(x.fp), e = map[k], isOpen = sel === k;
      let pick = '';
      if (isOpen) {
        const cats = [...B.CATS, 'This game'];
        const items = cat === 'This game'
          ? all.filter(y => y.fp !== x.fp).map((y) => [`g:${hex(y.fp)}`, `Instrument ${all.indexOf(y) + 1}`, e && e.src === hex(y.fp)])
          : B.PRESETS.filter(p => p.cat === cat).map(p => [`p:${p.id}`, p.name, e && e.preset === p.id]);
        pick = `<div class="pick"><div class="cats" role="group">${cats.map(c => `<button data-cat="${esc(c)}" aria-pressed="${c === cat}">${esc(c)}</button>`).join('')}</div>
          <div class="pgrid">${items.length ? items.map(([v, n, on]) => `<button data-use="${esc(v)}" aria-pressed="${!!on}">${esc(n)}</button>`).join('') : '<p class="iempty" style="padding:8px">No other instruments heard yet.</p>'}</div>
          ${e ? `<button class="btn rst" data-restore="${k}">Restore the original</button>` : ''}</div>`;
      }
      return `<div class="irow${isOpen ? ' open' : ''}" data-fp="${k}"><button data-sel="${k}" aria-expanded="${isOpen}"><span class="lt${lit.get(k) > performance.now() ? ' on' : ''}" data-lt="${k}"></span>
        <span class="nm"><b>Instrument ${i + 1}</b><small data-sub="${k}">${esc(CH(x.ch))} · algorithm ${x.regs[28] & 7} · ${x.keyons} notes</small></span>
        ${e ? `<span class="swp">${esc(label(e))}</span>` : ''}</button>${pick}</div>`;
    }).join('');
  }
  function poll() {
    const M = Emu.M; if (!M || !open) return;
    const all = M.instruments(), now = performance.now();
    if (all.length !== lastN) { all.forEach(x => prevKeys.set(hex(x.fp), x.keyons)); render(); return; }
    for (const x of all) {
      const k = hex(x.fp), p = prevKeys.get(k);
      if (p !== undefined && x.keyons > p) lit.set(k, now + 140);
      prevKeys.set(k, x.keyons);
      const l = list.querySelector(`[data-lt="${k}"]`); if (l) l.classList.toggle('on', (lit.get(k) || 0) > now);
      const sub = list.querySelector(`[data-sub="${k}"]`); if (sub) sub.textContent = `${CH(x.ch)} · algorithm ${x.regs[28] & 7} · ${x.keyons} notes`;
    }
  }
  list.addEventListener('click', async e => {
    const M = Emu.M; if (!M) return;
    const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; render(); return; }
    const u = e.target.closest('[data-use]');
    if (u && sel) {
      const [kind, v] = u.dataset.use.split(':');
      let entry, r;
      if (kind === 'p') { entry = {preset: v}; r = regsFor(entry); }
      else { const src = M.instruments().find(y => hex(y.fp) === v); if (!src) return; r = B.normalize(src.regs); entry = {regs: [...r], name: `Instrument ${M.instruments().indexOf(src) + 1}`, src: v}; }
      M.setInstrument(parseInt(sel, 16), r); map[sel] = entry; await persist(); render();
      toast(`${label(entry)} — plays from the next note`); return;
    }
    const rs = e.target.closest('[data-restore]');
    if (rs) { M.clearInstrument(parseInt(rs.dataset.restore, 16)); delete map[rs.dataset.restore]; await persist(); render(); toast('Original instrument back'); return; }
    const sl = e.target.closest('[data-sel]'); if (sl) { sel = sel === sl.dataset.sel ? null : sl.dataset.sel; render(); }
  });
  $('#insX').onclick = () => show(false);
  $('#bIns').onclick = () => show(!open);
  $('#insOn').onclick = () => {
    S.instrOn = S.instrOn === false; saveS();
    $('#insOn').setAttribute('aria-checked', String(S.instrOn));
    if (Emu.M) Emu.M.E.hd_instr_enable(S.instrOn ? 1 : 0);
    toast(S.instrOn ? 'Swaps on' : 'Swaps off — original instruments');
  };
  return {attach, detach, show, get open() { return open; }};
})();

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
    <div class="field"><div class="lb">Integer scaling<small>Whole-number pixel heights, so no uneven rows.</small></div>${tog('integer')}</div>`;
}
function controlsHTML(inGame) {
  return `<div class="sec">Controller</div>
    <div class="field"><div class="lb">Pad type<small>6-button for X/Y/Z games. Auto suits most.</small></div>${seg('pad', [['auto', 'Auto'], ['3', '3-btn'], ['6', '6-btn']])}</div>
    <div class="sec">Touch controls</div>
    <div class="field"><label for="rs">Size</label><input type="range" id="rs" min=".7" max="1.4" step=".05" value="${S.size}" data-range="size"></div>
    <div class="field"><label for="ro">Opacity</label><input type="range" id="ro" min=".2" max="1" step=".05" value="${S.opacity}" data-range="opacity"></div>
    ${inGame ? `<div class="field"><div class="lb">Layout<small>Drag the D-pad, buttons and Start/Mode where you want them</small></div><button class="btn" data-act="edit">Edit layout</button></div>` : ''}
    <div class="sec">Speed</div>
    <div class="field"><div class="lb">Fast-forward button</div>${seg('ffMode', [['hold', 'Hold'], ['toggle', 'Toggle']])}</div>
    <div class="field"><div class="lb">Fast-forward speed</div>${seg('ffSpeed', [[2, '2×'], [4, '4×'], [8, '8×']])}</div>
    <div class="field"><div class="lb">Sound while fast</div>${seg('ffAudio', [['mute', 'Mute'], ['fast', 'Sped up']])}</div>
    <div class="sec">Performance</div>
    <div class="field"><div class="lb">Rewind<small>Rewind saves snapshots as you play, which costs speed on older phones. Off is smoothest.</small></div>${seg('rewind', [['off', 'Off'], ['std', 'Standard'], ['long', 'Extended']])}</div>
    <div class="field"><div class="lb">Audio buffer<small>Stable trades a little sound delay for fewer crackles and hitches.</small></div>${seg('audio', [['normal', 'Normal'], ['stable', 'Stable']])}</div>
    <div class="field"><div class="lb">Show speed meter<small>Frames per second, bottom-left of the screen. 60 is full speed.</small></div>${tog('fps')}</div>
    <div class="sec">Gamepad (Xbox layout) — tap a button, then press it on the controller</div>
    <div class="map" id="map"></div>
    <p class="sub" style="margin-top:10px">LT hold = rewind · RT = fast-forward · View + Start = menu · View + RB = quick save · View + LB = quick load. View alone is Mode.<br>Keyboard: WASD/arrows, J K L = A B C, U I O = X Y Z, Enter = Start, M = Mode, Space = fast-forward, Backspace = rewind, F2/F4 = quick save/load, Esc = menu.</p>`;
}
const GPN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'Up', 'Down', 'Left', 'Right'];
function renderMap() {
  const m = $('#map'); if (!m) return;
  m.innerHTML = GEN.map(([n, i]) => `<button data-map="${i}" class="${waitMap === i ? 'wait' : ''}">${n}<span>${waitMap === i ? 'Press…' : GPN[S.map[i]] || '#' + S.map[i]}</span></button>`).join('');
}
const CHIPS = [
  ['mame (ym2612)', 'Model 1 · YM2612', 'The original chip. Gritty, with buzz on quiet notes — what Sonic 1–3 were mixed for.'],
  ['mame (asic ym3438)', 'Model 2 · YM3438', 'The later, cheaper chip. Cleaner, no buzz on quiet notes.'],
  ['mame (enhanced ym3438)', 'Enhanced', 'An idealised chip that never shipped. The cleanest sound.'],
  ['nuked (ym2612)', 'Accurate Model 1', 'Cycle-accurate YM2612. The most authentic Model 1.', 1],
  ['nuked (ym3438)', 'Accurate Model 2', 'Cycle-accurate YM3438. The most authentic Model 2.', 1]
];
function chipHTML(inGame) {
  return `<div class="sec">Sound chip</div><p class="sub" style="margin:2px 0 8px">Genesis models shipped with different FM chips. ${inGame ? 'Switches live.' : 'Applies to every game.'}</p>
    <div class="list chips">${CHIPS.map(([v, n, d, heavy]) => `<button class="item" data-set="chip" data-v="${esc(v)}" aria-pressed="${S.chip === v}"><span class="dot"></span><span>${esc(n)}${heavy ? ' <i class="heavy">Heavy</i>' : ''}<small>${esc(d)}${heavy ? ' Much more work for the phone — may stutter on older iPhones. Use the speed meter to check.' : ''}</small></span></button>`).join('')}</div>`;
}
function systemHTML(inGame) {
  return `<div class="field"><div class="lb">Region<small>${inGame ? 'Changing it resets the console' : 'Auto reads the cartridge'}</small></div>${seg('region', [['auto', 'Auto'], ['ntsc-u', 'US'], ['ntsc-j', 'Japan'], ['pal', 'Europe']])}</div>
    <div class="field"><div class="lb">Remove sprite limit<small>Stops sprite flicker. A few games use the limit on purpose.</small></div>${tog('sprites')}</div>
    ${chipHTML(inGame)}
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
      if (['shader', 'integer', 'ffSpeed', 'ffAudio', 'audio', 'rewind'].includes(k)) applyEngineSettings();
      if (k === 'pad' && Emu.M) Emu.M.E.retro_set_controller_port_device(0, padDevice());
      if (k === 'ffSpeed') ffLabel();
      if (k === 'chip') { if (Emu.M) Emu.M.setVar('genesis_plus_gx_ym2612', v); if (CHIPS.find(c => c[0] === v)?.[3]) toast('Accurate chip on — watch for stutter'); }
      if (k === 'region' && Emu.M) { Emu.M.setVar('genesis_plus_gx_region_detect', v); Emu.M.reset(); toast('Console reset for new region'); }
      rerender();
    }
    const t = e.target.closest('[data-tog]');
    if (t) {
      const k = t.dataset.tog; S[k] = !S[k]; saveS();
      if (k === 'sprites' && Emu.M) Emu.M.setVar('genesis_plus_gx_no_sprite_limit', S.sprites ? 'enabled' : 'disabled');
      if (k === 'integer') applyEngineSettings();
      rerender();
    }
    const mp = e.target.closest('[data-map]'); if (mp) { waitMap = +mp.dataset.map; renderMap(); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'edit') { sheetClose = null; closeSheet(true); editMode(true); }
    if (a === 'reset') { Emu.M.reset(); closeSheet(); toast('Console reset'); }
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
      <div class="in"><b>Slot ${i}</b><span>${s ? (s.engine === ENGINE ? esc(ago(s.t)) : 'Old engine') : ''}</span><div class="acts"><button data-sv="${i}" ${s ? 'data-used="1"' : ''}>Save</button><button data-ld="${i}" ${s && s.engine === ENGINE ? '' : 'disabled'}>Load</button></div></div></div>`).join('')}</div>`;
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
