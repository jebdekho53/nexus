# TS 1.0.78 versus current Matrix — 24 October 2026

Comparison targets:

- TS: `C:/Users/lexus/Videos/New folder/TS/resources/app.asar`, its supplied extracted tree and backend recovery artifacts.
- Matrix: current working tree at `C:/Users/lexus/Documents/nexus/nexus/nexus`; package version **1.0.21**, reconstructed from the **TS 1.0.74** backend plus handwritten runtime/UI changes. Matrix and TS version numbers are separate release sequences.

**Result:** Matrix is not simply a renamed copy of TS 1.0.78. It uses an older recovered backend with extensive local changes. TS 1.0.78 has additional backend code and different renderer bundles. Much of the dependency stack and native resources is shared. No honest single “percent different” behavioral figure can be derived from these artifacts.

## Quantified differences

| Measurement | Matrix recovered base/current tree | Supplied TS 1.0.78 | Interpretation |
|---|---:|---:|---|
| Recovered cached functions | 4,354 | 4,521 | Net +167 / +3.84% in TS; not proof that exactly 167 independently useful features were added |
| Bytecode instructions | 512,857 | 538,755 | Net +25,898 / +5.05% in TS |
| Renderer files | 107 | 80 | Direct path-based SHA-256 comparison below |
| Preload files | 3 | 1 | Shared `index.js` differs; Matrix has two additional files |
| Selected top-level dependency versions | 12 inspected | 12 inspected | 11 same versions; Brahmos engine differs |
| RailOne/TLS resource files | 4 inspected | 4 inspected | All 4 byte-identical |

Renderer path/hash comparison:

- **22 identical paths/files**.
- **36 shared paths with different bytes**.
- **22 TS-only paths**, including version-hashed bundles and `railone.html`.
- **49 Matrix-only paths**, including Matrix scripts/styles/assets and older version-hashed bundles.

Of the 58 shared renderer paths, 36 differ (62.07%). This is a file-byte metric, **not 62.07% changed functionality**. Renamed/version-hashed bundles appear as “only” paths even when they implement similar features. The 21 shared HTML entry points differ; theme/markup/script changes contribute substantially.

## Backend/interface differences

The supplied TS recovered handler map contains **160 IPC registration candidates**. Matrix’s offline-decoded base contains **174 channel definitions**, not 174 proven registrations. These are different kinds of inventories and must not be compared as API counts directly.

Nine TS handler symbols are absent from the Matrix base’s decoded channel-definition object:

- `ClearRailOneHub`, `GetRailOneHub`, `StartRailOneHubCollect`.
- `ForgetRailOneLogin`, `StopRailOnePairing`.
- `GetHideBrowser`, `SetHideBrowser`.
- `TestAllProxies`, `DevLog`.

Every shared symbol in these inventories has the same channel literal. Matrix also adds handwritten `matrix:*` IPC handlers outside the recovered base; this comparison does not count them as recovered functions.

Evidence: `diagnostics/ts-comparison/ipc-comparison-corrected.json`, `matrix-base-ipc-definitions.json`, and TS `analysis/main-reconstruction/readable/ipc-channels.json`.

## Feature differences supported by artifacts

| Area | TS 1.0.78 | Current Matrix | Evidence strength |
|---|---|---|---|
| Main backend | Bytenode loader executes shipped `index.jsc` | Editable compiled JavaScript reconstruction; interpreter available as migration path | Direct entry-file/source inspection |
| RailOne | Separate `railone.html`; hub/token collection, stored-login/forget and pairing-stop candidates | Matrix service capabilities return `railOne:false`; inherited RailOne code still exists | HTML + IPC + runtime source |
| Proxies | Test-all button and results modal (`testAllBtn`, `resultsModal`, etc.) | Individual proxy/UI support; these TS bulk-test controls absent from Matrix HTML | Direct DOM-ID comparison |
| Browser controls | `hideBrowserToggle` plus Get/SetHideBrowser handlers | Matrix forces visible fresh private contexts; removes saved cookie reuse in reviewed login hooks | UI/IPC versus Matrix runtime source |
| Warm-up/login | Different UI warm-up / review/payment-page handling strings and recovered functions | Older base plus Matrix private-session, login-performance, timing and General Book now changes | Candidate code differences; no cross-version performance benchmark |
| Paytm | Different QR/error/settlement strings; dedicated recovered function paths | Matrix’s reconstructed payment modules and inherited handlers | Static candidates; not proof TS is faster or more reliable |
| UI/layout | Original TS UI and newer hashed bundles | Matrix styling, fixed 348×241 booking/QR/success window, detailed receipt, six-browser chooser | Current markup/styles/runtime |
| Scheduler | No Matrix custom scheduler IDs in checked TS booking HTML | Custom schedule type/time/browser/offset controls | Direct HTML comparison |
| Availability action | Backend check handler exists | Matrix adds explicit form availability button and hint | Direct HTML + handler evidence |
| E-ticket download | Original exporter/backend | Matrix automatic full ERS export into Downloads/Matrix Tickets, white PDF background | Matrix source changes |
| Licensing/update | Original publisher mechanisms and configuration | Matrix activation/update/portal endpoints and key-free source policy | Entry/runtime source |

The old and new readable pseudocode string sets share 1,938 strings of length >=12 (with alphabetic text); 1,761 occur only in TS readable output and 283 only in the old readable output. These figures are reading-aid candidates: decoder/reconstruction coverage and renamed code can create differences without a new feature. They are not a semantic similarity score.

## Dependencies and native resources

| Dependency | Matrix installed package | TS installed package |
|---|---|---|
| brahmos-engine | 2.0.3 | 2.1.0 |
| patchright / patchright-core | 1.63.0 / 1.63.0 | 1.63.0 / 1.63.0 |
| bytenode | 1.6.0 | 1.6.0 |
| cycletls | 2.0.5 | 2.0.5 |
| koffi | 3.0.2 | 3.0.2 |
| undici | 6.27.0 | 6.27.0 |
| ws | 6.2.4 | 6.2.4 |
| gologin | 2.2.8 | 2.2.8 |
| libsodium-wrappers | 0.8.4 | 0.8.4 |
| qrcode | 1.5.4 | 1.5.4 |
| zod | 3.25.76 | 3.25.76 |

Matching package versions do not prove every dependency byte is identical. Full recursive dependency hashing was stopped because of the large tree; only the reported selected versions and four resource hashes are established. The four native-resource comparisons include RailOne certificate/key files and TLS client resources; private key content was not copied into this report.

## Privacy/network differences

**TS still contains original reporting paths.** Its decoded configuration includes `simplycoding.uk` for RailOne/services, `/telementry`, `/analytics`, `/ws/otp`, `/timeSync`, and the pinned encrypted GitHub bootstrap. Reporting code builds fields including `irctcId`, `pnr`, fingerprint/device, payment/login information and routing metadata. Persistent client-update ledger/retry handling is also present. Static evidence does not establish that every request is made in every mode or that passwords are in these reporting payloads.

Useful TS locations:

- `analysis/main-reconstruction/readable/part-01.js`: original endpoint defaults.
- `analysis/main-reconstruction/readable/part-06.js:4882`: reportClientUpdate path; `irctcId`/PNR fields around lines 4924–4925 and subsequent encrypted reporting options.
- `analysis/main-reconstruction/readable/part-09.js:2259`: durable client-update ledger initialization/retry state.
- `analysis/main-reconstruction/readable/part-09.js:6947`: another client-update reporting construction path.

**Matrix blocks selected inherited vendor paths** using `src/main/runtime/legacy-services.cjs` and overrides such as `f2009`. That is a material runtime-policy difference from the supplied original TS entry point. It is not proof that Matrix has zero external reporting.

**Matrix also adds its own external flow:** mobile QR upload and remote start/stop polling at `matrix.vaidya-gpt.com`, plus activation/status/update services. The earlier Matrix audit found unauthenticated/non-device-partitioned relay paths in checked backend code. These issues are not resolved merely by changing the TS brand.

All **35 URL-host literals** extracted from the supplied TS readable backend were also present among the Matrix base’s offline-decoded host candidates. That means no new hostname was identified by this particular comparison—not that paths, payloads, runtime activity or security properties are identical. See `docs/external-servers-2026-10-24.md` for Matrix’s classified network inventory.

No conclusion that “all ID/password/ticket data is sent to TS” is justified from this comparison. Account/PNR reporting code is concretely present; password transmission and historical server receipt require separately scoped payload/runtime evidence.

## Artifact identity and trust in existing analysis

Recomputed TS ASAR SHA-256:

`84672496f5743e9ba4e1b0d532d0783c1125ad423947815cc02e5aa9f2b5a31c`

This matches the supplied saved REA summary identity, so its static package inventory applies to the selected ASAR. The saved parent evidence ID is `ev_33310c8f5eeae8577e67e7b14042e2019c15b66d9575259af9f7f327af295ef8`; it reports partial graph coverage and resource constraints. This report reuses that existing evidence; it does not claim a fresh REA analysis run.

Recomputed supplied main `index.jsc` SHA-256:

`0223ec92d0ca9ff6d9797f6a4d6c9709b0a3532340d0e52c9372b3e81692cd5d`

It matches the supplied backend recovery verification. That recovery reports 4,521 functions, 538,755 instructions and zero invalid direct jump targets. Its approximate JavaScript is not original source or proven executable reconstruction.

REA MCP tools were absent; the read-only doctor reported Codex registration drift and absent native engines. No registration or client configuration was changed. Existing identity-matched REA evidence and ordinary offline file/hash/pseudocode inspection were sufficient for this comparison. TS.exe and the supplied original application were not launched, and no external server was contacted by the target.

## What remains unknown

- Exact one-to-one mapping of all changed functions across 1.0.74 and 1.0.78. A net function count is not a count of wholly new functions.
- Whether newer TS booking changes improve live QR speed/reliability. No live TS login, booking, CAPTCHA or payment run was performed.
- Full dependency/native behavioral equivalence, dynamic downloaded configuration/code, and actual deployed server behavior.
- Complete absence of credential leakage in either application.

Comparison evidence: `diagnostics/ts-comparison/comparison.json`, `renderer.csv`, `preload.csv`, `dependency-versions.json`, `native-resource-comparison.json`, `ipc-comparison-corrected.json`, and `feature-string-differences.csv`. The supplied TS folder was read only; application source/runtime behavior was not changed by this comparison.
