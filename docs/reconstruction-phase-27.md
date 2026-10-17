# Phase 27 — HTTP transport retry controller f3132 as an ordinary module

Offline only. No live service, stored credential, booking, payment, deployment or release was involved. Required provider waits, TLS security profiles, sensor tokens, and quarantine guards are strictly preserved.

| Controller | Recovered functions | Module | Oracle test (scenarios) |
| --- | --- | --- | --- |
| callTransport | f3132 (2,871 instrs) | `src/main/booking/transport-retry.cjs` | `test/transport-retry-reconstruction.test.cjs` (8) |

Wired through `functionFactories` in `src/main/runtime/reconstructed-payment.cjs` (entry `f3132`) and pinned in `src/main/payment/recovered-contract.json` (now 406 pins).

## Key Characteristics of f3132

* **HTTP Transport with Retries & Path Variants**:
  - Handles sensor token injection and `tokenSource` tracking.
  - Dynamically switches path variants on HTTP 510 or Akamai blocks via `optStep`, `optVar`, and `optShape`.
  - Captures cookies and propagates response headers (`set-cookie`).
  - Detects authentication expiration (401, 403, invalid token) and initiates bounded auto-relogin (`tryRelogin`).
  - Implements bounded exponential backoff with jitter on network errors and transient failures.
  - Evaluates early exit when `securityQuarantined` and `finalPnrRequestPending` are set.

## Oracle Verification

* Tested synthetic scenarios:
  1. 200 OK without sensor token.
  2. 200 OK with sensor token and payload.
  3. 401 re-login failure.
  4. 401 re-login success followed by 200 OK retry.
  5. Network error with retries exhausted.
  6. Stopped operator check.
  7. Quarantine and final PNR pending early return.
  8. 510 path step rotation with `formatPathStep`.
* Full test suite verification: **2,173 tests passing**, 0 failing.
