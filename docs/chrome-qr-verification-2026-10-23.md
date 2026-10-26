# Chrome booking verification — 23 October 2026

No build, installer, deployment or payment was performed.

## Live result

The actual renderer Start button, Google Chrome launch, IRCTC login, browser-check journey, fresh login, actual booking countdown and PayTM QR generation completed. The QR was visible inside the booking panel after 258 seconds (4 minutes 18 seconds). The run was stopped at QR. This does not verify paid booking or success/PDF delivery.

The initial 120-second diagnostic was insufficient for this run: browser check includes passenger/review/payment navigation followed by a fresh login. An IRCTC logout response of 503 occurred, but this run recovered and completed fresh login. An earlier six-minute run stalled while selecting availability; that intermittent path is not proven resolved by one successful run.

Live evidence: `diagnostics/six-browser-e2e/extended-report.json` and `chrome-live-qr.png`. The diagnostic maximum is now ten minutes, and only Chrome was exercised in the extended successful run.

## Display fix and local verification

The live QR screenshot exposed a separate amount issue: the brand script copied the entire fare badge, including `AVL 4`, into Booking Amount. The renderer now prefers the QR event's provider amount, and its fallback extracts only a rupee amount from the fare badge.

A subsequent local synthetic Chrome replay deliberately supplied `AVL 4 · ₹ 162.25` in the fare badge and amount `1` in the QR event. The UI displayed `₹ 1.00`, its wait timer advanced to `00:00:01`, and it created zero Scan to Pay popup windows. Native panel ID remained 3. The existing native panel expanded from 348×241 to 348×320 for QR; identical dimensions through every stage are therefore not verified.

Evidence: `diagnostics/six-browser-e2e/display-regression-report.json` and `chrome-display-fixed.png`. This replay used a synthetic nonpayable QR and did not repeat the live booking.

Targeted verification: 23 tests passed across amount formatting, private browser behavior, scheduler browser selection and QR delivery.

## Remaining

- Repeat extended real QR verification on the other browsers after Chrome review.
- Investigate intermittent availability selection if it recurs. A separate local reproduction shows the recovered f1092 XPath fallback contains escaped quotes that are invalid XPath; the successful live run did not require a source change to that fallback.
- Success, PDF delivery and identical native dimensions across booking/QR/success require separate verification.
- Current IRCTC HTML and script filenames were fetched successfully in a browser; direct script-body requests timed out. A specifically dated 22 October website release has not been confirmed.
