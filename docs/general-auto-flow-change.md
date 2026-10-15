# General Auto flow change (unreleased)

User requested the existing 8AM/AC-Tatkal/SL-Tatkal Auto pipeline for General
Book now, then reported General taking 1m54s versus roughly one minute for
opening bookings. These are user observations; identical measurement start
points have not been established.

The previous `book-now.cjs` policy forced `directLogin:true` on General Auto
login and booking requests. That override is removed. Original Auto flags now
reach the recovered handlers, as for scheduled Auto; quota stays GN. No new
warm-up booking, payment request or duplicate engine is added. Existing GN
slot resolution still returns no opening-time target. Manual/Direct/Nexus/UI
mode requests and scheduled quotas are unchanged. Selected-browser and denial
guards remain enabled.

54 app tests passed after this change. Tests cover unchanged Auto flags,
explicit modes, GN slot/countdown behaviour and scheduled timing preservation.
This is routing validation, not a measured live warm-up or QR performance pass.

Restoring Auto preparation does not establish that General becomes faster.
Opening bookings can perform login/preparation before the opening time, whereas
Book now may include that work after clicking. Compare login-start-to-QR and
booking-start-to-QR separately; retain provider-required waits. Existing logs
include long warm-up/re-login paths and cannot establish that every one-minute
opening observation includes the initial login. A matched live timing trace
has not been obtained; the earlier live QR tool rejection remains in effect.

Installed/public version remains 1.0.8. This change is source-only and must not
be described as already installed or as a guaranteed one-minute QR flow.
