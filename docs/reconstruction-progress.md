# Matrix source reconstruction — phases1–11

Verified16October2026: **51 native entry replacements**, **132 pinned recovered definitions**, **696 passing application tests**. Eight isolated source smoke screens rendered complete DOMs with all51 factories(PID2384). Public1.0.11 is unchanged; this candidate has not been built or deployed.

## Readable modules

Files below are under src/main/payment/. Local callbacks are included in the native implementations and contract pins.

| Recovered entries | Source | Responsibility |
| --- | --- | --- |
| f510,f535,f542,f544–f548 | request-url.cjs,request-body.cjs,gateway-selection.cjs,payment-error.cjs,retry-delay.cjs | Payment/PNR contracts, gateway choices and errors |
| f549,f554 | booking-result.cjs | Booking/passenger normalization |
| f2172,f2176 | payment-init.cjs,gateway-dispatch.cjs | Initialization, retries and provider routing |
| f2186,f2193,f2196,f2208,f2213 | provider-qr.cjs,paytm.cjs,paytm-watch.cjs,phonepe.cjs,razorpay.cjs | QR/payment orchestration and result coordination |
| f2181,f2220,f2221,f2226 | settlement.cjs,pnr-lifecycle.cjs,booking-data.cjs | Settlement, cancellable PNR verification and booking-data polling |
| f2230–f2233,f2243 | session-context.cjs,finish-booking.cjs | Session references, finalization and ordered cleanup |
| f2247 | print-ticket.cjs | Optional print detail attachment |
| f1719,f1727 | gateway-requests.cjs | Booking-data/print-ticket HTTP requests |
| f152,f1666,f1756 | payment-error.cjs,gateway-headers.cjs,gateway-retry.cjs | Closed-browser detection, headers and bounded retries |
| f1659,f1660,f1662–f1665 | gateway-session.cjs | Browser hints/cache, origins and referrers |
| f1621,f1630 | gateway-lifecycle.cjs | Actor-owned request-context disposal |
| f1609,f1610,f1667 | gateway-redirect.cjs | PaymentRedirect payload, HTML parsing and bounded retries |
| f1602,f1603,f1608,f1668,f1673,f1678 | qr-response.cjs,provider-qr-request.cjs,provider-qr-poll.cjs | Provider QR config/amount/status parsing, generation, polling and encdata |
| f1611,f1681 | bank-response.cjs | Full provider interstitial waits and one-form bank settlement |

These are ordinary JavaScript, not wrappers executing the same instruction definitions. runtime/reconstructed-payment.cjs bridges remaining recovered callers through engine functionFactories/readBinding. Existing invocation tracing/interceptors remain. All132 entry/local-callback contracts validate before enabling the candidate.

## Candidate use and limits

Replacements require all of: unmanaged developer checkout and --reconstructed-payment. Default and managed releases retain the recovered implementation. The General API candidate is a separate flag. Local opt-in launch(without automatic login or booking):

```powershell
cd "C:\Users\gurpr\OneDrive\Documents\ts\nexus"
& ".\.runtime\electron.exe" "." --development --reconstructed-payment
```

Most of the application still uses the recovered engine. No generated definitions have been deleted. Required passenger waits, authentication/session checks, gateway validations, release activation, private-browser and independent-pair ownership are preserved. Retired vendor reporting remains disabled by runtime/legacy-services.cjs f2009 in release and development.

## Evidence

The696-test suite includes actual recovered-versus-native comparisons of requests/order, return values, errors, cancellation, timers, state changes and reference identity using synthetic fixtures. The complete Provider-QR chain now runs native initialization→redirect→QR creation→status polling→encdata→bank response→PNR→ticket/finalization. Five complete-chain checks cover ordinary results, parallel actors, transient network failure, pending→paid polling and a virtual45000ms bank interstitial with bodiless continuation.

Low-level HTTP, browser navigator/session and timing effects are synthetic. No real credentials, account/passenger records, cookies or provider responses were used as fixtures; no live login, booking, payment or QR requests occurred. No live QR speed improvement is established. The historical38–42second payment-stage gap remains unverified.

Intentional diagnostic differences: booking-data logs omit raw responses/transaction IDs/supplier errors; provider QR missing-ID logs omit auth-page HTML. Tests normalize those specific messages and assert privacy independently. Other recovered waits and result semantics are retained, including the redundant second await after finalization's5second report race.

tools/export_payment_fixture.py exports static program strings from the locally recovered table; tools/review_recovered_function.cjs writes compact instruction listings with branch targets. Future functions can appear in the fixture before migration. Approximate readable-reference is not the control-flow authority.

## Remaining work

1. Actual browser/HTTP request routing and settlement context arming/proxy ownership(f1617–f1658).
2. Remaining PayTM/PhonePe/Razorpay-specific gateway transports.
3. Broader passenger submission, browser/session/controller logic and remaining application functions.
4. Full source migration before removing the execution engine; service validation requires appropriate authorization and cannot be inferred from mocks.

Read the numbered reconstruction phase reports for historical checkpoints and detailed compatibility findings. Current next step is in reconstruction-phase-11.md. A prior authenticated automated launch was rejected by automatic approval review; do not use an alternate route to retry it. Current continuation remains offline.
