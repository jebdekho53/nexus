# Private browser and IRCTC entry diagnosis

Verified locally on 15 October 2026. This change covers native Chrome, Brave
and Edge providers through their shared f184 launcher.

## Reproduction and result

- Ordinary Chrome and manually opened Incognito loaded the IRCTC application.
- Matrix's original Auto navigation displayed an Akamai/IRCTC Access Denied
  page mentioning `/_sec/cpr/challenge`. This alone did not prove an IP block.
- A fresh Matrix private context opened `https://www.irctc.co.in/nget/` directly:
  HTTP 200, application form present, no denial.
- Instrumented Auto navigation showed a Google preflight followed by the bare
  IRCTC origin `https://www.irctc.co.in/`. That route redirected to `/nget/`
  with the denied challenge page, despite the navigation response being 200.
  No saved IRCTC cookies were present before this navigation.
- Repeated the same Auto page setup and Google preflight, changing only the
  bare IRCTC entry to the canonical `/nget/` application entry. The application
  loaded at `/nget/train-search`, form present, no denial.

This identifies a reproducible client entry/redirect-path problem. The site's
internal security rule is unavailable; no claim is made about its exact WAF
classification. Challenge URLs and security responses are not altered.

## Privacy and failure behavior

Each native launch gets an owned temporary profile and a new off-the-record
browser context. Saved cookie jars/pools are not restored into new logins.
Normal user browser profiles are not used as the browsing context. Proxy
settings remain explicit. Context close/disconnect/logout cleans the context,
native browser and temporary profile. Cleanup failures are logged.

Actual browser checks confirmed zero initial cookies, zero cookies in a second
context after adding a synthetic cookie to the first, and removal of the owned
temporary profile after close. Incognito is session isolation, not a promise
that the OS, network or website retains no records. Abrupt process termination
is not covered by the successful graceful-close cleanup verification.

An observed IRCTC challenge denial terminates the login with the explicit
`IRCTC_ACCESS_DENIED` result. Another browser is not launched for that denied
run. Independent concurrent logins keep independent state.

## Checks and limits

The app test suite passes. Native page-access probes run through the real
recovered Auto page setup; they stop after page inspection. Credentials were
not submitted by those probes. Full authenticated login, CAPTCHA, booking and
QR generation were not verified by this change. No booking or payment was
submitted. Diagnostic reports/screenshots remain in ignored `diagnostics/`.
