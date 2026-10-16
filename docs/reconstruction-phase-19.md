# Reconstruction phase19 —16October2026

PayTM bank response f1717/f1718 is ordinary JavaScript in payment/bank-response.cjs. Current code commit b056da7:72 native entries,193 execution-metadata/code pins and1069 passing full-suite tests. Default/release stays recovered; public1.0.11 unchanged.

The PayTM variant sends MID/ENC_DATA/CHECKSUMHASH only in its first request. Subsequent requests are bodiless, including after failures. It retains configured origin/navigation headers, timeout0, full interstitial delay,3000ms network retries,3500ms non200 follow-ups and7000ms plain200 retries. Network failures accumulate to4 total; plain200 counter resets after an interstitial. Unlike the generic bank method, the recovered PayTM variant treats a browser-close exception as an ordinary network retry; this difference is preserved and tested. No new loop cap or shorter provider wait was added.

Thirty-one additional comparisons/assertions reuse the actual recovered oracle across confirmation URL/body, missing response data, async/synchronous failures, headers/origin overrides, cumulative retries, interstitials and cleanup-related errors. Composed PayTM orchestration→redirect→QR→owned browser status→disposal→bank request also matches original with synthetic HTTP/browser effects. Final-status response and PNR/finalization remain stubs in that particular chain; separate Provider-QR chain tests cover native PNR/finalization. No live booking/payment/QR verification occurred.

Next inspect remaining PayTM WebSocket watcher f1693 and final-status f1712, then PhonePe/Razorpay transports and remaining session/cookie helpers. All generated definitions remain available. Full reconstruction is unfinished.

Offline smoke PID2308 verified8 complete DOM screens,72 enabled factories and no native bytecode loaded.
