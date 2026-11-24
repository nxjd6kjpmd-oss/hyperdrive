/* Hyperdrive instrument hook.
   Sits between the game and the YM2612/YM3438: keeps a shadow copy of every
   channel's instrument registers, fingerprints instruments when notes start,
   counts key-ons for the activity lights, and swaps in replacement instruments
   while keeping the game's volume changes (carrier total level) working. */
#include <stdint.h>
#include <string.h>

typedef void (*fmw_t)(unsigned int cycles, unsigned int a, unsigned int v);
static fmw_t real_write;

#define PATCH_BYTES 30          /* 7 regs x 4 ops + FB/ALG + AMS/FMS */
#define MAX_PATCHES 64
#define MAX_OVR 64

typedef struct {
  uint32_t fp;                  /* fingerprint */
  uint32_t keyons;              /* total notes started */
  uint32_t chmask;              /* channels it has played on */
  uint8_t regs[PATCH_BYTES];    /* as first heard, carrier TL as played */
  uint8_t pad[2];
} hd_patch;

static hd_patch patches[MAX_PATCHES];
static int npatches;
static struct { uint32_t fp; uint8_t regs[PATCH_BYTES]; uint8_t on; } ovr[MAX_OVR];

/* shadow: what the game wrote. latch: game's last address per port. */
static struct { uint8_t regs[2][256]; uint8_t latch[2]; int8_t applied[6]; uint8_t pad[2]; } sh;
static int enabled = 1;

static const uint8_t OPOFF[4] = {0, 8, 4, 12};               /* op1, op2, op3, op4 */
static const uint8_t BASES[7] = {0x30, 0x40, 0x50, 0x60, 0x70, 0x80, 0x90};
static const uint8_t CARRIERS[8] = {8, 8, 8, 8, 10, 14, 14, 15}; /* bit i = op(i+1) is a carrier */

static void read_patch(int c, uint8_t *out) {
  int port = c / 3, ch = c % 3, k = 0;
  for (int b = 0; b < 7; b++) for (int o = 0; o < 4; o++) out[k++] = sh.regs[port][BASES[b] + OPOFF[o] + ch];
  out[28] = sh.regs[port][0xB0 + ch] & 0x3F;
  out[29] = sh.regs[port][0xB4 + ch] & 0x37;
}
static uint32_t fingerprint(const uint8_t *p) {
  uint8_t t[PATCH_BYTES]; memcpy(t, p, PATCH_BYTES);
  uint8_t car = CARRIERS[t[28] & 7];
  for (int o = 0; o < 4; o++) if (car & (1 << o)) t[4 + o] = 0;  /* TL row is index 4..7 */
  uint32_t h = 2166136261u;
  for (int i = 0; i < PATCH_BYTES; i++) { h ^= t[i]; h *= 16777619u; }
  return h ? h : 1;
}
static int find_ovr(uint32_t fp) { for (int i = 0; i < MAX_OVR; i++) if (ovr[i].on && ovr[i].fp == fp) return i; return -1; }

/* write straight to the chip, then put the game's latched address back */
static void chip(unsigned cyc, int port, int reg, int val) {
  real_write(cyc, port * 2, reg); real_write(cyc, port * 2 + 1, val);
}
static void relatch(unsigned cyc) { real_write(cyc, 0, sh.latch[0]); real_write(cyc, 2, sh.latch[1]); }

/* the game's attenuation for this channel: loudest carrier TL */
static int game_volume(int c) {
  int port = c / 3, ch = c % 3, alg = sh.regs[port][0xB0 + ch] & 7, v = 127;
  for (int o = 0; o < 4; o++) if (CARRIERS[alg] & (1 << o)) { int tl = sh.regs[port][0x40 + OPOFF[o] + ch] & 0x7F; if (tl < v) v = tl; }
  return v;
}
static void write_carrier_tls(unsigned cyc, int c, const uint8_t *r) {
  int port = c / 3, ch = c % 3, vol = game_volume(c), car = CARRIERS[r[28] & 7];
  for (int o = 0; o < 4; o++) if (car & (1 << o)) { int tl = (r[4 + o] & 0x7F) + vol; if (tl > 127) tl = 127; chip(cyc, port, 0x40 + OPOFF[o] + ch, tl); }
}
static void load_override(unsigned cyc, int c, const uint8_t *r) {
  int port = c / 3, ch = c % 3, k = 0, car = CARRIERS[r[28] & 7];
  for (int b = 0; b < 7; b++) for (int o = 0; o < 4; o++, k++) {
    if (b == 1 && (car & (1 << o))) continue;              /* carriers set below */
    chip(cyc, port, BASES[b] + OPOFF[o] + ch, r[k]);
  }
  chip(cyc, port, 0xB0 + ch, r[28]);
  chip(cyc, port, 0xB4 + ch, (sh.regs[port][0xB4 + ch] & 0xC0) | (r[29] & 0x37));
  write_carrier_tls(cyc, c, r);
}
static void restore_game(unsigned cyc, int c) {
  int port = c / 3, ch = c % 3;
  for (int b = 0; b < 7; b++) for (int o = 0; o < 4; o++) { int a = BASES[b] + OPOFF[o] + ch; chip(cyc, port, a, sh.regs[port][a]); }
  chip(cyc, port, 0xB0 + ch, sh.regs[port][0xB0 + ch]);
  chip(cyc, port, 0xB4 + ch, sh.regs[port][0xB4 + ch]);
}
static void note_on(unsigned cyc, int c) {
  uint8_t p[PATCH_BYTES]; read_patch(c, p);
  uint32_t fp = fingerprint(p);
  int i = 0; while (i < npatches && patches[i].fp != fp) i++;
  if (i == npatches && npatches < MAX_PATCHES) { patches[i].fp = fp; memcpy(patches[i].regs, p, PATCH_BYTES); patches[i].keyons = 0; patches[i].chmask = 0; npatches++; }
  if (i < npatches) { patches[i].keyons++; patches[i].chmask |= 1u << c; }
  int dac = (sh.regs[0][0x2B] & 0x80) && c == 5;
  int o = (enabled && !dac) ? find_ovr(fp) : -1;
  if (o >= 0) { load_override(cyc, c, ovr[o].regs); sh.applied[c] = (int8_t)o; relatch(cyc); }
  else if (sh.applied[c] != -1) { restore_game(cyc, c); sh.applied[c] = -1; relatch(cyc); }
}

static void hook_write(unsigned int cyc, unsigned int a, unsigned int v) {
  int port = (a >> 1) & 1;
  if (!(a & 1)) { sh.latch[port] = (uint8_t)v; real_write(cyc, a, v); return; }
  int reg = sh.latch[port];
  sh.regs[port][reg] = (uint8_t)v;
  if (port == 0 && reg == 0x28) {
    int cc = v & 7, c = (cc & 4) ? 3 + (cc & 3) : cc;
    if ((cc & 3) != 3 && c < 6 && (v & 0xF0)) note_on(cyc, c);
    real_write(cyc, a, v); return;
  }
  /* patch registers of a channel that currently plays a replacement */
  int ch = -1, isTL = 0;
  if (reg >= 0x30 && reg < 0xA0 && (reg & 3) != 3) { ch = reg & 3; isTL = (reg & 0xF0) == 0x40; }
  else if ((reg >= 0xB0 && reg <= 0xB2) || (reg >= 0xB4 && reg <= 0xB6)) ch = reg & 3;
  if (ch >= 0) {
    int c = port * 3 + ch, o = sh.applied[c];
    if (o >= 0) {
      if (isTL) { write_carrier_tls(cyc, c, ovr[o].regs); relatch(cyc); }
      else if (reg >= 0xB4) { real_write(cyc, a, (v & 0xC0) | (ovr[o].regs[29] & 0x37)); }
      return;                                       /* game's timbre change waits for the next note */
    }
  }
  real_write(cyc, a, v);
}

fmw_t hd_wrap_fm(fmw_t w) { real_write = w; return hook_write; }

/* ---- exports for JavaScript ---- */
int hd_instr_count(void) { return npatches; }
hd_patch *hd_instr_table(void) { return patches; }
int hd_instr_entry_size(void) { return (int)sizeof(hd_patch); }
void hd_instr_reset(void) { npatches = 0; memset(patches, 0, sizeof patches); }
uint8_t *hd_instr_buf(void) { static uint8_t buf[PATCH_BYTES]; return buf; }
int hd_instr_set(uint32_t fp) {                     /* replacement regs in hd_instr_buf() */
  int i = find_ovr(fp);
  if (i < 0) for (i = 0; i < MAX_OVR && ovr[i].on; i++);
  if (i >= MAX_OVR) return 0;
  ovr[i].fp = fp; memcpy(ovr[i].regs, hd_instr_buf(), PATCH_BYTES); ovr[i].on = 1;
  for (int c = 0; c < 6; c++) if (sh.applied[c] == i) sh.applied[c] = -2;  /* force reload at next note */
  return 1;
}
void hd_instr_clear(uint32_t fp) { int i = find_ovr(fp); if (i >= 0) ovr[i].on = 0; }
void hd_instr_clear_all(void) { memset(ovr, 0, sizeof ovr); }
void hd_instr_enable(int on) { enabled = on; }
/* shadow state travels with save states so swaps survive load and rewind */
void *hd_instr_shadow(void) { return &sh; }
int hd_instr_shadow_size(void) { return (int)sizeof sh; }
void hd_instr_after_load(void) { for (int c = 0; c < 6; c++) sh.applied[c] = sh.applied[c] >= 0 ? -2 : sh.applied[c]; }
void hd_instr_init(void) { memset(&sh, 0, sizeof sh); for (int c = 0; c < 6; c++) sh.applied[c] = -1; }
