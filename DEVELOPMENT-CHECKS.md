# Nexus source-build gates

The source overrides live in src/main/runtime/development.cjs. Original recovered definitions remain available for reference.

Local inspections overridden: f2595, f2605, f2635, f2684, f2685, f2689, f2749, f2758, f2810, f2835. Publisher version gates: f2539/f2549. Publisher license branches: f3370 selects the key-free path; f3383 permits the per-booking source path. Forced shutdown f2877 and encrypted vendor reporting f2009 are disabled.

Networking, browser processes and native clients are enabled. Original IPC handlers and window managers remain in use; genuine service authentication is preserved. Explicit Quit and Restart still require the app's confirmation page. Only the isolated smoke harness intentionally blocks external requests and commands.

Six runtime checks pass, including real loopback networking, child-process launch, original IPC passthrough, key-free branch selection and recovered control-flow consistency. Live QR/payment success must be established separately; see VALIDATION.json and TASK-STATE.json.
