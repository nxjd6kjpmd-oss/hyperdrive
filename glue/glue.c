/* Hyperdrive frontend glue: lets JavaScript drive the libretro core without a
   function table. Callbacks into JS are wasm imports from module "env". */
#include "libretro.h"
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#define IMPORT(n) __attribute__((import_module("env"), import_name(n)))
IMPORT("js_video") void js_video(const void *d, unsigned w, unsigned h, size_t pitch);
IMPORT("js_audio") size_t js_audio(const int16_t *d, size_t frames);
IMPORT("js_input") int16_t js_input(unsigned port, unsigned dev, unsigned idx, unsigned id);

#define NV 96
static char vk[NV][64], vv[NV][64];
static int nv, dirty;
void hd_set_var(const char *k, const char *v) {
  for (int i = 0; i < nv; i++) if (!strcmp(vk[i], k)) { strncpy(vv[i], v, 63); dirty = 1; return; }
  if (nv < NV) { strncpy(vk[nv], k, 63); strncpy(vv[nv], v, 63); nv++; dirty = 1; }
}
static bool env(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: return *(enum retro_pixel_format *)data == RETRO_PIXEL_FORMAT_RGB565;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)data = "/system"; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)data = "/saves"; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data; v->value = NULL;
      for (int i = 0; i < nv; i++) if (!strcmp(vk[i], v->key)) { v->value = vv[i]; return true; }
      return false; }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)data = dirty; dirty = 0; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)data = 0; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)data = true; return true;
    default: return false;
  }
}
static void vid(const void *d, unsigned w, unsigned h, size_t p) { if (d) js_video(d, w, h, p); }
static void aud1(int16_t l, int16_t r) { int16_t s[2] = {l, r}; js_audio(s, 1); }
static size_t audb(const int16_t *d, size_t f) { return js_audio(d, f); }
static void poll(void) {}
static int16_t inp(unsigned port, unsigned dev, unsigned idx, unsigned id) { return js_input(port, dev, idx, id); }
void hd_instr_init(void);
void hd_init(void) {
  hd_instr_init();
  retro_set_environment(env); retro_set_video_refresh(vid); retro_set_audio_sample(aud1);
  retro_set_audio_sample_batch(audb); retro_set_input_poll(poll); retro_set_input_state(inp);
  retro_init();
}
int hd_load(const char *path) { struct retro_game_info gi = {path, 0, 0, 0}; return retro_load_game(&gi); }
static struct retro_system_av_info av;
double hd_fps(void) { retro_get_system_av_info(&av); return av.timing.fps; }
double hd_rate(void) { return av.timing.sample_rate; }
