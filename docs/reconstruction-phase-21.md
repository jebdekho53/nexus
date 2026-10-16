# Reconstruction phase21 — 16 October 2026

Native entries: **88** (was 74). Pinned definitions: **261** (was 209). Full suite: **1406** tests passing (after the last commit of this phase). Offline smoke PID 18112: 8 DOM-complete screens, no native bytecode loaded, 88 factories enabled. Public 1.0.11 unchanged; default/managed release still runs the recovered implementations. No live service, credential, booking or payment was used.

## Migrated in this phase (all compared against the actual recovered functions)

| Recovered | Native | Notes |
| --- | --- | --- |
| f1693–f1703, f1712–f1716 | paytm-websocket.cjs, paytm-final-status.cjs | PayTM socket watcher and final status; composed with f1689/f1704/f1708/f1710/f1717 in test/paytm-qr-chain.test.cjs |
| f1730 | phonepe-transport.cjs | Browser fingerprint id (cached) |
| f1733–f1735 | phonepe-transport.cjs | PhonePe headers, redirect |
| f1736–f1750 | phonepe-transport.cjs | PhonePe QR (mercury, routing key, token exchange, details, validate, pay) |
| f1751–f1755 | phonepe-transport.cjs | PhonePe payment polling (2000 ms before every request, 800 attempts) |
| f1758–f1759 | phonepe-transport.cjs | Razorpay redirect |
| f150, f1612, f1760–f1763 | razorpay-transport.cjs | Location rewrite, checkout page parser, checkout |
| f1764–f1765 | razorpay-transport.cjs | Session token |
| f151, f1766–f1770 | razorpay-transport.cjs | Payment creation: form fields and order, 429 handling (bootstrap constants 100 attempts / 3 error attempts / 3000 ms), 1500 ms pause between error retries |
| f1771–f1775 | razorpay-transport.cjs | Payment polling (RAZORPAY_POLL_MS or 5000 ms; 20 min budget) and signed callback |
| f1722–f1726 | wallet-verify.cjs | Wallet payment verification (502/504 retried every 500 ms, 600 attempts) |

Class-member names were recovered by decoding the name lookups that precede each closure in the bootstrap (see tools/name_recovered_functions.py and docs/reconstruction-inventory/function-names.csv; names are planning hints, not proofs).

## Engine/data fidelity fix (important)

`tools/build_source_ir.py` treated any `{...}` in an instruction as a jump table, so `CreateRegExpLiteral` operands were truncated for patterns containing braces (`{64}`, `{0,32}`, `\{code\}`…): the feedback slot and **flags** were lost, and the engine then built those regular expressions without flags. 111 sites in 75 functions were affected (for example the session-token matcher, log-redaction patterns in f3694, the browser-closed matcher f152 and the bank interstitial parser f1611). The lifter now only parses tables for `Switch*` instructions; the generated modules were corrected from the original V8 listing (verified: exactly those 111 rows differ, nothing else) and the three pinned definitions were re-pinned. Native closed-browser and bank-interstitial matchers now keep the original case-insensitive flag. This changes recovered (default) behaviour only where the old flags were wrong.

## Intentional diagnostic differences (tests normalize only these)

Logs omit: PhonePe routing key, token, response bodies and QR contents; Razorpay payment/order identifiers, poll/intent/callback addresses, provider error text, signatures and page text; wallet bank response; PayTM room id, socket URLs and payloads, final-status response text. The `snip` helper still runs where the recovered function called it.

## Findings recorded, not changed (compatibility)

* PayTM chain: after the winner disposes the owned status page, a poll attempt that is already sleeping reopens one more page and never closes it; the cancel path never disposes it.
* Razorpay create stops generic-error retries after the bootstrap's 3 attempts but may retry rate limits up to 100 times at 3000 ms.
* PhonePe poll waits 2000 ms before the first status request as well.

## Remaining

Payment gateway class: constructor f1614/field initializer f1616/f1623 (class-field semantics need engine review), f1613, and small helpers. Then the session/cookie helpers, booking/browser controllers (f2161 runBrowserBooking, f2102 runUiBooking, f3149 runInner, availability pollers), IPC/UI/backend boundaries and the 33,708-instruction bootstrap f1. See docs/reconstruction-inventory for the remaining size/risk inventory (88 native entries; 173 pinned support definitions).
