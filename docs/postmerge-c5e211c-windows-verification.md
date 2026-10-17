# Post-merge Windows verification —17October2026

Verified the actual merged main source c5e211c. The working tree was clean before checks. Local main and jebdekho/main tracking ref both resolved to c5e211c; origin/main tracking ref resolved to60ec6ae. These are local ref observations, not a fresh remote query. No fetch/push or credential changes were performed.

## Full suite

| Environment | Tests | Passed | Failed |
| --- | ---: | ---: | ---: |
| MATRIX_COMPILED absent |1688|1688|0|
| MATRIX_COMPILED=1 |1688|1688|0|

Both runs used bundled Node with --test test/*.test.cjs. This includes the3 Windows-path checks that failed on Linux. Captured logs: diagnostics/postmerge-c5e211c-tests-default.log and diagnostics/postmerge-c5e211c-tests-compiled.log. Original process environment values were restored afterward.

## Fresh offline Electron smoke

| Mode | PID | DOM-ready windows | Runtime | Native bytecode | Exit |
| --- | ---: | ---: | --- | --- | ---: |
| Default |28084|8|compiled|false|0|
| --interpreter-runtime |20952|8|interpreter|false|0|

Launch arguments were project root, --development and --smoke-test, plus --interpreter-runtime for the second run. Tests completed before smoke began, and smoke modes ran sequentially with hidden windows. Previous smoke results were preserved. Each run required a result file written after launch, its own PID's definitions-loaded event selecting the expected runtime and4354 definitions, and its own smoke-complete event with8 windows. Both results have8 complete DOMs and nativeBytecodeLoaded=false. Proof and result copies are under diagnostics/postmerge-c5e211c-smoke-*.json; diagnostics are private and excluded from Git.

## Merge disposition and limits

Main uses the cloud phase23 compiler and generated bundle. Local phase24/25 optimization implementations are preserved in local-codex-phase25 at0dfd75f; their historical reports already state they were not carried into main. No reset, reapplication, merge or compiler regeneration occurred here.

This verifies offline source startup and existing suite behavior after the merge. It does not verify live accounts, providers, QR/payment, bookings, production packaging, performance, every callback input or full readability. Existing known failure-only non-function error wording differences remain documented in phase23. Public1.0.11 was not changed. The earlier recorded differential and callback-boundary checks were not rerun in this verification.

Next: native controller/readability work and a deliberate static string-folding evaluation using the local table. Keep interpreter fallback during further offline soak; do not remove it from packaging solely on these smoke runs. Source checkpoint is c5e211c; subsequent documentation commits do not change its tested runtime code.
