/* Hyperdrive's built-in FM instrument bank.
   Each preset is turned into the 30 register bytes the instrument hook expects:
   7 rows (DT/MUL, TL, KS/AR, AM/D1R, D2R, SL/RR, SSG-EG) x 4 operators (op1..op4),
   then FB/ALG and AMS/FMS. Carrier levels sit near 0 (full); the game's own
   volume is added on top by the hook. */
(() => {
'use strict';
// op(mul, tl, ar, d1r, d2r, sl, rr, dt = 0, ks = 0)
const op = (mul, tl, ar, d1r, d2r, sl, rr, dt = 0, ks = 0) => ({mul, tl, ar, d1r, d2r, sl, rr, dt, ks});
const P = (id, name, cat, alg, fb, ops, amsfms = 0) => ({id, name, cat, alg, fb, ops, amsfms});
const OFF = op(1, 127, 31, 0, 0, 15, 15);
const PRESETS = [
  // Bass
  P('synbass', 'Synth Bass', 'Bass', 0, 6, [op(1, 28, 31, 10, 2, 2, 8), op(1, 38, 31, 12, 3, 3, 8), op(0, 30, 31, 8, 2, 2, 8), op(1, 0, 31, 6, 2, 2, 10)]),
  P('slap', 'Slap Bass', 'Bass', 4, 5, [op(2, 34, 31, 18, 6, 6, 12, 0, 1), op(1, 0, 31, 9, 4, 3, 10), op(5, 40, 31, 20, 8, 8, 12, 0, 1), op(1, 5, 31, 11, 5, 4, 10)]),
  P('pickbass', 'Pick Bass', 'Bass', 2, 4, [op(3, 40, 31, 14, 4, 4, 10), op(1, 32, 31, 10, 3, 3, 9), op(1, 26, 31, 9, 3, 3, 9), op(1, 0, 31, 7, 3, 3, 9)]),
  P('subbass', 'Sub Bass', 'Bass', 7, 0, [OFF, OFF, OFF, op(1, 0, 31, 4, 1, 1, 9)]),
  P('acidbass', 'Acid Bass', 'Bass', 3, 7, [op(1, 22, 31, 14, 6, 5, 9), op(2, 44, 31, 12, 4, 4, 9), op(1, 30, 31, 16, 6, 6, 9), op(1, 0, 31, 8, 3, 2, 10)]),
  // Lead
  P('square', 'Square Lead', 'Lead', 4, 0, [op(2, 22, 31, 0, 0, 0, 8), op(1, 2, 31, 0, 0, 0, 8), op(2, 24, 31, 0, 0, 0, 8, 3), op(1, 4, 31, 0, 0, 0, 8, 7)]),
  P('saw', 'Saw Lead', 'Lead', 0, 7, [op(1, 18, 31, 0, 0, 0, 8), op(1, 30, 31, 0, 0, 0, 8), op(1, 26, 31, 0, 0, 0, 8), op(1, 0, 31, 2, 1, 1, 8)]),
  P('softlead', 'Soft Lead', 'Lead', 4, 2, [op(1, 36, 26, 4, 2, 2, 7), op(1, 0, 26, 3, 1, 1, 7), op(3, 46, 26, 6, 2, 3, 7, 2), op(1, 6, 26, 3, 1, 1, 7, 6)], 0x02),
  P('syncled', 'Sync Lead', 'Lead', 0, 5, [op(5, 24, 31, 4, 2, 2, 8), op(2, 28, 31, 6, 2, 3, 8), op(1, 22, 31, 5, 2, 2, 8), op(1, 0, 31, 2, 1, 1, 8)]),
  P('flute', 'Flute', 'Lead', 4, 3, [op(1, 44, 22, 3, 1, 2, 8), op(1, 0, 20, 2, 1, 1, 8), op(4, 60, 24, 8, 3, 6, 8), op(1, 8, 20, 2, 1, 1, 8)], 0x03),
  // Brass
  P('brass', 'Brass Section', 'Brass', 2, 6, [op(1, 30, 24, 6, 2, 3, 8), op(1, 26, 22, 5, 2, 2, 8), op(1, 22, 24, 6, 2, 2, 8), op(1, 0, 22, 4, 1, 1, 8)]),
  P('trumpet', 'Trumpet', 'Brass', 0, 5, [op(1, 32, 26, 6, 2, 3, 8), op(1, 30, 26, 6, 2, 3, 8), op(1, 26, 26, 5, 2, 2, 8), op(1, 2, 24, 4, 1, 1, 8)], 0x02),
  P('stab', 'Brass Stab', 'Brass', 4, 6, [op(1, 24, 31, 12, 6, 5, 10), op(1, 0, 31, 10, 5, 4, 10), op(2, 30, 31, 12, 6, 5, 10, 1), op(1, 4, 31, 10, 5, 4, 10, 5)]),
  // Keys
  P('epiano', 'Electric Piano', 'Keys', 4, 0, [op(14, 40, 31, 16, 8, 8, 8), op(1, 0, 31, 6, 3, 2, 7), op(1, 30, 31, 8, 4, 4, 8), op(1, 4, 31, 6, 3, 2, 7)]),
  P('organ', 'Organ', 'Keys', 7, 0, [op(1, 8, 31, 0, 0, 0, 12), op(2, 10, 31, 0, 0, 0, 12), op(4, 16, 31, 0, 0, 0, 12), op(0, 6, 31, 0, 0, 0, 12)]),
  P('clav', 'Clav', 'Keys', 0, 6, [op(3, 30, 31, 14, 8, 6, 10), op(5, 38, 31, 12, 6, 6, 10), op(1, 28, 31, 10, 6, 5, 10), op(1, 0, 31, 9, 6, 4, 11)]),
  P('toypiano', 'Toy Piano', 'Keys', 4, 2, [op(7, 30, 31, 18, 10, 10, 9), op(1, 0, 31, 12, 6, 5, 9), op(4, 36, 31, 16, 10, 9, 9), op(2, 8, 31, 12, 6, 5, 9)]),
  // Pads
  P('strings', 'Strings', 'Pads', 2, 3, [op(1, 34, 16, 4, 1, 2, 6, 1), op(1, 32, 15, 4, 1, 2, 6, 5), op(1, 28, 16, 3, 1, 1, 6), op(1, 0, 15, 2, 1, 1, 6)], 0x03),
  P('choir', 'Choir', 'Pads', 4, 2, [op(2, 40, 14, 3, 1, 2, 6), op(1, 0, 13, 2, 1, 1, 6, 1), op(3, 46, 14, 4, 1, 3, 6), op(1, 4, 13, 2, 1, 1, 6, 5)], 0x03),
  P('warmpad', 'Warm Pad', 'Pads', 5, 1, [op(1, 36, 12, 3, 1, 2, 5), op(1, 4, 12, 2, 1, 1, 5, 1), op(2, 10, 12, 2, 1, 1, 5, 5), op(1, 2, 12, 2, 1, 1, 5)], 0x02),
  P('glasspad', 'Glass Pad', 'Pads', 4, 0, [op(6, 44, 16, 4, 1, 3, 6), op(1, 0, 15, 2, 1, 1, 6), op(9, 50, 16, 5, 2, 4, 6, 2), op(2, 10, 15, 2, 1, 1, 6, 6)], 0x01),
  // Bells
  P('bell', 'Tubular Bell', 'Bells', 4, 0, [op(3, 26, 31, 8, 3, 4, 5, 3), op(1, 0, 31, 4, 2, 2, 4), op(7, 34, 31, 9, 3, 5, 5), op(2, 10, 31, 5, 2, 3, 4, 7)]),
  P('marimba', 'Marimba', 'Bells', 4, 0, [op(4, 32, 31, 20, 14, 12, 10), op(1, 0, 31, 12, 8, 6, 9), op(10, 46, 31, 22, 16, 14, 10), op(1, 6, 31, 12, 8, 6, 9)]),
  P('musicbox', 'Music Box', 'Bells', 4, 1, [op(9, 34, 31, 14, 6, 8, 7), op(2, 0, 31, 8, 4, 4, 6), op(5, 40, 31, 14, 6, 8, 7), op(4, 8, 31, 9, 4, 4, 6)]),
  // Synth
  P('chip', 'Chip Pulse', 'Synth', 4, 0, [op(1, 18, 31, 0, 0, 0, 10), op(2, 0, 31, 0, 0, 0, 10), op(3, 22, 31, 0, 0, 0, 10), op(1, 6, 31, 0, 0, 0, 10)]),
  P('blip', 'Arp Blip', 'Synth', 4, 3, [op(2, 26, 31, 16, 10, 8, 12), op(1, 0, 31, 12, 8, 6, 12), op(4, 34, 31, 16, 10, 8, 12), op(1, 6, 31, 12, 8, 6, 12)]),
  P('hoover', 'Hoover', 'Synth', 6, 7, [op(1, 20, 28, 2, 1, 1, 8), op(1, 2, 28, 2, 1, 1, 8, 1), op(1, 4, 28, 2, 1, 1, 8, 5), op(0, 6, 28, 2, 1, 1, 8)], 0x33),
  // Pluck
  P('harp', 'Harp', 'Pluck', 4, 2, [op(2, 34, 31, 14, 6, 7, 8), op(1, 0, 31, 9, 4, 4, 7), op(3, 40, 31, 15, 6, 8, 8), op(1, 6, 31, 9, 4, 4, 7)]),
  P('steel', 'Steel Guitar', 'Pluck', 2, 5, [op(3, 32, 31, 12, 5, 5, 9), op(1, 30, 31, 10, 4, 4, 9), op(1, 26, 31, 9, 4, 3, 9), op(1, 0, 31, 8, 4, 3, 9)]),
  P('dist', 'Distortion Guitar', 'Pluck', 0, 7, [op(1, 14, 31, 2, 1, 1, 9), op(3, 22, 31, 4, 2, 2, 9), op(1, 20, 31, 3, 1, 1, 9), op(1, 0, 31, 3, 2, 2, 9)])
];
const CATS = ['Bass', 'Lead', 'Brass', 'Keys', 'Pads', 'Bells', 'Synth', 'Pluck'];
function regs(p) {
  const r = new Uint8Array(30);
  p.ops.forEach((o, i) => {
    r[0 + i] = ((o.dt & 7) << 4) | (o.mul & 15);
    r[4 + i] = o.tl & 127;
    r[8 + i] = ((o.ks & 3) << 6) | (o.ar & 31);
    r[12 + i] = o.d1r & 31;
    r[16 + i] = o.d2r & 31;
    r[20 + i] = ((o.sl & 15) << 4) | (o.rr & 15);
    r[24 + i] = 0;
  });
  r[28] = ((p.fb & 7) << 3) | (p.alg & 7);
  r[29] = p.amsfms & 0x37;
  return r;
}
const CARRIERS = [8, 8, 8, 8, 10, 14, 14, 15];
// a game instrument as heard: bring its loudest carrier to full level so the game's volume applies on top
function normalize(r) {
  const out = Uint8Array.from(r), car = CARRIERS[out[28] & 7];
  let m = 127; for (let o = 0; o < 4; o++) if (car & (1 << o)) m = Math.min(m, out[4 + o] & 127);
  for (let o = 0; o < 4; o++) if (car & (1 << o)) out[4 + o] = (out[4 + o] & 127) - m;
  return out;
}
window.HDBank = {PRESETS, CATS, regs, normalize, byId: id => PRESETS.find(p => p.id === id)};
})();
