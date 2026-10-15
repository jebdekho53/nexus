# Matrix 1.0.7 — downloaded installer extraction

The reported .NET exception occurred while reading the ZIP central directory.
Four downloaded 1.0.6 updater copies had intact ZIP contents but about 138 KB
of added prefix/overlay data. Their physical ZIP records moved while the
stored offsets did not. Python's ZIP reader compensated; the installer's
direct .NET ZipFile.OpenRead did not. The source of the download modification
has not been determined.

The installer now locates the physical central directory from the ZIP end
record and exposes a bounded stream with corrected relative positions. It
validates directory counts and all destination paths before stopping Matrix.
The same fix is included in the full setup and small updater. A read-only
`/S /verify /archive=<file>` mode validates/decompresses an archive without
installing or stopping any app.

Verification:

- The new Windows extractor successfully reads all four previously failing
  downloaded updater copies and the original published updater.
- Both new setup and updater pass normal/relocated-payload verification and
  reject a truncated archive. The actual wrapped updater EXE installs into
  an isolated target, preserving the runtime hash and saved marker.
- The updated app boots with eight rendered windows, no renderer errors,
  and toolbar version 1.0.7.
- 45 app tests and 14 control-plane tests pass.
- The corrected updater was also applied to this PC while Matrix was closed:
  exit code 0, installed version 1.0.7, eight existing saved profile files
  unchanged. Matrix was not automatically launched afterward.
- Published bytes and server SHA-256 values match the local artifacts.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Matrix-Setup-1.0.7.exe | 264670471 | 181b8b96695dcd1aed95f85c2e1f4f111d0cb0dd3c3faf6c694c0343dc595da0 |
| Matrix-Updater-1.0.7.exe | 27262823 | 89b804e627e8f01fc0c7c6ffa76afa639b8e3aa610d78f92fc1179499f018b52 |

No live login, booking or payment was submitted in this installer repair.
