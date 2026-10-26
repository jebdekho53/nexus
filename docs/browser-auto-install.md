# Matrix Browser automatic installation

Tools provides Download & Install when the Matrix-owned engine is missing, and Ready when the installed executable matches the pinned SHA-256. Copy link shares the fixed browser ZIP hosted on matrix.vaidya-gpt.com. Other browsers retain official download pages; they are not silently installed.

Pinned Matrix Browser 156.0.8078.48 package: 230782091 bytes, SHA256 d115c321aabb9c0c97ce1885139af0a717501d9d97acc7629f4cf4056c8e3f61. Corrected EXE SHA256 590f61577988fe9971bc551a9338d2d35d03b22ee2077028391680cec84834d3. The release server serves browser-manifest.json separately; main app release manifest is preserved.

Installer downloads over HTTPS with redirects disallowed and bounded size/time, verifies archive hash before extraction, checks ZIP paths/size through .NET, extracts in a staging directory, validates EXE identity, launches a local page, switches installation atomically and checks the final location. Existing installation is retained until the staged browser passes. Concurrent clicks share the operation; network/integrity failures leave prior installation intact. Windows temporary file locks have bounded retries. No system-wide software or admin install is needed.

Verified end to end from the hosted URL into an isolated diagnostics directory: online download, extraction, launch, readiness and repeat-click download skip. Offline/invalid archive tests also pass. Release Tools shows Ready / Copy link and fits its viewport without scrolling. Browser profiles are separate from the installation directory. No real booking/payment was performed. No Matrix app installer/updater was built or published.

Adding an npm SDK dependency alone does not ship the engine binary. This implementation manages the engine as an on-demand runtime dependency. Bundling it is possible in a future explicitly requested app build, at the cost of a larger installer. Existing 1.0.25 clients need updated Matrix app code for the new Tools behavior.
