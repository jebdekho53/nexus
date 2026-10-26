# Matrix Browser runtime — ready

Based on public ProxyShard ShardBrowser Chromium 156.0.8078.48, SDK reference 2.1.0, engine build 3. TS package.json aliases this upstream SDK as brahmos-engine; no TS files/profiles or server/license configuration were copied. This is a repackaged upstream binary, not Chromium compiled from source. Original license notices are preserved.

The original engine EXE referred to an unresolved private versioned chrome_elf assembly. Packaging rebuilds only resource #1 launch manifest to use the DLL already supplied in its root folder. UAC asInvoker and Windows Common Controls remain. Original and resulting EXE hashes are recorded in source-manifest.json; upstream ETag and download SHA-256 are retained.

Verified both headless and normal visible browser launch, browser version 156.0.8078.48 and local HTML page. Page requests blocked. No real login/payment/booking attempted. runtime-ready.json records the tested EXE hash and gates discovery of the Matrix-owned engine. Resolver prioritizes %LOCALAPPDATA%/Matrix/Browser/ShardX-Windows/chrome.exe.

Portable package: C:\Users\lexus\Documents\nexus\nexus\matrix-browser-build\Matrix-Browser-156.0.8078.48-win-x64.zip
SHA256: d115c321aabb9c0c97ce1885139af0a717501d9d97acc7629f4cf4056c8e3f61

Recipients should extract the ZIP contents into %LOCALAPPDATA%/Matrix/Browser (avoiding an extra nested folder). Launch-Matrix-Browser.cmd opens an independent Matrix browser profile. Matrix Tools supports ZIP folder / Copy path on the current workstation; the ZIP has not been published to a public server. Other users need the updated Matrix resolver code. Main app installer/updater were not built.
