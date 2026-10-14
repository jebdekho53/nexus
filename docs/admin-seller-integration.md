# Matrix admin/seller integration

Live service: https://matrix.vaidya-gpt.com/admin and /seller. Separate Docker container matrix-service, internal8082, HTTPS via existing Caddy. Persistent data /srv/matrix-data, separate from Lexus. Private administrator access is stored locally in diagnostics/matrix-admin-access.txt and on the VPS in /srv/matrix-data/admin-access.txt, excluded from Git and packaging.

Launch Matrix.cmd for managed release activation. Launch Develop Matrix.cmd/start.cmd for the key-free developer build. Tools offers Administrator, Seller and My key shortcuts. Release own-key verification occurs at startup and everyfive minutes; expired/revoked/unverifiable activation blocks new logins/bookings. Original vendor gates remain removed.

Validation:36 existing/integration tests plus local portal-origin test passed;9 developer-mode screens and syntheticstorage smoke passed. Real Electronrelease QA confirmed no controller before activation and a ready controller after valid own-server key activation. Temporary QA key was revoked and subsequent verification rejected it. No booking/payment was performed during this integration. Existing Lexus/n8n remain healthy.

Only requiredadmin/seller/key/ledger/signup/notice/payment modules copied. Original Lexus app, otherbooking engines, installer, runtimes, private registries and customerstores are not included in Matrix integration; original input preserved ../lexus-reference. No existing customers or sellers were migrated.

Git source excludes executable/runtime dependencies, customerdata, credentials and SSH/PEM keys. The portable local ZIP includes the desktop runtime and vendor dependencies. The webdownload page does not advertise a nonexistent installer.
