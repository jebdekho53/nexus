# Reconstruction phase17 —16October2026

PayTM QR request f1687/f1688 plus response parsers f1601,f1605,f1606,f1607 are ordinary JavaScript in payment/paytm-qr-request.cjs. Candidate totals:67 native entries,179 contract pins,966 tests. Eight offline source smoke screens completed with all67 factories(PID23636), no native bytecode loaded.

The request resolves action against hosts.paytm, posts MID/ENC_DATA/CHECKSUMHASH through existing reqRetry with gateway headers, and parses base64 pushAppData plus QR image. Order lookup preserves short-circuit order: request URL, parsed data with request URL, response URL, parsed data with response URL. The parser retains nullish alias precedence, truthy order checks, case-sensitive data-image prefix and URL query spellings. Request/post capture happens before awaited headers; form values are read afterward as recovered.

Intentional diagnostic difference: raw response URL/order identifier/HTML are omitted; only status, app-data presence, QR length and order presence are logged. Response URL and snip helpers are still evaluated in original order so their side effects/errors remain. The supplied gateway and session determine transport; no new destination or service was enabled.

Sixty-three new checks cover33 parser cases,3 decoder variants,22 request/failure cases,1 privacy assertion and4 composed orchestration→redirect→QR chain checks. Original and native code use identical synthetic fixtures. Chain payment watcher/final-status/bank/PNR effects are stubs; this is not a live QR or full PayTM settlement verification. Public1.0.11 remains unchanged; no build/deployment occurred.

Next inspect PayTM browser/page/WebSocket/status and finalization methods beginning f1689. Broader reconstruction remains unfinished.
