# Claude window lane (`parallel/claude-windows`)

Offline-only reconstruction of ordinary Electron window and UI helpers as readable strict TypeScript, done in parallel with
Codex (who owns storage, settings/backup persistence, build hardening, packaging and integration). Starting checkpoint `b4e64b5`.
No live bookings, payments or provider requests were made; licensing, access-control, version-gate and security-check functions
were left as recovered code.

## Reconstructed functions

| Module | Functions | Tests |
| --- | --- | --- |
| `src/ts/main/windows/window-helpers.ts` (`src/main/windows/window-helpers.cjs`) | f3738, f3739, f4136, f4254, f4261, f4262 | `test/window-helpers-reconstruction.test.cjs` (70) |
| `src/ts/main/windows/window-layout.ts` (`.cjs`) | f4091, f4092, f4093, f4097, f4098, f4116, f4117, f4118, f4119, f4127 | `test/window-layout-reconstruction.test.cjs` (117) |
| `src/ts/main/windows/window-factory.ts` (`.cjs`) | f4099, f4105, f4112, f4128, f4132 (controller, splash, quit confirmation, form, open-form); f4147 (utility window); f4157 (delayed restart); f4255 (update window) | `test/window-factory-reconstruction.test.cjs` (168) |

Each replacement is a factory in `src/main/runtime/reconstructed-payment.cjs`; bootstrap slots are read lazily through
`readBinding`/`writeBinding` so captured scopes, hole (uninitialised binding) errors, return values and side-effect order match the
recovered code. Every test compares the replacement with the recovered function using independent fake Electron objects and
deterministic synthetic state and asserts concrete outputs. Targeted mutation checks (`tools/mutation_check.cjs`) were run on
each module; the only surviving mutant is equivalent (`refresh` false to true on an already destroyed window in window-layout).

## Excluded (left as recovered code)

- Licensing/lease: f4085–f4090. Pair limit decision windows: f4137, f4138, f4141. Version-blocked window f4151, config-error f4154.
- Security-check family f4161, f4164, f4234, f4235, f4263; device-blocked f4236; app lock f4107–f4111.
- Updater download/install and version comparison: f4244–f4271 (except the plain window f4255), f4268.
- The passcode window stays recovered. Each test file ends with a factory-presence test asserting this.

## Shared-file edits (for Codex to integrate)

- `src/main/runtime/reconstructed-payment.cjs`: requires for the three modules, `windowHelper*`, `windowLayout*`, `windowFactory*`
  dependency/factory helpers, and three spreads after `...windowIpcFactories(dependencies)`.
- `src/main/payment/recovered-contract.json`: pins for all the ids above (`tools/pin_recovered_contract.cjs`).
- `test/fixtures/payment-strings.json`: added entries only (`tools/export_payment_fixture.py --merge`).
- `docs/typescript-migration.md` module table (three rows) and the generated
  `docs/reconstruction-inventory/TYPESCRIPT.md`, `typescript-modules.csv`, `typescript-functions.csv`
  (`node tools/typescript_inventory.cjs`).
- `tools/scaffold_reconstruction.cjs`: now detects bootstrap slots read directly as `ctx[N]` by root functions.
- Runtime support (earlier in the lane): `writeBinding` in both the interpreter and the compiled runtime.

## Known limits

- Calling-a-non-function error text differs between interpreter, compiled bundle and V8; `tools/compiler/failure-wording.cjs`
  accepts only the documented forms.
- Offline smoke runs use an isolated profile; the packaged installer was not rebuilt in this lane.

## Remaining work

Most adjacent ordinary window creators are done. Remaining BrowserWindow users are the excluded groups above; any further
candidate needs a fresh review of bodies and callers before reconstruction.
