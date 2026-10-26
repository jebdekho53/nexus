# Account verification dialog state

Add/Edit previously reset account credentials but left mIdStat from the previous account. An outstanding verification response could also repaint a newly opened dialog.

The production Login Data module now delegates verification to matrix-account-verification.js. Open, close, username input and username change invalidate previous checks and clear the badge. Responses must match the current dialog generation and requested username, and the returned userId must match that username. Older completions cannot repaint the badge or enable a newer request's button. The saved account cache remains keyed by its own username.

Seven focused checks passed: production modal field reset/edit prefills, stale-response ordering, input/close invalidation, blank/wrong-account/network outcomes and existing backend ID classification. A release UI probe confirmed blank username/password and a hidden empty badge on Add and on reopen after a synthetic prior badge; no account was saved or real ID status request sent. Evidence: diagnostics/account-dialog-verified.json. No installer/updater build.
