# Matrix 1.0.14 — 21 October 2026

## Overview
Matrix 1.0.14 introduces multi-form horizontal window docking, enhanced privacy with PNR masking, modernized obsidian and cyber emerald status theming, illuminated toolbar iconography, and streamlined tools window controls.

## Features & Enhancements
1. **Side-by-Side Multi-Form Docking (`src/main/runtime/ticket-docking.cjs`):**
   - Opening multiple forms or clicking the pair option in a form box now tiles windows side-by-side with a 14px horizontal gap instead of stacking directly on top of each other.
   - Intelligent multi-monitor and desktop viewport boundary detection with automatic wrap/offset fallback.

2. **PNR Privacy Masking (`src/renderer/assets/booking-box-Bsv5-yxI.js`, `src/renderer/matrix-brand.js`):**
   - Displayed PNRs are securely masked to reveal only the final 3 digits (e.g. `•••••••834`).
   - Styled with a glowing cyber emerald badge for clear status feedback without exposing sensitive customer reservation data.

3. **Status UI Overhaul (`src/renderer/matrix-theme.css`):**
   - Replaced legacy purple/magenta TS gradient with a modern Obsidian & Cyber Emerald theme.
   - Clean badges, glowing emerald indicators, and streamlined layout for booking status.

4. **Illuminated Dock Toolbar (`src/renderer/matrix-theme.css`, `src/main/runtime/matrix-brand.cjs`):**
   - Every toolbar option (`New Form`, `Open Form`, `Login Data`, `Proxy`, `Payment`, `Tickets`, `Tools`, `Updates`, `Logs`) features an illuminated brand SVG logo and clearly legible label.

5. **Streamlined Tools Window (`src/renderer/tools.html`):**
   - Cleaned up redundant administrator and seller buttons, focusing solely on `🔑 My key` and `Check services`.

6. **Validation:**
   - 2,209 unit and integration tests passing cleanly (0 failures).
   - Windows offline installer (`Matrix-Setup-1.0.14.exe`), updater (`Matrix-Updater-1.0.14.exe`), and macOS packages (`Matrix-1.0.14-darwin-arm64.zip`, `Matrix-1.0.14-darwin-x64.zip`) verified.
