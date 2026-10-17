# Parallel local work

Shared starting checkpoint: b4e64b5. Use separate worktrees; previous
uncoordinated edits in one checkout must not be repeated.

## Codex lane

Worktree: `matrix-ts-verify`, branch `verify/typescript-windows`.
Owns storage/import logic, build/startup hardening, integration, packaging
and scheduled QR-test setup. Current batch checks required TypeScript
outputs individually (main and renderer) and adds a read-only QR-plan
preflight. Credentials and passenger data live outside Git in the user's
private directory. No live provider test was executed in this batch.

## Claude lane

Worktree: sibling `matrix-claude-windows`, branch `parallel/claude-windows`.
Owns ordinary window/UI helper reconstruction and focused comparison tests.
The self-contained handoff is in `../MATRIX-CLAUDE-LOCAL-PROMPT.txt`.
Dependencies, TypeScript output, bundled Electron and native vendor modules
were prepared in that checkout. Do not edit the Codex worktree.

Initial candidates: f3738, f3739, f4136, f4254, f4261, f4262. Review actual
behavior first; keep licensing, protection and version-gate decisions
unchanged. Continue eligible neighboring lifecycle code after a verified batch.

Each lane commits on its own branch. Claude pushes only its lane branch and
reports hashes; Codex reviews/integrates into the existing migration PR.
Shared factory/contract/inventory edits are reconciled during integration,
never by force-pushing or resetting either checkout. Do not merge main.

## Scheduled QR tests

Three local daily heartbeat automations prepare at 07:55, 09:55 and 10:55
IST. Actual login/preparation and AUTO countdown must be observed; booking
openings remain 08:00, 10:00 and 11:00. Record these as distinct timestamps.
General uses the app's 8AM opening mode (provider quota GN), not GN Book now.
The private plan determines the authorized route, dates, account and passenger.

`node tools/qr_test_plan.cjs --plan PRIVATE_JSON --slot HH:MM --day YYYY-MM-DD`
resolves dates and prints a redacted preflight. It does not decrypt credentials,
launch the app, contact a provider, or demonstrate live booking success.
The actual app must still be operated and checked by the scheduled run.
Stop for human captcha/OTP; stop at a real rendered QR; never submit payment.
Do not count warm-up QR or diagnostic stage messages as the requested journey's
rendered QR. Stop completed slots and pause the schedules when all requested
tests are verified or the user stops them.
