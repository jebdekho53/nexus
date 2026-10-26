# Matrix 1.0.27 — Windows local build

Setup: 188,323,031 bytes (188.32 MB / 179.60 MiB). Updater: 25,222,361 bytes (25.22 MB / 24.05 MiB). Relative to Setup 1.0.26 (277,626,561 bytes), reduction is 89,303,530 bytes (32.17%). Browser engine is a separate verified on-demand dependency.

Windows-only production selection excludes test harnesses, archived interpreter definitions, non-Windows executables/artwork, dependency development docs/maps/declarations and unused Electron translations. Required Windows runtime DLLs, compiled code, station/train data, renderer assets and license notices remain.

Includes current branding/button consistency, unified workspace sizes, Tools layout, booking-card layout, account-verification state/race fix, booking log filtering, multi-box placement and per-box minimize controls, trial/IP/booking attribution integration and automatic Matrix Browser installation.

Validation: 17 focused desktop tests pass; both actual EXE payload validators accept normal/relocated ZIPs and reject truncated payloads; ZIP entries verified for 1.0.27 and absence of tests/generated/macOS payloads; setup extracted into isolated QA directory and its compiled release controller loaded with zero startup errors; updater preserved the Electron runtime hash and saved-data fixture. No live booking/payment tested for this release.

Local artifacts in ../matrix-build. Not published; live download manifest remains unchanged.
