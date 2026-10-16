# Reconstruction phase 9 — 16 October 2026

Provider QR creation f1668/f1669–f1672, app-config decoding f1602 and QR amount extraction f1608 are native. Current total:46 entries,119 pinned recovered definitions,610 passing tests. The candidate remains source-only and developer-only; public1.0.11 is unchanged.

Thirty-five tests cover sale POST, auth redirect resolution, base64 config parsing, browser/Buffer decoder preference, metadata aliases/coercion, generation URL selection, exact headers/body, QR/amount fields, missing IDs and errors at each stage. Two parser tests contain additional value matrices. The complete-chain test now uses native QR creation with synthetic low-level responses, in addition to redirect, headers/retries, settlement, PNR, ticket capture and cleanup.

Intentional privacy difference: the missing-ID diagnostic omits the authentication HTML excerpt and length. Original-versus-native comparisons normalize that one message; a separate assertion rejects leakage of a marker placed in the auth page. Requests, return metadata, retry calls and error propagation otherwise match. No real credentials, browser fingerprint or response body was used as a fixture.

Polling f1673 and bank/encdata transports remain recovered. Reviewed f1673 sequence: generate command payload/headers once; up to72 counted polls by default; stop callback each iteration; command network/unusable failures switch to statusCheckRedirect after5 failures; paid command calls irctcQrFetchEncdata; fallback success extracts encdata aliases; declines return reasons. Wait callback and sleep happen between polls. Sleeps shorter than60% of the configured interval do not consume a counted attempt, capped at60 extra fast iterations. These bounds must be tested with a deterministic clock before migration.

Next migrate f1673 with classifier f1603/f1604 and encdata helper f1678/f1679/f1680. Do not replace its state machine with a simple fixed retry loop. Preserve stop semantics, deduplicated logs, HTTP/error fallbacks and provider timing constraints.
