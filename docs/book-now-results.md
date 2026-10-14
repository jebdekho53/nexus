# Auto Book now — verified 14 October 2026

GN Auto Book now performs automatic WebLogin and immediately uses the current authenticated session. It skips the scheduled browser-check/re-login cycle, retaining provider submit waits, availability, authentication and payment requirements. The UI chip reads AUTO · NOW. Scheduled 8AM/Tatkal, Manual, Direct, Nexus and UI Login behavior is retained. Saved mode flags are not rewritten.

13307, DDU → BSB, 20 October2026, SL/GN returned AVL-8. Paytm QR was displayed in the Nexus booking panel and visually inspected. Login24.24s; booking-to-QR74.99s; total99.23s. These are a single observation, not a guaranteed time. No payment was submitted and the isolated test session was stopped/closed.

QR delivery fallback reuses the generated image after the original publisher, delivers only to its exact local form, avoids already visible QR duplication, and refuses ambiguous unnamed delivery among multiple profiles.22 tests passed, including scheduled/manual routing and QR isolation checks.
