# Reconstruction phase 7 — 16 October 2026

Current developer candidate: 40 native entry replacements, 109 pinned recovered definitions, 554 application tests passed. Eight isolated smoke screens rendered complete DOMs with all 40 factories (PID 10540). No build, deployment or live service request occurred.

payment/gateway-session.cjs replaces f1659–f1665 (including the local f1661 rejection callback). It preserves URL fallback rules, optional gateway-page origins, provider host mapping, browser client-hint evaluation/cache/fallback and the existing gateway hint template/version selection. The native page evaluation callback is ordinary JavaScript and no longer needs the recovered dynamic-function compiler for this path. Tests evaluate both original and native callbacks against synthetic navigator data; no user's browser/session or fingerprint was read during verification.

Thirty-eight comparison tests cover cache reference identity, evaluation rejection versus synchronous errors, null/malformed results, URL coercion/errors, strict host aliases, repeated host getter reads and inherited template version selection. The 40-case host mapping matrix is inside one of these tests.

payment/gateway-lifecycle.cjs replaces f1621/f1622 and f1630/f1631. Both clear the actor-owned field before awaiting disposal and swallow asynchronous disposal rejection; synchronous errors still reject. Seventeen tests compare actual recovered behavior, preserve replacement contexts created while disposal was pending and verify that one pair's disposal does not touch another actor.

The complete-chain test now executes native browser-hint extraction, origin/header generation, transport retries and context disposal as well as previously migrated payment/PNR/finalization code. The browser navigator, low-level HTTP and provider payment effects remain synthetic. Original and native chains agree, including one injected network failure.

Next: paymentRedirect f1667 and its form parsers f1609/f1610 (fixture lookups already exported and instructions reviewed), then provider-specific QR creation/polling and remaining gateway transports. f1667 uses up to four HTTP posts with 700/1400/2100ms sleeps only when no action and no blocking response; exceptions propagate. Do not mistake this for the generic reqRetry policy. Required provider waits and existing retired-vendor guards remain unchanged.
