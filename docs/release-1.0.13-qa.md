# Matrix 1.0.13 — 20 October 2026

## Overview
Adds complete Ticket Panel Scheduler with opening presets (08:00 AM General, 10:00 AM Tatkal AC, 11:00 AM Tatkal Non-AC), custom time scheduling, schedule type modes (Login + Submit, Submit Only, WebLogin), slot opening submit offsets (0s, +0.5s, +1.0s, +1.5s, +2.0s), and automated browser selection for WebLogin.

## Features & Fixes
1. **Ticket Panel Scheduler (`src/renderer/matrix-scheduler.js`):**
   - Direct `⏰ Schedule` button on action bar with live armed countdown (`⏹ Cancel`).
   - Slot Opening Presets for General (08:00 AM), AC Tatkal (10:00 AM), and Sleeper Tatkal (11:00 AM).
   - Custom time scheduling (e.g. `01:45:00` or arbitrary afternoon/morning slots) with 12h/24h smart conversion and quick minute adjustment buttons (`+1m`, `+5m`, `+10m`, `+15m`).
   - Schedule Types: `🔄 Login + Submit`, `⚡ Submit Only`, `🌐 WebLogin`.
   - Submit Offset options (`Exact 0s`, `+0.5s`, `+1.0s`, `+1.5s`, `+2.0s`).
   - Browser picker integration: detected browser profiles (`Google Chrome`, `Brave Browser`, `Microsoft Edge`, `Chrome Advance`, `GoLogin`) are automatically selected and launched on schedule.
   - Header countdown banner with second-by-second live countdown.

2. **QR Positioning & Parity:**
   - Pre-calculated dock positions before window creation to eliminate center jump/rotation animation.
   - Exact 8px vertical gap docking conforming to TS recovered specification.

3. **Validation:**
   - Full test suite passing (11 unit tests in `test/matrix-scheduler.test.cjs`, `test/qr-delivery.test.cjs`, `test/ticket-docking.test.cjs`).
   - Package payload verified using `tools/test_installer_payload.py` with normal, relocated, and truncated payload tests passing.
