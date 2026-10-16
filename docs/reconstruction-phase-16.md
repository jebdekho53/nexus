# Reconstruction phase16 —16October2026

PayTM redirect form parser f1599/f1600 and request/retry method f1684/f1685/f1686 are now ordinary JavaScript in payment/gateway-redirect.cjs. Candidate totals:62 native entries,173 pinned definitions,903 passing application tests. Default/release remains unchanged.

The parser preserves action extraction and ordered first-truthy aliases for encData, mid and checksum. Existing HTML case, quote, attribute order, coercion and empty-field behavior are retained. Dependencies resolve through captured root slots775,783 and784; tests include replacement after earlier helper side effects.

Redirect constructs its token/transaction form once and reuses the reference. Four outer attempts wrap the existing reqRetry callback. Rejected request promises become null; missing response/incomplete fields wait700/1400/2100ms between attempts. Text/parser/status/log/sleep errors retain recovered propagation; synchronous reqRetry failure differs from its rejected promise and is tested. The callback captures request/post before awaiting gateway headers. Completion requires action, mid, encData and checksum; no provider gate was removed.

Intentional privacy difference: diagnostic action is presence-only and raw HTML is omitted. The snip helper still executes in the original position to retain side effects/errors; its return is discarded. Comparison tests normalize only those diagnostic fields and explicitly assert no synthetic secret markers appear in native logs.

Thirty-nine new tests compare actual recovered execution with the native candidate using synthetic inputs only. Full suite903 passed. No real login, booking, payment, QR, build or deployment occurred. Next inspect remaining PayTM transport methods beginning f1687; all broader reconstruction remains unfinished.

Offline source smoke PID11908 completed eight rendered screens with all62 factories and no native bytecode loaded.
