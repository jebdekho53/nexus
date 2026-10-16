# Payment reconstruction phase 4 — 16 October 2026

This source-only developer candidate now replaces 25 recovered entry functions. Public 1.0.11 is unchanged. Full suite: 341 tests passed.

Booking normalization (f549 and callbacks, f554) preserves response aliases, error precedence, bank-error handling, fare/field coercion, passenger confirmation detection and fresh fallback arrays. It does not log passenger or payment records. Booking-data URL (f547) preserves literal concatenation; retry parsing (f548) retains both retryAfterMili/retryAfterMilis names, positive integer extraction and the original 1–20 second bounds.

Session context (f2230–f2232) returns the actual token reference, selects page URL before configured provider URL, catches referrer failures and preserves request-ID UUID/random fallback plus evaluation order. Tests use synthetic tokens and deterministic random values only.

Finalization wrapper (f2243) awaits finishBookingCore, then invokes endFinalPnrRequest before endSettling in a finally block. Tests cover synchronous failure, promise rejection, deferred completion, both cleanup failures and unawaited cleanup promises. The core f2233 remains recovered; this wrapper does not implement ticket attachment or persistence itself.

The expanded complete-chain test compares actual recovered functions against native replacements from initialization through synthetic QR/payment results to normalized booking and final cleanup. Parallel chains retain independent booking/QR ownership. This is offline behavioral evidence, not live booking success or a measured speed improvement.

The adapter validates 76 recovered entry/local-callback fingerprints. The decoded fixture now covers 88 selected functions (880 static lookups), including upcoming finalization code. Fixture availability does not imply those upcoming functions are reconstructed.

Next reconstruct f2233 and its callbacks only after reviewing exact recovered instructions, preserving retired-vendor restrictions and private diagnostics. Gateway transports and the broader application still use recovered code. No generated fallback definitions were removed; no build, deployment, real login, payment, booking or QR request occurred.
