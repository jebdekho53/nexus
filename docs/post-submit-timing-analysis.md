# Post-submit timing investigation — 16 October 2026

Human-operated 10AM opening runs submitted at 10:00:47.453 and 10:00:47.857 IST after countdown began at 10:00:02.012/02.071. The required passenger wait is followed promptly by submit. QR events arrived at 10:01:41.587/52.678; visual delivery was not independently checked.

The largest observed stage gap is first payment to pay-ready (37.9/42.3 seconds). Stage events alone do not identify server latency versus application work. The recovered slowDownPayment option concerns the bookingData GET/PNR lookup and has a 2000ms fallback; it is not evidence for the entire missing 38–42 seconds.

Added passive browser-context request/response timing for boardingStationEnq, allLapAvlFareEnq, addonServices and bookingInitPayment. Records contain local request IDs, endpoint names, HTTP status and durations, never full URLs, payloads, headers or credentials. No route, wait, timer or request order changed. Separate Node/APIRequestContext traffic is outside this observer. Next human-operated run is needed to correlate actual network timing with stages before changing the payment sequence.

Validation: 13 focused payment-observer and private-browser tests pass. Source only; no live booking test, build or deployment in this investigation.

## Original TS comparison

Compared the recovered original listing-v6 instructions against current generated definitions using recovery-tools/build_source_ir.py parse_listing. f2172 payment initialization (1627 instructions), f2176 gateway dispatch (1152), f2186 provider QR (838), and URL builders f510/f3030 match after JSON normalization (Python integer jump-table keys versus JSON string keys). This establishes instruction equivalence for those functions, not end-to-end equivalence of configuration, decoded constants, runtime, network or selected gateway. No artificial post-countdown delay was found in the runtime wrappers inspected.

Added entry/exit duration instrumentation for the three payment functions as well as browser network timing. The wrappers invoke the original immediately once, preserve arguments/results/errors, add no timers or retries, and log no input/output data. Three observer tests pass, including immediate invocation and error propagation. The currently running process must restart before it uses these new function timing hooks. No live QR speed result is claimed.
