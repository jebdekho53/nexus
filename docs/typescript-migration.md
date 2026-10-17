# TypeScript migration

Status: **in progress, first batch**. Only the modules listed under "Verified migrated modules" are TypeScript
reconstructions. Everything else (the generated definitions in `src/main/generated`, the compiled bundle, the
interpreter, and the earlier hand-written `.cjs` modules) is unchanged. No completion percentage is claimed.

## Architecture and build decisions

* TypeScript sources live in `src/ts/**` and compile with `tsc` (`tsconfig.json`: strict, ES2022, CommonJS, no
  `any`-escape hatches, no `ts-nocheck`) into `build/ts/**`. `build/` is git-ignored; sources and output stay separate.
* The runtime stays CommonJS. A migrated module's original path keeps a three-line `.cjs` entry point that calls
  `loadTs('main/…')` (`src/main/runtime/ts-build.cjs`), so every existing `require()` site, the factory table in
  `src/main/runtime/reconstructed-payment.cjs`, the compiled bundle and the interpreter keep working unchanged.
* A missing build gives an actionable error (`Run npm install and npm run build:ts`). `scripts/run.cjs` (used by
  `start.cmd`/`npm start`) builds automatically when `build/ts` is missing or older than `src/ts` and TypeScript is installed.
* `typescript` is the only new dependency (devDependency, `^5.9.3`). No `@types/node` yet: the migrated modules use no
  Node APIs. Add it when the first Node-API module is migrated.
* Scripts: `npm run build:ts`, `npm run check:ts` (type-check, no emit), `npm test` (builds first, then runs the suite).
* The previous JavaScript of each migrated module is kept in `test/fixtures/legacy/*.legacy.cjs` and used **only** by
  the differential tests (`test/ts-*.test.cjs`). Delete a fixture only together with its test.
* Packaging: not verified. Any packaging step must include `build/ts` (or run `npm run build:ts`) because the entry
  points load it at run time. No packaging script exists in this repository, so this could not be checked.

## Verified migrated modules (real reconstructions, not wrappers)

| TypeScript | Entry point (unchanged path) | Recovered functions | Differential test |
| --- | --- | --- | --- |
| `src/ts/main/booking/time-helpers.ts` | `src/main/booking/time-helpers.cjs` | f2271, f2367–f2370, f2373, f2375–f2381, f2383, f2385 (+ f432 via `parseClockTime`) | `test/ts-time-helpers.test.cjs` |
| `src/ts/main/booking/server-time.ts` | `src/main/booking/server-time.cjs` | f2272, f2274, f2276/f2277, f2278/f2279 | `test/ts-server-time.test.cjs` |
| `src/ts/main/booking/rules.ts` | `src/main/booking/rules.cjs` | f425–f431, f433, f435–f441, f444–f456/f457 | `test/ts-rules.test.cjs` |

Verification per module: the legacy JavaScript and the TypeScript build run on the same inputs (including missing,
null, empty, zero, NaN and wrong-type values) and results, thrown error types, mutated state, log order, API call order
and lazy dependency reads are compared. Each test file was mutation-checked by changing the TypeScript source
(boundaries, operators, defaults, `??` vs `||`) and confirming the tests fail; the one surviving mutant is equivalent
(`lowered && …` in `isPremiumTrain`). The existing reconstruction tests that exercise the recovered functions through the
factory table still pass against the TypeScript output.

Where the types are looser than the domain: dependency callbacks that read bootstrap slots return `unknown` where the
recovered code does not reveal the shape (for example the clock-time parser in `openingTimes`).

## Typed adapters that still delegate to recovered logic

None yet. The factory table (`reconstructed-payment.cjs`) is still JavaScript and now routes `f2271…f2385`, `f2272…f2278`
and `f425…f457` to the TypeScript modules through the `.cjs` entry points.

## Remaining generated/interpreted business logic

Almost all of it. `docs/reconstruction-inventory/` lists 3949 of 4354 recovered functions as `recovered_other`, and the
earlier `.cjs` modules in `src/main/payment`, `src/main/booking` and `src/main/runtime` have not been converted yet.

## Controllers and mechanisms flagged for separate review (not changed in this batch)

These were deliberately **not** migrated or modified. They need an explicit decision before anyone reconstructs them:

* **f3132 `call` (+ callbacks f3133–f3136)** — the RailOne request method. Besides plain HTTP it selects TLS client
  profiles (`d.ja3Profiles` → `tlsProfile`), obtains and attaches anti-bot "sensor" tokens (`d.tokenSource`,
  `nextSensor`, `isSensorExhausted`), applies header variants (`buildHeaders`/`headerVariant`), and has quarantine /
  alternate-egress logic (`securityQuarantined`, `judgeAltEgress`, `railY510`). Needs review of whether these mechanisms
  are acceptable to carry forward.
* **f3149–f3175 (`railone-*.cjs`, already reconstructed in phase 26)** — consume the sensor-token exhaustion checks above
  and call captcha-solver hooks (`captchaSolve`, `captchaManual`) and an Aadhaar OTP solver. The reconstruction only
  mirrors the recovered control flow against scripted stubs; the mechanisms themselves belong to the review above.
* **f2161–f2169 (`browser-booking.cjs`) and f2102–f2115 (`ui-booking.cjs`)** — same review for their captcha-solver
  and fingerprint-related branches (for example the "solver blocked this fingerprint → kill the pair" path).
* **f2064 `safeCall` and f2551 `fetchReply`** — high-load gating and a remotely supplied configuration/feature-gate
  reply (signature and device-block checks, `heatmap_high_load_*`, `maxpair`, login-mode lists). Not read in detail.
* **`src/main/runtime/development.cjs` / `DEVELOPMENT-CHECKS.md`** — local overrides of publisher licence/version gates
  (f2539/f2549, f3370, f3383) and inspections (f2595 … f2835), plus the disabled f2877 shutdown and f2009 reporting. Not
  modified in this batch; the migration neither relies on nor extends them. Whether they should remain is a product /
  licensing decision outside this migration.

## Uncertain behaviour and blockers

* Names in the new modules come from the recovered function comments and usage; the original developer's names are unknown.
* `syncServerTime` assumes an `api` client exists whenever server-time sync is enabled, exactly as the recovered code
  does (a missing client throws); the TypeScript keeps this with one documented non-null assertion.
* Windows startup, the Electron offline smoke test (`.runtime/electron.exe`), native dependencies and packaging cannot be
  run in this Linux cloud environment and were **not** verified.

## Commands actually run and results

Environment: Linux cloud container, Node 22.22, TypeScript 5.9.3 (local devDependency).

| Command | Result |
| --- | --- |
| baseline, `main` at aa0a6b5: `node --test test/*.test.cjs` | 2165 tests, 2162 pass, 3 fail (known Windows-path tests: "Matrix development/release keeps live handlers and restarts in its original mode", "only requested windows show after renderer readiness") |
| `npm run check:ts` | no errors |
| `npm run build:ts` | emits `build/ts/main/booking/{time-helpers,server-time,rules}.js` |
| `node --test test/*.test.cjs` on this branch | 2193 tests, 2190 pass, the same 3 fail (28 new tests, no regressions) |
| `MATRIX_COMPILED=1 node --test test/*.test.cjs` on this branch | 2193 tests, 2190 pass, the same 3 fail |
| `node scripts/run.cjs` with `build/` removed | builds `build/ts` automatically before looking for Electron (the Electron binary itself is unavailable) |
| mutation check of the three TypeScript sources | all non-equivalent mutants killed after adding the cases noted above |

Not run: the compiler differential (`tools/compiler/differential-parallel.cjs`; the compiled bundle was not changed),
the Electron offline smoke test, Windows startup, native-dependency loading and packaging (unavailable here).

## Exact next migration batch

1. Convert the remaining pure helpers in `src/main/runtime` (`window-readiness`, `ticket-docking`, `book-now`,
   `payment-timing`, `activity-log`, `qr-delivery`) and the small payment modules (`payment-error`, `pnr-lifecycle`,
   `print-ticket`, `session-context`, `qr-response`), each with a legacy fixture and a differential test, installing
   `@types/node` where Node APIs appear.
2. Then `booking/controls.cjs` and `booking/provider-page.cjs`, after reviewing them for the mechanisms listed above.
3. Resolve the flagged-controller review before touching f3132 and the captcha/token-related branches.
