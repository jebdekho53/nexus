# Nexus administration service

This service uses only the Lexus administration, seller hierarchy, key registry, ledger, signup, notice and optional USDT modules, rebranded and isolated for Nexus. The duplicate desktop, booking engines, installer, old releases, reports and customer databases are excluded.

Run `npm install` then `npm start`. Development defaults to http://127.0.0.1:8082. Production uses https://nexus.vaidya-gpt.com with `/admin`, `/seller`, `/signup` and `/client`. Persistent production data is `/srv/nexus-data`; it is separate from Lexus. The first administrator password is generated in `/srv/nexus-data/admin-access.txt`; it must never be committed. Cookies are HttpOnly, SameSite Strict and Secure on HTTPS. Browser writes require same-origin JSON requests.

The desktop uses the same `/api/license/activate` and `/api/license/verify` endpoints. `Nexus.cmd` launches the managed release; `Develop Nexus.cmd`/`start.cmd` launch the key-free developer build. Releases verify at startup and every five minutes. Expired, revoked or unverifiable activation prevents new logins/bookings and opens the activation screen; an ongoing payment is not submitted or automatically terminated by this check. Keys are stored using Electron OS encryption. No vendor licensing endpoint is used.

The copied USDT functionality is optional and requires the administrator to configure it; deployment imports no wallet/payment configuration. Downloads currently link to the source repository; no unsigned installer is presented as an available release.
