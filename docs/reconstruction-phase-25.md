> Note: this report describes work on the branch `local-codex-phase25`. Its compiler changes were NOT carried into main when cloud phase 23 was merged (main uses the cloud compiler: tools/compiler/optimize.cjs and split.cjs). Re-apply only if still wanted.

# Phase 25 — compiled-bundle readability: collapsing register copy chains

Offline only. No live service, stored credential, booking, payment, deployment or release was involved.

## Readability pass: inline temporaries (second slice — copy chains)

Phase 24 collapsed the single-hop case `rN=acc; <next line reads rN once>` into a direct read of `acc`, but
explicitly deferred two harder cases: chains of copies, and copies whose one use crosses a block boundary. This
phase closes the first of those two — copy chains within a single basic block — leaving the cross-block case
(which needs real liveness analysis) for later, as before.

### What changed

`inlineStarCopies` in `tools/compiler/compile.cjs` previously matched only `rN=acc;`. It now matches
`rN=acc;` **or** `rN=rM;` (any register source, not just the accumulator) via `/^r(\d+)=(acc|r\d+);$/`, and
substitutes whichever source text was captured in place of the hardcoded `'acc'`. This is the same safety
argument as phase 24 — nothing executes between two adjacent lines of one basic block, so the source (accumulator
or another register) still holds the exact value that was copied into `rN` — just applied to a copy-of-register
line instead of only a copy-of-accumulator line.

That change alone only collapses one hop of a chain per scan, because the scan walks each block's original line
list once: given `rN=acc; rM=rN; <use rM>`, the `rN=acc;` step turns `rM=rN;` into `rM=acc;` in the output, but
`rM`'s own def+use pair isn't re-examined as a *new* candidate until a later pass sees that rewritten line fresh.
So `inlineStarCopies` now re-runs the single scan (`inlineStarCopiesOnce`) to a fixpoint — repeating until a full
pass makes no further change — which finishes arbitrarily long same-block copy chains, one hop per round, with no
change to the single-hop safety argument: each round is still only ever substituting a value-identical adjacent
read.

The eligibility gate is unchanged: a register is only touched when its *total* token count across the whole
function is exactly 2 (the copy plus the one read), so anything live elsewhere in the function is left alone, and
the one read must be in the immediately next line of the same block and must not itself be a reassignment of the
same register.

### Result

Rebuilding `src/main/compiled` with `tools/compiler/build.cjs`:

- 4354/4354 definitions still compile (0 unsupported — unchanged).
- Net change across the bundle: -202 lines (chains of register copies collapsing to a single final read, on top
  of what phase 24 already removed).
- The transform is still register-substitution-only: no opcode handling, control-flow recovery or printer logic
  changed.

### Re-verification

- `node tools/compiler/differential.cjs --seeds 4`: `{"checked":4354,"compiled":4354,"unsupported":0,"failing":0}`
  — compiled output matches the recovered interpreter on every definition, synthetic world, 4 seeds.
- Full suite: 1686/1686 passing, both without and with `MATRIX_COMPILED=1`.
- Offline smoke with `--compiled-runtime --reconstructed-payment --development`: 8/8 windows
  `document.readyState==="complete"`, `diagnostics/startup.jsonl` recorded `definitions-loaded` with
  `functions:4354, compiledRuntime:true` (no archived instruction definitions loaded) and `smoke-complete` with
  `windows:8` for that run's PID, process exited cleanly (confirmed no leftover `electron.exe`).

No other source changed; `src/main/compiled` is the only generated output touched, rebuilt entirely from
`tools/compiler`.

## Next

Unchanged from phase 24, narrowed further by this phase's slice:

1. Longer offline soak of `--compiled-runtime`, then make it the default (interpreter stays as a migration switch).
2. Remaining readability work: copies whose single use is in a different block right across an unconditional
   jump (needs real liveness across block boundaries, deliberately deferred again here), promoting context-array
   slots to lexical variables, and splitting the `f1` bootstrap into modules.
3. Remove the interpreter dependency from packaging only after the above is verified.
