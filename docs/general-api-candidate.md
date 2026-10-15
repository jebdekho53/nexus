# General API-search candidate — unreleased

Human requested Lexus-style General booking if it is faster, comparing through
actual QR. That comparison is not complete. No fastest route is selected and
no installed/public default is changed.

Inspection:

- Lexus `app/inject/direct_book_boot.js` calls session validation, train list,
  availability/fare and boarding, then waits using boarding
  `minPsgnInputTime` with 35000 ms fallback before passenger submission.
- Its `booking_direct.js` also contains a General gate to 07:59:59 in the
  machine's local timezone and retry budgets as high as 100 for some steps.
  Copying that engine wholesale would import unwanted scheduling/retry
  behaviour. It has not been proven faster or compatible with current Matrix
  sessions by a live comparison.
- Matrix already has a recovered `skipTrainSearch` setting and an
  `altAvlEnq/TC` priming path (`f2161`). Its option getter is `f3406`, wired from
  root context slot 1605 into `f3876`'s options. This existing path is reused;
  no Lexus credentials, client identity, anti-bot code or CAPTCHA service is
  imported.

Implementation is opt-in via a developer-only `--general-api-candidate` flag.
Managed releases ignore that flag. It applies only to loaded GN Auto forms:
reuse the login session through existing Direct login flags, then enable
the existing skip-search getter in that booking's AsyncLocalStorage scope.
Other forms/modes and concurrent scheduled bookings retain their settings.
Saved requests/quota are not mutated. Provider countdown implementation and
fallback are unchanged; 45 seconds was not replaced with 35 arbitrarily.

Validation: 61 app tests passed, covering routing, actual recovered option
getter execution, async/concurrent isolation, default/scheduled preservation
and existing pair/QR/activation tests. This verifies candidate selection, not
the complete authenticated enquiry pipeline or QR compatibility. Offline
startup smoke with the candidate flag passed with eight windows; availability
requests were blocked by the smoke harness as expected. This did not submit
credentials or test live API/QR compatibility.

The earlier live login-to-QR launch was rejected by automatic approval review.
No alternate execution method was used to retry that blocked action. Running
from a local app does not make external railway/payment requests offline.

For a valid speed decision, compare matched journey/class/quota/passengers,
gateway, browser and network; measure login-start-to-QR and booking-start-to-QR
separately, include failed trials and distinguish actual journey QR from any
warm-up event. No mock durations or historical mismatched samples should be
used to promote this candidate. Current installed/public release stays 1.0.10.
