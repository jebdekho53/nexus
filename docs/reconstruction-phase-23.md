# Phase 23 — compiled-bundle naming comments and a second compiled-runtime soak

Offline only. No live service, stored credential, booking, payment, deployment or release was involved.

## Readability pass: naming (first slice)

Phase 22 listed three readability steps for `src/main/compiled`: naming from `function-names.csv`, promoting
context-array slots to lexical variables, and splitting the `f1` bootstrap. This phase does the first, narrowly:

- `tools/compiler/build.cjs` now parses `docs/reconstruction-inventory/function-names.csv` itself (its own small
  RFC4180-ish reader — quoted fields, `""` escapes, commas and multi-line prompt/string-literal hints inside quotes),
  and keeps only hints that are short (<=40 chars) and single-line, since many CSV rows hold incidental string
  constants near a function (HTTP headers, user-agents, LLM fallback-controller prompts) rather than a usable name.
  2882 of 4354 definitions have such a hint.
- `tools/compiler/compile.cjs` emits `// <id> <hint>` immediately above `exports.<id>=function(...)` when a hint is
  available, e.g. `// f1601 pushAppData`. Comment only — no identifier, register name or control flow changed.

This is intentionally the smallest, lowest-risk slice of the naming step: a grep/skim aid for 66% of definitions.
Renaming the actual `rN` registers from hints (the harder, riskier part of "naming") is still open — most hints are
property/method names near a function, not reliable semantic labels for its temporaries, and would need per-function
judgement rather than a mechanical pass.

## Re-verification

- Full suite: 1686/1686 passing, both without and with `MATRIX_COMPILED=1`.
- `node tools/compiler/differential.cjs --seeds 4`: `{"checked":4354,"compiled":4354,"unsupported":0,"failing":0}`.
- Offline smoke with `--compiled-runtime`: 8/8 windows `document.readyState==="complete"`,
  `nativeBytecodeLoaded:false`, clean exit (`diagnostics/smoke-result.json`).

No other source changed; this is an additive, comment-only rebuild of `src/main/compiled`.

## Next

Unchanged from phase 22:

1. Longer offline soak of `--compiled-runtime`, then make it the default (interpreter stays as a migration switch).
2. Remaining readability work: inline temporaries, promote context-array slots to lexical variables, split the `f1`
   bootstrap into modules.
3. Remove the interpreter dependency from packaging only after the above is verified.
