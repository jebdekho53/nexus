# Phase 23 — readability passes, class/boundary verification, compiled runtime as default

Offline only. No live service, stored credential, booking, payment, deployment or release was involved. The Electron
offline smoke test (`.runtime/electron.exe`) is not available in the cloud environment and **still has to be run locally
on Windows** (`--development --smoke-test`, then with `--interpreter-runtime` for the switch).

## 1. Readability passes over `src/main/compiled`

| Pass | What changed | Evidence |
| --- | --- | --- |
| Inline temporaries | `tools/compiler/optimize.cjs` folds single-use registers and accumulator values into nested expressions per basic block, using CFG liveness (exception edges included for registers), preserving evaluation order, and rewrites `rt.call(x.f,x,[...])` to `x.f(...)`. Compiled bundle: 592k -> 238k lines. | differential, 24 seeds: only f1556 seed 23 differs |
| Names | every compiled body has a header comment (id, original name, creation site, hint) and a function name from `docs/reconstruction-inventory/function-names.csv` (hints are creation-site property names, not proof) | same |
| Context slots | **no safe promotion exists.** `tools/compiler/context-survey.cjs`: 586 function-level contexts, all captured by closures the function creates; 191 catch and 197 block contexts. Closures are instantiated by id with their captured context (`makeFunction(id, ctx)`) and native replacements read slots through `readBinding(slot)`, so those contexts must stay arrays. Real lexical variables would need the closures nested inside their parents, which breaks id-keyed overrides/interceptors/factories. | survey output |
| f1 split | `tools/compiler/split.cjs` peels leading statement runs out of top-level blocks, hoists the trailing loop-exit continuation and writes 12 ordered parts to `src/main/compiled/bootstrap/` (shared variables travel in a frame object). The parts are mechanical size cuts, not purpose-named modules. | `bootstrap-check.cjs` |

Verification tooling: `differential-parallel.cjs` (sharded differential), `bootstrap-check.cjs`, `boundary-check.cjs`,
`check-support.cjs` (recording stub environment, sandboxed globals, virtual clock).

## 2. Class, derived-constructor and boundary verification (compiled runtime vs interpreter)

`bootstrap-check.cjs` runs the real `f0 -> f1` bootstrap in the interpreter, the compiled bundle (split f1) and an unsplit
compile against a recording stub environment and compares the interaction log (768 entries), the shapes of the 48 classes
it defines (prototype and static descriptors, parents) and instances constructed with synthetic arguments together with
their effects. Covered: `f1614` (payment gateway BaseConstructor) with its field initializer `f1616`, the derived
constructors `f325 f577 f578 f579 f2533`, and the other BaseConstructor classes. Math.random is seeded.

`boundary-check.cjs` collects every callback the application registers with the stubbed environment (IPC handlers,
Electron/window events, session and web-request hooks, timer continuations) and invokes each with two synthetic argument
sets under a virtual clock with sandboxed globals (no network, no process exit; Node modules are stubs). Provider waits
are unchanged; time is just virtual. Each runtime runs in a supervised child; a callback that stalls or exhausts memory
under stub input is recorded as `aborted` and the run continues. Results: see section 4.

## 3. Default runtime

`src/main/index.cjs` now runs the compiled bundle by default. `--interpreter-runtime` selects the archived instruction
interpreter (`src/main/generated` + `runtime/engine.cjs`) as a migration switch; `--compiled-runtime` is still accepted.
Nothing was removed: `src/main/generated`, `engine.cjs` and the contract pins stay. Native payment factories
(`--reconstructed-payment`, unmanaged developer mode only) still load the archived definitions to verify their contract
pins, so the "no instruction definitions loaded" property holds for the default launch without that flag.
The release packaging script includes `src/main/compiled` (it packs the whole tree).

## 4. Boundary comparison results (interpreter vs compiled vs unsplit compile)

`node tools/compiler/boundary-check.cjs` (about 25 minutes; the interpreter is slow). 779 callbacks registered by the
bootstrap, the first 400 invoked twice each: **797 invocations, 631 of them with effects on the stub environment**
(IPC handlers `ipcMain.handle` x300 invocations, `ipcMain.on`, window and `BrowserWindow.fromWebContents` events,
`setPermissionRequestHandler/CheckHandler`, `safeStorage.decryptString`, `screen`, `util.inherits`, zod preprocessors and
node-module callbacks such as the fs/path helpers). Outcomes and every recorded effect are identical in all three
runtimes. Four handlers exhaust time or memory under stub input in all three runtimes alike and were aborted by the
supervisor: `app:detect-browsers`, `app:get-browser-downloads`, `app:run-speed-test`, `app:get-gologin-status`.

Known, accepted difference: calling a non-function now fails with V8-style text (`r4[r0(...)] is not a function`) instead
of the interpreter's `Function.prototype.apply was called on ...` because compiled code uses direct calls. It can appear in
`{ok:false,error}` IPC replies, only for such failing calls; the checkers normalise exactly this wording.

What this does and does not show: it exercises the application's own IPC/session/cookie/window code with synthetic
arguments against recording stubs. It does not touch Electron, the filesystem, the network or any live service, the
callbacks after index 400 were not invoked, argument sets are two generic shapes, and results are only as faithful as the
stubs. It is evidence of interpreter/compiled equivalence, not of correct live behaviour.

## 5. Verification record

- `node tools/compiler/differential-parallel.cjs --seeds 24`: 4354 checked, only f1556 seed 23 differs (interpreter-only
  `recoveredFrames` artifact), unchanged.
- Full suite (`node --test test/*.test.cjs`, 1688 tests) with and without `MATRIX_COMPILED=1`: all pass except the same 3
  tests that hard-code Windows paths (`C:/project`) and fail on Linux independent of this work (`development-policy`
  x2, `window-readiness`). Re-run them on Windows.
- Inventory regenerated with `tools/classify_recovered_functions.cjs`: unchanged (no recovered definition was altered).
- **Not run here: the Electron offline smoke test.** Run locally on Windows:
  `.runtime/electron.exe . --development --smoke-test` (default compiled runtime) and once more with
  `--interpreter-runtime`; expect 8 DOM-ready windows and no native bytecode.

## Next action

1. Run the Windows smoke test above and the 3 Windows-path tests. If the default runtime misbehaves, launch with
   `--interpreter-runtime` and report the first divergent callback with `tools/compiler/boundary-check.cjs`.
2. Resume the reconstruction roadmap in `docs/FULL-RECONSTRUCTION-PROMPT.md`: replace remaining dynamic dispatch by
   migrating controllers (`f2161`, `f2102`, `f3149`) to ordinary modules, using the compiled output as the readable
   reference. Biggest readability win left: fold the string-decoder calls (`ctx[5](index,"key")`) at build time; this needs
   the local static string table (`../recovered-source/main-reconstruction/string-array.txt`), which is not in the repo.
3. Remove the interpreter from packaging only after the Windows smoke test and a soak with the compiled default.
