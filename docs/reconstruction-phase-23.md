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

Not switched yet in this commit: `--compiled-runtime` is still opt-in. The switch happens only after the boundary
comparison (section 4) is complete.

## 4. Boundary comparison results

Pending: the interpreter and unsplit runs were still executing when this draft was committed. The compiled run finished
(400 callbacks, 797 invocations, 4 runaway handlers aborted: `app:detect-browsers`, `app:get-browser-downloads`,
`app:run-speed-test`, `app:get-gologin-status`).
