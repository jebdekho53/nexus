# Pre-passenger-countdown login latency

Human clarified the target is time before the 45-second countdown, not the
countdown or QR gateway time. Read-only analysis of the human-operated local
candidate run on 15 October 2026 found:

| Interval | Pair 1 | Pair 2 |
| --- | ---: | ---: |
| Launch -> navigation starts | 3.3 s | 3.3 s |
| Navigation starts -> settle starts | 1.2 s | 1.9 s |
| Settle starts -> login trigger | 13.6 s | 26.6 s |
| Trigger -> Sign In submission | 1.6 s | 1.5 s |
| Sign In submission -> login done | 5.1 s | 4.9 s |
| Login done -> passenger countdown | 3.5 s | 2.6 s |
| Total to countdown | 28.3 s | 40.8 s |

Rounded existing stage logs; the settle interval spans multiple operations,
not a single proven fixed sleep. Different accounts ran concurrently, so
these observations are not a controlled browser/route speed comparison.

Found two avoidable issues in Matrix's own `f698` performance interceptor:

1. A readiness probe could consume up to 4 seconds and then give the recovered
   handler its entire original budget again.
2. `original(...)` was inside the probe's try/catch. A synchronous original
   handler failure could invoke it a second time with the fallback settings.
   Async rejection behaviour depends on whether the promise was awaited; do
   not claim every historical failure produced a duplicate call.

Source fix: charge probe time to the caller's settle budget; cap the probe to
that budget; invoke the recovered popup handler once, outside the probe catch.
Keep the readiness predicate, popup handler, slow-page handling and genuine
denial checks. Add `matrix-login-settle-timing` with readiness, probe duration,
remaining handler budget and total duration. No credentials/page content logged.

63 application tests pass, including budget accounting, exhausted budgets,
original failure propagation, field fallback and existing scheduling/pair
regressions. This is not a live speed result. Other navigation/trigger work
inside the long interval remains to be measured with the new timing events.
Provider-required waits, session validation and passenger countdown unchanged.

Source-only change: installed/public release remains 1.0.10. No new live login
or booking was initiated; the prior rejected QR execution was not retried.
