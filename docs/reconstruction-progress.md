# Matrix source reconstruction — phases 1–10

Date: 16 October 2026. This is source work after the published 1.0.11 diagnostics release. It has not been built or deployed.

## Native modules now implemented

| Recovered entry | Readable source | Responsibility |
| --- | --- | --- |
| f152, f1666, f1756/f1757 | src/main/payment/payment-error.cjs, gateway-headers.cjs, gateway-retry.cjs | Closed-browser classification, header merging and bounded network retries |
| f1719–f1721, f1727–f1729 | src/main/payment/gateway-requests.cjs | Booking-data and print-ticket HTTP orchestration |
| f2233–f2242 | src/main/payment/finish-booking.cjs | Finalization core, callbacks and ticket/report timing |
| f2247/f2248 | src/main/payment/print-ticket.cjs | Optional print-ticket detail capture |
| f547, f548 | src/main/payment/request-url.cjs, retry-delay.cjs | Booking-data URL and bounded provider retry delay |
| f549 plus f550–f553, f554 | src/main/payment/booking-result.cjs | Booking/passenger result normalization and fresh empty records |
| f2230, f2231, f2232 | src/main/payment/session-context.cjs | Session token reference, payment referrer and request ID |
| f2243 | src/main/payment/finish-booking.cjs | Ordered cleanup around the still-recovered finalization core |
| f2181 | src/main/payment/settlement.cjs | Common paid/declined/timeout/result handoff |
| f2220, f2221 | src/main/payment/pnr-lifecycle.cjs | Request eligibility, retry timer and cancellation ownership |
| f2226 plus f2227–f2229 | src/main/payment/booking-data.cjs | Booking-data request and bounded provider-directed polling |
| f2172 | src/main/payment/payment-init.cjs | Initialization orchestration, retry/fallback and dispatch handoff |
| f2176 plus f2177–f2180 | src/main/payment/gateway-dispatch.cjs | Gateway routing and wallet countdown/verification |
| f510 | src/main/payment/request-url.cjs | Payment initialization URL, insurance query semantics |
| f535 | src/main/payment/request-body.cjs | Wallet and ordinary initialization payloads |
| f542, f544 | src/main/payment/gateway-selection.cjs | Bank-ID selection, gateway preference/fallback ordering |
| f545, f546 | src/main/payment/payment-error.cjs | Bank processing classification and structured response error extraction |
| f2186 plus f2187–f2192 | src/main/payment/provider-qr.cjs | Provider QR redirect, bounded retries, QR callback, polling and settlement handoff |
| f2193 plus its local callbacks | src/main/payment/paytm.cjs | PayTM redirect, QR delivery, payment-result handling and booking-result handoff |
| f2196 plus f2197–f2204 | src/main/payment/paytm-watch.cjs | First-truthy WebSocket/poll result, cancellation and timer cleanup |
| f2208 plus f2209–f2212 | src/main/payment/phonepe.cjs | PhonePe redirect, QR delivery, polling and settlement handoff |
| f2213 plus f2214–f2219 | src/main/payment/razorpay.cjs | Razorpay checkout, QR/collect callbacks, polling and settlement handoff |

These implementations are ordinary JavaScript, not wrappers that execute the same instruction definitions. `engine.cjs` now supports optional function factories so a remaining recovered caller can call a native function. The factory's `readBinding` bridge resolves required lexical configuration at invocation time, preserving initialization errors and separate captured scopes. Existing function interceptors and invocation tracing still run around the native implementation.

## Activation and fallback

`runtime/reconstructed-payment.cjs` installs forty-nine entry replacements only with **all** of: developer mode, unmanaged checkout, and `--reconstructed-payment`. Without this flag the original functions remain active; managed releases ignore it. The General API candidate is a different, independent flag.

Local opt-in launch, with no automatic login or booking:

```powershell
cd "C:\Users\gurpr\OneDrive\Documents\ts\nexus"
& ".\.runtime\electron.exe" "." --development --reconstructed-payment
```

Do not describe the whole app as fully reconstructed. No generated definitions have been deleted because the fallback and other callers still need them.

## Evidence

Final full application suite: **663 tests passed**. No test failures remain. The opt-in adapter also validates pinned native IDs and definition SHA-256 contracts before installing replacements; changed recovery output must be reviewed and retested, not blindly accepted.

- Tests execute actual recovered functions with a static decoded-string fixture and synthetic transports, then compare request data, call order, callbacks, results, errors, cancellation and state changes against the native implementation.
- Payment payload tests cover 875 combinations of method, amount and bank override. Gateway candidate tests cover 90 combinations and bank lookup tests cover 20.
- Thirty-nine scenarios compare the actual recovered f2172 with the complete native orchestrator. Twenty-seven compare gateway dispatch including the wallet branch. Two complete chain tests cover payment-init → dispatch → PayTM QR with mocked transport and parallel actor isolation.
- A native-factory test runs f2186 with no decoder/captured actor and verifies its local recovered callbacks are not invoked. Factories preserve `this` and existing duration instrumentation.
- Eight source smoke screens rendered with all forty-nine entry factories enabled with complete DOMs and no native bytecode loaded with reconstruction enabled (PID 4132). This is boot/UI evidence, not a service or QR speed measurement.
- The decoder fixture is static program data, not a captured HTTP response. `tools/export_payment_fixture.py` can regenerate it from the local original string table using the recovery decoder. No credentials or passenger records are involved.

Required passenger wait, authentication/session checks, request ordering, gateway validation, existing release activation, pair ownership and retired-vendor restrictions are preserved. No live login, booking, payment or QR requests were made during reconstruction.

## Still recovered / next work

1. Gateway transport methods: API/session/CSRF helpers, redirect fetching, QR extraction, WebSocket and provider polling implementations.
2. Broader passenger submission flow and persistence outside the reconstructed finalization core. Preserve existing retired-vendor reporting restrictions.
3. Remaining application logic and eventual removal of the execution engine after all required callers have been migrated.

Payment-init f2172 and gateway dispatch f2176 are now reconstructed and verified offline. The Antigravity draft was not integrated unchanged: its invented actor helper interface, exclusion filtering, retry policy, conditional referrer handling, transaction rejection conditions, browser minimization and callbacks were corrected against actual recovered instructions. See docs/reconstruction-phase-2.md.

The earlier 38–42 second payment-to-pay-ready gap remains unresolved. Instruction equivalence and offline reconstruction do not establish a faster real journey.

Phase 3 adds common settlement (25 parity cases), PNR lifecycle (13) and booking-data polling (20). Booking-data diagnostics intentionally omit raw response/transaction IDs and raw supplier error messages; comparisons explicitly account for that privacy change. Provider waits, bounded re-verification and result semantics match. Native entry and local closure fingerprints cover 64 recovered definitions.

Phase 4 adds booking-result normalization, provider retry-delay parsing, session/referrer/request-ID helpers and the finalization wrapper. Forty-nine additional tests pass, including field coercion, missing/error responses, reference identity, cleanup failure ordering and independent actor isolation. The complete-chain comparison now executes actual recovered versus native init → Provider QR → synthetic paid result → settlement → booking-data → normalization → finalization wrapper; transport and finalization-core effects remain synthetic. All 76 entry/local-closure fingerprints are pinned. See docs/reconstruction-phase-4.md.

Phases 5–6 complete the finalization core, print-ticket attachment, booking-data/print-ticket gateway request methods, shared retry/header helpers and browser-closed classification. The full chain now executes these native modules against synthetic low-level HTTP and browser hints, including transient failure recovery. Current count: 32 entry replacements and 98 fingerprints; see docs/reconstruction-phases-5-6.md. Retired vendor reporting remains disabled. Live QR timing is unverified.

Phase7 reconstructs gateway session/origin/hint helpers f1659–f1665 and disposal f1621/f1630 with original-versus-native tests. Current total:40 entries,109 fingerprints,554 tests,eight smoke windows(PID10540). See docs/reconstruction-phase-7.md. Payment redirect and provider transports still need migration.

Phase8 adds PaymentRedirect f1667 and form parsers f1609/f1610; current43 entries,112 fingerprints,575 tests. See docs/reconstruction-phase-8.md. Provider QR generation/polling still needs migration; no live timing claim.

Phase9 adds provider QR creation f1668 and config/amount parsing f1602/f1608. Current46 entries,119 fingerprints,610 tests. Missing-ID logs intentionally omit auth-page HTML; request/result behavior matches. See docs/reconstruction-phase-9.md. Polling/encdata helpers still recovered.

Phase10 adds provider command polling f1673, encdata fetch f1678 and classifier f1603. Current49 entries,129 fingerprints,663 tests. Full synthetic chain includes pending→paid requested wait. See docs/reconstruction-phase-10.md. BankResponse/survivor arming and remaining provider transports still recovered.
