# Matrix 1.0.23 testing build

Includes the reviewed Web-2 upgrades from 1.0.22 plus the latest high-load handling changes: cumulative 510 diagnostics, explicit booking-not-allowed classification, default availability transient-status handling, and deadline-capped retries for HTTP 200 high-load bodies during special shifted enquiries.

General GN Book Now retains immediate start without the three scheduled opening-slot countdowns. It still depends on provider availability, session validity and high-load responses. This release does not promise a successful booking or faster QR.

The Windows full installer includes its Electron runtime. Install and launch Matrix, then verify the displayed version is 1.0.23. Test General GN separately from 8AM/AC Tatkal/Sleeper Tatkal. If a run stalls, record the selected mode, train/date, stage and time, and export the application logs; do not share passwords or payment credentials.

Validation results and installer digest are recorded locally in diagnostics/build-1.0.23-verification.json after packaging checks. Offline tests and startup smoke validation do not establish real IRCTC booking or payment success.
