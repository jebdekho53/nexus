# Phase 28 — Browser Booking HTTP transport & retry controller f2064 (`safeCall`) as an ordinary module

Offline only. No live service, stored credential, booking, payment, deployment or release was involved. Required provider waits, TLS profiles, rate limits, Akamai scores, and IP block detection are strictly preserved.

| Controller | Recovered functions | Module | Oracle test (scenarios) |
| --- | --- | --- | --- |
| safeCall | f2064 (2,850 instrs) + f2065–f2078 (15 functions total) | `src/main/booking/safe-call.cjs` | `test/safe-call-reconstruction.test.cjs` (13) |

Wired through `functionFactories` in `src/main/runtime/reconstructed-payment.cjs` (entry `f2064`) and pinned in `src/main/payment/recovered-contract.json` (now 421 pins).

## Key Characteristics of f2064 (`safeCall`)

* **Browser-Booking Central Transport Engine**:
  - URL normalization and path variations via `optStep`, `optShape`, `masterCache`, and `optimizeSpace`.
  - Akamai server timing score extraction (`parseAkScore`) and telemetry recording.
  - Response categorization via classifier (`ok`, `other`, `highload`, `retry`, `terminal`, `csrf`).
  - Edge/IP-block 403 bounded retry loop with exponential jitter delays and terminal error state dispatch.
  - 510 path step rotation with `max510`, `ewLimit` tracking, and automatic `onProxyOutcome('client_ip')` trigger on train availability queries (`allLapAvlFareEnq`).
  - 511 high-load loop handling with `infinite511`, `fastAmz`, and `akamai.fastRefresh()`.
  - Asynchronous background `retryCover` coordination with mutex flag (`retryCoverBusy`).
  - CSRF mismatch detection, re-seeding (`resyncCsrf`), and duplicate-login terminal notification.
  - Server busy (429/retry) backoff loop with alt-egress pace detection.

## Oracle Verification

* Tested synthetic scenarios:
  1. 200 OK without sensor/options (POST `altAvlEnq`).
  2. 200 OK with `serverTiming` Akamai score extraction.
  3. 204 status `other` immediate return.
  4. Stopped actor early return.
  5. Browser closed during network error triggers terminal closed error.
  6. Network error with `boundedRetry: 0` exhaustion.
  7. 403 terminal after 3 retry attempts.
  8. 500 terminal describes failure.
  9. CSRF duplicate login detection and terminal error.
  10. 510 path step rotation with `optVar` and `masterCache`.
  11. 429 retry status (server busy) with `boundedRetry: 2`.
  12. 511 high load retry loop with `infinite511: true`.
  13. `retryCover` execution on high load and recovery.
* Full test suite verification: **2,186 tests passing**, 0 failing.
