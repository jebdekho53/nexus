# Phase 26 — booking controllers f2102, f2161 and f3149 as ordinary modules

Offline only. No live service, stored credential, booking, payment, deployment or release was involved. Waits,
privacy-omitting diagnostics, the disabled HTTP-record callback and the retired f2009 reporting are unchanged.

| Controller | Recovered functions | Module | Oracle test (scenarios) |
| --- | --- | --- | --- |
| runUiBooking | f2102–f2115 | `src/main/booking/ui-booking.cjs` | `test/ui-booking-reconstruction.test.cjs` (75) |
| runBrowserBooking | f2161–f2169 | `src/main/booking/browser-booking.cjs` | `test/browser-booking-reconstruction.test.cjs` (169) |
| runInner (RailOne) | f3149–f3175 | `src/main/booking/railone-booking.cjs`, `railone-submit.cjs`, `railone-payment.cjs` | `test/railone-booking-reconstruction.test.cjs` (233) |

Each is wired through `functionFactories` in `src/main/runtime/reconstructed-payment.cjs` (entries `f2102`, `f2161`,
`f3149`) and pinned in `src/main/payment/recovered-contract.json` (now 405 pins).

## Method

Every oracle test runs the actual recovered function (interpreter engine) and the native factory against the same
scripted actor, scripted bootstrap helpers (root slots) and hosted-order client, and deep-compares the result and the
complete effect trace including order and receivers. Mutation checks: browser-booking (hand-written mutants, only a
meaningless one survives) and railone (every single-line `if(...)` negated in the three modules: 75 mutants, 1
survivor — the re-poll amount carry-over in the boarding re-drive loop, which the later `/Y` amount always overrides,
so it is not observable).

## RailOne notes

* f3149 is split in three modules: read leg (validate/search/availability/boarding re-drive, f3149 + f3151), submit
  leg (pre-/Y wait, /Y, waitlist, Aadhaar, captcha, fare limit; `railone-submit.cjs`) and payment (wallet, UPI collect,
  QR; `railone-payment.cjs`).
* Helper names in the modules are inferred from how the flow uses bootstrap slots; the slot numbers are listed in the
  module headers/wiring.
* `tools/export_decoder_fixture.cjs` adds decoded string lookups for given functions (`--descendants`) to
  `test/fixtures/payment-strings.json`, using the recovered decoder (bootstrap root slot 5) run offline in the stub
  bootstrap. This was used for f3149 (+754 lookups). It shows the decoder is extractable offline, so string-decoder
  folding may not need an external string table after all; it was NOT attempted here.

## Verification

Full suite default and `MATRIX_COMPILED=1` (same 3 Windows-path failures on Linux as the baseline), and
`node tools/compiler/differential-parallel.cjs --seeds 24` (only f1556 seed 23 differs).

## Next action

1. Run the Electron offline smoke test locally on Windows (`.runtime/electron.exe . --development --smoke-test`, then
   with `--interpreter-runtime`); it cannot run in the cloud. Also run the 3 Windows-path tests there.
2. Continue the controller migration with the remaining large unreconstructed controllers listed in
   `docs/reconstruction-inventory/` (largest non-native definitions first), same oracle-test pattern.
3. Optionally evaluate string-decoder folding using the offline decoder extraction described above.
