# Matrix service ownership and privacy cleanup

Implemented 15 October 2026. The deployed control plane now serves
`/api/desktop/config`, `/api/desktop/status` and `/api/desktop/time` on
`https://matrix.vaidya-gpt.com`. These routes expose fixed capabilities and
server time only. They do not receive account/password/booking details and
make no upstream vendor calls. Desktop configuration cannot supply scripts,
arbitrary URLs or turn on unsupported integrations. Server time is diagnostic;
it does not alter booking timers.

The source desktop replaces the encrypted GitHub bootstrap/cache loader with
local configuration. Its inherited remote CAPTCHA and RailOne client entry
points return explicit unavailable errors; heartbeat and booking/account
reporting are skipped in both development and release. Known vendor endpoints
are replaced at string decoding with a reserved `.invalid` sentinel to satisfy
the recovered configuration validator. The sentinel and original vendor hosts
are rejected before the guarded HTTP/fetch/Electron transports. Provider URLs
and Matrix activation/update endpoints are preserved.

Tools contains a service-status check showing local/online configuration,
round-trip latency, clock difference and unsupported integrations. The IPC
accepts only the local Tools page. Manual CAPTCHA and existing WebLogin remain
the supported route. This is not a replacement for RailOne's official
authentication/sensor integration or a CAPTCHA-solving service.

## Evidence and limits

- 52 application tests and 14 backend tests passed; checks include data-report
  no-ops, endpoint rejection before transport, schema failures/offline fallback
  and local-page IPC isolation.
- Public GET requests to all three new Matrix endpoints returned HTTP 200.
- Isolated before/after startup trace: pinned GitHub bootstrap attempts fell
  from two to zero. Matrix update and provider availability requests remained.
  These diagnostic smoke requests were blocked locally, not sent live.
- The isolated patched desktop completed startup with eight windows. The first
  experiment exposed empty-URL validation failures; reserved blocked sentinels
  fixed those failures.
- Raw recovered definitions, encrypted strings and inherited native resources
  still exist. These are not proof of a live callback, but static names alone
  cannot establish that the app has no remaining data-sharing path.
- A repeatable native marker check scanned seven resource/dependency EXE,
  DLL and Node addon files in ASCII and both UTF-16 byte alignments. No literal
  matches for the six known vendor/bootstrap markers were found. This says
  nothing about encrypted/constructed URLs or unrecognized callback hosts.
  Run `python tools/audit_native_vendor_markers.py` to repeat the check; its
  private report records each file's SHA-256 without dumping binary strings.
- No exhaustive native-library/socket or live RailOne/OTP/payment/browser trace
  was performed. Global JavaScript transport wrappers are not an OS firewall.
  Do not claim the previous vendor can never identify the app or that every
  runtime path has zero outbound traffic.
- Published Windows installers remain 1.0.7; this desktop cleanup has not yet
  been released or applied to the user's installed app. Own backend routes are
  deployed. A new release requires final packaging and release-mode validation.

Private redacted request summaries are in ignored `diagnostics/link-audit/`.
The earlier audit report describes the pre-cleanup 1.0.7 release.
