# Matrix 1.0.5 — release checks and small updater

The recovered version gate returned only the locally installed version. The old Updates page consequently labelled 1.0.3 up to date without consulting the published Matrix release manifest. A new local Updates bridge and readable renderer now fetch the same `/api/portal/downloads` manifest used by the website. Network failure reports “Could not check”; it does not claim the app is current.

Check now displays a newer published version and offers Download & install update. The updater download is restricted to the fixed Matrix HTTPS origin and exact version filename, bounded to 64 MB, and verified against the manifest byte count and SHA-256 before execution. Auto-update preference is stored in the persistent user profile and applied on release startup. Development checkouts are not automatically overwritten.

The download page offers both the 252.4 MiB full setup and 26.0 MiB updater EXE. The updater carries app source, resources and package metadata; it reuses the installed Electron runtime and dependencies. It requires an existing Matrix installation. Updates preserve profile files and refresh the shortcuts. The older 1.0.3 checker needs this updater run once; server changes alone cannot replace its local implementation.

Validation:

- 37 app tests and 14 backend tests pass.
- Manifest origin, exact version path, size limits and hashes are validated; corrupted/truncated downloads are rejected and removed.
- Actual updater EXE updates an isolated installation from 1.0.4 to 1.0.5. Electron runtime hash remains unchanged and a saved-profile marker is preserved.
- The updated installation boots, renders the synthetic booking panel and passes its dropdown/calendar/timer checks.
- An actual Electron UI harness reporting installed 1.0.3 identifies the live 1.0.5 release, displays the install button, responds to Check now and saves the auto-update setting.
- Both published files match their server-side SHA-256 values; the updater download returns HTTP 200 with the expected size.
- The live website shows both versioned download buttons and sizes.

No customer installation, booking or payment was interrupted during testing. Private test files and screenshots remain excluded from shipped packages and Git.
