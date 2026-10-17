# TypeScript migration

Status: **in progress**. The module table and generated function inventory below distinguish TypeScript business logic,
runtime infrastructure, renderer scripts, interceptors and remaining recovered functions. The interpreter and compiled
runtime infrastructure are TypeScript, but most recovered business functions still run from generated definitions.
The migration is **not** complete.

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
| `src/ts/main/ipc/forms-transfer-ipc.ts` | Saved form/model JSON exports, file and pasted CSV/JSON imports | f3949-f3953 | `forms-transfer-ipc-reconstruction` |
| `src/ts/main/storage/form-codecs.ts` | Form file dispatch, portable form and passenger serialization | f484-f486 | `form-codecs-reconstruction` |
| `src/ts/main/storage/forms-csv.ts` | CSV tokenizer, passenger text parsing, header normalization and form alias mapping | f473-f483 | `forms-csv-reconstruction` |
| `src/ts/main/storage/form-normalization.ts` | Legacy/nested form schema conversion and defaults; reuses existing rules validation helpers | f472, f487 | `form-normalization-reconstruction` |
| `src/ts/main/storage/record-codecs.ts` | Saved login/proxy text and object conversion, UPI-record validation/normalization and stored method mapping | f414-f424 | `record-codecs-reconstruction` |
| `src/ts/main/ipc/backup-ipc.ts` | Backup selection/info and user-requested encrypted backup/restore orchestration using unchanged crypto/store helpers | f4031-f4033 | `backup-ipc-reconstruction` |
| `src/ts/main/storage/settings-store.ts` | Settings path, JSON read/atomic replacement, one-time local settings migrations and standard Electron window pin operations; secret values remain opaque | f3543-f3544, f3551-f3556 | `settings-store-reconstruction`, `settings-migrations-reconstruction` |
| `src/ts/main/storage/ai-key-store.ts` | Local AI key save/read, OS encryption and legacy plaintext migration; settings IPC error forwarding | f3570-f3571, f4022 | `ai-key-store-reconstruction` |
| `src/ts/main/storage/local-catalog.ts` | Offline JSON catalog read/fallback, ranked station suggestions and capped train-name suggestions | f3495-f3497 | `local-catalog-reconstruction` |
| `src/ts/main/storage/vault-access.ts` | Lazy initialization/cache of ordinary form and record vaults, form-label migration and identity callback | f3499-f3500, f3575, f3578, f3582-f3583 | `vault-access-reconstruction` |
| --- | --- | --- | --- |
| `src/ts/main/booking/provider-page.ts` | Wait for the operator to return to the provider site | f2255, f2256, f2257 | `ts-misc` |
| `src/ts/main/booking/rules.ts` | Booking rules, berth limits, opening/availability times, mode routing | f425, f426, f427, f428, f429, f431, f433, f435, f436, f437, f438, f439, f440, f441, f444, f445, f446, f447, f448, f449, f450, f451, f452, f453, f454, f455, f456 | `ts-rules` |
| `src/ts/main/booking/run-controls.ts` | Run controls: cancel/stop, browser window handling, live-form edits, sign-in waiting, session-drop and duplicate-login detection, AI hand-off, print control | f2046, f2047, f2049, f2055, f2057, f2059, f2079, f2081, f2083, f2087, f2094, f2128 (re-exported by `controls.cjs`) | `ts-run-controls` |
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
| `src/ts/main/runtime/runtime-support.ts` | Lexical contexts, constants, literals, class definition and runtime intrinsics shared by the interpreter and the compiled runtime | engine / compiled-runtime support | `ts-runtime-support` + full suite + compiler differential |
| `src/ts/main/runtime/offline-smoke.ts` | Offline smoke harness: blocks network, child processes and visible windows | `index.cjs` smoke wiring | `ts-offline-smoke` |
| `src/ts/main/runtime/smoke-run.ts` | The `--smoke-test` run: per-window DOM/screenshot report, optional offline diagnostics, `smoke-result.json`, exit code | extracted from `index.cjs` | `ts-smoke-run` (31 scenarios) |
| `src/ts/main/runtime/startup-support.ts` | Startup diagnostics log with secret redaction, error details, `.jsc` guard, ESM import bridge | extracted from `index.cjs` | `ts-startup-support` |
| `src/ts/main/runtime/development-windows.ts` | Development profile selection and window diagnostics | extracted from `index.cjs` | `ts-development-windows` |
| `src/ts/main/runtime/invoke-observer.ts` | `onInvoke` observer: activity events, action trace, live-test diagnostics | extracted from `index.cjs` | `ts-invoke-observer` |
| `src/ts/main/runtime/compiled-runtime.ts` | Compiled-bundle runtime (function creation, hooks, native factories) | the default runtime | `ts-compiled-runtime` + full suite + differential |
| `src/ts/main/runtime/engine.ts` | The archived instruction interpreter (fallback runtime) | `--interpreter-runtime` | full suite (recovered-vs-native oracles) + compiler differential (it is the oracle) |
| `src/ts/main/runtime/updates.ts` | Verified update download and Updates IPC | — | `ts-misc + updates.test` |
| `src/ts/main/runtime/window-readiness.ts` | Windows stay hidden until the renderer is ready | — | `ts-runtime` |
| `src/ts/main/storage/forms-vault.ts` | Saved-forms vault (`forms.vault`): read/decrypt, list, save, delete, duplicate, reorder, label migration, timing normalisation, atomic write; form summary projection | f865, f869, f871, f873, f875, f876, f879, f881, f882, f884, f885, f886, f888, f889, f890, f891, f893, f895, f896 | `forms-vault-reconstruction` (234 scenarios vs the recovered methods) |
| `src/ts/main/storage/record-vault.ts` | Encrypted record vaults for saved logins (`users.vault`), proxies and payment methods, plus the readers/writers of the history vault | f900, f902, f903, f906, f908–f913 (logins); f916, f918, f920, f921, f924, f926–f931 (proxies); f934, f936, f938, f939, f942, f944–f949 (payments); f964–f967 (history) | `record-vault-reconstruction` (331 scenarios), `history-vault-reconstruction` |
| `src/ts/main/storage/history-vault.ts` | Booking-history vault: newest-first listing, add with retention pruning, import, delete, clear | f952, f954, f955, f957, f959, f961 | `history-vault-reconstruction` (103 scenarios) |
| `src/ts/main/windows/window-ipc.ts` | Window-management IPC handlers: controller toolbar actions, update download/cancel, form and booking windows, window sizing, external links, ticket PDF, quit/restart | f4273–f4275, f4277–f4282, f4284–f4288, f4291–f4295 | `window-ipc-reconstruction` (186 scenarios) |
| `src/ts/main/ipc/browser-ipc.ts` | Browser detection, vendor download page, Brahmos Browser install with throttled progress | f3817, f3818, f3819, f3825 | `browser-logs-ipc-reconstruction` (119 scenarios) |
| `src/ts/main/ipc/logs-ipc.ts` | Diagnostic-log buffers and verified export, success-ticket store | f3831, f3832, f3861, f3862, f3863 | `browser-logs-ipc-reconstruction` |
| `src/ts/main/ipc/data-ipc.ts` | Saved-data IPC: forms (with armed copies), history, saved logins, payment methods, proxies, vault lock state and recovery | f3936, f3938, f3940, f3941, f3943–f3947, f3959–f3963, f3965, f3966, f3972–f3974, f3976–f3980, f3982, f3984, f3985 | `data-ipc-reconstruction` (95 scenarios) |
| `src/ts/main/ipc/settings-ipc.ts` | Application settings IPC: auto update, window pin (applied to the controller and booking-box windows), AI switch, QR popup, theme flag | f4013–f4021 | `settings-ipc-reconstruction` (65 scenarios) |
| `src/ts/main/ipc/transfer-ipc.ts` | Import and export of saved logins and proxies: save/open dialogs, per-file parsing, pasted text with private-host rejection | f3967, f3969, f3970, f3971, f3986, f3989, f3991, f3993 | `transfer-ipc-reconstruction` (113 scenarios) |

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
* **`booking/controls.cjs` (remaining part)** — the ordinary run controls were extracted to `run-controls.ts`. Still JavaScript and unchanged: `controlProxyContext` and `routeGatewayThroughFormProxy` (proxy routing with `cookieF5` cookie filtering), `highLoadDelay` (retry delay used by the high-load gating) and `dumpAuthState`/`collectAuthState` (debug dump that logs token prefixes).
* **Booking controllers** `booking/browser-booking.cjs` (f2161–f2169), `ui-booking.cjs` (f2102–f2115),
  `railone-booking.cjs`/`railone-submit.cjs`/`railone-payment.cjs` (f3149–f3175): consume anti-bot sensor tokens and
  call captcha-solver hooks. **f3132** (the RailOne request method, never reconstructed) selects TLS client profiles,
  attaches sensor tokens and applies alternate-egress logic. **f2064** (`safeCall`) and **f2551** (`fetchReply`:
  remote gate replies, device blocks, high-load lists) were not read in detail.
* **Licensing / activation:** `runtime/activation.cjs`, `runtime/id-check.cjs`, `runtime/development.cjs`,
  `runtime/development-policy.cjs` (stubs the vendor licence IPC), `runtime/legacy-services.cjs`, `services/control-plane/*`
  (licensing server), `DEVELOPMENT-CHECKS.md` overrides (f2539/f2549, f3370, f3383, f2595 … f2835). Not touched.
* **Core runtime kept as JavaScript on purpose:** `reconstructed-payment.cjs` (the factory table), `offline-smoke.cjs`, `src/main/index.cjs`
  (Electron entry: the activation gate, engine boot and the live-test hooks stay inline; its smoke run, startup log,
  development windows and invoke observer were extracted to TypeScript) and `src/main/generated`, `src/main/compiled`.

## Remaining generated/interpreted business logic

Almost all of it: `docs/reconstruction-inventory/` lists 3869 of 4354 recovered functions as `recovered_other` and the
mechanisms above are not reconstructed in TypeScript. Migrated modules cover only the functions mapped in the table.

## Uncertain behaviour

* Names in the new modules come from recovered-function comments and usage; the original names are unknown.
* `syncServerTime` assumes an `api` client exists whenever sync is enabled (a missing one throws), as the recovered code does.
* The merged loop in `bank-response.ts` serves both recovered chains (`bankResponse`, `paytmBankResponse`); the
  differential test proves the same traces, but the structure differs from the recovered code.

## Windows verification

Windows verification of `aabf9cd` is recorded in `docs/typescript-windows-verification.md` (merged from
`origin/verify/typescript-windows`, commit 527e47d): 2241/2241 tests in both modes, default and interpreter smoke,
both launchers in smoke mode, an independently installed installer payload's smoke, packaging executed. Normal visual UI,
interactive launcher startup and live provider flows were not verified. Later commits (this section's batches) have **not**
been re-verified on Windows yet.

## Commands actually run and results

Environment: Linux cloud container, Node 22.22, TypeScript 5.9.3 (local devDependency).

| Command | Result |
| --- | --- |
| baseline on `main` (aa0a6b5): `node --test test/*.test.cjs` | 2165 tests, 2162 pass, 3 fail (known Windows-path tests) |
| `npm run check:ts` / `npm run build:ts` | clean |
| clean clone, `npm install --no-package-lock`, `npm run build:ts`, `node scripts/ensure-ts-build.cjs`, `node --test test/ts-*.test.cjs` | built; build current; passed |
| `node --test test/*.test.cjs` (head after the Windows-verification merge and the run-controls / runtime-support batch) | 2256 tests, 2253 pass, the same 3 fail (they pass on Windows per the verification doc), 0 cancelled |
| `MATRIX_COMPILED=1 node --test test/*.test.cjs` (same head) | 2256 tests, 2253 pass, the same 3 fail, 0 cancelled |
| `node tools/compiler/differential-parallel.cjs --seeds 24` | 4354 checked, only f1556 seed 23 differs (the known baseline) |
| `node scripts/run.cjs` with `build/` removed | builds `build/ts` before looking for Electron (binary absent here) |
| `npm ci --ignore-scripts` with the merged lockfile | 0 vulnerabilities; `check:ts`/`build:ts` clean |
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

## Independent verification of the interpreter and runtime support

The earlier engine test compared the migrated interpreter with the migrated compiled runtime, which is not an independent
reference. Now:

* `test/fixtures/legacy/engine.legacy.cjs`, `compiled-runtime.legacy.cjs` and `runtime-support.legacy.cjs` are the preserved
  original JavaScript. They require only each other (a test checks that no migrated code is loaded).
* `tools/compiler/engine-parity.cjs` executes **all 4354 recovered functions** through original-vs-migrated interpreter and
  original-vs-migrated compiled runtime in identical seeded synthetic worlds (`tools/compiler/world.cjs`) and compares return
  values, thrown errors and the full interaction log. Result on this branch: 17416 executions, 0 confirmed divergences.
  Some recovered functions overwrite real built-ins (for example `Reflect.apply`) inside a long-running process; the tool
  restores the intrinsics after each run and re-checks every candidate mismatch alone in a fresh process, so only
  divergences that persist in isolation count (45 candidates appeared, none persisted). Fault injection (a changed `Sub`,
  `StaContextSlot`, handler choice or async rejection mode) is detected.
* `test/ts-engine-independent.test.cjs` runs hand-assembled programs (loops, branches, arithmetic, strings, context slots
  including the opcodes no recovered function uses, exceptions with nested handlers and `recoveredFrames`, hole/super checks,
  `new.target`/`this`, closures, `for-in`, switch tables, rest parameters, opcode errors, the step limit and dynamic import with
  and without a loader) against the original and the migrated engine, a guard test that the programs compute the expected
  values, and a 60+ function opcode-covering subset of the real functions through the parity tool.

Run it with `node tools/compiler/engine-parity.cjs --mode both --seeds 2` (about two minutes).

## Windows verification of later commits

`1b0cdaf` follow-up: main tsconfig accidentally included the browser sources,
causing TS2451 (`module` redeclaration). Fixed by limiting the main include
to src/ts/main/**/*.ts. After this fix, both builds/type checks, all 2347
tests in both modes, both launcher smoke checks and synthetic booking-panel
checks pass on Windows. Screenshots for Form, Logs, Tools, Updates and the
Booking box were visually spot-checked. See the Windows verification doc.

Follow-up Windows verification of `e734c2d` (including `1c0887a`) now passes
2306/2306 tests in both modes and both offline launcher smoke checks.
See `docs/typescript-windows-verification.md` for exact scope and the
independent engine-oracle coverage limitation. Statements below about
unverified Windows commits describe the earlier cloud session.

`c9ae78e` (merged) verified `c859a0b`: 2256/2256 tests in both modes, `start.cmd --smoke-test --interpreter-runtime` and
`Matrix.cmd --smoke-test` each complete with eight windows. Normal visual UI, live provider flows and a rebuilt
installer were not verified. **The commits after that (offline-smoke, smoke-run, startup-support, development-windows,
invoke-observer and the `index.cjs` edits) have not been run on Windows.** `index.cjs` changed, so rerun at least both
smoke commands and the launchers there.

## Minified code inventory

No source maps (`.map` files or `sourceMappingURL` comments) exist in the repository. `src/preload/index.js`, `src/preload/matrix.js`
and the Vite renderer bundles in `src/renderer/assets` (28 renderer bundles and the 2 preload files) are string-array
obfuscated rather than merely minified, and they include the licensing and protection screens. They are **not** reconstructed:
no readable source exists to recover and the protection logic is outside this migration. They are unchanged and are only
documented here. The nine ordinary `src/renderer/matrix-*.js` scripts were plain source and are migrated below.

## Renderer scripts (browser-target build)

`src/ts/renderer/*.ts` is compiled by `tsconfig.renderer.json` (`npm run build:renderer`, type-check only: `npm run check:renderer`)
into classic scripts in `src/renderer/matrix-*.js`, the paths the HTML `<script defer src>` tags (CSP `script-src 'self'`)
already load. The output is committed, like the Vite assets, so the HTML and packaging are unchanged. Scripts:
`matrix-portals`, `matrix-services`, `matrix-book-now`, `matrix-booking-timer`, `matrix-availability`, `matrix-payments`
(also `require`d by the main process, so the CommonJS branch is kept), `matrix-updates`, `matrix-logs`, `matrix-brand`.
Page globals and preload bridges are typed in `src/ts/renderer/globals.d.ts`.

Verification (`test/renderer-dom.test.cjs`, 12 tests): the preserved originals (`test/fixtures/legacy/renderer/*.legacy.js`) and the
compiled output run in identical jsdom documents (the real HTML pages with scripts removed) with fake bridges and fake
timers; DOM serialization, title and every bridge call must match. Covered: portals clicks, service status (online/local/failure),
booking-box book-now/timer/brand, availability, payments catalog (window global and CommonJS), update flows (4 statuses x
2 settings results, install, progress), log rendering/filtering/clear/download, and brand over every page that loads it. A
staleness test rebuilds into a temp dir and requires the committed files to be identical. Mutation checks on the services,
brand and logs scripts were each caught. A bug found by the existing tests: the timer must read `matrixBookingTiming` as a bare
global, not `window.`.

Windows visual checks still to do: open Tools (portal buttons, service status line), Booking box (book-now chip, general
timer, payment label, login mode), Form (availability button), Updates, Logs (filter, download, clear) and any page for
rebranded text/logo.

## Batch: storage vaults and window IPC (Windows, local session)

Four modules (`forms-vault`, `record-vault`, `history-vault`, `window-ipc`) reconstruct the methods of five recovered classes and
19 window IPC handlers. They replace the recovered bodies one function at a time through the existing factory table; the
classes, their constructors, the channel registration (f4272) and the nested closures that the replaced bodies used to
create stay as recovered or disappear with their parent. Each was compared with the **actual recovered execution** on
identical synthetic worlds (in-memory file system, reversible fake cipher, fake windows and screens, traced bootstrap
helpers), checking results, thrown error names, the full effect trace in order and the resulting state, and with selective
mutations of the compiled TypeScript (negated conditions, off-by-one limits, sort direction, `==` for `===`, dropped
cleanup and the like). Mutants that the first draft of the tests missed led to more scenarios (distinct updatedAt values,
single-record vaults, mixed-type ids, an untracked-window case).

Helper functions the recovered code reads from the bootstrap (cipher, form normaliser, timing and label helpers, window
helpers, retention settings) are injected and read at call time. Their original names are unknown, so `window-ipc.ts` names
them from their use and records the recovered slot beside each. The locked-vault error texts are the recovered ones.

Behaviour preserved on purpose: the history `deleteAll` reads an unreadable vault as empty and overwrites it (the other
writers refuse); the saved-logins vault has no `get`; `get` returns `undefined` on the record vaults and `null` on the forms
vault; `list` sorts the array `readAll` returned, in place, on the record and history vaults.

Not migrated from the same area, with reasons: `f4296`/`f4297` (app-lock PIN check: it writes bootstrap slots, which the
factory API cannot do yet, and wipes local data after failed attempts), `f4177` (security-block, bypass and evidence IPC:
a protection mechanism), `f3790` (login, licence and RailOne pairing IPC: licensing and the excluded RailOne controllers),
`f968`–`f999` (request-signing headers and the TLS web-gateway fetch: the excluded gateway layer).

Tooling changes: `tools/export_payment_fixture.py` gained `--range LO-HI` (repeatable), `--merge` (keep every existing entry
and add only missing functions) and `--output`, and passes ids over stdin; the committed fixture was extended with the
lookups of f860–f1300, f3700–f3800 and f4150–f4353 from the local string table only. `tools/compiler/engine-parity.cjs`
treats the two non-function call wordings (`Reflect.apply is not a function` versus V8's `Function.prototype.apply was called
on …`) as equal, as the compiler differential already did. Before that the opcode-covering parity test failed intermittently,
also on the untouched baseline fa54973 (1 of 3 runs), because f1 seed 2 reaches a clobbered `Reflect.apply`.

## Batch: f3790 ordinary handlers (browser, logs, tickets, saved data)

`f3790` registers about 120 IPC handlers. They were separated by what they do, not by name, and only the ordinary ones were
reconstructed (module table above; `browser-logs-ipc-reconstruction` and `data-ipc-reconstruction` compare each with the
recovered handler, 392 scenarios across the four IPC test files, plus mutation checks):

* migrated: DetectBrowsers, OpenBrowserDownload, DownloadBrahmos, GetBrowserDownloads (f3817, f3818, f3819, f3825); GetLogs,
  GetLogPairs, ExportLogs (f3831, f3832, f3863); OpenSuccessTicket, GetSuccessTicket (f3861, f3862); the saved-data handlers
  for forms, history, logins, payments and proxies, vault lock state and recovery (27 functions); the settings handlers GetAutoUpdate,
  SetAutoUpdate, GetWindowPin, SetWindowPin, GetAiEnabled, SetAiEnabled, GetQrPopup, GetNewTheme and SetQrPopup (f4013-f4021); and the
  login and proxy import/export handlers (ExportUsers, ImportUsers, ImportUserFile, ImportUsersData, ExportProxies, ImportProxies,
  ImportProxyPaste, ImportProxyFile: f3967, f3969, f3970, f3971, f3986, f3989, f3991, f3993).
* left untouched on purpose: licence, account and login handlers (Login, CheckUserIdInUse, SetBoxAccount, GetBoxLicenseInfo,
  ValidateLicenseKey, ActivateLicense, CheckIdStatus, GetVersionGate, CheckUsageWindow); RailOne pairing and run handlers; captcha,
  OTP and Aadhaar registration handlers (SubmitCaptcha, SubmitAadhaarOtp, ResendAadhaarOtp, RegisterAadhaar, SubmitConfirm and the
  rest); the sensor-token handler (GetSensorInfo); DownloadChromeAdvance (f3822, installs a fingerprint-spoofing Chromium and records
  its path); the GoLogin key and profile handlers.
* not yet examined or deliberately left: the forms export/import handlers (ExportForm, ImportForms, ImportFormsData, ExportFormModel,
  ImportFormFile: f3949-f3953), train and station search and CheckAvailability (provider calls), backup, restore and rollback;
  SetAiKey (f4022, stores an API key), the app-lock PIN handlers, the version-gate and update-status handlers (f3956, f3958) and
  GetTiming (f3954).

`writeBinding` was added to the factory API of both runtimes (`engine.ts`, `compiled-runtime.ts`): a native replacement can now
store into the lexical slots of the recovered scope it replaces (DownloadBrahmos sets and clears an in-progress flag; the app-lock
PIN handler f4296 could use it; DownloadBrahmos is the first user). `write-binding.test.cjs` covers both runtimes. The legacy fixtures are unchanged because they
never receive factories.

`SetQrPopup` (f4021) is replaced here and still wrapped by the qr-delivery interceptor; `native-interceptor-compose.test.cjs` shows in
both runtimes that the interceptor receives the native implementation as `original` and its result unchanged. The inventory credits the
replacing module.

The engine parity wording rule is now `tools/compiler/failure-wording.cjs`: exactly `Reflect.apply is not a function` and V8's
`Function.prototype.apply was called on <value>, which is a|an <type> and not a function` (anchored, one line, TypeError only) are
treated as equal; `engine-parity-wording.test.cjs` proves other TypeErrors, other error types, extra text, returned values and
differing logs or names still fail.

`docs/reconstruction-inventory/TYPESCRIPT.md`, `typescript-modules.csv` and `typescript-functions.csv` (generated by
`tools/typescript_inventory.cjs`, checked for staleness by `typescript-inventory.test.cjs`) separate the following, because module
counts hide it: TypeScript business logic that replaces recovered functions (225 functions, 6.80% of the original instructions),
JavaScript-native replacements that are not TypeScript (46 functions, 5.98%), TypeScript interceptors that wrap functions which
still run as recovered code (12, 1.49%), reviewed recovered support (250, 1.37%) and recovered-only functions (3821, 84.37%).
The nine typed runtime-infrastructure modules and the nine renderer scripts replace no business function.

### Reconstruction tooling (scaffold and mutation check)

* `node tools/scaffold_reconstruction.cjs <name> f1234 [f1235 ...] [--children]` writes `diagnostics/scaffold/<name>/`: a dossier with the
  readable compiled body of every function (decoder strings and constants resolved), a table of the bootstrap slots they read and write
  with the hole-check names, paste-ready dependency accessors, the three-line `.cjs` entry and a test skeleton. It first extends the
  string fixture for the id range (additions only). It does the mechanical part only: understanding the function, naming, typing and
  deciding what is excluded stay manual.
* `node tools/mutation_check.cjs build/ts/<module>.js test/<file>.test.cjs [--max N] [--lines A-B]` mutates the compiled TypeScript one small
  change at a time (comparison and logical operators, boundaries, boolean literals, `??`, increments, negated `if`), runs the test file,
  restores the module and lists the mutants the tests did not notice. It refuses anything outside `build/ts` and an already failing module.
  First runs on the IPC modules: settings 21/21 and data 40/40 killed; transfer, browser and logs left a handful of survivors, of which
  the real ones (a login text with no login, a proxy export without a path, a progress total of exactly one) were closed with new scenarios and
  the rest are equivalent (`window ?? undefined` versus `window || undefined`, an unobservable local). `mutation-check.test.cjs` covers the tool.

### Next candidates after this batch (not started)

* The not-yet-examined parts of `f3790` listed above, starting with the import/export handlers and the settings getters and setters.
* `f4296`/`f4297` (app-lock PIN): needs its `writeBinding` now exists (it clears a pending resolver slot and sets a relaunch flag); decide whether the wipe-after-failures part belongs in this migration.
* Unread: `f2064` (safeCall) and `f2551` (fetchReply: remote gate replies, device blocks, high-load lists), the train list
  cluster (`trains.json` f3513–f3524, `searchTrains` f2025/f2026/f2386) and the window helpers behind window-ipc's injected
  functions (slots 1929/1930, 2060–2070, 2105–2131), which would let the injected names become real modules.
* Process: extend the string fixture for a range with `tools/export_payment_fixture.py --range LO-HI --merge`, read the compiled
  body of a recovered function with the compiled bundle plus the fixture (the bundle's bodies are structured JavaScript), write the
  module in `src/ts`, add a three-line `.cjs` entry point, add factories in `reconstructed-payment.cjs`, pin with
  `tools/pin_recovered_contract.cjs`, then compare with the recovered execution using `test/helpers/recovered-harness.cjs`.

## Continuation checkpoint

Done in the latest batches: `compiled-runtime.ts` and `engine.ts` (both keep a real `import()` in their `.cjs` entry points; a bug caught on the way: `require('../compiled/…')` inside TypeScript resolves from `build/ts`, so such paths must be written from the project root), `offline-smoke.ts`, and four helpers extracted from `src/main/index.cjs`
(`smoke-run.ts`, `startup-support.ts`, `development-windows.ts`, `invoke-observer.ts`). The `import()` calls stay in
`index.cjs` (`globalThis.__esmImport`) because TypeScript's CommonJS output would turn them into `require()`.

Not migrated, with reasons:
* `src/main/index.cjs` remainder: the activation gate (`requireActivation`), the engine boot (`bootRecovered`), the `startMatrix`
  sequencing and the live-test/brand-check/ui-diagnostic hooks. The activation gate is licensing; the rest is wiring that
  only a full Windows run can exercise.
* `src/preload/index.js`, `src/preload/matrix.js` and the Vite bundles in `src/renderer/assets`: inventoried (see "Minified code
  inventory"); left untouched.
* `src/renderer/activation.js` (licensing UI) and `src/renderer/matrix-build.js` (generated by `tools/build_installer.py`).
* `src/main/generated`, `src/main/compiled` (generated), `reconstructed-payment.cjs` (factory table), `runtime/legacy-services.cjs` (retired reporting stays
  disabled), `development.cjs`, `development-policy.cjs`, `activation.cjs`, `id-check.cjs`, `services/control-plane`
  (licensing).
* Everything in "Excluded or blocked" above.

Possible next steps:
1. Decide on the excluded list; that gates the largest remaining pieces of business logic.
2. Windows visual check of the compiled renderer scripts (list in "Renderer scripts").
3. `reconstructed-payment.cjs` (the factory table) once the modules it routes to are all decided.
Do not remove the legacy fixtures, the interpreter fallback or `src/main/generated` while any of this is open.

## Local AI key persistence batch

Reconstructed f3570, f3571 and f4022 in storage/ai-key-store.ts. Saving trims
the key, removes obsolete fields and uses Electron safeStorage when available;
the existing plaintext fallback is preserved when OS encryption is unavailable.
Reading gives the environment key priority, decrypts stored ciphertext, returns
an empty key on decryption failure, and migrates a legacy plaintext key through
the original setter. The IPC handler preserves synchronous save/error handling.
There are no provider calls or changes to licensing or access control.

The independent recovered-function comparisons cover storage mutation and call
order, encryption availability, missing/empty keys, environment precedence,
legacy migration, and read/encrypt/decrypt/write failures. Invalid non-string
inputs compare TypeError directly; IPC error forwarding uses scripted errors
because JS and the interpreter generate different non-callable-method messages.
The general harness and error normalization rules were not broadened.

Related tests and inventory: 122/122 default; settings and key tests: 119/119
with MATRIX_COMPILED=1. Mutation check: 8/8 killed, no survivors. Main TypeScript
check passes. No live account, saved profile or provider flow was used.

Full default suite after integration: 5190 passed, 0 failed (npm test).

## Offline local catalog batch

Reconstructed f3495-f3497 in storage/local-catalog.ts. JSON load failures return
exactly the caller's fallback. Station suggestions retain exact-code, code-prefix,
name-prefix and substring groups in source order, then truncate to 12; train
suggestions stop after 12 matches. Empty queries avoid accessing the catalog.
These functions make no network requests. Remote train-name lookup f3498 and
RailOne token/profile persistence remain recovered.

Validation: 74/74 focused tests against recovered execution; compiled mode plus
inventory 77/77; main type check clean; 10/10 mutation candidates killed.
Tests include late exact-code priority, 11/12/13 boundaries, iterator cleanup,
getter ordering and JSON/read/path failures. Broad suite is reserved for the
next material integration checkpoint.

## One-time settings migration batch

Reconstructed f3543/f3544 (existing auto-update default and per-form availability
timing migrations) and f3551 (settings path) in settings-store.ts. Existing
completion markers, failure tolerance, write-before-log order and original
form-vault calls are unchanged. No remote configuration or service waits change.

Validation: related settings suites 249/249 default, compiled plus inventory
252/252; final focused migration tests 51/51. Seven mutation candidates inside
the migrated functions were killed. An initial wider mutation range also
included three old accessor/window-pin candidates outside this test file's
scope; narrowing to the changed functions left no survivors. Runtime-generated
error wording normalization was not changed.

## Lazy vault access batch

Reconstructed f3499/f3500 and f3575/f3578/f3582/f3583 in vault-access.ts:
ordinary forms and saved-record vault construction, cache reuse, current-identity
callback and initial form-label migration. Existing injected constructors and
key-loader calls are unchanged. Constructor/key failure leaves the cache empty;
form migration or logging failure leaves the already-created instance cached,
as in the recovered code.

Validation: 97/97 focused tests, compiled mode plus inventory 100/100; three
mutation candidates killed. These are synthetic local tests; they neither open
real profiles nor contact services.
