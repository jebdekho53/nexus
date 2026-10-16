# Continue Matrix source reconstruction

Workspace: C:/Users/gurpr/OneDrive/Documents/ts/nexus

The latest human request is to continue converting recovered Matrix logic into ordinary editable JavaScript. Continue from the current checkout; do not restart or replace working modules with placeholders. Read TASK-STATE.json and docs/reconstruction-progress.md first. Check git status/log for the latest verified commit.

Current checkpoint: phases1–18,71 native entries,191 pinned recovered definitions,1038 application tests passed. See docs/reconstruction-phase-16.md and the numbered phase reports for details. The Provider-QR chain now executes native initialization, gateway dispatch, redirect/form parsing, browser hint/origin/header helpers, QR generation/status polling, encdata extraction, settlement/bank response, PNR polling/normalization, ticket detail capture and finalization/cleanup against synthetic transports. Low-level HTTP/browser effects, request routing, other gateway implementations and the broader app remain recovered.

Context arming/setters/sleep are now complete. Request routing f1652 and closures are complete. TLS transport/facade f1633/f1634–f1648 is complete. HTTP recorder f1649/f1650/f1651 is also complete. PayTM redirect f1684/f1685/f1686 and its root775 parser f1599/f1600 are complete. PayTM QR request f1687/f1688 and response parsers f1601/f1605/f1606/f1607 are also complete. Next inspect remaining PayTM page/status/watch transports beginning f1689, then other provider/session implementations. Metadata and decoded listings can be inspected with tools/review_recovered_function.cjs. The source of truth is generated/index.cjs plus runtime/engine.cjs. Approximate readable-reference can have wrong branches. tools/export_payment_fixture.py exports static program strings from the local original string table; do not read user profiles to make fixtures.

Native modules are in src/main/payment/. runtime/reconstructed-payment.cjs installs them only in an unmanaged developer checkout with --reconstructed-payment. Default/release stays on the recovered path. Public1.0.11 is unchanged. Do not build, publish or claim that installed users have this candidate. Do not delete generated definitions while remaining callers or tests need them.

Meaningful tests must compare actual recovered functions and native functions using synthetic browser/HTTP/session data. Include stop/error paths, request order/payloads, timer bounds and independent actors. All real credentials, account/profile/passenger data, cookies and tokens stay out of diagnostics/fixtures. Booking-data logging intentionally omits raw response/transaction IDs; provider-QR missing-ID logs intentionally omit raw auth HTML; PayTM redirect diagnostics omit raw action URL and HTML. The snip helper is still evaluated for compatible side effects/errors, but its return is discarded. Preserve these documented privacy differences.

Preserve provider-required waits, authentication/CAPTCHA/access controls/rate limits, own-server release activation, pair ownership and private-browser behavior. runtime/legacy-services.cjs disables retired vendor reporting via f2009 in both release and development; do not restore vendor destinations or telemetry. BankResponse sends encrypted form once, then continues bodiless and honors full interstitial delay. Provider polling retains its bounded short-sleep behavior.

No live service verification is authorized for this continuation checkpoint. A prior automated authenticated launch was rejected by automatic approval review; do not route around it. Use offline synthetic tests and isolated source smoke only. Real QR speed and the historical38–42second payment gap remain unverified.

Bundled Node: C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
Run it with --test test/*.test.cjs. Offline smoke: .runtime/electron.exe . --development --smoke-test --reconstructed-payment, hidden window, isolated smoke profile. Verify the new PID reaches smoke-complete; do not mistake stale result files for completion.

Keep TASK-STATE.json and the progress report accurate at verified checkpoints. Write UTF-8 files with LF on Windows. Do not spawn subagents without direct user/AGENTS authorization. Human authorized continued work beyond weekly5%; latest weekly4%, primary14%. Check both windows at meaningful checkpoints and finalize handoff near exhaustion. Schedule is an existing general fallback, first16Oct18:42IST then every5h30m; it stays quiet when idle/unchanged and must not duplicate an active main turn.

Contract pins now include execution metadata and handlers. Use runtime/recovered-contract.cjs definitionFingerprint for reviewed additions; do not use the old partial hash formula. Full smoke71 factories(PID25436) passed.

Phase16 adds39 comparisons:14 HTML/parser cases,4 helper/error cases,1 dynamic binding case,19 redirect retry/failure cases and1 explicit privacy/bounds check. No live PayTM QR success is established. Fixture adds static f1599/f1600 lookups only. Run git status/log to locate the saved checkpoint.

Phase17: PayTM QR request/response parsing is native;63 new checks include actual recovered/native parser cases, request/error/fallback order, privacy and synthetic orchestration→redirect→QR chain. See docs/reconstruction-phase-17.md.

Phase18: PayTM origin page f1704, browser fetch f1708, disposal f1710 and status polling f1689 are native. See docs/reconstruction-phase-18.md. Next remaining PayTM WebSocket f1693 and final-status/bank methods f1712/f1717.
