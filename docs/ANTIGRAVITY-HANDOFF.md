# Antigravity continuation prompt

Continue the existing Matrix source reconstruction at:
`C:\Users\gurpr\OneDrive\Documents\ts\nexus`

Do not start over or replace working modules with placeholders. Read applicable AGENTS.md, TASK-STATE.json, docs/reconstruction-progress.md, docs/post-submit-timing-analysis.md and docs/release-1.0.11-qa.md first.

The goal is ordinary, readable JavaScript replacing recovered instruction execution gradually, with behavioural comparison tests. Eleven payment entries already have native replacements in src/main/payment/, integrated through runtime/reconstructed-payment.cjs and the engine's functionFactories seam. Provider QR, PayTM, PhonePe, Razorpay, PayTM result coordination, URL/payload construction, gateway selection and response errors have been reconstructed. The report lists exact function IDs and limits.

Reconstruction is developer-only and opt-in using --reconstructed-payment. Installed/public 1.0.11 contains earlier diagnostics and login-settle improvements, not this candidate. Preserve this separation, own-server release activation, profile data, independent pair ownership and existing retired-vendor restrictions. Do not change provider-required passenger waits or bypass authentication, CAPTCHA, access controls or rate limits.

Next implement f2172 as a readable payment-init orchestration module with explicit dependencies, preserving gateway order, safeCall options, transient retry conditions, cancellation, response/transaction validation, callbacks and dispatch. test/payment-init-integration.test.cjs already runs the actual recovered f2172 with synthetic transports and recovered/native helper variants; expand it to compare the reconstructed orchestrator. Then handle f2176 dispatch and its wallet branch, remaining gateway transports and common settlement/PNR logic. Do not call a renamed instruction loop a reconstruction.

Use src/main/generated/index.cjs, recovery/listing-v6.txt and the execution engine as the oracle. recovery/readable-reference is approximate and can have incorrect control flow. test/fixtures/payment-strings.json is static decoded program data; tools/export_payment_fixture.py regenerates it using the local recovery-tools/strdecode.py and recovered-source/main-reconstruction/string-array.txt in the parent folder.

Bundled Node:
C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe

Run all application tests with that executable and --test test/*.test.cjs. Tests must compare observable request order/data, return values, errors, state mutations and cancellation against the actual recovered implementation using synthetic fixtures. Include independent-pair and retry/error coverage. Do not print profile/account secrets, tokens, cookies or passenger data.

No live login, booking/payment submission, QR generation, new build or deployment was performed for this candidate. Continue offline. A prior automated authenticated launch was rejected by automatic approval review; do not route around that rejection. Service timing validation must not be claimed from mocks or stage timestamps. The real 38–42 second payment-stage gap is still unverified.

Keep TASK-STATE.json and the reconstruction report current after each verified module. Report precisely which parts still use the recovered engine. Preserve a reversible original fallback and do not delete generated definitions while remaining callers or tests need them.

Latest checkpoint: 177 full application tests pass. The opt-in adapter checks src/main/payment/recovered-contract.json fingerprints before installing replacements. Do not regenerate these fingerprints merely to silence a mismatch; inspect and compare the changed semantics.

Code checkpoint: commit 7ab017c. Latest usage check showed 8% of the five-hour window remaining; handoff prepared before exhaustion. TASK-STATE.json remains in_progress because reconstruction is incomplete.
