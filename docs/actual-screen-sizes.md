# Actual Matrix window sizes

Measured from the running release app, not the old screenshot gallery.

## Current workspace size update

New Form, Open Form, Login Data, Proxy, Payment, Tickets, Tools, Updates and Logs now share **1120 × 760**. All nine were measured in the running release after this change; evidence: diagnostics/workspace-size-verification.json. Smaller monitor work areas are clamped to fit. Tools now uses a two-column layout verified without page or main-panel overflow at 1120 × 760. Splash and Confirm Quit are now both 460 × 360, measured in release; evidence: diagnostics/splash-quit-460-verified.json. The old measurements below document the previous layout. Updates no longer has the Release Center / Your Matrix. Always ready intro block.

Measurement timestamp: 2026-10-25T15:23:26.927Z (UTC). Display scaling: 100%; devicePixelRatio: 1. These measured windows are frameless, so outer bounds and content bounds match. Sizes are width × height. No booking/payment was started.

| Screen | Size | Evidence |
|---|---|---|
| Tickets / History | 680 × 640 | Measured in running release |
| Payment | 660 × 620 | Measured in running release |
| Logs | 720 × 560 | Measured in running release |
| Proxy | 660 × 660 | Measured in running release |
| Tools | 640 × 760 | Measured in running release |
| Updates | 520 × 480 | Measured in running release |
| Login Data | 640 × 640 | Measured in running release |
| Open Form | 1120 × 760 | Measured in running release |
| Confirm Quit | 400 × 236 | Measured in running release |
| Booking Form | 1280 × 940 | Measured in running release |
| Controller — expanded | 970 × 58 | Measured in running release |
| Controller — collapsed | 140 × 50 | Native window measurement before restart |
| Splash | 460 × 360 | Measured during release startup |
| Booking / QR / Success | 348 × 241 | Current runtime configuration; not opened for a booking in this audit |
| Activation | 540 × 740 | Current source configuration; saved key bypassed this screen |

## Dialogs are not independent windows

The old gallery contains 49 previews, including scroll positions and dialogs; it does not contain 49 independent application windows.

- Booking picker / browser / schedule / captcha / booking OTP / confirmation dialogs belong to the booking window. The parent is configured as 348 × 241; the individual dialog card can be smaller and was not separately measured here.
- Login Data dialogs belong to the measured 640 × 640 window.
- Payment dialog belongs to 660 × 620.
- Proxy dialogs belong to 660 × 660.
- Open Form export belongs to 1120 × 760.
- Available Trains belongs to the measured 1280 × 940 form.

## Not triggered in this run

App Lock, standalone OTP, Updating, Configuration Error, Device Blocked, Pair Limit, Security Error and Version Blocked were not triggered. Their live window sizes are not verified by this audit. Do not substitute gallery screenshot dimensions for them. Form and other resizable windows can differ on a smaller monitor or after resizing.

## Collection card update

Booking Library cards now match the IRCTC account card footprint: at a 1120 × 760 workspace, both are approximately 352 × 134 CSS pixels (account measured 133.53125 high; library 134). Library Open Booking, Edit Setup, Dup and Del share one action row. Measured evidence: diagnostics/library-account-card-match.json.
