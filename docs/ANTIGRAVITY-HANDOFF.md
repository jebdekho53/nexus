# Continue Matrix source reconstruction

Workspace: C:/Users/gurpr/OneDrive/Documents/ts/nexus

The latest human request is to continue converting recovered Matrix logic into ordinary editable JavaScript. Continue from the current checkout; do not restart or replace working modules with placeholders. Read TASK-STATE.json and docs/reconstruction-progress.md first. Check git status/log for the latest verified commit.

Current checkpoint: phases1–12,57 native entries,142 pinned recovered definitions,741 application tests passed. See docs/reconstruction-phase-12.md and the numbered phase reports for details. The Provider-QR chain now executes native initialization, gateway dispatch, redirect/form parsing, browser hint/origin/header helpers, QR generation/status polling, encdata extraction, settlement/bank response, PNR polling/normalization, ticket detail capture and finalization/cleanup against synthetic transports. Low-level HTTP/browser effects, request routing, other gateway implementations and the broader app remain recovered.

Context arming/setters/sleep are now complete. Next implement request routing getter f1652 and closures f1653–f1658, then backing transport helpers f1633/f1649 and other provider implementations. Metadata and decoded listings can be inspected with tools/review_recovered_function.cjs. The source of truth is generated/index.cjs plus runtime/engine.cjs. Approximate readable-reference can have wrong branches. tools/export_payment_fixture.py exports static program strings from the local original string table; do not read user profiles to make fixtures.

Native modules are in src/main/payment/. runtime/reconstructed-payment.cjs installs them only in an unmanaged developer checkout with --reconstructed-payment. Default/release stays on the recovered path. Public1.0.11 is unchanged. Do not build, publish or claim that installed users have this candidate. Do not delete generated definitions while remaining callers or tests need them.

Meaningful tests must compare actual recovered functions and native functions using synthetic browser/HTTP/session data. Include stop/error paths, request order/payloads, timer bounds and independent actors. All real credentials, account/profile/passenger data, cookies and tokens stay out of diagnostics/fixtures. Booking-data logging intentionally omits raw response/transaction IDs; provider-QR missing-ID logs intentionally omit raw auth HTML. Preserve these documented privacy differences.

Preserve provider-required waits, authentication/CAPTCHA/access controls/rate limits, own-server release activation, pair ownership and private-browser behavior. runtime/legacy-services.cjs disables retired vendor reporting via f2009 in both release and development; do not restore vendor destinations or telemetry. BankResponse sends encrypted form once, then continues bodiless and honors full interstitial delay. Provider polling retains its bounded short-sleep behavior.

No live service verification is authorized for this continuation checkpoint. A prior automated authenticated launch was rejected by automatic approval review; do not route around it. Use offline synthetic tests and isolated source smoke only. Real QR speed and the historical38–42second payment gap remain unverified.

Bundled Node: C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe
Run it with --test test/*.test.cjs. Offline smoke: .runtime/electron.exe . --development --smoke-test --reconstructed-payment, hidden window, isolated smoke profile. Verify the new PID reaches smoke-complete; do not mistake stale result files for completion.

Keep TASK-STATE.json and the progress report accurate at verified checkpoints. Write UTF-8 files with LF on Windows. Do not spawn subagents without direct user/AGENTS authorization. Quota handoff target remains5% primary remaining; check at meaningful checkpoints. Schedule is an existing general fallback, first16Oct18:42IST then every5h30m; it stays quiet when idle/unchanged and must not duplicate an active main turn.

Contract pins now include execution metadata and handlers. Use runtime/recovered-contract.cjs definitionFingerprint for reviewed additions; do not use the old partial hash formula. Full smoke57 factories(PID25428) passed.
