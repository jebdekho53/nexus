# TypeScript migration

Status: **in progress**. 53 modules are real TypeScript reconstructions (listed below). Everything else — the generated
definitions in `src/main/generated`, the compiled bundle, the interpreter, the engine, the exclusions listed below and
the remaining `.cjs` modules — is unchanged. No completion percentage is claimed; the migration is **not** complete.

## Architecture and build decisions

* TypeScript sources live in `src/ts/**` and compile with the local `tsc` (`typescript` devDependency, `tsconfig.json`:
  strict, ES2022, CommonJS) into `build/ts/**`. `build/` is git-ignored; sources and output stay separate.
  `@types/node` is a devDependency. A few files add `/// <reference lib="dom" />` because they contain page-side
  functions that run inside a browser (`page.evaluate`); those functions are self-contained and are tested by
  evaluating their compiled source text in a scripted DOM sandbox.
* The runtime stays CommonJS. A migrated module's original path keeps a three-line `.cjs` entry point calling
  `loadTs('main/…')` (`src/main/runtime/ts-build.cjs`), so every `require()` site, the factory table
  (`src/main/runtime/reconstructed-payment.cjs`), the compiled bundle and the interpreter are unchanged.
* `scripts/ensure-ts-build.cjs` builds when `build/ts` is missing or older than `src/ts`/`tsconfig.json`. It is used by
  `npm start` (`scripts/run.cjs`), by `start.cmd` and `Matrix.cmd` (the bundled `.runtime\electron.exe` runs it as Node via
  `ELECTRON_RUN_AS_NODE=1`), and by `tools/build_installer.py` and `tools/package_project.py`. A packaged install without a
  compiler keeps using the shipped `build/ts`; a missing build with no compiler gives an actionable error.
* Packaging: the installer builder now builds first and includes `build/` and `scripts/ensure-ts-build.cjs` in both the
  full and update payloads; the zip packager builds first and excludes the root `node_modules`. **Not executed here.**
* Scripts: `npm run build:ts`, `npm run check:ts`, `npm test` (builds, then runs the suite).
* The previous JavaScript of each migrated module is kept in `test/fixtures/legacy/*.legacy.cjs` and is used **only** by
  the differential tests. Delete a fixture only together with its test.
* `test/helpers/legacy-diff.cjs` runs the legacy and migrated modules on the same scripted scenario and compares the
  result or thrown error, the full side-effect trace (order included) and mutated state. `DIFF_STATS=1` prints how many
  scenarios ended in an error, to spot tests that pass only because both sides fail early.

## Verified migrated modules (real reconstructions, not wrappers)

| TypeScript | Purpose | Recovered functions / adapter | Differential test |
| --- | --- | --- | --- |
| `src/ts/main/booking/provider-page.ts` | Wait for the operator to return to the provider site | f2255, f2256, f2257 | `ts-misc` |
| `src/ts/main/booking/rules.ts` | Booking rules, berth limits, opening/availability times, mode routing | f425, f426, f427, f428, f429, f431, f433, f435, f436, f437, f438, f439, f440, f441, f444, f445, f446, f447, f448, f449, f450, f451, f452, f453, f454, f455, f456 | `ts-rules` |
| `src/ts/main/booking/server-time.ts` | Server clock offset and sync | f2272, f2274, f2276, f2278 | `ts-server-time` |
| `src/ts/main/booking/time-helpers.ts` | Scheduling, IST clock, quota families, failure text | f432, f2271, f2367, f2368, f2369, f2373, f2375, f2376, f2377, f2379, f2380, f2381, f2383, f2385 | `ts-time-helpers` |
| `src/ts/main/payment/bank-response.ts` | Bank response confirmation chain | f1611, f1681, f1717 | `ts-payment-settlement` |
| `src/ts/main/payment/booking-data.ts` | Final PNR lookup and polling | pollBookingData/fetchBookingData (adapter helpers) | `ts-payment-flow` |
| `src/ts/main/payment/booking-result.ts` | Booking result normalisation | f554 | `ts-payment-flow` |
| `src/ts/main/payment/finish-booking.ts` | Booking completion and cleanup | f2233, f2243 | `ts-payment-flow` |
| `src/ts/main/payment/gateway-dispatch.ts` | Payment flow dispatch by method | f2176 (dispatch) | `ts-payment-flow` |
| `src/ts/main/payment/gateway-redirect.ts` | Payment redirect form flow | f1599, f1609, f1610, f1667, f1684 | `ts-gateway-redirect` |
| `src/ts/main/payment/gateway-requests.ts` | bookingData / printTicket gateway GETs | f1719, f1727 | `ts-payment-flow` |
| `src/ts/main/payment/gateway-retry.ts` | Gateway network retry | f1756 | `ts-payment-small` |
| `src/ts/main/payment/gateway-selection.ts` | Payment method/bank selection | f2172 helpers | `ts-payment-small` |
| `src/ts/main/payment/http-record.ts` | Opt-in HTTP recorder (disabled unless a callback is supplied) | f1649 | `ts-payment-small` |
| `src/ts/main/payment/payment-error.ts` | Payment failure classification | f152, f545, f546 | `ts-payment-small` |
| `src/ts/main/payment/paytm.ts` | PayTM QR orchestration | f2193 | `ts-paytm` |
| `src/ts/main/payment/paytm-final-status.ts` | PayTM final status | f1712 | `ts-paytm` |
| `src/ts/main/payment/paytm-page.ts` | PayTM origin page | f1704, f1708, f1710 | `ts-paytm-pages` |
| `src/ts/main/payment/paytm-qr-request.ts` | PayTM QR fetch/parse | f1601, f1605, f1606, f1607 | `ts-paytm-pages` |
| `src/ts/main/payment/paytm-status.ts` | PayTM status polling (2500ms then 2000ms) | f1689 | `ts-paytm` |
| `src/ts/main/payment/paytm-watch.ts` | PayTM payment watcher | PayTM watcher (called from paytm.ts) | `ts-paytm` |
| `src/ts/main/payment/paytm-websocket.ts` | PayTM WebSocket watcher | f1693 | `ts-paytm-pages` |
| `src/ts/main/payment/phonepe.ts` | PhonePe QR orchestration | f2208 | `ts-payment-qr` |
| `src/ts/main/payment/pnr-lifecycle.ts` | PNR request gating and cancellable retry wait | f2220, f2221 | `ts-payment-small` |
| `src/ts/main/payment/print-ticket.ts` | Printable ticket attachment | f2247 | `ts-payment-small` |
| `src/ts/main/payment/provider-qr.ts` | Provider QR orchestration | f2186 | `ts-payment-qr` |
| `src/ts/main/payment/provider-qr-poll.ts` | Provider QR status polling | f1673, f1678 | `ts-payment-qr` |
| `src/ts/main/payment/provider-qr-request.ts` | Provider QR creation | f1668 | `ts-payment-qr` |
| `src/ts/main/payment/qr-response.ts` | QR page/status parsing | f1602, f1603, f1608 | `ts-payment-small` |
| `src/ts/main/payment/razorpay.ts` | Razorpay orchestration | f2213 | `ts-payment-qr` |
| `src/ts/main/payment/request-body.ts` | Payment-initiation body | f2172 helper | `ts-payment-small` |
| `src/ts/main/payment/request-url.ts` | Payment/booking-data URLs | f547 | `ts-payment-small` |
| `src/ts/main/payment/retry-delay.ts` | Server-requested retry delay | f548 | `ts-payment-small` |
| `src/ts/main/payment/session-context.ts` | Session accessors, referrer, request id | f2230, f2231, f2232 | `ts-payment-small` |
| `src/ts/main/payment/settlement.ts` | Payment settlement | settlePayment (adapter helper) | `ts-payment-settlement` |
| `src/ts/main/payment/wallet-verify.ts` | Wallet payment verification | f1722 | `ts-payment-settlement` |
| `src/ts/main/runtime/activity-log.ts` | Activity log with secret redaction | — | `existing activity-log.test` |
| `src/ts/main/runtime/aux-windows.ts` | Close auxiliary windows | — | `existing aux-windows.test` |
| `src/ts/main/runtime/book-now.ts` | General "Book now" handling | — | `existing book-now.test` |
| `src/ts/main/runtime/booking-timing.ts` | GN immediate-login scope | f2281 (interceptor) | `ts-runtime` |
| `src/ts/main/runtime/general-api-candidate.ts` | Developer-only GN candidate scope | f3406 (interceptor) | `ts-runtime` |
| `src/ts/main/runtime/login-performance.ts` | Login settle/fill improvements | f698, f583 (interceptors) | `existing login-performance.test` |
| `src/ts/main/runtime/matrix-brand.ts` | Matrix branding hooks | — | `ts-runtime` |
| `src/ts/main/runtime/matrix-services.ts` | Matrix service status | — | `existing matrix-services.test` |
| `src/ts/main/runtime/payment-timing.ts` | Payment timing observer (no URLs/bodies/headers retained) | f2172, f2176, f2186 (step timing wrappers) | `existing payment-timing.test` |
| `src/ts/main/runtime/portal-links.ts` | Portal links IPC | — | `existing portal-links.test` |
| `src/ts/main/runtime/private-browser.ts` | Private login sessions; stops on a security-challenge denial | f811, f829, f184 (interceptors) | `existing private-browser.test` |
| `src/ts/main/runtime/profile.ts` | Release profile directory | — | `existing profile.test` |
| `src/ts/main/runtime/qr-delivery.ts` | QR delivery to the right panel | f3734, f3743, f3746, f4021, f3740 (interceptors) | `ts-runtime + qr-delivery.test` |
| `src/ts/main/runtime/recovered-contract.ts` | Definition contract fingerprint | — | `ts-misc` |
| `src/ts/main/runtime/ticket-docking.ts` | Ticket window docking | — | `existing ticket-docking.test` |
| `src/ts/main/runtime/updates.ts` | Verified update download and Updates IPC | — | `ts-misc + updates.test` |
| `src/ts/main/runtime/window-readiness.ts` | Windows stay hidden until the renderer is ready | — | `ts-runtime` |

How each was verified: legacy vs TypeScript on identical inputs (missing / null / empty / zero / NaN / wrong-type
values) comparing results, thrown error types, traces, mutated state and lazy dependency reads; existing recovered-vs-native
oracle tests still pass against the TypeScript output; and selective mutation checks (negating every `if` condition and
specific operators, `??` vs `||`, boundaries). The differential tests found and fixed one real divergence during the
migration (the bank-response browser-closed log level). Mutants that the type checker rejects were not run.

Known looseness: dependency callbacks that read bootstrap slots return `unknown` where the recovered code does not reveal
a shape; `booking-result.ts` casts untrusted provider JSON fields at the boundary (documented in place) rather than
validating each field, to preserve the recovered value coercions exactly.

## Typed adapters that still delegate to recovered logic

None added. The factory table (`reconstructed-payment.cjs`, JavaScript) routes the function IDs above to the TypeScript
modules through the `.cjs` entry points.

## Excluded or blocked — needs a separate decision (not changed in this migration)

These were deliberately **not** migrated or modified:

* **`src/main/payment/gateway-tls.cjs`** (TLS-profile web gateway transport), **`gateway-session.cjs`** (builds a macOS
  Chrome user-agent/client-hint set for the gateway), **`gateway-headers.cjs`** (browser-style header emulation),
  **`gateway-routing.cjs`** (F5-cookie stripping, TLS-gateway and proxy-fallback routing), **`gateway-lifecycle.cjs`**
  (survivor/direct contexts with F5-cookie filtering and user-agent hints).
* **`phonepe-transport.cjs`, `razorpay-transport.cjs`** — synthesise browser-fingerprint identifiers
  (`x-browser-fingerprint`, `_[shield][fhash]`) for the providers' fraud-detection fields.
* **`payment-init.cjs`** — passes `max510`/`infinite511` retry options to the request layer for the provider's rate-limit
  responses.
* **`booking/controls.cjs`** — `cookieF5` cookie filtering and proxy-routing of the gateway (mixed with ordinary controls).
* **Booking controllers** `booking/browser-booking.cjs` (f2161–f2169), `ui-booking.cjs` (f2102–f2115),
  `railone-booking.cjs`/`railone-submit.cjs`/`railone-payment.cjs` (f3149–f3175): consume anti-bot sensor tokens and
  call captcha-solver hooks. **f3132** (the RailOne request method, never reconstructed) selects TLS client profiles,
  attaches sensor tokens and applies alternate-egress logic. **f2064** (`safeCall`) and **f2551** (`fetchReply`:
  remote gate replies, device blocks, high-load lists) were not read in detail.
* **Licensing / activation:** `runtime/activation.cjs`, `runtime/id-check.cjs`, `runtime/development.cjs`,
  `runtime/development-policy.cjs` (stubs the vendor licence IPC), `runtime/legacy-services.cjs`, `services/control-plane/*`
  (licensing server), `DEVELOPMENT-CHECKS.md` overrides (f2539/f2549, f3370, f3383, f2595 … f2835). Not touched.
* **Core runtime kept as JavaScript on purpose:** `runtime/engine.cjs` (interpreter fallback), `compiled-runtime.cjs`,
  `runtime-support.cjs`, `reconstructed-payment.cjs` (the factory table), `offline-smoke.cjs`, `src/main/index.cjs`
  (Electron entry; cannot be exercised here) and `src/main/generated`, `src/main/compiled`.

## Remaining generated/interpreted business logic

Almost all of it: `docs/reconstruction-inventory/` lists 3949 of 4354 recovered functions as `recovered_other` and the
mechanisms above are not reconstructed in TypeScript. Migrated modules cover only the functions mapped in the table.

## Uncertain behaviour

* Names in the new modules come from recovered-function comments and usage; the original names are unknown.
* `syncServerTime` assumes an `api` client exists whenever sync is enabled (a missing one throws), as the recovered code does.
* The merged loop in `bank-response.ts` serves both recovered chains (`bankResponse`, `paytmBankResponse`); the
  differential test proves the same traces, but the structure differs from the recovered code.

## Commands actually run and results

Environment: Linux cloud container, Node 22.22, TypeScript 5.9.3 (local devDependency).

| Command | Result |
| --- | --- |
| baseline on `main` (aa0a6b5): `node --test test/*.test.cjs` | 2165 tests, 2162 pass, 3 fail (known Windows-path tests) |
| `npm run check:ts` / `npm run build:ts` | clean |
| clean clone, `npm install --no-package-lock`, `npm run build:ts`, `node scripts/ensure-ts-build.cjs`, `node --test test/ts-*.test.cjs` | built; build current; passed |
| `node --test test/*.test.cjs` (final head) | 2241 tests, 2238 pass, the same 3 fail, 0 cancelled |
| `MATRIX_COMPILED=1 node --test test/*.test.cjs` (final head) | 2241 tests, 2238 pass, the same 3 fail, 0 cancelled |
| `node tools/compiler/differential-parallel.cjs --seeds 24` | 4354 checked, only f1556 seed 23 differs (the known baseline) |
| `node scripts/run.cjs` with `build/` removed | builds `build/ts` before looking for Electron (binary absent here) |
| `python3 -m py_compile tools/build_installer.py tools/package_project.py` | compile only; not executed |

The 3 failures are the known Windows-path tests: "Matrix development/release keeps live handlers and restarts in its
original mode" and "only requested windows show after renderer readiness; original preload is extended". The last is the
only existing test of the preload swap in `window-readiness`; `test/ts-runtime.test.cjs` covers that behaviour on Linux.

## Not verified in this environment (run these on Windows)

Subsequent Windows verification of `aabf9cd` is recorded in
`docs/typescript-windows-verification.md`: all 2241 tests pass in both modes,
offline launcher/installer smoke checks pass, and packaging was executed.
The following list describes the original Linux session's limitations.

1. `npm install` then `npm run build:ts` in a fresh copy; confirm `build\ts` exists.
2. `start.cmd` and `Matrix.cmd`: confirm `scripts\ensure-ts-build.cjs` runs under `.runtime\electron.exe` and the app opens.
3. `.runtime\electron.exe . --development --smoke-test`, then again with `--interpreter-runtime`.
4. The 3 Windows-path tests above.
5. `python tools\build_installer.py` (needs `csc.exe`): confirm the payload contains `build/ts` and `scripts/ensure-ts-build.cjs`, then
   install it and start the app. `tools/package_project.py` likewise.
Native dependencies, GoLogin/Playwright launchers and live provider flows were not exercised (and must not be tested
against live services without authorisation).

## Continuation checkpoint

Next eligible work, in order:
1. `runtime/offline-smoke.cjs` and `runtime/runtime-support.cjs` — core, no flagged mechanisms; need careful typing of
   dynamic engine values and a Windows smoke run before replacing.
2. Split the benign parts out of the mixed modules (`controls.cjs`: `cancelPayment`, `stoppedResult`, `highLoadDelay`,
   `focusBrowser`, `hideBrowser`, `minimizeBrowser`, `collectAuthState`; `gateway-lifecycle.cjs`: dispose/proxy-setter/`sleep`
   helpers) into their own modules, leaving the flagged parts untouched, then migrate those.
3. `src/main/index.cjs` after the Windows smoke test has been run, since it cannot be exercised here.
4. Decide on the excluded list above before any further work on the booking controllers and gateway transports.
Do not remove the legacy fixtures, the interpreter fallback or `src/main/generated` while any of this is open.
