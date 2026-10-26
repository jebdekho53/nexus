# Backend flow comparison: TS 1.0.78 and current Matrix

Date: 2026-10-24. Scope: backend code from form normalization and login through availability, boarding, payment, QR, settlement and ticket handling; supporting transport, proxy, RailOne and persistence services. Chromium executable selection was covered separately and is excluded from the upgrade list here.

## Evidence and limits

TS is the supplied package at `C:/Users/lexus/Videos/New folder/TS`. Its recovered main backend contains 4,521 functions / 538,755 instructions. Matrix's recovered 1.0.74 baseline contains 4,354 functions / 512,857 instructions, with additional handwritten modules and runtime overrides in the current project. Matrix's package version is not the upstream backend version.

An offline census compared opcode sequences for every recovered function. 4,149 TS functions have at least one Matrix function with the same opcode sequence; 372 have a different/new sequence. **These are not semantic equivalence or new-feature counts:** operand/constant changes are excluded, small functions can collide, and a changed sequence can be an existing function with an edit. The net +167 functions is also not +167 features.

Artifacts: [full census](../diagnostics/ts-comparison/backend-shape-census.json), [372 structural candidates with locations](../diagnostics/ts-comparison/different-or-new-shape-functions.csv), [reproducible offline script](../tools/audit_ts_backend_shapes.py). The script imports only static decoders and never instantiates the target process reader or invokes the application wrapper.

TS evidence is under `C:/Users/lexus/Videos/New folder/TS/analysis/main-reconstruction/readable/` (called **TS R** below). Pseudocode conditions/scopes/object templates are approximate. Explicit calls, stored fields, caller contracts, constants and the current Matrix implementations support the findings below. Old readable strings alone were insufficient: several supposedly new messages decode to functionality already in Matrix. Saved REA evidence matches the supplied ASAR digest; no new REA connection or live capture is claimed.

This is an end-to-end **code-path comparison**, not an end-to-end live booking test. No credentials, bookings, payments or external requests were performed. It does not certify every branch as equivalent or identify every operand-only edit.

## 1. Login, CSRF and scheduled opening

| Change | TS behavior | Matrix current behavior | Evidence |
|---|---|---|---|
| CSRF mismatch recovery | Refreshes token through the live SPA/API and retries; refresh limit defaults to 3 before duplicate-session termination | `csrf` classification immediately sets duplicate-login terminal | TS R part-05.js:10167–10214; default part-01.js:4854; Matrix src/main/booking/safe-call.cjs:136–139 |
| Recovery after first lost response | First network failure triggers a CSRF refresh before another request | Network catch delays/retries without that refresh | TS R part-05.js:9940–9953; Matrix safe-call.cjs:58–77 |
| New live token refresh helper | GETs captured/default validateUser endpoint, compares old/new API CSRF, retains old if no new token arrives | Primarily resyncs browser-captured token and re-establishes login/search when absent | TS R part-06.js:8727–8804; Matrix browser-booking.cjs:129–140 |
| Countdown token freshness | Arms a pre-slot refresh, with a minimum-time guard; when too close to opening it skips refresh rather than delaying availability | No equivalent pre-slot refresh helper in current booking/runtime/compiled implementation | TS R part-06.js:8816–8869, caller/state at :439–552 |
| Late-start warm-up skip | Near-slot interval covers 5 minutes before AND 5 minutes after target | Inherited skip covers the 5 minutes before target | TS R part-05.js:11350–11395; Matrix src/main/compiled/part-03.cjs:944–949 |
| Current Matrix login override | TS retains scheduled login-target calculation | Matrix `app:login` is wrapped in immediate-login context; booking-box weblogin target returns null, including 8AM | TS R part-06.js:7887; Matrix development-policy.cjs:63–73, booking-timing.cjs:10 |

The last row is a current Matrix customization, not proof of a TS upstream update. An isolated local probe confirmed that Matrix's 8AM target survives outside immediate-login context and becomes null inside it. Availability has its own wait, so this alone does not prove booking submits before opening. The pre-slot refresh's precise lead-window defaults are not asserted here.

## 2. Availability, special trains and boarding

The significant addition is a **stateful special-train alternate-date enquiry flow**, not a claim that all 8AM bookings now use different dates.

- TS normalizes and carries `specialTrainSelectedAt` alongside the special-train flag (TS R part-02.js:2383–2388, :3055; RailOne use part-08.js:7988). No matching field was found in Matrix's compiled implementation. It supplies additional selection context to the new guard; exact date-validity policy should not be inferred from malformed pseudocode.
- New helper family distinguishes unusable/invalid date or ARP responses and applies special-timing, selected-train, quota/slot and synchronized-clock guards (TS R part-05.js:8113–8518). This is narrower than an unconditional date substitution.
- Web availability now maintains `specialProbeState` with journey identity, date index, completion and a fallback deadline (TS R part-06.js:5938–5966, :6106–6228, :7299–7332). A usable original-date `W` can start shifted enquiries after the opening guard (:6958–6984).
- A usable shifted enquiry can hand control back to boarding using the **original quota and journey date** (:6540–6613). It is not evidence of silently booking the alternate enquiry date.
- Shifted-date probing has a four-minute fallback to original date/quota (240,000 ms default at TS R part-01.js:4847; fallback helper part-06.js:7321–7332). There is also an overall availability deadline. Do not promise this strategy will improve acceptance by IRCTC.
- RailOne has corresponding new special-probe state and exact-date parsing controls. Its polling now accepts an options argument, and soft boarding redrive can resume the same state without resetting the deadline. Details below.

Matrix's current `src/main/booking/availability.cjs` instead follows its inherited original-journey poll: slot gate, high-load retry, reasonType S acceptance, no-seats/cancellation handling and bounded window. It does not contain this `specialProbeState` orchestration. `reconstructed-payment.cjs:191–194` binds that handwritten implementation, so this is a difference in the active Matrix path.

Confidence: high that new state, helper contracts and branches exist; moderate for the exact outcome of every TS branch because the recovered condition expressions are imperfect. No live 8AM validation has been performed.

## 3. API transport, route selection and error classification

| Change | TS | Matrix | Practical effect |
|---|---|---|---|
| Alternate egress scope | Pattern includes availability and `bookingInitPayment`; judge receives an explicit flag indicating whether this call used alternate route | Existing active-fetch match is availability-only; judge called in availability branch | Extends route handling into payment initialization; not a new existence of alternate transport |
| Alternate outcome handling | Judge invoked for calls through the shared transport with explicit used-alt context | Two-argument judge in narrower endpoint block | Better separation of alternate-route errors from session-route errors |
| RailOne edge 403 classification | Adds edge-body classifier and fresh-sensor/next-fingerprint branch with relogin capability/budget checks | Current transport sends 401/403/invalid-token cases into actual relogin | Distinguishes edge rejection from expired account session; precise retry continuation is only moderately established |
| Proxy vs control-service failure | On analytics transport failure, checks whether the configured form proxy itself is dead | Current Matrix removes those vendor control services | More specific diagnostics in TS; not an exposed Matrix booking improvement |

Sources: TS R part-01.js:3238; part-08.js:1115–1168, :2256, :2441–2485, :15576–15626. Matrix `src/main/compiled/part-04.cjs:16207`; `src/main/booking/transport-retry.cjs:149–150,245–263`. Runtime bindings: `reconstructed-payment.cjs:98–101,148–151`.

Existing sensor recycling, 510/511 loops, path variants, TLS/JA3 profiles, sensor rotation and fresh-browser relogin are **not** new merely because the TS recovery decoded their messages more cleanly.

## 4. Payment initialization, gateway requests and QR

Two material route-safety changes were confirmed:

1. **Payment proxy setup now has a checked success/failure contract.** TS `routeGatewayThroughFormProxy` returns a boolean, rejects an attached/GoLogin vendor-proxy situation without a matching form proxy, and returns false on request-context setup failure. `attemptPayment` checks this and stops before gateway requests. Matrix's helper logs the setup failure and continues with `page.request`; its payment caller does not test a boolean result.
   - TS R part-05.js:9398–9620; part-06.js:2451–2480.
   - Matrix `src/main/booking/controls.cjs:73–94`; `src/main/payment/payment-init.cjs:59`.
2. **Gateway network failure no longer silently changes the host to direct connection.** Matrix adds failed gateway hosts to `directHosts` and creates a direct request context after its threshold. The corresponding TS wrapper retains the configured proxy, tracks failure streaks and reports once through `reportedProxyFailures`/`onProxyFailure`.
   - TS R part-04.js:11855–12090.
   - Matrix `src/main/payment/gateway-routing.cjs:14–20,49–59`; active binding `reconstructed-payment.cjs:279`.

These improve route consistency. An unavailable proxy can still stop QR generation; neither change establishes faster QR generation.

The following already exist in Matrix and must **not** be sold as new TS upgrades:

| Inherited behavior | Matrix evidence |
|---|---|
| Change gateway when no QR/collect was shown | compiled/part-03.cjs:5528–5730, f2170 |
| Poll bookingData even when PayTM BankResponse missed booking-confirm | compiled/part-03.cjs:7450–7660; payment fixture f2193 |
| Mirror QR from gateway pages/frames | compiled/part-02.cjs:5527+, f1186; 40-second scan budget |
| Fallback after five unusable provider-QR commands | payment/provider-qr-poll.cjs:28–55 |
| PayTM/PhonePe/Razorpay/IRCTC QR and wallet dispatch | payment/gateway-dispatch.cjs:3–40 |
| Browser-close settlement continuation / survivor proxy | payment/gateway-lifecycle.cjs:15–29 |
| PNR wait/cancel/final-request and paid-but-unconfirmed handling | payment/pnr-lifecycle.cjs, settlement.cjs, finish-booking.cjs |
| Ticket-detail fetch and booking completion reporting path | payment/print-ticket.cjs, finish-booking.cjs |

No distinct new passenger payload, berth-selection algorithm, PNR settlement algorithm or ticket-fetch algorithm was established in this audit. This is a verification limit, not a proof those functions are byte-for-byte identical. Matrix's custom popup sizing/export behavior is a separate local UI/output change.

## 5. RailOne login, token collection and booking state

RailOne has a larger redesign than the earlier button-level comparison showed. Current Matrix advertises `railOne:false` (`src/main/runtime/matrix-services.cjs:3`), so the current availability of this service must be distinguished from changes in its inherited backend code.

| Change | TS behavior | Evidence in TS R |
|---|---|---|
| Separate remembered login vault | Persists per-form login separately from disposable sensor/token batches; records save/update timestamps | part-08.js:13110–13188; part-09.js:1254–1288 |
| Restart keeps remembered login | Purges stale token pools while retaining remembered authentication material | part-09.js:1640–1697 |
| Central token hub | Collection decrypts bundles into one pool; per-call supplier takes with priority/label | part-09.js:4300–4355,6899–6917 |
| Reuse saved login without pair QR | Pairing path detects saved login, starts hub if needed and returns rather than requiring pair QR again | part-09.js:13495–13566 |
| Hub snapshot/restore | Restores identity/pool metadata after freshness checks; rejects stale pool, drops empty identity; snapshot caps spent history at 200 | part-09.js:4115–4237 |
| Shared-pool readiness | Defaults to 20 ready tokens, 4-token force-start minimum; snapshot TTL 30 minutes | part-01.js:7212–7229; readiness part-09.js:4537–4564 |
| Collection lifecycle | Shared collection QR, status polling every 2.5 seconds, 10-second bundle top-up default; clear cancels timer and erases pool identity | part-09.js:4430–4527; part-01.js:7202–7207 |
| Stop vs forget | Stopping active pairing and erasing remembered login are separate operations | part-10.js:2194–2244 |
| Special enquiry parsing | Parser receives requested original journey date and exact-date requirement; shifted answers face additional usability guards | part-08.js:7317–7478 |
| Redrive preserves special-probe deadline | New poll options permit soft boarding redrive to reopen completed state for same journey within its existing deadline | part-08.js:6863–6890,7774–7794,8037–8050 |
| Bounded alternate-date rotation | Retries an unusable dated answer once, then advances date index after the second empty response | part-08.js:7570–7591,8050–8054 |
| Keep original journey and fare ownership | Main boarding still uses original job; accepted shifted result has its amount zeroed rather than carrying alternate enquiry fare into booking | part-08.js:3539,7464–7477 |

Old Matrix startup cleared tokens and clearance and described pairing as not surviving restart (`recovery/readable-reference/part-06.js:975–1044`). It already had per-form pairing/sensors, encrypted vault primitives, token pacing, tail reserve, boarding redrive and Y-margin controls. The **new part is shared-pool/login persistence and additional probe orchestration**, not the mere existence of token storage or retries. Matrix's `railone-booking.cjs:104–105` already has redrive max/wait; `railone-submit.cjs:38` already has the Y margin.

The new login vault uses existing encryption primitives, refuses writes after decryption failure and uses temp-write/rename (`TS R part-08.js:13226–13268`). Hub collection still calls vendor `status()`/`bundle()` services (`part-09.js:4260–4338`); this is not a local-only hub. No private values or observed traffic were used to make that code-path finding.

## 6. Proxy tooling, preferences and dependency changes

- **Bulk saved-proxy testing:** TS handler tests list entries, returns working/tested totals and persists `lastTest` including status/time/latency/note and IRCTC result fields, then broadcasts `ProxyTagsChanged` (TS R part-10.js:971,1172–1350). Matrix lacks the corresponding Test All/results UI. This is actual persisted backend work, not just a button addition.
- **Saved browser visibility preference:** new Get/Set handlers persist `hideBrowser` (TS R part-10.js:6305–6350). Running hidden already existed; the preference and control surface are new.
- **Browser dependency:** Brahmos is 2.1.0 in TS vs 2.0.3 in Matrix. Patchright/core remains 1.63.0 in both. Version difference alone does not reveal the dependency's internal fixes. Native RailOne and TLS resource files compared earlier are hash-identical.
- **IPC additions:** nine TS symbols absent from baseline definitions: `ClearRailOneHub`, `DevLog`, `ForgetRailOneLogin`, `GetHideBrowser`, `GetRailOneHub`, `SetHideBrowser`, `StartRailOneHubCollect`, `StopRailOnePairing`, `TestAllProxies`. This is not a comparable total IPC count because one source lists definitions and the other reconstructed registrations.

## 7. Vendor services, security and current Matrix overrides

Security evidence collection/queue, quarantine/bypass, consent handling, encrypted analytics config and durable clientUpdate ledger already exist in the older Matrix baseline. They are not newly introduced TS features merely because their strings differ in the recovered listing.

Current Matrix intentionally replaces remote vendor configuration, removes inherited CAPTCHA/server helpers and disables vendor booking/account reporting (`src/main/runtime/legacy-services.cjs:15–27`). TS retains vendor-dependent control-service paths. This is a current product/configuration difference; it does not establish newly added exfiltration or observed password transmission in TS. Matrix's own mobile bridge and its server endpoints require separate privacy assessment; disabling these inherited vendor paths does not make the whole product offline.

## Priorities if porting is requested later

1. CSRF refresh/retry and countdown freshness, preserving opening-time budget.
2. Checked gateway proxy setup and removal of silent direct fallback.
3. Carefully port and test special-train enquiry state with original-journey invariants and one overall deadline.
4. Port bulk proxy diagnostics and saved metadata.
5. Treat RailOne hub/login persistence as a separate feature requiring its vendor-service dependencies and lifecycle validation.

No backend behavior was changed as part of this audit. Verification was offline inventory, structural decoding, source/caller comparison and the isolated Matrix login-target probe. Live login-to-QR, simultaneous runs and real opening-slot performance remain untested.
