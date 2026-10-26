# Release 1.0.28: installation cleanup

Windows Setup and Updater remove known obsolete files from earlier locally archived Matrix releases after successful extraction. Each file must match its previous shipped SHA-256. Current payload files, modified files, unknown files and paths through directory links are preserved. Only empty obsolete directories are pruned; no recursive user-data deletion is used.

Cleanup covers known old test harnesses, generated interpreter definitions, non-Windows dependency binaries/resources, unused Electron UI translations and development metadata. Saved accounts, forms, browser profiles and tickets are outside cleanup scope. Required application runtime remains distributed.

This takes effect when the recipient runs 1.0.28 Setup or Updater. It cannot erase copied installers, archives or copies outside the installation directory.

Validation: actual updater over an existing extracted installation removed original obsolete test/generated files, preserved modified/unknown files and Electron runtime hash, and rejected traversal in the manifest. Actual extractor also accepted normal and relocated archives and rejected a truncated archive. Evidence: diagnostics/cleanup-1.0.28-verified.json and diagnostics/installer-payload-test.json. Cleanup counts are saved in the installation diagnostics/installer-cleanup.log.
