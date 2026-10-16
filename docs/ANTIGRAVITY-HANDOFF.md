# Antigravity continuation prompt

Continue the existing Matrix source reconstruction at:
`C:\Users\gurpr\OneDrive\Documents\ts\nexus`

Do not start over or replace working modules with placeholders. Read applicable AGENTS.md, TASK-STATE.json, docs/reconstruction-progress.md, docs/post-submit-timing-analysis.md and docs/release-1.0.11-qa.md first.

The goal is ordinary, readable JavaScript replacing recovered instruction execution gradually, with behavioural comparison tests. Twenty-five payment entries already have native replacements in src/main/payment/, integrated through runtime/reconstructed-payment.cjs and the engine's functionFactories seam. Provider QR, PayTM, PhonePe, Razorpay, PayTM result coordination, URL/payload construction, gateway selection and response errors have been reconstructed. The report lists exact function IDs and limits.

Reconstruction is developer-only and opt-in using --reconstructed-payment. Installed/public 1.0.11 contains earlier diagnostics and login-settle improvements, not this candidate. Preserve this separation, own-server release activation, profile data, independent pair ownership and existing retired-vendor restrictions. Do not change provider-required passenger waits or bypass authentication, CAPTCHA, access controls or rate limits.

Payment-init f2172 and gateway dispatch f2176 are now complete native candidates, corrected from the unverified Antigravity draft. Read docs/reconstruction-phase-2.md. They join the earlier modules behind the same development-only switch. Common settlement f2181, PNR lifecycle f2220/f2221 and booking-data polling f2226 are now reconstructed too. Booking-result normalization f549/f554, URL/retry helpers f547/f548, session context f2230–f2232 and cleanup wrapper f2243 are now complete too; read docs/reconstruction-phase-4.md. Next inspect finalization core f2233 and gateway transport helpers, reconstruct one complete module at a time and extend original-versus-native offline comparisons. Booking-data diagnostic logging has an explicit privacy-preserving difference documented in reconstruction-progress.md.

Use src/main/generated/index.cjs, recovery/listing-v6.txt and the execution engine as the oracle. recovery/readable-reference is approximate and can have incorrect control flow. test/fixtures/payment-strings.json is static decoded program data; tools/export_payment_fixture.py regenerates it using the local recovery-tools/strdecode.py and recovered-source/main-reconstruction/string-array.txt in the parent folder.

Bundled Node:
C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe

Run all application tests with that executable and --test test/*.test.cjs. Tests must compare observable request order/data, return values, errors, state mutations and cancellation against the actual recovered implementation using synthetic fixtures. Include independent-pair and retry/error coverage. Do not print profile/account secrets, tokens, cookies or passenger data.

No live login, booking/payment submission, QR generation, new build or deployment was performed for this candidate. Continue offline. A prior automated authenticated launch was rejected by automatic approval review; do not route around that rejection. Service timing validation must not be claimed from mocks or stage timestamps. The real 38–42 second payment-stage gap is still unverified.

Keep TASK-STATE.json and the reconstruction report current after each verified module. Report precisely which parts still use the recovered engine. Preserve a reversible original fallback and do not delete generated definitions while remaining callers or tests need them.

Latest checkpoint: 341 full application tests pass. The opt-in adapter checks src/main/payment/recovered-contract.json fingerprints before installing replacements. Do not regenerate these fingerprints merely to silence a mismatch; inspect and compare the changed semantics.

Phase4 checkpoint: 341 tests passed, eight offline smoke screens passed with all 25 factories (PID 10828). Use git log for the latest reconstruction commit. The prior handoff was prepared at 8% remaining; work resumed after the 16 October 13:41 IST reset. TASK-STATE.json remains in_progress because reconstruction is incomplete.

Current native entry/local-closure fingerprint count: 76. The complete offline chain includes synthetic settlement, normalized booking and finalization cleanup; finalization core/transport are mocked. No live QR speed improvement has been established.

Handoff threshold reached: 5% primary quota remaining. Verified source commit: 52c32fd. Read docs/finalization-core-review.md before implementing f2233; it records the redundant post-race await and the exact existing f2009 retired-vendor guard. Hourly minute-41 continuation remains configured for the latest unfinished task; do not duplicate an active main turn.
