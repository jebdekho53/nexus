# Reconstruction phase 10 — 16 October 2026

Provider QR polling f1673/f1674–f1677, encdata fetch f1678/f1679/f1680 and command classification f1603/f1604 are native. Current total:49 entries,129 pinned definitions,663 full application tests passed. No live service request, build or deployment occurred.

Fifty-two new tests compare the actual recovered state machine: required IDs, default bounds, stop checks, command parsing/classification, paid/declined results, unusable/network error counters, fifth-failure fallback, parse/request/header failures, optional wait callback, custom/internal sleep, deduplicated logs and encdata aliases. Classifier tests cover success-before-pending-before-decline precedence and field/coercion matrices.

The command payload/headers are built once before polling. Five consecutive unusable/network failures enable the statusCheckRedirect fallback in the same iteration; usable responses reset the error count. A paid command still fetches encdata; fallback success extracts its own response encdata. The original short-sleep behavior is preserved: sleeps below60% of interval do not consume an attempt, capped at60 extras. One configured attempt therefore permits61 polls under zero-duration synthetic sleeps. This is existing bounded Check-now behavior, not a newly introduced faster polling policy.

The full chain now runs native QR command polling, classification and encdata extraction against synthetic HTTP. A fourth comparison case returns pending then paid and verifies the10000ms requested wait, two command calls and one encdata request. Actual money movement, credentials, browser traffic and real QR speed remain untested.

Next: bankResponse f1681/f1682 with provider interstitial delay parser f1611, then remaining gateway/session transport and other payment providers. The current full-chain test still mocks bankResponse and survivor arming/proxy effects. Preserve provider-specified delay and one-time encrypted form submission when migrating bankResponse.
