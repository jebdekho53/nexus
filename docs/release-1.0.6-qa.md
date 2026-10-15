# Matrix 1.0.6

Native Chrome/Brave/Edge logins now use a separate temporary launcher profile
and an off-the-record browser context. Saved cookie pools are not restored.
Close/disconnect/logout disposes the context and removes the owned temporary
profile. A failed cleanup is reported in logs.

The recovered Auto preflight opened the bare IRCTC origin, whose redirect
produced a denied security-challenge page in the reproduced session. Using
the canonical `/nget/` application entry with the same Auto page setup loaded
the booking form successfully. Challenge URLs and denied responses are not
modified. An observed denial reports `IRCTC_ACCESS_DENIED` and prevents further
browser launches in that login run instead of claiming the IP is blocked.

The installer builder now regenerates the renderer's version asset from
package.json, keeping the toolbar and Updates labels consistent with the
installed package version.

Validation:

- 45 app tests and 14 control-plane tests pass; Git whitespace checks pass.
- Native browser probes verify the before/after entry-path result, zero initial
  cookies, isolation from a second context, and temporary-profile deletion.
- Full setup and small updater ZIP payloads pass integrity checks, contain
  version 1.0.6 and the new module, and exclude diagnostic/private account data.
- Actual updater EXE applies 1.0.5 -> 1.0.6 to an isolated installation, exits
  successfully, preserves the saved marker and leaves the runtime hash intact.
- The rebuilt updater is reapplied after fixing version metadata. Packaged
  startup, version labels, payment/login dropdowns and calendar are checked.
- Full authenticated login, CAPTCHA handling and QR generation were not
  retested for this release. No booking or payment was submitted.

Further packaged startup and publication evidence is recorded in TASK-STATE.json
and ignored diagnostic reports. See private-browser-qa.md for the diagnosis
and privacy limits, including abrupt-termination cleanup limitations.

Published artifacts:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Matrix-Setup-1.0.6.exe | 264667912 | f2af7a67e55a3df05ab9e9cae0033a0fba5a0f05cbc96ba813ca4c9a298e4997 |
| Matrix-Updater-1.0.6.exe | 27260263 | a0a4085c14e226afd7f399b200b3b4874f7693096882c8c463126172f94d8473 |
