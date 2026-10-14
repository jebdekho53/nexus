# Availability and live E2E results — 14 October 2026

Edit Form now has an explicit Check availability button. It validates required journey fields and reuses the existing availability request, selected class/quota, proxy and result panel. Offline app rendering/storage check and all 20 automated tests passed.

Live tests used an isolated copy of the saved form and the previously authorized test account. Original forms were untouched. The isolated form used GN and Paytm QR; no payment was submitted. Manual was deferred by the human.

| Mode | Login | Availability API | Actual journey outcome |
| --- | ---: | ---: | --- |
| auto | 34.53 s | 0.23 s (NA) | journey-unavailable; no QR |
| direct | 37.16 s | 0.24 s (NA) | booking-failed; no QR |
| Nexus | 40.15 s | 0.15 s (NA) | journey-unavailable; no QR |

Auto completed its browser-check QR stage at 133.55 seconds from login start, then re-authenticated and searched the actual journey. This warm-up QR is not the actual journey payment QR. Direct ended with “No confirmed seats opened up before the deadline”; Nexus and Auto tests stopped after repeated NOT AVAILABLE responses. Tests closed their sessions. No claim of successful actual-journey booking or payment.

These are single observations, not guaranteed performance or a controlled speed ranking. Direct was allowed to reach its availability deadline; Nexus/Auto were stopped after repeated unavailable checks, so their booking attempt durations are not comparable. See e2e-results.json for per-stage timestamps (UTC).
