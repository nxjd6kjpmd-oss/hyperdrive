# Hyperdrive

A Sega Genesis / Mega Drive emulator that runs in the browser, built for phones (portrait and landscape) with touch controls, Xbox controller support, save states, rewind, fast-forward, CRT/scanline filters, region switching, Sonic & Knuckles lock-on, a sound chip swapper and an FM instrument swapper.

No ROMs are included. You add your own; they stay in your browser's storage on your device.

## Install on iPhone
Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**.

## Credits and licence
Emulation is by [Genesis Plus GX](https://github.com/libretro/Genesis-Plus-GX) (Eke-Eke and contributors), compiled to WebAssembly for Hyperdrive with a small frontend bridge (`glue/`) and an FM instrument hook (`glue/instr.c`) that powers the instrument swapper. The patch to Genesis Plus GX routes FM register writes through that hook and disables 68000 address-error emulation (it needs `setjmp`, which plain WebAssembly lacks). Genesis Plus GX is licensed for **non-commercial use only**; see `core/license.txt`. Hyperdrive must not be sold or used commercially.

## Building the core
`glue/build.sh` builds `core/hyperdrive-core.wasm` from a Genesis Plus GX checkout with the Zig toolchain (`pip install ziglang`), targeting `wasm32-wasi`. `glue/gpgx.patch` holds the changes to Genesis Plus GX.
