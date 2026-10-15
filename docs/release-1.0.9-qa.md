# Matrix 1.0.9

Changes:

- A confirmed ticket (`booking-box.html?view=ticket&id=...`) docks below its
  own booking/success panel. It follows movement and resize, resists inherited
  side-positioning and detaches listeners on close. When the combined heights
  fit the display work area, the panel moves up if needed to keep the ticket
  below it. If both windows cannot fit, display-bound clamping may overlap;
  no claim of impossible off-screen-free stacking is made.
- QR parent lookup excludes ticket views, preventing a ticket window from
  becoming its own pair's booking-panel anchor.
- Private browser launcher cleanup closes only unowned blank/new-tab pages,
  preserving other pair pages and restored nonblank tabs.
- Login/start/stop/logout logs include form/profile/sender identifiers without
  account/password fields, to diagnose pair lifecycle issues.
- General Auto no longer forces Direct flags; standard Auto routing is used
  with GN's immediate clock resolution. Scheduled quotas are preserved.

Verification:

- 56 application tests passed, including matching-pair docking, movement,
  inherited reposition attempts, listener cleanup, cross-pair page protection,
  independent login scopes and GN/scheduled timing separation.
- Installed 1.0.9 updater successfully; four release-profile JSON files unchanged.
- Both full setup/updater pass embedded ZIP relocation/truncation validation.
  Disposable updater application preserves runtime hash and saved marker.
- Installed application smoke passed with eight windows.
- Installed docking module tested with actual Electron windows and local
  synthetic HTML. Initial panel `(20,274,380,210)` -> ticket
  `(20,492,380,540)`; after moving panel to `(90,20)`, ticket followed to
  `(90,238)`. A legacy side-position attempt was corrected. No booking/payment.
- Actual installed Brave helper with two independent private sessions kept the
  first page alive during second launch and second disposal. No network/login.
- Source app's actual pair IPC with two mocked authenticated sessions and
  synthetic different IDs retained both independent panels/sessions. External
  networking was blocked. This did not reproduce the reported live symptom.

Setup and updater published on Matrix Downloads after VPS SHA-256 verification
and atomic manifest replacement. Public GET returned HTTP 200 and expected
content sizes: setup 264680420 bytes; updater 27268170 bytes.

Limits: the human reports first pair browser/panel closes when the second logs
in, using different IDs and independent pairs. This exact authenticated case
was not reproduced. The launcher-page protection removes one unsafe cleanup
path, not a proven explanation of the user's full symptom. Do not claim the
whole pair-login issue solved. New General Auto warm-up/QR latency is not
live-verified. Prior live QR automatic-approval rejection must not be bypassed.

RailOne remains unconfigured; CAPTCHA is manual. No booking/payment confirmation
was submitted during these checks.
