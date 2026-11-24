#!/bin/bash
# Usage: GPGX=/path/to/Genesis-Plus-GX (with glue/gpgx.patch applied) OUT=core ./glue/build.sh
set -e
S=${GPGX:-./Genesis-Plus-GX}; O=${OUT:-.}
DIRS="core core/z80 core/m68k core/ntsc core/sound core/input_hw core/cd_hw core/cart_hw core/cart_hw/svp"
INC=""; SRC=""
for d in $DIRS; do INC="$INC -I$S/$d"; SRC="$SRC $(ls $S/$d/*.c 2>/dev/null || true)"; done
C=$S/libretro/libretro-common
SRC="$SRC $(dirname "$0")/glue.c $(dirname "$0")/instr.c $S/libretro/libretro.c $C/streams/file_stream.c $C/streams/file_stream_transforms.c $C/compat/fopen_utf8.c $C/compat/compat_snprintf.c $C/compat/compat_strl.c $C/compat/compat_strcasestr.c $C/compat/compat_posix_string.c $C/encodings/encoding_utf.c $C/file/file_path.c $C/file/retro_dirent.c $C/lists/string_list.c $C/lists/dir_list.c $C/memmap/memalign.c $C/string/stdstring.c $C/vfs/vfs_implementation.c"
Z=$S/libretro/deps/zlib-1.2.11
SRC="$SRC $Z/adler32.c $Z/crc32.c $Z/inffast.c $Z/inflate.c $Z/inftrees.c $Z/zutil.c"
INC="$INC -I$S/core/sound/minimp3 -I$S/libretro -I$C/include -I$Z"
DEF='-DLSB_FIRST -DALIGN_LONG -DBYTE_ORDER=LITTLE_ENDIAN -DHAVE_ZLIB -D__LIBRETRO__ -DUSE_LIBRETRO_VFS -DM68K_OVERCLOCK_SHIFT=20 -DZ80_OVERCLOCK_SHIFT=20 -DHAVE_YM3438_CORE -DHAVE_OPLL_CORE -DMAXROMSIZE=33554432 -DUSE_16BPP_RENDERING -DFRONTEND_SUPPORTS_RGB565 -DUSE_PER_SOUND_CHANNELS_CONFIG -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_MMAN -D_WASI_EMULATED_PROCESS_CLOCKS'
EXP=""
for f in retro_init retro_deinit retro_api_version retro_get_system_info retro_get_system_av_info retro_set_environment retro_set_video_refresh retro_set_audio_sample retro_set_audio_sample_batch retro_set_input_poll retro_set_input_state retro_set_controller_port_device retro_reset retro_run retro_serialize_size retro_serialize retro_unserialize retro_load_game retro_unload_game retro_get_memory_data retro_get_memory_size retro_get_region malloc free hd_init hd_load hd_set_var hd_fps hd_rate hd_instr_count hd_instr_table hd_instr_entry_size hd_instr_reset hd_instr_buf hd_instr_set hd_instr_clear hd_instr_clear_all hd_instr_enable hd_instr_shadow hd_instr_shadow_size hd_instr_after_load; do EXP="$EXP -Wl,--export=$f"; done
python3 -m ziglang cc -target wasm32-wasi -O3 -DNDEBUG -DINLINE="static inline" -fno-strict-aliasing -w $DEF $INC $SRC -mexec-model=reactor -lwasi-emulated-signal -lwasi-emulated-mman -lwasi-emulated-process-clocks -Wl,--export-table -Wl,--growable-table -Wl,-z,stack-size=1048576 $EXP -Wl,--strip-all -o $O/hyperdrive-core.wasm
ls -la $O/hyperdrive-core.wasm
