# Windows-only production payload

The owner requested Windows-only distribution and no new installer/updater build yet. `tools/build_installer.py --plan` validates and reports the selected payload without creating an installer, modifying the renderer version file or compiling a stub. `--updater --plan` checks the update payload.

The selector in `tools/production_payload.py` excludes the top-level test harness, archived instruction interpreter definitions (`src/main/generated`), dependency test/example/doc trees, source maps, TypeScript declarations, irrelevant native build intermediates, unused Electron UI translation packs, non-Windows CycleTLS executables and macOS/Linux resource binaries/icons. The source checkout remains intact for development. Required Windows DLLs, station/train datasets, compiled runtime, assets, package entry points and license notices remain.

The default production runtime uses `src/main/compiled`, with the reviewed web-booking adapters. Archived interpreter and migration/testing flags are source-checkout tools and are not part of the customer distribution. Do not package tests merely to support those flags.

Browser engines remain separate on-demand downloads with fixed hashes and launch validation. Adding npm dependencies alone does not deliver those engine binaries. Electron and the Windows libraries needed to start the desktop app stay in the offline setup; the customer does not need Node/npm installed to start it.

Current payload plan: 6,203 files, approximately 463.8 MB uncompressed selected and 231.1 MB uncompressed excluded compared with the prior broad selection. Compression level is now 9. This is not an installer download-size claim: the final compressed EXE size is unknown until an explicitly requested build. Evidence: diagnostics/production-payload-plan.json. Main published desktop release remains unchanged.
