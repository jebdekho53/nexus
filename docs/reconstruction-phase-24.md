# Phase 24 — compiled-bundle readability: dropping pure accumulator-copy registers

Offline only. No live service, stored credential, booking, payment, deployment or release was involved.

## Readability pass: inline temporaries (first slice)

Phase 22/23 listed "inline temporaries" as open readability work for `src/main/compiled`, alongside promoting
context-array slots to lexical variables and splitting the `f1` bootstrap. This phase does the narrowest, safest
cut of the first item.

`tools/compiler/compile.cjs` lowers each basic block's rows once into a flat list of JS statement strings (one
list per block). A very common shape in that list is a register whose only job is to shadow the accumulator for
exactly one statement:

```
rN=acc;
<next statement reads rN once>
```

Because nothing executes between those two statements (they are adjacent lines of the same straight-line basic
block — the whole point of a basic block), `acc` still holds the exact value that was copied into `rN`. Replacing
the one read of `rN` with `acc` and dropping the copy is a value-identical substitution, not a reordering: it
swaps one side-effect-free variable read for another, at the same textual position, so every other sub-expression
in the consuming statement still evaluates in the same order as before. No computation moves across any boundary.

`inlineStarCopies` in `tools/compiler/compile.cjs` implements this narrowly and conservatively:

- It only ever looks at `rN=acc;` lines — the literal output of `Star`/`Star<N>` opcodes — never at a register
  copy derived from any other expression. A line like `rN=someExpression();` is never a candidate, so no
  side-effecting expression is ever relocated.
- Eligibility is gated on the register's **total** token count across the *whole function* (every block's lines
  joined) being exactly 2: the copy itself, plus the one read. Any other write or read anywhere else in the
  function — including inside a string/constant literal that happens to contain the substring `rN`, which the
  token count treats as a spurious extra occurrence — pushes the count above 2 and the register is left alone.
  The gate can only make the pass *more* conservative than it needs to be; it can never misfire into inlining a
  register that is still live elsewhere.
- The one remaining occurrence must be in the *immediately next* line of the *same block's* line list (adjacency
  within one basic block is true program-order adjacency — nothing can branch in between), and it must not itself
  be the start of a new assignment to the same register (which would make it a dead store, not a read — left
  untouched rather than guessed at).
- When eligible, the next line's single occurrence of `rN` is textually replaced with `acc` and the copy line is
  dropped; otherwise both lines are emitted unchanged.

This runs once per compiled definition, over the already-lowered-but-not-yet-structured per-block line lists,
before `structure.cjs` assembles them into the nested if/loop/try tree — so it has no interaction with control-flow
recovery at all.

## Result

Rebuilding `src/main/compiled` with `tools/compiler/build.cjs`:

- 4354/4354 definitions still compile (0 unsupported — unchanged from phase 22/23).
- 6592 pure `rN=acc;` copy statements were eliminated across the bundle; net change is -2543 lines (fewer
  declared registers per function in addition to the dropped copy lines).
- The transform is comment-and-register-only: no opcode handling, control-flow recovery or printer logic changed.

## Re-verification

- Full suite: 1686/1686 passing, both without and with `MATRIX_COMPILED=1`.
- `node tools/compiler/differential.cjs --seeds 4`: `{"checked":4354,"compiled":4354,"unsupported":0,"failing":0}`.
- Offline smoke with `--compiled-runtime`: 8/8 windows `document.readyState==="complete"`,
  `nativeBytecodeLoaded:false`, clean process exit (`diagnostics/smoke-result.json`).

No other source changed; `src/main/compiled` is the only generated output touched, rebuilt entirely from
`tools/compiler`.

## Next

Unchanged from phase 22/23, narrowed by this phase's slice:

1. Longer offline soak of `--compiled-runtime`, then make it the default (interpreter stays as a migration switch).
2. Remaining readability work: the harder half of "inline temporaries" (chains of copies, and copies whose single
   use is in a different block right across an unconditional jump — needs real liveness across block boundaries,
   not just within one block, so deliberately deferred here), promoting context-array slots to lexical variables,
   and splitting the `f1` bootstrap into modules.
3. Remove the interpreter dependency from packaging only after the above is verified.
