# Reconstruction phase12 —16October2026

Current developer candidate:57 native entries,142 pinned recovered definitions,741 application tests passed. No live service, real cookies, build or deployment was used.

Gateway lifecycle f1617/f1618,f1619/f1620,f1624/f1625–f1627,f1628/f1629 now use readable gateway-lifecycle.cjs. Existing request/proxy setters retain references and values. Survivor arming transfers the existing browser cookie snapshot and configured request options to a new actor-owned context; it returns a logged failure on errors. Direct context creation retains its different rejected-cookie-read fallback. Existing cookie-selection and proxy policy flags are preserved rather than enabled or changed.

Forty-four comparison tests cover reference/cached-context behavior, option construction, independent actor snapshots, request library/cookie/hint/context failures, synchronous versus asynchronous failures, and sleep/timer semantics. The full synthetic chain now creates and disposes the survivor context through native methods and uses the native timer helper for the45000ms bank interstitial. Actual request routing still uses synthetic low-level transport.

Contract integrity was strengthened to include kind, language, parameter count, length, incoming register, register count/ranges, exception handlers, constants and instructions. Before changing hash coverage, every previous native ID/code fingerprint was verified unchanged. No generated definition changed. A new test rejects metadata changes for both a native entry and a local callback; release/off candidates still bypass candidate validation. Future reviewed pins must use runtime/recovered-contract.cjs definitionFingerprint, not the old partial hash formula.

The fixture exporter now has readable selected-ID ranges and explicit UTF-8 subprocess decoding. The current static fixture includes upcoming request-routing functions for inspection only.

Next reconstruct f1652's request getter and f1653–f1658 closures. Reviewed routing: snapshot configured/page request at getter time; run existing pre-request hook; clone options with timeout default0; explicit direct hosts and browser-gone survivor routes first; optional configured TLS transport then normal path; record responses/errors; closed browser can continue via survivor; configured proxy fallback requires existing classifiers and failure threshold. Preserve these policies, record/callback ordering and actor isolation. Underlying browser/native HTTP helpers f1633/f1649 still need separate migration afterward.
