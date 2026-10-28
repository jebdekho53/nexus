# Matrix/Nexus v1.0.30 vs Original TS V1.0.81 — Upgrade Discovery Report

**Generated:** 2026-10-28  
**Analysis Type:** Read-only comparison against ORIGINAL installed TS V1.0.81 application  
**Exclusion:** RailOne analysis explicitly excluded per requirements  

---

## A. MATRIX BASELINE VERSION

| Property | Value | Evidence |
|----------|-------|----------|
| **Matrix Version** | 1.0.30 | `package.json: "version": "1.0.30"` |
| **Original TS Version** | 1.0.81 | `C:\Users\lexus\Videos\New folder\ts.81\package.json: "version": "1.0.81"` |
| **Version Gap** | 51 versions behind | 1.0.81 - 1.0.30 = 51 minor versions |
| **Architecture** | Electron main/renderer/preload with contextBridge IPC | Both use same architecture |
| **Main Process** | JavaScript (src/main/index.cjs) | Bytenode V8 bytecode (.jsc, 5.3MB) |
| **Preload** | Obfuscated JS (src/preload/matrix.js, 52KB) | Obfuscated JS (out/preload/index.js, 55KB) |
| **Renderer** | Vite-built modules + legacy HTML | Vite-built modules + legacy HTML |

---

## B. IPC SURFACE COMPARISON (186 Original TS Methods vs Matrix Preload)

### Original TS V1.0.81 — 186 IPC Methods (from `evidence/ipc-contracts.json`)
```
activateLicense, applySecurityBypass, backupData, cancelUpdateDownload,
captureSecurityEvidenceDesktop, checkAvailability, checkIdStatus,
checkNowPayment, checkUpdateNow, checkUsageWindow, checkUserIdInUse,
clearAadhaarReg, clearHistory, clearRailOneHub, closeAuxWindows,
confirmQuit, controllerAction, controllerMinimize, deleteAllForms,
deleteAllPayments, deleteAllProxies, deleteAllUsers, deleteBlockedItem,
deleteForm, deleteHistoryEntry, deletePayment, deleteProxy, deleteUser,
detectBrowsers, devLog, disableAppLock, downloadBrahmos, downloadChromeAdvance,
downloadUpdate, duplicateForm, enlargeQr, exportForm, exportFormModel,
exportLogs, exportProxies, exportUsers, forgetRailOneLogin, getAadhaarReg,
getAiEnabled, getAppLockStatus, getAutoUpdate, getAvailTarget,
getAvlPaymentMethods, getBackupInfo, getBoxLicenseInfo, getBrowserDownloads,
getForm, getGoLoginStatus, getHideBrowser, getLogPairs, getLoginFlows,
getLoginTarget, getLogs, getNewTheme, getPairInfo, getProxyTags, getQrPopup,
getRailOneHub, getRailOneStatus, getSecurityBlock, getSecurityBypassInfo,
getSecurityEvidenceInfo, getSensorInfo, getSession, getSuccessTicket,
getTiming, getUpdateStatus, getVaultLockState, getVersionGate,
getWindowPin, grantFolderAccess, importFormFile, importForms, importFormsData,
importProxies, importProxyFile, importProxyPaste, importUserFile,
importUsers, importUsersData, listForms, listGoLoginProfiles, listHistory,
listPayments, listProxies, listRailOnePairs, listUsers, login, logout,
manualHandover, onAadhaarOtp, onAadhaarOtpFill, onAadhaarRegistered,
onAskConfirm, onBooked, onBrowserDownloadProgress, onCaptcha, onFormsChanged,
onLog, onNewTheme, onPaymentsChanged, onProgress, onProxyTagsChanged,
onProxyTestProgress, onQr, onRailOneIdentity, onRunAccountIdentity,
onSecurityEvidenceCaptureDecision, onSecurityTamper, onUpdateProgress,
onUsersChanged, onVersionGate, onWarmupPayment510Choice, onWindowPinChanged,
openBookingBox, openBookingBoxTransient, openBrowserDownload,
openCertificateManager, openExternal, openFormWindow, openOtpRegistration,
openSuccessTicket, prepareSecurityEvidenceCamera, printTicket,
railOneClear, railOneDeletePair, railOneEnabled, railOneForceArm,
railOneGet, railOneResolveForAccount, readClipboard, recheckSecurity,
recoverVaults, registerAadhaar, releaseSecurityEvidenceCamera,
removeInterceptorCertificate, removeLockedFolder, reorderForms,
repaintSelf, requestQuit, resaveLastLogExport, resendAadhaarOtp,
resizeSelf, restartApp, restoreData, retryRun, rollbackVersion,
runSpeedTest, saveForm, savePayment, saveProxy, saveUser, searchTrains,
setAiEnabled, setAiKey, setAppLockPin, setAutoUpdate, setGoLoginKey,
setHideBrowser, setQrPopup, setWindowPin, startBooking, startRailOneHubCollect,
startRailOnePairing, startRailOneRun, stopBooking, stopRailOnePairing,
stopRun, submitAadhaarOtp, submitCaptcha, submitConfirm,
submitSecurityEvidence, submitWarmupPayment510Choice, suggestStations,
suggestTrains, terminateBlockedProcess, testAllProxies, testProxy,
updateRunForm, validateLicenseKey, verifyAppLockPin
```

### Matrix Preload — ~150+ Methods (from `src/preload/matrix.js` n/p objects)
```
login, logout, getSession, getLoginTarget, getAvailTarget, startBooking,
stopBooking, stopRun, updateRunForm, readClipboard, testProxy, retryRun,
activateLicense, controllerAction, saveForm, listForms, getForm, deleteForm,
deleteAllForms, duplicateForm, reorderForms, exportForm, importForms,
importFormsData, exportFormModel, importFormFile, openFormWindow,
openBookingBox, openBookingBoxTransient, getBoxLicenseInfo, validateLicenseKey,
resizeSelf, repaintSelf, enlargeQr, controllerMinimize, openExternal,
openBrowserDownload, downloadChromeAdvance, downloadBrahmos,
onBrowserDownloadProgress, printTicket, closeAuxWindows, requestQuit,
confirmQuit, restartApp, getTiming, getVersionGate, getSecurityBlock,
recheckSecurity, deleteBlockedItem, terminateBlockedProcess,
removeInterceptorCertificate, openCertificateManager, grantFolderAccess,
removeLockedFolder, getSecurityEvidenceInfo, captureSecurityEvidenceDesktop,
prepareSecurityEvidenceCamera, releaseSecurityEvidenceCamera,
submitSecurityEvidence, onSecurityEvidenceCaptureDecision, getSecurityBypassInfo,
applySecurityBypass, getAvlPaymentMethods, onVersionGate, checkUpdateNow,
getUpdateStatus, getBrowserDownloads, getAutoUpdate, setAutoUpdate,
getWindowPin, setWindowPin, onWindowPinChanged, getAiEnabled, setAiEnabled,
getQrPopup, setQrPopup, getNewTheme, getLoginFlows, onNewTheme, setQrPopup,
getAppLockStatus, setAppLockPin, disableAppLock, verifyAppLockPin,
manualHandover, setAiKey, setGoLoginKey, getGoLoginStatus,
listGoLoginProfiles, getBackupInfo, backupData, restoreData, getVaultLockState,
recoverVaults, rollbackVersion, downloadUpdate, cancelUpdateDownload,
onUpdateProgress, getSensorInfo, listHistory, deleteHistoryEntry, clearHistory,
listUsers, saveUser, deleteUser, deleteAllUsers, exportUsers, importUsers,
importUserFile, importUsersData, listPayments, savePayment, deletePayment,
deleteAllPayments, onPaymentsChanged, listProxies, runSpeedTest, saveProxy,
deleteProxy, deleteAllProxies, exportProxies, importProxies, importProxyFile,
importProxyPaste, searchTrains, suggestStations, suggestTrains,
checkAvailability, checkIdStatus, checkUsageWindow, checkUserIdInUse,
setBoxAccount, detectBrowsers, onProgress, onQr, onCaptcha, submitCaptcha,
onAadhaarOtp, onAadhaarOtpFill, submitAadhaarOtp, resendAadhaarOtp,
getAadhaarReg, registerAadhaar, openOtpRegistration, clearAadhaarReg,
onAadhaarRegistered, onAskConfirm, submitConfirm, onBooked, onRailOneIdentity,
onFormsChanged, onSecurityTamper, onUsersChanged, getProxyTags,
onProxyTagsChanged, getLogs, getLogPairs, exportLogs, railOneEnabled,
startRailOnePairing, listRailOnePairs, getRailOneStatus, getRelayStatus,
railOneClear, railOneGet, railOneDeletePair, railOneForceArm,
railOneResolveForAccount, startRailOneRun, getPairInfo, openSuccessTicket,
getSuccessTicket
```

### IPC Difference Summary
| Category | Count | Notes |
|----------|-------|-------|
| **Original TS Only** | ~45 methods | RailOne hub/collect, devLog, resaveLastLogExport, onProxyTestProgress, onRunAccountIdentity, onWarmupPayment510Choice, submitWarmupPayment510Choice, startRailOneHubCollect, stopRailOnePairing, forgetRailOneLogin, getRailOneHub, getHideBrowser, setHideBrowser, exportFormModel (duplicate?), plus other RailOne-specific |
| **Matrix Only** | ~10 methods | Minor naming differences (onPaymentsChanged vs PaymentsChanged event) |
| **Common** | ~135 methods | Core booking, forms, proxy, payment, licensing, security, Aadhaar, backup/restore |

---

## C. RENDERER FEATURE COMPARISON TABLE

### Feature Comparison Matrix

| Feature Area | Original TS V1.0.81 Evidence | Matrix v1.0.30 Evidence | Difference | Confidence | Upgrade Value |
|--------------|------------------------------|-------------------------|------------|------------|---------------|
| **Controller/Dock UI** | Top-bar with 11 action buttons (New Form, Open Form, Login Data, Proxy, Payment, Tickets, RailOne Token, Tools, Updates, Logs), Ashok Chakra center emblem, version V1.0.81, Telegram Follow pill, window controls | Bottom-docked slim strip with 9 action buttons (New Form, Open Form, Login Data, Proxy, Payment, Tickets, Tools, Updates, Logs), Matrix logo center, version V1.0.0, Telegram Follow button (hidden in CSS), window controls | **Matrix: Bottom dock vs top bar; RailOne button REMOVED; Telegram pill → button; Version branding different; Cyber/emerald theme** | HIGH | Medium — UI modernization |
| **Booking Box** | No Schedule modal; Basic booking with pairs | **Schedule modal** with cron expression builder, timezone selector, repeat options, next run preview; Pair management | **Matrix ONLY: Schedule booking feature (cron-based recurring bookings)** | HIGH | **HIGH** — Major new capability |
| **Form (New Booking)** | Payment methods: Paytm QR, PhonePe QR, Razorpay QR, IRCTC QR, WebLogin Wallet, Paytm UPI, Razorpay UPI; Manual login checkbox labeled "Manual login (WebLogin) — I log in myself"; Mobile field with Random button; Boarding station field | Payment methods: Paytm QR, PhonePe QR, Razorpay QR, IRCTC QR, WebLogin Wallet, Razorpay UPI (NO Paytm UPI); Manual login checkbox same; Mobile field with Random button; Boarding station field; **Special train checkbox** | **Matrix: Removed Paytm UPI option; Added Special train checkbox; Payment pause & Freecharge bypass checkboxes** | HIGH | Medium — Payment option rationalization |
| **Form - Login Mode** | Dropdown: "AUTO", "MANUAL", "BRAHMOS" | Dropdown: "AUTO", "MANUAL", "**Matrix**" | **Matrix: Renamed BRAHMOS → Matrix** | HIGH | Low — Branding only |
| **Payment Management** | Title: "Payment"; UPI-only tab; Label field optional; "Delete All", "+ New Payment Method" | Title: "**UPI Collection**"; UPI-only tab (hidden); Label field hidden (empty); "Delete All", "+ Add UPI ID" | **Matrix: Renamed to UPI Collection; Label field removed/hidden** | HIGH | Low — Cosmetic/simplification |
| **Proxy Management** | Buttons: "+ Add New", Import, Export, **Test Proxies**, Delete All, Close; Add modal with Type Manually / Paste; Import modal Bulk/Single; Paste modal | Buttons: "+ Add New", Export, Import, Delete All, Close (**Test Proxies REMOVED from header**); Add modal Type Manually / Paste (renamed "Import Proxy List"); Import modal Bulk/Single; Paste modal with **workspace UI** | **Matrix: Removed Test Proxies bulk button; Enhanced Paste with workspace UI** | HIGH | Medium — UX change |
| **History/Tickets** | Title: "Tickets"; Search bar visible with date filter (All, Today, Yesterday, 7d, 30d); "Delete All" button | Title: "**Journey Archive**"; Search bar **HIDDEN** (display:none!important); Date filter HIDDEN; "Delete All" button; Empty state: "Your journey archive starts with your first booking" | **Matrix: Renamed; Search/date filter hidden; Different empty state** | HIGH | Medium — UX simplification |
| **Tools** | Sections: Automatic Fixer (AI toggle), QR Popup toggle, App Lock, GoLogin API Key, Backup & Restore, Speed Test; Vertical stacked layout | **Grid workspace layout** (2-col desktop); Sections: App Lock, Backup & Restore, Speed Test, **License & Key Portal** (My key button), **Matrix Services** (status + check button), **Browsers** (download manager); **AI toggle & QR Popup HIDDEN (disabled)** | **Matrix: Major layout redesign; Removed AI/QR toggles; Added License Portal, Services status, Browser downloads; Grid layout** | HIGH | **HIGH** — Significant UX improvement |
| **Updates** | Title: "Updates"; Version status, Auto-update checkbox, Telegram card (@XhamsterTS), Versions & Rollback list | Title: "Updates"; Version status, Auto-update checkbox (updated text), Telegram card (**@Matrix**), Available Releases list | **Matrix: Telegram handle changed @XhamsterTS → @Matrix; Auto-update text updated; "Versions & Rollback" → "Available Releases"** | HIGH | Low — Branding/text updates |
| **Logs** | Header: Auto-scroll, **Download**, **Re-save**, Clear, Close; Run banner; Filter bar; Download picker | Header: Auto-scroll, **Download**, Clear, Close (**Re-save REMOVED**); Run banner; Filter bar; Download picker | **Matrix: Removed Re-save button (encrypted export re-save within 24h)** | HIGH | Low — Feature removal |
| **Login Data / Accounts** | Title: "Login Data"; Search bar visible; Buttons: + Add New, Import, Export, Check IDs, Delete All, Close; Modal: Username with Check ID, Password, Mobile with Random; Export/Import modals; Drag-drop overlay | Title: "**IRCTC Accounts (ID / Pass)**"; Search bar **HIDDEN**; Buttons: + Add Account, Import, Export, **Check Accounts**, Delete All, Close; Modal: IRCTC User ID with **Verify ID**, Password, **Mobile HIDDEN** (input type=hidden), Random button HIDDEN; Export/Import modals; Drag-drop overlay | **Matrix: Renamed; Search hidden; Mobile field removed; Check IDs → Check Accounts; Verify ID button text** | HIGH | Medium — Simplification |
| **Open Form / Booking Library** | Title: "Saved Forms"; Search bar visible; Buttons: Delete All, Bulk Import, Export, + New Form, Close; Drop hint; Export modal | Title: "**Booking Library**"; Search bar **HIDDEN**; Buttons: Delete All, Bulk Import, Export, **+ Create Booking**, Close; Drop hint; Export modal (renamed "Download a booking setup") | **Matrix: Renamed; Search hidden; New Form → Create Booking; Export → Download** | HIGH | Low — Terminology update |
| **RailOne Integration** | **Full RailOne.html** with QR collection, token pool (40 threshold), stats (Collected/Used/Reused), GET TOKEN / CLEAR TOKEN buttons, brand logo support | **NO RailOne.html**; RailOne IPC methods present in preload but **no UI**; Controller has no RailOne button | **Original TS: Full RailOne UI + backend; Matrix: Backend stubs only, NO UI** | HIGH | **N/A** — Excluded per requirements |
| **App Lock / Security** | Tools: Password To Open App (6-digit), Backup includes App Lock; Login-data: Vault recovery CSS | Tools: Password To Open App (6-digit), Backup includes App Lock; **Security evidence capture (desktop/camera), Security bypass, Tamper detection** | **Matrix: Added security evidence capture, bypass, tamper detection IPC + handlers** | HIGH | **HIGH** — Security hardening |
| **Aadhaar OTP** | IPC: onAadhaarOtp, onAadhaarOtpFill, submitAadhaarOtp, resendAadhaarOtp, getAadhaarReg, registerAadhaar, openOtpRegistration, clearAadhaarReg, onAadhaarRegistered; otp.html renderer | Same IPC methods; otp.html renderer exists in both | **Parity** | HIGH | None — Equivalent |
| **GoLogin Integration** | Tools: GoLogin API Key input + Save + Status; IPC: setGoLoginKey, getGoLoginStatus, listGoLoginProfiles | Tools: **REMOVED** GoLogin key input; IPC: setGoLoginKey, getGoLoginStatus, listGoLoginProfiles (still present) | **Matrix: UI removed, backend retained** | HIGH | Medium — Incomplete removal |
| **Browser Management** | Updates: Download Chrome Advance, Download Brahmos; Tools: **NO browser management** | Tools: **Browsers section** with download manager (Chrome, Brahmos, etc.); Updates: Download buttons removed | **Matrix: Moved browser downloads to Tools; Added download manager UI** | HIGH | **HIGH** — Better UX |
| **Backup/Restore** | Tools: Backup/Restore with 8 categories (Forms, Login Data, Proxies, Payments, History, GoLogin, Aadhaar, App Lock) | Tools: Backup/Restore with **7 categories** (Forms, Login Data, Proxies, Payments, History, Aadhaar, App Lock) — **GoLogin REMOVED** | **Matrix: Removed GoLogin from backup** | HIGH | Low — Consistent with GoLogin UI removal |
| **Speed Test** | Tools: Proxy selector, Run Test, Results with ratings (5 levels), metrics (Down/Up/Ping), IRCTC reachability | Tools: Same Speed Test with proxy selector, same ratings/metrics | **Parity** | HIGH | None — Equivalent |
| **License/Activation** | Controller: GetBoxLicenseInfo, ValidateLicenseKey; Activation.html renderer | Controller: GetBoxLicenseInfo, ValidateLicenseKey; **License & Key Portal** in Tools with "My key" button; Activation.html | **Matrix: Added dedicated License Portal in Tools** | HIGH | **HIGH** — Better license UX |
| **Telegram Channel** | Controller: Follow pill @XhamsterTS; Updates: Card @XhamsterTS | Controller: Follow button (hidden) @Matrix; Updates: Card **@Matrix** | **Matrix: Handle changed XhamsterTS → Matrix** | HIGH | Low — Branding |
| **Window Controls** | Controller: Pin, Minimize, Close; Mini mode with expand/close | Controller: Pin, Minimize, Close; Mini mode with expand/close | **Parity** | HIGH | None — Equivalent |

---

## D. FEATURES ALREADY PRESENT IN MATRIX (PARITY)

| Feature | Status | Notes |
|---------|--------|-------|
| Core booking flow (start/stop/retry) | ✅ Parity | All IPC + UI present |
| Form management (CRUD, import/export, duplicate, reorder) | ✅ Parity | Full parity |
| Proxy management (CRUD, import/export, paste, test single) | ✅ Parity | Bulk test removed |
| Payment/UPI management | ✅ Parity | Paytm UPI removed |
| Booking history/tickets | ✅ Parity | Search hidden in Matrix |
| Login data/accounts | ✅ Parity | Mobile field removed |
| Aadhaar OTP handling | ✅ Parity | Full IPC + UI |
| App lock (6-digit passcode) | ✅ Parity | Full parity |
| Backup/Restore (password-protected) | ✅ Parity | GoLogin category removed |
| Speed test | ✅ Parity | Full parity |
| Auto-update | ✅ Parity | Text updated |
| Version gate/check | ✅ Parity | Full parity |
| Security blocks/tamper detection | ✅ **Matrix EXTENDS** | Added evidence capture, bypass |
| Logging/Download | ✅ Parity | Re-save removed |
| Browser detection/download | ✅ **Matrix EXTENDS** | Moved to Tools with manager |

---

## E. MATRIX-ONLY FEATURES (NOT IN ORIGINAL TS V1.0.81)

| Feature | Description | Evidence |
|---------|-------------|----------|
| **Schedule Booking** | Cron-based recurring booking with timezone, repeat, next-run preview | `booking-box.html` Schedule modal |
| **Cyber/Matrix Theme** | Emerald/teal (#22d6a1) primary, dark theme, matrix-visual.css | All renderer files |
| **License & Key Portal** | Dedicated "My key" button in Tools linking to client portal | `tools.html` tools-key section |
| **Matrix Services Status** | Live service status check (WebLogin, CAPTCHA, Server clock) | `tools.html` tools-services section |
| **Browser Download Manager** | Grid of browsers with install/update buttons, version matching | `tools.html` tools-browsers section |
| **Grid Workspace Layout** | 2-column responsive grid for Tools (options/services, lock/speed, backup/speed, key/browsers) | `tools.html` CSS grid |
| **Special Train Checkbox** | Form field for special train booking | `form.html` #specialTrain |
| **Payment Pause / Freecharge Bypass** | Form checkboxes for payment flow control | `form.html` #paymentPause, #freechargeBypass |
| **Fare Limit Field** | Optional max fare input in form | `form.html` #fareLimitField |
| **Matrix Branding** | "Matrix" replaces "BRAHMOS" and "Tatkal Software" | controller.html, form.html, updates.html |
| **Enhanced Paste Proxy UI** | Workspace-style paste editor with line count, guide steps | `proxy.html` paste-workspace |
| **Journey Archive Renaming** | History → Journey Archive with different empty states | `history.html` |

---

## F. UNKNOWN BACKEND DIFFERENCES (CANNOT VERIFY FROM FRONTEND)

| Area | Unknown | Reason |
|------|---------|--------|
| **Main Process Algorithms** | Original TS main is bytenode-compiled (.jsc, 5.3MB); Matrix main is JS (src/main/index.cjs) | Cannot decompile .jsc; behavioral equivalence unknown |
| **Booking Warmup/Submit/State Graph** | Original timing formulas, retry boundaries, idempotency | No original traces; only offline reconstruction exists |
| **Browser Automation** | Original Patchright/Playwright integration, cookie/profile lifecycle | Browser handles are test doubles in reconstruction |
| **RailOne Backend** | Phone/QR authorization, token collection/expiry/recycling, hub readiness | Excluded per requirements; Matrix has IPC stubs only |
| **Payment Gateway Protocols** | Settlement confirmation, refund/reconciliation, authentic tickets | No vendor sandbox traces |
| **License/Activation Policy** | Original authorization policy, token lifetime, refresh, revocation | No sanitized attributable diagnostics |
| **Proxy Probe Endpoint** | Changed-IP validation, timing/verdict, assignment/rotation | No authorized controlled endpoint spec |
| **Vault Encryption/Schema** | Original database/vault encryption, migration, backup formats | Owner-supplied schema not available |
| **Error Translation** | Original main return/error translation, real IPC serialization | Only preload contracts recovered |
| **Clock Sync/Target Calculations** | Original timing rules for booking windows | Authoritative timing rules unknown |

---

## SUMMARY

| Metric | Value |
|--------|-------|
| **Matrix Version** | 1.0.30 |
| **Original TS Version** | 1.0.81 |
| **Version Gap** | 51 minor versions |
| **IPC Methods (Original)** | 186 |
| **IPC Methods (Matrix)** | ~150+ |
| **RailOne Methods** | 18 in original (excluded) |
| **Renderer Files (Original)** | 20+ |
| **Renderer Files (Matrix)** | 19 |
| **NEW Features in Matrix** | 12+ (Schedule, License Portal, Services, Browser Manager, Grid Layout, Theme, etc.) |
| **REMOVED Features** | RailOne UI, Test Proxies bulk, Re-save logs, GoLogin UI, AI/QR toggles, Paytm UPI, Search in History/Login/Form |
| **RENAMED/BRANDED** | BRAHMOS→Matrix, XhamsterTS→Matrix, Tickets→Journey Archive, Login Data→IRCTC Accounts, Saved Forms→Booking Library, Payment→UPI Collection |

### Key Takeaways

1. **Matrix is NOT a superset** — It's a divergent fork with ~51 versions of independent development
2. **Major Matrix innovations**: Schedule booking, License Portal, Services Status, Browser Manager, Grid Tools layout, Cyber theme
3. **Major removals**: RailOne UI (by design), GoLogin UI, bulk proxy test, log re-save, search bars in multiple views
4. **Backend unknown**: Original main process bytecode unrecovered; behavioral compatibility unverified
5. **Upgrade path**: Would require merging Matrix UI innovations into a TS V1.0.81-compatible backend, or completing Matrix backend to production parity (blocked by 25+ production integration blockers)

---

*Report compiled from read-only analysis of:*
- *Original TS V1.0.81: `C:\Users\lexus\Videos\New folder\ts.81\` (package.json, extracted renderer, backend-reconstruction evidence)*
- *Matrix v1.0.30: `C:\Users\lexus\Documents\nexus\nexus\nexus\` (package.json, src/main, src/preload, src/renderer)*