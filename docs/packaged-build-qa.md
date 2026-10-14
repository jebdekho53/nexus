# Matrix packaged-build verification — 14 October 2026

The blank Account/Payment panel was caused by the Auto Book now label replacing the whole mode button and removing `loginModeVal`, which the booking initializer still needed. The label now changes only its text node. A saved valid form renders the account and Paytm QR correctly.

Release 1.0.2 also waits for Electron readiness before decrypting the saved activation key. Release data now lives under `%APPDATA%/Matrix/profiles/release`. Older install-folder profiles migrate once, and installer updates preserve existing files rather than deleting the saved profile. Developer profiles remain separate.

The existing hosted control plane is connected at `https://matrix.vaidya-gpt.com`. Administrator/seller/client state and credit persist in the server's atomic registry store under `/srv/matrix-data`; desktop forms and login details remain in local encrypted vaults. The panel defect did not require transmitting booking credentials to a new database.

Verification uses the actual EXE's extracted payload and separately the installed EXE, not only the source checkout. No payment or booking confirmation was submitted.

- 41 automated checks pass, including DOM element preservation, saved-key restart and profile migration.
- Packaged 1.0.1 Auto, train 13307 DDU–BSB, 20 October 2026, SL/GN: visible QR; login 32.72 seconds; login-to-QR 105.98 seconds. Session stopped and logged out.
- Packaged 1.0.2 starts using its retained server-issued activation, without displaying the activation screen again.
- Installed 1.0.2 reads the restored saved form: 1 stored, 1 readable.
- A separate Direct live run logged in and rendered account/payment, but its railway search form did not become usable; the browser closed and no QR was reached. This is a failed test, not a pass. Auto is tested separately.

Live test credentials, full keys, browser captures and detailed stage logs stay in ignored `diagnostics`. The shipped installer contains no QA credentials or user profiles.

Final packaged 1.0.2 Auto: visible QR reached; login 21.93 seconds, booking-to-QR 83.42 seconds, total 105.36 seconds. Account/payment loaded and the session was stopped/logged out without payment.
