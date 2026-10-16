# Matrix 1.0.11 — 16 October 2026

Adds passive payment request and payment-function durations, including request start, response latency and request completion. Logs do not include URLs, credentials, headers or bodies. Original payment-init/gateway/QR instructions match recovered TS after JSON normalization; no speculative request reordering or passenger timer reduction was made. Includes the source login readiness shared-budget fix; experimental General API candidate remains developer-only and opt-in.

Validation: 66 application tests passed; setup and updater pass original and relocated ZIP verification and truncated-payload rejection. Disposable updater installation preserves runtime and saved marker. Actual updated package renders all eight smoke screens with complete DOMs, offline and without native bytecode. No authenticated journey/QR test or speed improvement is claimed.

Full setup and updater uploaded to /srv/matrix-releases. Publication validates SHA-256 and sizes before atomic manifest replacement and retains previous manifest. Public /api/portal/downloads reports 1.0.11; both GET artifact endpoints return HTTP 200 with matching content lengths. Downloads page uses runtime manifest data rather than embedding release version in static HTML. Local development app restarted with latest code. No other services or browser processes were stopped.

{
  "version": "1.0.11",
  "name": "Matrix",
  "distribution": "windows-offline-installer",
  "notes": "Add private payment-stage and request timing diagnostics; improve login readiness settle budget. Required booking waits and gateway validations are preserved. QR speed improvement is not yet verified.",
  "offlineSetup": {
    "url": "/downloads/Matrix-Setup-1.0.11.exe",
    "bytes": 264686518,
    "sha256": "c0f0d62407d8c5040603a278dcc1e7ae5ec4f616e4dbfd3a5ec13b5107c54607"
  },
  "updaterExe": {
    "url": "/downloads/Matrix-Updater-1.0.11.exe",
    "bytes": 27270957,
    "sha256": "edd642ad108fedc1b6eac07739c2564db73d56c89d9b6629a0bafdcd93a8f065"
  }
}
