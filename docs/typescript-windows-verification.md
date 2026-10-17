# TypeScript migration: Windows verification

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
