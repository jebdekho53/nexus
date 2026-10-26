# TS 1.0.78 vs current Matrix: scheduled booking and browser audit

Static comparison dated 2026-10-24. TS target: `C:/Users/lexus/Videos/New folder/TS`. TS backend evidence is reconstructed bytecode, not original source. No live booking or browser launch was performed for this comparison; runtime speed and QR reliability remain unverified.

## 8AM booking

The implementations do not exactly match.

- Both retain an eightAm timing family, scheduled availability targets and clock synchronization. Matrix maps 8AM/LD/SS to this family (`src/main/booking/time-helpers.cjs:45`); TS exposes eightAm configuration (`analysis/main-reconstruction/readable/part-01.js:3258`). A displayed 7:45 AM login label must not be confused with the 8AM availability opening.
- Matrix currently wraps every `app:login` in `withImmediateLogin`, and its booking-box weblogin target response is null (`src/main/runtime/development-policy.cjs:63-73`). `booking-timing.cjs` then suppresses the recovered login target, including for 8AM. A local isolated probe confirmed 8AM returns the original target outside this context and null inside it. TS retains its recovered login-target calculation (`readable/part-06.js:7887`).
- This login bypass does not establish that booking submits early: Matrix availability has its own target wait (`src/main/booking/availability.cjs`, recovered f2269), independent of the suppressed login wait.
- TS contains additional alternate-date probe and original-date boarding branches, with explicit 8AM log messages (`readable/part-06.js:6486,6606,6982`). Those messages are absent from Matrix's recovered baseline. Exact branch equivalence is not established from decompiled pseudocode alone; treat this as a candidate algorithm difference requiring controlled runtime validation.
- Matrix already skips warm-up in the five minutes before its target (`src/main/compiled/part-03.cjs:944-949`). TS widens this proximity interval to include five minutes after the target (`readable/part-05.js:11350-11395`), avoiding a warm-up on a late start. This is not a measured speed improvement.

## Chromium launch

- TS resolves a saved `FINGERPRINT_CHROMIUM_PATH` and has a Fingerprint Chromium download integration pointing to `adryfish/fingerprint-chromium/releases/latest` (`readable/part-01.js:11206,9603`; persisted setting in `part-09.js:10936,13125`). Its launcher contains fingerprint seed, brand, platform, concurrency and locale flags (`part-01.js:19370`).
- Matrix's scoped fingerprint resolver uses `chromiumEngine()` instead (`src/main/runtime/private-browser.cjs:57-75`). This searches standard local Chromium and Playwright cache locations (`browser-engines.cjs:21`), including `LOCALAPPDATA/Chromium/chrome-win/chrome.exe`. It does not honor the saved fingerprint executable in that override.
- Consequently, Matrix's Chrome Advance label does not imply TS's executable or fingerprint behavior. Ordinary Chromium cannot be assumed to implement the specialized flags.
- Matrix preserves the selected fingerprint provider, clears login cookie state, uses a temporary profile plus an explicit incognito context, passes the proxy, and prevents an automatic second launch (`private-browser.cjs:38-55,110-129`). Brahmos has a separate engine resolver. TS also supports profiles/persistent launch and contains browser fallback paths; exact fallback ordering remains uncertain in reconstructed code.
- The user's successful manual Chromium startup proves that executable opens in their session. The earlier Chrome QR result of 107.85 seconds was neither an 8AM comparison nor a Chromium speed result.

## Other confirmed TS additions

| Feature | TS evidence | Current Matrix difference |
|---|---|---|
| Test all saved proxies, results and persisted last-test metadata | readable/part-10.js:971,1172-1350 | No equivalent Test All/results UI |
| RailOne shared token hub: inspect, collect and clear | readable/part-09.js:13616,13631,13689 | Local runtime advertises railOne:false |
| RailOne stop pairing / forget saved login | readable/part-10.js:2194,2221 | Additional TS handler symbols |
| Saved hide-browser preference | readable/part-10.js:6305,6322 | No matching tools toggle; hiding itself already existed |
| Warm-up skip after scheduled target | readable/part-05.js:11350-11395 | Matrix only has the inherited pre-target interval |

Matrix has separate local customizations: private browser isolation, single-window booking/QR/success presentation, and ticket export handling. Their presence does not prove better booking performance.

Do not count the durable usage ledger, dummy UI warm-up, resume skip, Paytm QR or payment fallback as new TS features: these already occur in Matrix's recovered baseline. The net 167 additional recovered functions is not a count of new features.

Priority findings: restore intended scheduled-login semantics if exact TS timing is desired; decide whether Chrome Advance should use Fingerprint Chromium or ordinary Chromium; validate 8AM alternate-date behavior with controlled evidence before porting reconstructed branches. No core code was changed by this audit.
