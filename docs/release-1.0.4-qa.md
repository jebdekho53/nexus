# Matrix 1.0.4 verification — 15 October 2026

WebLogin was waiting in the renderer before invoking the login IPC. The local booking panel's WebLogin target now returns no scheduled login wait. The login actor also ignores its cached future login target for the explicit login action, using an isolated async context. Booking availability targets, Tatkal opening slots and provider passenger-submit waits remain intact.

Payment and login-mode picker rows now use contrasting dark backgrounds and readable labels. Payment capability badges have separate readable WebLogin, UI Login and RailOne colours. Calendar selected/past/disabled states are styled separately. General displays an idle/run/submit timer from its matching form's real activity events. Toolbar icons are enlarged without changing the dock dimensions.

The QR publisher suppresses the in-panel copy when the separate popup is enabled, follows the matching booking panel, and restores the panel copy when toggled off. Unit checks cover routing, duplication, popup position, toggling and listener cleanup. No fresh live payment QR was requested for this release.

ID status falls back to the fixed MakeMyTrip status endpoint only for inconclusive primary results. Requests contain the ID, never its password. Verification requires a matching returned ID, complete IRCTC profile and explicit successful status flags. Errors stay unknown. Chromium returned `ERR_HTTP2_PROTOCOL_ERROR` against this endpoint; the bundled Node fetch transport successfully returned verified in the actual Electron runtime. No system curl installation is required. The supplied userAvailability URL returns 404 to GET and is not used without a request contract.

The installer dialog now displays the Matrix logo and uses its embedded icon. Desktop and Start Menu shortcuts retain the Matrix ICO; app window icons, activation, passcode and Login Data headers use the Matrix artwork.

Validation:

- 34 app tests and 14 control-plane tests pass.
- Extracted EXE payload source/tests match the source checkout byte for byte.
- Actual packaged synthetic booking panel loads the account and Paytm QR, opens both pickers with visible options, shows the General timer, and selects an enabled calendar date.
- Actual packaged release blocks before activation, accepts the existing QA key from the hosted service and initializes its controller.
- Live ID-only fallback test in Electron returns verified; no railway login password is transmitted by that check.

No payment or booking confirmation was submitted. Another physical PC has not been retested. These checks do not establish a new live login-to-QR timing result; the earlier performance comparison remains unfinished.
