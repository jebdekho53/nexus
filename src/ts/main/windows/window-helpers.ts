// Ordinary window and booking-panel helpers of the main process: showing a stored QR, nudging a booking to re-check its payment,
// counting live windows, cancelling an update download, hiding the other windows and publishing update progress.
//
// Reconstructed from the recovered root functions f3738, f3739, f4136, f4254, f4261 and f4262. All of them are created in the
// bootstrap scope, so every dependency below is a bootstrap slot read at call time (readBinding with depth 0 in the factory
// table); the original names of those bindings are unknown and the accessors are named after how the recovered code uses them.
// The recovered functions also read the string decoder (slot 5) first and throw if it were uninitialised; the decoder is always
// initialised before any of these can run, so that incidental check is not reproduced.

export interface WindowHandle {
  isDestroyed(): boolean;
  isVisible?(): boolean;
  hide?(): void;
  webContents: { isDestroyed(): boolean; send(channel: string, payload: unknown): void };
}

/** A stored QR payload (as far as showing it is concerned). */
export interface StoredQr {
  dataUrl?: unknown;
  caption?: unknown;
  amount?: unknown;
  account?: unknown;
}

export interface WindowHelperDeps {
  /** Stored QR payloads by form id (slot 1928 "uu"). */
  qrStore(): { get(formId: unknown): StoredQr | null | undefined };
  /** The form id used when none is given (slot 1922 "Xi"). */
  defaultFormId(): unknown;
  /** Shows a QR in its booking panel (slot 1932). */
  showQr(dataUrl: unknown, caption: unknown, amount: unknown, formId: unknown, account: unknown): void;
  /** Running bookings by form id; each entry may hold a `booking` object (slot 1537 "oe"). */
  bookings(): { get(formId: unknown): { booking?: { triggerCheckNow(): unknown } | null } | null | undefined };
  /** The application's window registry (slot 2063 "Ln"). */
  windowRegistry(): { values(): Iterable<{ isDestroyed(): boolean }> };
  /** State of the running update download, if any: { phase, controller } (slot 2116 "Bi"). */
  updateDownload(): { phase?: unknown; controller: { abort(reason: unknown): void } } | null | undefined;
  /** Whether the installer has already started (slot 2113 "cs"). */
  updateInstalling(): unknown;
  /** Electron's BrowserWindow (slot 22 "x"). */
  allWindows(): WindowHandle[];
  /** The window that asked for the running update (slot 2115 "Ve"). */
  updateWindow(): unknown;
  /** Remembers the latest progress for windows that open later (reads the binding "yo" first, then stores). */
  rememberUpdateProgress(progress: unknown): void;
  /** IPC channel names (slot 336 "v"). */
  channels(): { UpdateProgress: string };
}

// Recovered f3738: show the stored QR of a booking panel. The form id defaults to the current one for the lookup, but the
// panel is told the id that was passed in (possibly none).
export function showStoredQr(deps: WindowHelperDeps, formId?: unknown): void {
  const store = deps.qrStore();
  const lookup = formId || deps.defaultFormId();
  const stored = store.get(lookup);
  if (stored?.dataUrl) deps.showQr(stored.dataUrl, stored.caption, stored.amount, formId, stored.account);
}

// Recovered f3739: the operator pressed "check now" for a booking; nothing happens for an unknown or finished one.
export function checkNow(deps: WindowHelperDeps, formId?: unknown): void {
  if (!formId) return;
  deps.bookings().get(formId)?.booking?.triggerCheckNow();
}

// Recovered f4136: how many registered windows are still alive.
export function countLiveWindows(deps: WindowHelperDeps): number {
  let live = 0;
  for (const window of deps.windowRegistry().values()) {
    if (!window.isDestroyed()) live++;
  }
  return live;
}

// Recovered f4254: abort a download that is still downloading and has not started installing; reports whether it did.
export function cancelActiveUpdateDownload(deps: WindowHelperDeps): boolean {
  if (deps.updateDownload() && (deps.updateDownload() as { phase?: unknown }).phase === 'download' && !deps.updateInstalling()) {
    const controller = (deps.updateDownload() as { controller: { abort(reason: unknown): void } }).controller;
    const abort = controller.abort;
    abort.call(controller, new Error('Update download cancelled.'));
    return true;
  }
  return false;
}

// Recovered f4261: hide every visible window except the given one and return the windows that were hidden, so they can be
// shown again. A window that fails to report or hide is skipped.
export function hideOtherWindows(deps: WindowHelperDeps, except?: unknown): WindowHandle[] {
  const hidden: WindowHandle[] = [];
  for (const window of deps.allWindows()) {
    if (window === except) continue;
    if (window.isDestroyed()) continue;
    try {
      if (window.isVisible!()) {
        window.hide!();
        hidden.push(window);
      }
    } catch {
      // a window that cannot be hidden stays as it is
    }
  }
  return hidden;
}

// Recovered f4262: remember the progress of the update that the given window asked for, and show it in that window while it is alive.
export function publishUpdateProgress(deps: WindowHelperDeps, window: WindowHandle, progress: unknown): void {
  if (window === deps.updateWindow()) deps.rememberUpdateProgress(progress);
  try {
    if (!window.isDestroyed()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(deps.channels().UpdateProgress, progress);
      }
    }
  } catch {
    // the window closed while it was being updated
  }
}
