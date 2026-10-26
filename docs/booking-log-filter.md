# Booking log visibility

User requested the complete booking lifecycle, including browser internals, from Start Booking to success or cancellation. App/window opening and unrelated startup diagnostics do not belong in Live Logs.

Main and renderer now share src/renderer/matrix-log-policy.js. Live events and cached snapshots pass the same allowlist before entering the panel or its download. Original booking/login/browser/search/UI/payment/RailOne/GoLogin stage streams remain supported.

Verified by opening Proxy followed by Logs in release mode: zero visible rows and zero unrelated rows; both the bridge and renderer policy were ready. Evidence: diagnostics/booking-only-log-panel-verified.json. Four targeted activity-log checks passed, including the exact four unwanted rows supplied by the user, full lifecycle retention, redaction and terminal waiting behavior. No live booking/payment and no installer build were performed.
