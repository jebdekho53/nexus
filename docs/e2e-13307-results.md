# Train 13307 E2E check — 14 October 2026

Newest saved form: DDU → BSB, 20 October 2026, SL/GN. The isolated diagnostic copy used the authorized test account and Paytm QR. Availability returned AVL-8. Original user forms were untouched and no payment was submitted.

| Mode | Login | Login to QR-ready log | Panel QR image verified |
| --- | ---: | ---: | --- |
| direct | 25.68 s | 101.36 s | No |
| Nexus | 26.19 s | 100.35 s | No |
| auto | 40.04 s | Not reached | No |

Direct and Nexus generated an actual-journey booking:qr signal, but the QR image was not verified in the Nexus panel. Direct initially remained at payment wait because the old test detector required a visible panel image; the diagnostic was subsequently adjusted to stop at the QR-ready stage. The resulting stopped run does not mean a payment or ticket was completed.

Auto logged in but hit the 300-second booking-test timeout during browser-check availability selection, before an actual-journey QR. Its screenshot showed warm-up results for 19 October and train 22355 after first trying 13307. The ui:select step did not advance to ui:book. This does not establish an availability failure on the saved 20 October journey.

These are individual timing observations, not guarantees or a claim that every UI path passed. The QR panel display and Auto warm-up selection remain unverified/failing areas. All isolated test sessions were closed.
