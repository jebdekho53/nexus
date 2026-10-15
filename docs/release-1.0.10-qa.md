# Matrix 1.0.10 — independent pair closes during WebLogin

Reproduced the user's sequence: two independent booking/pair panels exist;
starting WebLogin invokes renderer `closeAuxWindows()` before login. The
recovered handler `f4292` decides which windows to keep using legacy titles
including `Booking` and `Scan to Pay`. Rebranded Matrix booking panels fail that
classification, so another pair is closed and its session disposed.

The earlier direct login IPC test missed the bug because it did not call the
renderer's pre-login auxiliary cleanup. The private-browser helper's separate
two-browser test also did not exercise this handler.

Fix: intercept `app:close-aux-windows` with a narrowly scoped local-page cleanup.
Require a local Matrix caller, close only known auxiliary renderer pages, keep
the caller, and preserve booking/pair/ticket/QR/controller/unknown/remote
windows. Window titles are no longer used for this decision. Account-conflict
and backup-pair rules are unchanged.

Verification:

- 58 application tests passed, including branded pair/ticket/QR preservation,
  auxiliary closing and rejection of foreign callers.
- Before fix: actual app pair IPC with different synthetic IDs and mocked
  authentication had two panels before `closeAuxWindows`, one afterward;
  second session was disposed. Reproduction failed as expected.
- After fix: same test against source and **installed 1.0.10** retained two
  panels and two undisposed sessions. External networking was blocked; no real
  credentials, booking or payment were used.
- Installed updater preserved five release-profile JSON files.
- Full setup and updater pass original/relocated ZIP validation and truncated
  payload rejection. Disposable updater preserves runtime and saved marker.

This verifies the panel-cleanup defect, not authenticated multi-account service
behaviour, General Auto QR timing or booking/payment success. Existing provider
session/access controls remain in force.

Artifacts:

Both files were SHA-256 verified on the VPS before atomic manifest publication.
Public Downloads manifest reports 1.0.10; both GET downloads return HTTP 200
and matching content lengths.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Matrix-Setup-1.0.10.exe | 264681985 | 044e92ed0e2e31a3ab6bce4dca0183aa1e0dafebd364c0976ef3b04344f4d28d |
| Matrix-Updater-1.0.10.exe | 27268885 | 84c2884db044f89e10bf199e3d9ed700760a01ac9a2d06e81450d37388d1bdf9 |

Private evidence: `diagnostics/pair-login-isolation-before-aux-fix.json`,
`diagnostics/pair-login-isolation-after-source-aux-fix.json`,
`diagnostics/pair-login-isolation.json` (installed version 1.0.10) and
`diagnostics/local-1.0.10-update.json`.
