# Version 1.0.0 — recovered historical summary

Verified against Git snapshots `f6d36b1` (14 October 2026, 15:11:37 IST) and
`ba3cf73`. Both identify the product as **Nexus**, package `nexus-source`,
version **1.0.0**. These are historical source/document records, not a new live
test of that version. No separate Matrix-Setup-1.0.0.exe was found in the local
matrix-build directory; its installers start at 1.0.1.

## Source and application

- Editable reconstruction: 4,354 recovered main-process functions and 512,857
  instructions, executed by a custom JavaScript runtime. Renderer/preload and
  portable Electron 43.6.0 Windows ia32 were included locally. This was not the
  original author's TypeScript source.
- Nexus graphite/mint theme, Manrope font, N logo, splash, native titles/menu
  and shared branding across 21 HTML entry points.
- Controller actions: New form, Open form, Login data, Proxy, Payment, History,
  Tools, Updates and Logs. Renderer/font readiness controlled panel display.
- Forms, saved logins, passengers, proxy/payment selection, bulk import/export,
  availability snapshot, General Book now, Opening General and Tatkal timings.
- Auto, Manual, Direct, Nexus and UI Login routing existed. General Auto Book
  now reused its authenticated session, skipping the scheduled browser-check
  and second login while preserving provider submit waits. Scheduled modes
  kept their separate timing.
- Payment labels shared stable gateway IDs; Paytm QR stayed `paytm` through
  save/conversion. QR delivery fallback targeted the matching booking profile.
- Live Logs included IST millisecond timestamps, elapsed/step durations,
  one-second wait heartbeats, run filter, clear/export and known-secret
  redaction. Diagnostic files were excluded from distribution.

## Backend and activation

- Selected Lexus admin/seller/key/ledger/signup/notice and optional USDT modules
  were integrated into an independent Nexus service; original Lexus input was
  preserved separately. Existing sellers/customers were not migrated.
- Historical hostname: `nexus.vaidya-gpt.com`; admin, seller, signup and client
  routes. Separate `nexus-service`, internal port 8082, Caddy HTTPS, persistent
  registry under `/srv/nexus-data`.
- Release launch required a Nexus-issued key, checked at startup and every
  five minutes. Developer launch was key-free. Activation used OS encryption;
  release/developer profiles were separate under installation diagnostics.
- This own-key integration did **not** establish complete independence from
  every inherited vendor service. The later 1.0.7 audit found legacy config,
  RailOne/sensor/CAPTCHA and reporting code; do not retroactively claim those
  connections were all removed in 1.0.0.

## Recorded checks and limitations

- Historical integration notes report 36 existing/integration checks plus a
  local portal-origin check; nine developer screens and storage smoke passed.
  The earlier Book now report separately records 22 application tests.
- Release activation QA: controller unavailable before activation, available
  after a valid own-server key, revoked temporary QA key subsequently rejected.
- General Auto Book now, 13307 DDU → BSB, 20 October 2026, SL/GN: availability
  AVL-8; visible Paytm QR verified; login 24.24 s, booking-to-QR 74.99 s,
  total 99.23 s. One observation, not a guaranteed speed. No payment submitted.
- An earlier Direct test logged QR-ready at 101.36 s from login; Nexus at
  100.35 s, but those panel QR images were not verified. Earlier Auto timed out
  during warm-up selection. Manual was deferred. These failures remain part of
  the record; a later General Auto success does not mean every mode passed.
- Blank Account/Payment rendering, saved activation restart and profile
  migration defects were documented/fixed in later 1.0.1–1.0.3 work. Likewise
  private-browser fixes, updater changes and recent vendor cleanup belong to
  later releases and must not be included as verified 1.0.0 features.

Historical sources: `git show f6d36b1:README.md`,
`git show f6d36b1:docs/book-now-results.md`,
`git show f6d36b1:docs/e2e-13307-results.md`,
`git show ba3cf73:docs/admin-seller-integration.md`, and
`git show f6d36b1:services/control-plane/README.md`.

This is the recoverable summary from available evidence, not a complete
transcript of every pre-Git edit. No rollback or installed-app change was made.
