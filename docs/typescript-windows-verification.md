# TypeScript migration: Windows verification

## Follow-up: 1b0cdaf (independent engine checks and renderer)

Verified 17 October 2026 on Windows, Node 24.21.0, after the config fix
described below. Includes 122fc20 and 1b0cdaf.

Found a real build regression before verification: tsconfig.json included
all src/ts sources, including the new browser renderer scripts. Its Node
types conflict with the renderer's ambient module declaration (TS2451).
Limited the main config to src/ts/main/**/*.ts; the renderer remains under
tsconfig.renderer.json. No application behavior or renderer output changed.

- `npm ci --ignore-scripts`: passed.
- Both TypeScript type checks and both builds: passed after the config fix.
- Default full suite: 2347 tests, all passed; zero cancelled/skipped.
- MATRIX_COMPILED=1 full suite: 2347 tests, all passed; zero cancelled/skipped.
- `start.cmd --smoke-test --interpreter-runtime`: smoke-complete, eight
  windows (PID 11472).
- `Matrix.cmd --smoke-test`: smoke-complete, eight windows (PID 8496).
- Visually inspected Electron smoke screenshots for Form, Logs, Tools and
  Updates: page text, headers and controls render readably with Matrix branding.
  Network-unavailable messages are expected in offline smoke.
- `node scripts/run.cjs --smoke-test --smoke-panel --smoke-duration=25000`:
  smoke-complete (PID 25784). Synthetic account/payment loaded; mode,
  payment and timer visible; payment/mode options readable; calendar
  selection passed. Booking-box screenshot visually inspected and readable.
  No booking start or payment submission was invoked. The synthetic form
  is deleted by the harness afterward.

These are screenshot spot checks, not complete interactive UI validation.
No live provider flow or rebuilt installer was verified for this head.
The full engine-parity CLI sweep was reported by cloud, not rerun locally;
the independent engine unit tests are included in the passing full suite.

## Follow-up: e734c2d (62 modules)

Verified 17 October 2026 on Windows, Node 24.21.0, in the independent QA
worktree. Includes 1c0887a (offline-smoke and index helpers) and e734c2d
(compiled runtime and interpreter).

- `npm ci --ignore-scripts`, `npm run check:ts`, `npm run build:ts`: passed.
- Default full suite: 2306 tests, all passed; zero cancelled/skipped.
- `MATRIX_COMPILED=1` full suite: 2306 tests, all passed; zero cancelled/skipped.
- `start.cmd --smoke-test --interpreter-runtime`: smoke-complete, eight
  windows (PID 27872).
- `Matrix.cmd --smoke-test`: smoke-complete, eight windows (PID 28716).
- The sequential launcher check exited 0. Both used the offline harness.

No new installer build, normal visual UI, or live provider flows were
verified for this head. These tests do not establish full migration.

Review limitation: the new engine default-path/parity test constructs a
function but does not invoke it. The compiler differential compares two
current implementations; after migrating both, it is not an independent
pre-migration behavior oracle. Keep the original JS engine/support fixtures
and add actual old-vs-new interpreter execution checks across synthetic
opcode and control-flow cases. This is a coverage limitation, not an
observed runtime regression.

## Follow-up: c859a0b (55 modules)

Verified on Windows on 17 October 2026 using the same independent QA
worktree and Node 24.21.0. This includes the new run-controls and shared
runtime-support migration.

- `npm ci --ignore-scripts`, `npm run check:ts`, `npm run build:ts`: passed.
- Default full suite: 2256 tests, 2256 pass, zero failures/cancellations/skips.
- `MATRIX_COMPILED=1` full suite: 2256 tests, 2256 pass, zero failures/cancellations/skips.
- `cmd /c start.cmd --smoke-test --interpreter-runtime`: smoke-complete,
  eight windows (PID 5188).
- `cmd /c Matrix.cmd --smoke-test`: smoke-complete, eight windows
  (PID 23420). The sequential launcher command finished with exit 0.
- Both launcher checks used the existing offline smoke harness. Its blocked
  update-network request is expected, not evidence of a live provider failure.

No normal visual UI, live provider flow, or rebuilt installer verification
was performed for this follow-up commit. Installer/package results below
apply to aabf9cd. Compiler differential for c859a0b was reported by the cloud
session, not rerun here.

Continue migration from c859a0b with this Windows baseline. The full
application migration remains incomplete.

## Initial batch: aabf9cd

Verified 17 October 2026 on Windows, Node 24.21.0, against migration
commit `aabf9cd`. Verification used an independent worktree; the running
original application and its profiles were not replaced.

## Results

- `npm install --ignore-scripts`, followed by local TypeScript check/build: passed.
- Added package-lock.json; `npm ci --ignore-scripts` and type check: passed.
- `node --test test/*.test.cjs`: 2241 passed, zero failures/cancellations/skips.
- `MATRIX_COMPILED=1 node --test test/*.test.cjs`: 2241 passed, zero failures/cancellations/skips.
- `node scripts/run.cjs --smoke-test`: exit 0, smoke-complete, eight windows.
- `cmd /c start.cmd --smoke-test --interpreter-runtime`: exit 0, smoke-complete, eight windows.
- `cmd /c Matrix.cmd --smoke-test`: exit 0, smoke-complete, eight windows.
- `python tools/build_installer.py <separate-output-directory>`: built 8836-file installer.
- Installer `/S /nolaunch /noshortcuts /target=<separate-QA-directory>`: exit 0.
- Installed copy's `Matrix.cmd --smoke-test`: exit 0, smoke-complete, eight windows;
  no root node_modules/compiler installed in that copy.
- Installer ZIP inventory: all 53 compiled TypeScript modules and the build
  check script present; root node_modules absent.
- `python tools/package_project.py <separate-output.zip>`: 8989 files,
  ZIP integrity check passed, 257809764 bytes. SHA-256:
  `e5cd9b6f88580600a9a85c4e68317c683fd573b06c65f1cf83d418d14b27ba0f`.
  This artifact preceded the final verification documentation additions.

The three Linux baseline failures all pass on Windows. No live booking,
payment, captcha service, or provider transaction was tested. Smoke checks
suppress window display; these results do not establish visual correctness
or successful live provider flows. Normal interactive launcher startup was
not separately tested.

## Small integration changes

`tools/package_project.py` now accepts an optional output ZIP path, allowing
QA packaging without overwriting a pre-existing release ZIP. The default
output remains unchanged. The lockfile makes dependency installation
reproducible.

## Cloud continuation

Use the next prompt in `docs/claude-typescript-continuation.txt`. Continue
the migration branch and existing draft PR, preserving this Windows evidence.
Do not treat the full application migration as complete.

## Local Windows session: storage vaults and window IPC (code at 61f6b4d)

Run on 17 October 2026 on Windows with the bundled Node 24, in the isolated worktree, offline and with synthetic data only.
These results are for code commit `61f6b4d`; documentation commits after it do not change tested code.

- `tsc` check and build for the main and renderer configurations: clean. The committed renderer output was unchanged afterwards
  (`git status` clean).
- `node --test test/*.test.cjs`: 3201 passed, 0 failed, 0 cancelled.
- `MATRIX_COMPILED=1 node --test test/*.test.cjs`: 3201 passed, 0 failed, 0 cancelled.
- `cmd /c .\start.cmd --smoke-test --interpreter-runtime`: exit 0, eight DOM-ready windows, `nativeBytecodeLoaded=false`, startup
  log `compiledRuntime:false`.
- `cmd /c .\Matrix.cmd --smoke-test`: exit 0, eight windows, `compiledRuntime:true`.
- `node scripts/run.cjs --smoke-test --smoke-panel --smoke-duration=25000`: exit 0, eight windows.
- `node scripts/run.cjs --development --smoke-test --reconstructed-payment` (compiled) and again with `--interpreter-runtime`:
  exit 0, eight windows each; 235 reconstructed functions enabled, including the new vault and window IPC handlers.
  Every smoke result file was deleted before its run and its timestamp checked afterwards.

Flaky test found and addressed: `ts-engine-independent` (opcode-covering parity) failed intermittently on the untouched baseline
fa54973 (1 of 3 runs) and once in each mode here, always at f1 seed 2, on the wording of one TypeError. With the wording
normalised in `tools/compiler/engine-parity.cjs` it passed six consecutive runs. The compiler differential
(`tools/compiler/differential*.cjs`) was not rerun for this batch: no compiler or engine code changed.

Not done: no installer or ZIP was rebuilt; no screenshot spot check was made (no renderer source changed); nothing live
(booking, payment, provider, licence server) was exercised. The vault and IPC reconstructions are verified against the
recovered code in synthetic worlds only; their real encryption helper, real windows and real file system were not exercised
beyond the offline smoke start-up.
