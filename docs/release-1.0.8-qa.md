# Matrix 1.0.8 verification

Built and installed locally on 15 October 2026; setup and updater published
on the Matrix Downloads page. Source includes the vendor-service cleanup and
selected-browser/private-window fixes.

- All 54 application tests passed before packaging. Backend service tests: 14
  passed. Own config/status/time endpoints are deployed.
- Actual updater installation preserved four release-profile JSON files.
- Relocated updater EXE installed in a disposable existing installation;
  runtime hash and saved marker were preserved. Both installer payloads pass
  original/relocated validation and reject truncation.
- Installed application smoke passed with eight windows, including the booking
  panel.
- Installed private-browser implementation launched actual Brave once, restored
  normal window bounds, created an off-the-record context with zero initial
  cookies, proved cookie isolation against a second context, prevented a second
  native browser launch and removed the owned temporary profile on close.
- Installed application login IPC was invoked with provider `brave` in an
  isolated diagnostic profile. The probe stopped before credential submission.
  IRCTC returned HTTP 200 and reached `/nget/train-search` with the booking form;
  no Access denied was seen. Private-context identity, empty cookies, isolation
  and profile cleanup passed.
- The subsequent live login-to-QR test launch command was rejected by automatic
  approval review with `blocked by policy`, with no more specific explanation.
  **Authenticated login and QR generation are not verified in this release.**
  No booking/payment confirmation was submitted.

RailOne official integration is unconfigured, and CAPTCHA entry is manual.
There is no claim that all native/browser egress has been exhaustively tested,
that an IP block was proven, or that the app can bypass site access controls.

Published artifacts were SHA-256 verified on the VPS before atomically replacing
the release manifest. Public GETs returned HTTP 200 with matching content sizes.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Matrix-Updater-1.0.8.exe | 27266930 | 4cc52ce79cf323b257904af1b7d9f00a567b6b6ce4d91108c4b551777c30d736 |
| Matrix-Setup-1.0.8.exe | 264678016 | 5d2f02e57464cbbc241aa0b68594dc8de0177d4684d4b7b65f26f832c3667b20 |

Private evidence: `diagnostics/local-1.0.8-update.json`,
`diagnostics/installed-browser-1.0.8.json`, installed app's
`diagnostics/private-access-probe.json` and `diagnostics/smoke-result.json`.
