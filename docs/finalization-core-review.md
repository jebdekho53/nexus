# Historical review: recovered f2233 finalization core

Historical read-only review,16October2026. Superseded by the native implementation verified in phases5–6; retained for the instruction findings. At the time of this review the function had not yet been replaced. Verified reconstruction checkpoint: 52c32fd, 341 tests, 25 native entry functions, 76 pinned definitions, eight offline smoke windows (PID 10828).

The static decoder fixture already covers f2233–f2242. Raw instruction definitions in generated/index.cjs remain the authority. Ignored diagnostics/f2233-review.txt and f2234-review.txt through f2242-review.txt contain decoded instruction listings; they replace only verified four-instruction constant preparation sequences before decoder calls, retaining control flow. Do not rely on approximate readable-reference alone.

Observed sequence:

1. Start gateway?.disposeSurvivor().catch(noop), then gateway?.disposeDirectContext().catch(noop), without awaiting either. A truthy gatewayReqCtx similarly starts dispose().catch(noop), then clears the actor field immediately. Synchronous exceptions still reject the outer async method.
2. If paymentCancelled, return actor.stoppedResult().
3. With a truthy booking and PNR, override booking.amount with paidQrAmount only when truthy, Number.isFinite and positive. A differing amount is logged first. Preserve privacy restrictions when considering logs containing amounts or PNRs.
4. Label is Confirmed when booking.allConfirmed, otherwise Booked. Await Promise.race between attachPrintTicket(booking) and a 3000ms timer, swallowing rejection of the raced promise. Then opts.onBooked?.(booking), followed by booking:pnr progress.
5. If any passenger.confirmed, call reportClientUpdate(booking).finally(markCompleted). Race that promise with a 5000ms warning timer. IMPORTANT: instructions then await the SAME report promise again (offsets 1372–1404). The timeout does not actually bound total waiting. This is after the QR/payment stage, so it does not explain the earlier payment-to-QR delay.
6. If no passenger is confirmed, log that reporting is skipped. Return {success:true,reference:booking.pnr,message:'PNR '+booking.pnr+' ('+label+')'}.
7. Without a PNR, a truthy booking.errorMessage produces booking:error progress and {success:false,message:errorMessage}. Otherwise return the existing payment-still-processing warning. Outer catch rejects rather than converting exceptions into success.

Vendor restriction: runtime/legacy-services.cjs overrides f2009 with a skipped result in release and development; runtime/development.cjs also overrides it. src/main/index.cjs merges legacy overrides after development overrides. Preserve these guards while migrating reportClientUpdate callers. Do not restore vendor transport or treat f2233's presence as permission to re-enable reporting.

Before implementing, add original-versus-native tests for cancellation, null/error responses, finite amount rules, both disposal errors, asynchronous disposal, ticket timeout/rejection, callback exceptions, confirmed/waitlist paths, deferred report completion and wrapper cleanup. A behavioral change to the redundant second await must be explicit and separately tested; do not silently alter it in a parity migration.

Core finalization, gateway transports and the broader app still execute recovered functions. No real credentials, booking/payment request or live QR test was used in this review.
