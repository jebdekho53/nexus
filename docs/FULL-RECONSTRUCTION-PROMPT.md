# Matrix: complete project reconstruction handoff

You are taking over an existing Electron/Node.js project. Your assignment is the complete reconstruction of its recovered application logic into maintainable ordinary JavaScript, from the current checkpoint through a standalone source project. This is an implementation assignment, not just a request for advice or a plan. Work through verified milestones across sessions. Do not restart existing work or stop after reconstructing one payment method and call the whole project complete.

## Project and history

Workspace: `C:/Users/gurpr/OneDrive/Documents/ts/nexus`.
Git origin: `https://github.com/urbanmoveservices/nexus.git`.
Current product name: Matrix. Nexus is a historical name and remains in folder/repository names. Earlier recovery inputs may contain older vendor/product names. Preserve required compatibility without restoring retired vendor services or performing an indiscriminate global rename.

The project began with recovery of an installed Electron application. Recovered main-process functions are stored as instruction definitions and executed by a JavaScript engine. There is already editable application code, UI, integration code and a control-plane service. The objective is to replace the recovered execution dependency with understandable JavaScript while preserving intended features. Do not promise to reproduce unavailable original comments, identifiers or exact original source layout.

Historical product requirements include booking forms, saved account data and ID checking, availability display, General Book now and scheduled opening/Tatkal flows, Auto/Manual/Direct login modes, selected private browser behavior, independent pair ownership, payment method selection, QR display, booking status/ticket windows, detailed redacted timing logs, Matrix branding, owned release activation, developer mode without activation, admin/seller/customer-credit management and updates/rollback. Treat these as a preservation and audit checklist, not proof that every feature is currently verified. Do not invent endpoint contracts from historical URLs.

The immediate authorized task is SOURCE RECONSTRUCTION. Keep it separate from new feature changes, live service testing, production releases and speculative speed optimizations.

## Read and reconcile before editing

1. Applicable `AGENTS.md` instructions.
2. `TASK-STATE.json`.
3. `docs/ANTIGRAVITY-HANDOFF.md`.
4. `docs/reconstruction-progress.md` and numbered reconstruction reports, especially phases16–19.
5. `docs/reconstruction-inventory/README.md`, `functions.csv` and `functions.json`.
6. `git status`, recent commits and the relevant existing source/tests.

A later user request or newer actual changes take precedence over stale state documentation. Preserve uncommitted work. At preparation of this handoff, `src/main/payment/paytm-final-status.cjs` existed as an UNTRACKED file created after the saved checkpoint. Review it before implementing final-status logic; do not overwrite, delete or assume it has been verified. Check for another active worker before starting duplicate implementation.

## Verified baseline

- 4,354 recovered definitions, containing512,857 original instructions.
- 72 native main-entry replacements, with193 pinned definitions including supporting callbacks/dependencies.
- 1,069 full-suite application tests passed.
- Offline source smoke PID2308 completed8 DOM-ready screens with all72 factories and no native bytecode loaded.
- Code checkpoint `b056da7`; checkpoint documentation `b149d5a`; static inventory `6448ef9`.
- Public release1.0.11 remains unchanged by reconstruction. The candidate has not been built or deployed.
- Native entries cover4.05% of original instruction volume; separately pinned support covers0.78%. Neither value is an actual effort-completion percentage. Do not repeat the misleading claim that precisely98.3% of engineering work remains.

The size inventory has1711 tiny,1555 small,741 medium,288 large and59 very-large functions. Its structural review-load groups contain3128 low,862 moderate,305 high,53 very-high and6 extreme definitions. These are planning heuristics. Tiny callbacks are often part of their parent migration rather than separate engineering tasks. The largest59 definitions contain about29% of instructions.

## Architecture and tools

- `src/main/generated/index.cjs` and part files: recovered definitions, authoritative for existing execution behavior.
- `src/main/runtime/engine.cjs`: instruction interpreter, wrappers and captured-context behavior.
- `src/main/runtime/reconstructed-payment.cjs`: opt-in native factory adapter.
- `src/main/runtime/recovered-contract.cjs`: definition fingerprint helper.
- `src/main/payment/`: existing readable reconstructed modules.
- `src/renderer/`, `src/preload/`: UI and preload boundaries; inspect their actual dependencies before changing them.
- `services/control-plane/`: owned backend/control-plane code; inspect implementation/configuration rather than assuming database or deployment details.
- `test/`: behavioral comparisons and integration checks.
- `tools/review_recovered_function.cjs`: compact instruction listings with decoded static calls and preserved branch targets.
- `tools/classify_recovered_functions.cjs`: reproducible size/review inventory.
- `tools/export_payment_fixture.py`: static string fixture exporter. Local input paths are in the detailed handoff. Never export real sessions or profiles into fixtures.

Approximate readable-reference material can have incorrect branches. The generated instructions plus engine behavior, not approximate pseudocode, are the compatibility oracle.

## Complete execution roadmap

### A. Establish an accurate baseline

Reconcile new/untracked work, run relevant existing tests, map the migration adapter and determine remaining dependencies. Make a dependency/work inventory with statuses such as recovered, reviewed, native, verified, integrated and retired with justification. Keep feature validation separate from function counts. Identify shared infrastructure, trivial callbacks, constructors, bootstrap, dynamically generated page programs and unreachable code.

### B. Finish the payment subsystem

Continue PayTM WebSocket watcher `f1693–f1703` and final-status `f1712–f1716`, reviewing the untracked final-status file first. Redirect, QR request/response parsing, browser-page lifecycle, status polling and bank response are already native. Then reconstruct remaining PhonePe/Razorpay transports and other reachable payment dependencies. Use composed synthetic flows that exercise actual reconstructed methods, not only mocks of the method under test. Explicitly identify any remaining mocked edges.

### C. Reconstruct browser/session and booking controllers

Map and migrate remaining session/cookie helpers, browser lifecycle, pair ownership, login readiness, API orchestration, booking forms, availability, passenger flow and scheduling. Preserve the distinction between login timing, booking opening time and provider-required passenger waits. General Book now must not accidentally inherit scheduled opening gates. Do not change performance behavior merely to imitate another application without evidence.

Review constructors and field initializers before replacement; `f1614/f1616` need engine integration scrutiny. Preserve error paths, cancellation, race winners, mutable shared state and independent actor/browser ownership. Never close an unrelated pair's resources.

### D. Finish application and backend integration boundaries

Trace IPC/preload handlers, persistence/settings, renderer controllers, account/availability adapters, QR/status/ticket windows, logging, branding/assets and update/rollback integration into ordinary source. Inspect the existing admin/seller/activation/control-plane interfaces and maintain their legitimate contracts. Preserve owned release activation and key-free developer mode. Do not turn recovery into an unrelated backend rewrite or remove authentication to make tests pass.

### E. Replace bootstrap and remove production reliance on recovery

The `f1` bootstrap contains33,708 instructions and thousands of closure creation sites. Decompose it into reviewed initialization modules and explicit dependency wiring rather than blindly translating it into one giant file. Replace remaining dynamic recovered dispatch only after its callers are understood. Prove that the final ordinary-source execution path no longer depends on the instruction interpreter, generated recovered definitions, proprietary bytecode loading or decoder tables for application logic. Keep recovery material archived until no required caller or verification workflow needs it. Remove dead code only with documented reachability/equivalence evidence.

### F. Verify and document the standalone project

Provide reproducible dependency installation, source launch, tests, offline smoke, configuration examples and architecture/developer documentation. Verify from a clean checkout where practical. Preserve existing user data and distinguish source mode from installed release. Maintain a feature/flow matrix covering success, errors, cancellation, missing configuration and independent instances. Clearly mark any service-dependent behavior not yet verified.

### G. Prepare completion honestly

Finish all reachable application logic and required integration, or explicitly document any accepted exclusions. Remove the migration switch only after normal source startup uses the verified ordinary implementation. Do not claim full reconstruction merely because the app opens or a synthetic QR appears. Produce a final report listing architecture, migrated/retired/unresolved inventory, validation evidence and remaining limitations. Release packaging, live tests and deployment are separate actions requiring appropriate authorization; they are not part of this continuation's current permission.

## Method for each migration

1. Inspect actual instructions, branches, exception handlers, arguments, captured bindings, local closures and call sites.
2. Describe the observable contract: inputs, output/reference identity, state writes, request order/payloads, waits, callbacks and failure propagation.
3. Implement meaningful ordinary JavaScript with explicit dependencies. A wrapper that still executes the same recovered instruction definition is not a completed native migration.
4. Compare actual recovered execution and native execution with identical synthetic fixtures. Include boundary values, errors, cancellation, concurrency and timer behavior where relevant.
5. Pin the reviewed definition and callbacks with `definitionFingerprint`; also validate nativeId. The fingerprint includes execution metadata and handlers as well as constants/code. Do not use the obsolete partial hash formula.
6. Integrate through the existing opt-in factory bridge while unmigrated callers remain. Preserve wrapper metadata/interceptors/tracing and dynamic captured binding lookup.
7. Run focused comparisons, then meaningful broader tests and isolated source smoke at a coherent checkpoint. Update state, reports and inventory; commit verified changes.

Class-method root bindings commonly use `readBinding(slot, undefined, 1)`; root helpers commonly use depth0. Verify each capture rather than assuming. Explicit engine globals may be required: spreading globalThis does not include all nonenumerable builtins. Captured slot details and known legacy semantics are in the handoff and phase reports.

## Compatibility, privacy and permission boundaries

Preserve provider-required waits, access controls, authentication/CAPTCHA/rate limits, gateway validation, private-browser behavior and actor ownership. Do not introduce alternate transport/fingerprint tricks to bypass access denials. Do not restore retired vendor reporting `f2009` or old vendor destinations. An absence of literal vendor strings is not proof of absence of all possible outbound behavior; audit runtime integration separately using synthetic transports where possible.

Preserve the documented diagnostic privacy differences: native logs omit raw sensitive bodies, transaction identifiers, gateway URLs/query data and HTML/status snippets in the specified migrated paths. Some snip helpers still execute for compatible side effects/errors while their return is discarded. Do not enable the optional HTTP-record callback or a new recording destination by default. Never commit credentials, cookies, tokens, account/passenger records, real QR data or production secrets.

Current continuation permits offline/synthetic tests and isolated source smoke only. A prior authenticated automated launch was rejected by automatic approval review. Do not circumvent that rejection through another browser, tool, endpoint or launch path. Do not transmit stored credentials, make real bookings, submit payments, publish artifacts or deploy this candidate under this prompt. Seek a new explicit, applicable instruction for later live/release work; never claim those checks were performed from offline evidence.

Behavior-preserving reconstruction is separate from bug fixing: the legacy status poll has a broad SUCCESS-substring regex, and finalization has a repeated await after a timeout race. Preserve documented compatibility during migration; record potential corrections separately for a deliberate reviewed change.

## Runtime, continuity and completion criteria

Bundled Node: `C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Bundled Python: `C:/Users/gurpr/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.
Full tests: bundled Node with `--test test/*.test.cjs` from the project root.
Offline smoke: `.runtime/electron.exe . --development --smoke-test --reconstructed-payment`; clear ELECTRON_RUN_AS_NODE first, use an isolated profile/hidden launch and verify the NEW PID's completion, DOM readiness and factory count. Do not trust stale diagnostics. On another machine, locate compatible runtimes instead of blindly using these host-specific paths.

Use UTF-8 LF files. Do not overwrite unrelated work or create noisy whole-file formatting changes. Keep TASK-STATE.json, migration inventory and handoff accurate. Continue routine work without repeatedly asking questions. Ask only for genuinely missing contracts or decisions that affect implementation, and continue independent work meanwhile. Do not spawn agents without explicit authorization.

If context/quota is near exhaustion, save verified code, exact test commands/results, current commit, dirty files, unresolved failures and the next concrete action. Do not claim background work or automatic restart unless the destination environment actually supports and has configured it. The existing Codex fallback belongs to the original environment; another account/Claude must not assume it will resume their session.

Completion means a reproducible, documented ordinary-source application with all required reachable behavior migrated and meaningfully verified, with remaining external-service limitations disclosed. It does not mean reproducing unavailable original source text byte-for-byte. Start by reconciling the current checkout and final-status file, then carry this roadmap forward through verified milestones.
