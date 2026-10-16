# Reconstruction phase13 —16October2026

Request getter f1652 and its six routing/preparation closures f1653–f1658 are native in payment/gateway-routing.cjs. Current total:58 entries,149 execution-metadata/code pins,787 full application tests passed. No live service/build/deployment occurred.

Forty-five tests compare getter-time request snapshots, detached get/post functions, pre-request hooks, option/timeout coercion, explicit direct-host routes, survivor routes, optional configured TLS path, response/error recording, cookie-log effects, browser-close classification and configured proxy fallback. The fallback classifier receives the full URL, not only the hostname; the tests caught and corrected that distinction. Fallback still requires proxyActive, both existing classifiers and the configured failure threshold. No route or transport is enabled by this migration.

The complete chain now runs native request routing around synthetic low-level requests. Its sixth comparison injects a browser-close error during bank settlement: the actor marks browserGone, reuses its already armed survivor context for bank and PNR requests, completes the booking result and disposes its own context. Parallel actor checks continue to pass.

The backing TLS transport f1633 and HTTP recorder f1649 remain recovered. Decoded instructions are available in diagnostics/f1633-review.txt and f1649-review.txt. f1649 is the HTTP record callback, not the TLS sender. Its optional callback receives request/response fields and truncations; review callback wiring/redaction before changing that diagnostic contract. Normal routing continues using the existing record method and existing retired-vendor guards.

Next migrate backing transport f1633/f1634–f1648 and recorder f1649/f1650/f1651 with actual recovered comparison tests and synthetic response facades, then remaining PayTM/PhonePe/Razorpay gateway methods. Full application reconstruction and live QR timing remain incomplete.
