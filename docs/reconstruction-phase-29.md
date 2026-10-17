# Phase 29 — Train availability polling & slot gating controller f2269 (`pollAvailability`) as an ordinary module

Offline only. No live service, stored credential, booking, payment, deployment or release was involved. Required provider opening waits, quota gating, Akamai detection, and reasonType 'S' allotment checks are strictly preserved.

| Controller | Recovered functions | Module | Oracle test (scenarios) |
| --- | --- | --- | --- |
| pollAvailability | f2269 (1,837 instrs) | `src/main/booking/availability.cjs` | `test/availability-reconstruction.test.cjs` (8) |

Wired through `functionFactories` in `src/main/runtime/reconstructed-payment.cjs` (entry `f2269`) and pinned in `src/main/payment/recovered-contract.json` (now 422 pins).

## Key Characteristics of f2269 (`pollAvailability`)

* **Booking Window Gating & Adaptive Polling**:
  - Gated countdown wait until `target.ms` using `waitUntilTarget(target)`, or logs warnings when target already passed.
  - Honors `options.skipWait` when slot wait was pre-handled by caller.
  - Verifies presence on provider page via `onProviderPage()` and `ensureOnProviderPage('check availability')`.
  - Dispatches HTTP request through `safeCall('api', 'POST', body, url, { optShape: 'eticket', optStep, terminalOn503: true, optVar: true })`.
  - Handles 510 path step rotation and high-load response status codes (`429, 502, 504, 510, 511`).
  - Identifies Akamai block responses and retries.
  - Immediate allotment on `reasonType === 'S'`.
  - Detects `noSeats` condition and terminates with reason.
  - Detects Provider highload body error messages and triggers terminal exit.
  - Delegates cancelled trains to `pollCancelledTrain`.
  - Adapts polling interval dynamically: 300ms if before target slot, 1500ms ordinary pace, or slow backoff up to 10 minutes from opening window.

## Oracle Verification

* Tested synthetic scenarios:
  1. Seats available (`reasonType: 'S'`) immediate success.
  2. Future target slot countdown wait.
  3. Already passed slot warning and immediate polling.
  4. Skip slot wait option.
  5. `noSeats` condition termination.
  6. High-load body error message termination.
  7. Cancelled train delegation.
  8. Stopped actor early return.
* Full test suite verification: **2,194 tests passing**, 0 failing.
