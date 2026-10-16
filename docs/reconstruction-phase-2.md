# Payment reconstruction phase 2 — 16 October 2026

Completed native f2172 initialization orchestration and f2176 gateway dispatch after reviewing and replacing the unverified Antigravity draft. Candidate remains source-only, developer-only and explicitly enabled by --reconstructed-payment. Public 1.0.11 is unchanged.

## Verified contracts

- Candidate selection filters excluded methods after obtaining the ordered list; helpers are supplied explicitly through the lexical migration bridge. No invented actor helper methods are required.
- The wallet referrer is resolved once per candidate and retained through retries; other methods receive undefined referrer.
- Only the original initial transient condition (non-ok response, status at least 500, no bank-processing error) enters up to three additional retries. Each retains the payload and uses the original 800 + floor(random * 1200) delay. safeCall's existing internal options remain unchanged.
- Stop and terminal outcomes occur at the same points as the original, including after a pending request. Structured rejection checks preserve the original conditions rather than imposing a new transaction-ID rule.
- Proxy callbacks, fare/pay-ready stages and QR preparation callbacks preserve their original conditions. Routing is awaited; minimization is deliberately started without awaiting it. Gateway-down results retain downMethod metadata.
- Gateway configuration guards and actor method receivers are preserved for Provider QR, PayTM, PhonePe and Razorpay QR/collect.
- Wallet waits for actor.now() + 10000, checking at 150ms intervals. This is a pre-verification countdown, not PNR polling. It retains stop handling, CSRF fallback, quarantine stopRetry, response normalization and booking-result/error handoff.

## Checks

234 application tests pass. Payment-init parity covers 39 cases, dispatcher parity covers 27, and complete-chain tests compare actual recovered versus native payment-init → dispatcher → PayTM QR with mocked transports. Both mock payment watchers return no payment; no service or money movement occurs. Parallel chain tests verify QR ownership per actor.

Factories for both recovered entries have pinned definition hashes. The engine's lexical bridge now supports explicit ancestor depth so class methods resolve their original root helpers lazily. Service transports, common settlement and booking-result polling are still recovered; the full application is not yet reconstructed. No speed improvement is claimed from offline tests.
