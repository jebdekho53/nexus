# Phase 22 — booking rules and the verified bytecode-to-JavaScript compiler

Offline only. No live service, stored credential, booking, payment, deployment or release was involved.

## Booking helpers (native, oracle-compared against the recovered engine)

`src/main/booking/` now holds `controls.cjs`, `server-time.cjs`, `time-helpers.cjs`, `provider-page.cjs` and `rules.cjs`
(proxy, amounts, availability windows, premium-train and berth rules, login modes). Each was compared with the actual
recovered execution using the shared harness `test/helpers/recovered-harness.cjs`. Contract pins: 355.

Reading aids added: `tools/root_slot_map.cjs`, `tools/name_recovered_functions.py`, `tools/show_readable_reference.cjs`,
`tools/pin_recovered_contract.cjs`. Regex literals with braces lost their flags in the lifter; fixed in
`tools/build_source_ir.py` and the generated modules.

## Compiler (`tools/compiler/`)

Hand reconstruction cannot cover 4354 definitions, so recovered bytecode is compiled to ordinary JavaScript:
CFG (`cfg.cjs`) -> lowering (`lower.cjs`) -> structured control flow (`structure.cjs`, dominator-tree/Ramsey with
try-region collapsing and async rewrite) -> printer (`print.cjs`). `build.cjs` writes `src/main/compiled/`:
`part-NN.cjs` bodies, `index.cjs`, `meta.cjs` (kind, language, name, length, constant pool per function) and
`unsupported.txt` (empty).

Verification:

- `tools/compiler/differential.cjs --seeds 24`: all 4354 definitions run in identical seeded synthetic worlds against the
  interpreter, comparing return values, errors and the full interaction log. 4354 checked, 1 differing seed
  (`f1556` seed 23, an interpreter-only `recoveredFrames` artifact).
- Full suite (1686 tests) passes both normally and with `MATRIX_COMPILED=1`.
- Offline smoke passes with compiled bodies and with `--compiled-runtime`: 8 complete windows, no native bytecode.

## Runtime split

`src/main/runtime/runtime-support.cjs` holds the helpers shared by both runtimes (contexts, constant pool, literals,
class definition, intrinsics). `engine.cjs` is the instruction interpreter. `compiled-runtime.cjs` has the same API,
supports function factories, overrides, interceptors and `onInvoke`, and never loads `src/main/generated/`.
`src/main/index.cjs --compiled-runtime` selects it (opt-in; the interpreter stays the default). Native replacements and
privacy-omitting diagnostics are unchanged. The archived definitions are kept.

## Next

1. Make `--compiled-runtime` the default after a longer offline soak; keep the interpreter as a migration switch.
2. Readability passes over `src/main/compiled`: temporary inlining, naming from `function-names.csv`, context-array slots
   promoted to lexical variables, f1 bootstrap split into modules.
3. Remove the interpreter dependency from packaging only after the above is verified.
