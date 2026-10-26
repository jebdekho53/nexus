# Working preferences

- Run targeted checks for the changed area. Use `npm run test:admin`, `npm run test:booking`, or `node tools/run-tests.cjs desktop` as appropriate. `npm test` is a focused core regression check, not the full historical reconstruction suite.
- Do not repeatedly run every test for small changes. Run `npm run test:full` only when explicitly requested or a broad runtime change leaves a specific unresolved cross-module concern. Summarize test counts/failures instead of printing long passing-test logs.
- Avoid adding tests that only assert static CSS/HTML text for reversible cosmetic changes. Use visual inspection where useful; retain meaningful booking, security, licensing and data-integrity checks.
- Do not build or publish installers/updaters until the user explicitly asks again. Local 1.0.26 artifacts existed before this preference was given; they have not been published.
- Desktop branding uses the approved logo instead of decorative MATRIX text prefixes. Keep common button styling in `src/renderer/matrix-visual.css`: primary actions use emerald/teal #22d6a1, secondary actions use the shared dark treatment, and destructive/stop actions remain red. Avoid adding page-specific blue primary buttons.
- Distribution target is Windows only. Do not produce macOS/Linux builds or include their platform binaries/artwork in the Windows payload. Preserve required Windows DLLs, runtime data and license notices. Browser engines are installed on demand rather than bundled in the main app.
