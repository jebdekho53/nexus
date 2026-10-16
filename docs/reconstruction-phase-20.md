# Reconstruction phase20 — 16 October 2026

PayTM WebSocket watcher f1693 (with local callbacks f1694–f1703) and final-status f1712 (with f1713–f1716) are ordinary JavaScript in `payment/paytm-websocket.cjs` and `payment/paytm-final-status.cjs`. Sixteen further definitions are pinned with `definitionFingerprint` (209 pins, 74 native entries). Default/managed release still retains the recovered implementations; public 1.0.11 is unchanged.

## Contracts preserved
- Room id is `mid + '_' + orderId`; socket URL is the PayTM host with `http`→`ws` plus `/websocket/?DEVICE=web&ID=<encoded room>`; default timeout 1,800,000 ms (only for `undefined`).
- A background page on the PayTM origin is preferred (15 s goto, errors tolerated); a wrong origin leaves the background page open until the final close and uses the booking page. The page-side socket program (handshake, `#1`/`#2` ping, JOIN_ROOMS after `rid===1`, room-hit, hidden `__pwslog` frame log, timeout) is a real function; tests execute both it and the recovered string program in a sandbox.
- 2000 ms frame-log poll and 400 ms operator-stop watchdog (only when a stop callback exists); both intervals are cleared; the background page is always closed.
- Result defaults: UPI / DYNAMIC_QR / SUCCESS / room id; invalid JSON keeps defaults; JSON `null` falls into the error path (null result).
- Final status: in-page POST first, ordinary request POST only if mid/encData/checksum are incomplete; the request result is used when complete or when the in-page result was incomplete. `transId` repeats `acquirementId`; property read order and snip/log ordering match the original.

## Diagnostic differences (tests normalize only these)
Logs omit the room id, background-page URL, frame text, WS payload and the supplier-response snippet (`snip` still runs). Frame logging reports only a count.

## Evidence
Seven-plus-seventeen new comparison groups: 21 final-status and 34 WebSocket checks against the actual recovered functions. Full suite: 1124 passed. Offline smoke PID 7344: 8 DOM-complete screens, no native bytecode loaded, exit 0 (the result file does not record the factory count). No live service, credentials, booking or payment used.

## Remaining
Composed chain with the native watcher and final-status in place of the synthetic stubs; PhonePe/Razorpay transports; session/cookie helpers; controllers and bootstrap (f1614/f1616 need engine review).

## Chain milestone (composed PayTM flow)
test/paytm-qr-chain.test.cjs now runs actual recovered/native f1693 and f1712 (with f1704/f1708/f1710/f1689/f1717/f1684/f1687) over synthetic pages, sockets and fetch: WebSocket wins, status poll wins, both, and operator cancel, plus concurrent independent actors. Native equals recovered traces. Remaining synthetic edges: HTTP `req`, `pollBookingData`/`finishBooking`, provider clock.

Legacy finding (preserved, not fixed): after the winner disposes the owned status page, a poll attempt already sleeping reopens one more page and never closes it; the cancel path never disposes it. Record as a candidate correction for a deliberate reviewed change.
