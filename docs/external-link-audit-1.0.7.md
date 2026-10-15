# Matrix 1.0.7 — external-link and legacy-vendor audit

Audit date: 15 October 2026 (India).

**Result: Matrix still contains legacy vendor dependencies. Rebranding and the
existing reporting overrides have not made the application fully independent.**
An isolated startup test confirmed attempts to download the old encrypted
remote configuration. Other vendor-dependent features remain in the code.

## Findings

| Priority | Finding | Evidence / state |
| --- | --- | --- |
| High | Old remote configuration is still requested at startup | Two GET attempts to `gist.githubusercontent.com/2jrp7sv7ddsketch/d2af45d107e3ba3120c9ab13a5aefd9e/raw/captcha.enc` were recorded and blocked in the test. `f4298` handles verification/cache/fallback and resolves service endpoint configuration. |
| High | RailOne server/sensor defaults still point to `simplycoding.uk` | `RAILONE_SERVER_URL` and `RAILONE_SENSOR_URL` are initialized to this host. `f3627`, `f3639`, and `f3640` use the server/sensor/auth configuration. These are functional references, not just a logo or a filename. No live RailOne credential request was made in this audit. |
| High | The old CAPTCHA-service path is still implemented | The decoded default includes `simplycoding.uk/telementry`. `f1778` builds external requests involving image/fingerprint information; `f3679` calls the solver path conditionally. This was inspected, not executed against a live service. |
| Medium | Additional old service defaults remain | Decoded strings include `simplycoding.uk/news`, `/ws/otp`, `/timeSync`, `/heatMap`, `/booksConfig`, `/analytics`, and `c9fe7387-f.b-cdn.net/news`. Presence alone does not prove they are called in every mode. |
| Reduced by existing overrides | Booking/client update reporting | The original `f2009` implementation includes booking/PNR/account/route metadata, but `development.cjs` replaces it with a skipped result. The old implementation is still shipped. |
| Reduced by existing overrides | Old licence/version config and analytics | `f2539`, `f2549`, and per-booking gate functions are overridden locally; returned config sets `extraAnalytics:false`. The `f3381` analytics path has corresponding skip conditions. This is not a global outbound-network deny rule. |
| Identity material | A shared RailOne client certificate and matching private key are bundled | `resources/railone/client_cert.pem` and `client_key.pem` form a matching pair. The certificate identifies the CRIS SUPERAPP client, not a Matrix-specific client. This does not by itself establish a TS/Brahmos callback; it is a separate shared-client dependency. No private-key contents are included here. |
| Cosmetic/internal | Legacy names remain in 20 source files | Some are recovered function/configuration names such as `brahmosLogin`; others are deliberate replacement/redaction rules. A name match alone is not evidence of a network connection. |

Domain ownership or present operator identity was not independently verified.
“Legacy vendor” here refers to configuration inherited from the recovered app.

## Source locations

- `src/main/generated/part-01.cjs:4904`: RailOne server default.
- `src/main/generated/part-01.cjs:4913`: RailOne sensor default.
- `src/main/generated/part-01.cjs:4922`: encrypted remote bootstrap URL.
- `src/main/generated/part-01.cjs:4949`: heatMap default.
- `src/main/generated/part-01.cjs:4958`: booksConfig default.
- `src/main/generated/part-01.cjs:4994`: analytics default.
- `src/main/generated/part-15.cjs:8719`: `f4298` remote bootstrap handling.
- `src/main/generated/part-22.cjs:5510`: `f3679` CAPTCHA handling.
- `src/main/generated/part-22.cjs:10170`: `f3640` RailOne auth configuration.
- `src/main/generated/part-22.cjs:10234`: `f3639` sensor configuration.
- `src/main/generated/part-22.cjs:11317`: `f3627` RailOne server client.
- `src/main/generated/part-24.cjs:10965`: `f3381` analytics/licence heartbeat.
- `src/main/generated/part-31.cjs:5499`: original `f2009` client reporting.
- `src/main/generated/part-32.cjs:1597`: original `f1778` external solver.
- `src/main/runtime/development.cjs`: current local overrides.

## What was tested

- Scanned 5,266 selected application, backend, dependency and native-resource
  files, including the 4,354 recovered function definitions. Literal URLs,
  decoded string comments, runtime-decoded URLs, legacy names and native
  ASCII/UTF-16 strings were considered. Library documentation URLs and XML/SVG
  namespaces are not treated as active connections.
- Compared 168 installed `src`/`resources` payload files against the source.
  Installed version was 1.0.7; there were **zero differences, missing files or
  extra files** in those two trees.
- Instrumented a disposable copy of the installed payload. Production source
  and the customer's installed application were not patched for this audit.
- Ran a 90-second smoke window plus a synthetic booking-panel test. Recorded
  fetch/HTTP/Electron/renderer request attempts before blocking them. Browser
  child launches were disabled. No real account, booking or payment was used.

Observed blocked requests:

| Destination | Attempts | Purpose |
| --- | ---: | --- |
| Old GitHub-hosted `captcha.enc` bootstrap | 2 GET | Legacy remote configuration |
| `matrix.vaidya-gpt.com/api/portal/downloads` | 1 GET | Matrix's own update service |
| `railways.makemytrip.com/api/user/status/<synthetic-id>` | 2 GET | Account-status check |
| `rails-cbe.goibibo.com/v1/irctc/validate/<synthetic-id>` | 1 GET | Account-status provider |
| `rails-cbe.goibibo.com/v1/search/refreshAvailabilty` | 6 POST | Synthetic availability checks |

The attempts above were blocked locally: they are evidence of a reachable
request path, not proof that the remote server received or accepted data.

## Other external services

The app also has IRCTC/Indian Railways, payment-provider, MakeMyTrip/Goibibo,
Railyatri/eRail, public-IP/speed-test, GoLogin/browser-download, Google warm-up
and optional Anthropic API references. These must be classified by feature;
being external does not make a destination a TS/Brahmos tracker. Matrix's own
activation/update/portal endpoints are hard-coded to `matrix.vaidya-gpt.com`.

## Limits and next work

This is not a proof of zero egress. The test did not execute live RailOne,
CAPTCHA, OTP, payment or every browser/native-DLL path. Native sockets,
browser-generated background requests, cached remote configuration and
runtime-constructed destinations need separate mode-specific validation.
Encrypted remote configuration was not fetched/decrypted for this audit.

The first cleanup priority is to replace/remove the legacy bootstrap and
establish a Matrix-owned endpoint configuration. RailOne/sensor/CAPTCHA/OTP/time
dependencies then need explicit feature-by-feature replacement or disabling.
Remove obsolete code/assets only after the corresponding features no longer
depend on them. Replacing visible names alone does not address these links.

Audit is complete; functional cleanup is a separate change. No production
feature or connection policy was changed by this audit. Private evidence is
in ignored `diagnostics/link-audit/` and the disposable test installation.
