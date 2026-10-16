# Matrix source reconstruction — phase 1

Date: 16 October 2026. This is source work after the published 1.0.11 diagnostics release. It has not been built or deployed.

## Native modules now implemented

| Recovered entry | Readable source | Responsibility |
| --- | --- | --- |
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

`runtime/reconstructed-payment.cjs` installs eleven entry replacements only with **all** of: developer mode, unmanaged checkout, and `--reconstructed-payment`. Without this flag the original functions remain active; managed releases ignore it. The General API candidate is a different, independent flag.

Local opt-in launch, with no automatic login or booking:

```powershell
cd "C:\Users\gurpr\OneDrive\Documents\ts\nexus"
& ".\.runtime\electron.exe" "." --development --reconstructed-payment
```

Do not describe the whole app as fully reconstructed. No generated definitions have been deleted because the fallback and other callers still need them.

## Evidence

Final full application suite: **177 tests passed**. No test failures remain. The opt-in adapter also validates pinned native IDs and definition SHA-256 contracts before installing replacements; changed recovery output must be reviewed and retested, not blindly accepted.

- Tests execute actual recovered functions with a static decoded-string fixture and synthetic transports, then compare request data, call order, callbacks, results, errors, cancellation and state changes against the native implementation.
- Payment payload tests cover 875 combinations of method, amount and bank override. Gateway candidate tests cover 90 combinations and bank lookup tests cover 20.
- Eleven integration scenarios run the original f2172 initialization orchestration with either recovered or native contract helpers. These exercise insurance, fallback, exclusions, wallet payloads, transaction rejection and transient errors.
- A native-factory test runs f2186 with no decoder/captured actor and verifies its local recovered callbacks are not invoked. Factories preserve `this` and existing duration instrumentation.
- Eight source smoke screens rendered with all eleven entry factories enabled with complete DOMs and no native bytecode loaded with reconstruction enabled. This is boot/UI evidence, not a service or QR speed measurement.
- The decoder fixture is static program data, not a captured HTTP response. `tools/export_payment_fixture.py` can regenerate it from the local original string table using the recovery decoder. No credentials or passenger records are involved.

Required passenger wait, authentication/session checks, request ordering, gateway validation, existing release activation, pair ownership and retired-vendor restrictions are preserved. No live login, booking, payment or QR requests were made during reconstruction.

## Still recovered / next work

1. f2172 payment initialization orchestration (gateway iteration, bounded transient retries, transaction validation, pre-dispatch callbacks).
2. f2176 gateway dispatch and its wallet branch.
3. Gateway transport methods: API/session/CSRF helpers, redirect fetching, QR extraction, WebSocket and provider polling implementations.
4. Common settlement f2181, bookingData/PNR polling, booking-result persistence and broader passenger submission flow.
5. Remaining application logic and eventual removal of the execution engine after all required callers have been migrated.

Next practical step: use the f2172 integration fixtures as an oracle while reconstructing that function into an explicit-dependency payment-init module. Native entry adapters should remain opt-in until the service contract is verified. Approximate readable-reference files are hints; validate branches against the listing and the actual interpreter.

The earlier 38–42 second payment-to-pay-ready gap remains unresolved. Instruction equivalence and offline reconstruction do not establish a faster real journey.
