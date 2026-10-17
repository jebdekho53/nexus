// Browser detection and Brahmos Browser download IPC handlers.
//
// Reconstructed from the handlers that the recovered registration function f3790 passes to `ipcMain.handle`:
// DetectBrowsers (f3817), OpenBrowserDownload (f3818), DownloadBrahmos (f3819, with its progress relay f3820 and
// throttled progress callback f3821) and GetBrowserDownloads (f3825-f3828). The registration, the channel names and the
// browser-detection and installer helpers stay recovered; they are injected here under names inferred from their use.
//
// Not reconstructed: DownloadChromeAdvance (f3822-f3824). It installs a fingerprint-spoofing Chromium build and records
// its path for later launches, which is outside this migration (see docs/typescript-migration.md).

export interface IpcSender {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface IpcEvent {
  sender: IpcSender;
}

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface BrowserInfo {
  id?: unknown;
  type?: unknown;
  installed?: unknown;
  [field: string]: unknown;
}

export interface InstallProgress {
  downloading?: unknown;
  received: number;
  total: number;
  step: number;
  steps: number;
  label: unknown;
}

export interface BrowserIpcDeps {
  /** The settings/environment object of the main process (bootstrap context slot 3 of the registration scope). */
  environment(): unknown;
  /** Detects the installed browsers (slot 107). */
  detectBrowsers(...args: unknown[]): Promise<BrowserInfo[]>;
  /** Whether the anti-detect profile service is ready (slot 1786). */
  profileServiceReady(): unknown;
  /** Text summary of the detected browsers for the log (slot 102). */
  summarizeBrowsers(environment: unknown): Promise<unknown>;
  /** Application log (slot 1885). */
  log(category: string, message: unknown, level: string): void;
  /** Finds the download for a browser id on this system, if any (slot 65). */
  findBrowserDownload(id: unknown): { url: string } | null | undefined;
  /** Electron's shell (slot 22 "x"). */
  openExternal(url: string): Promise<void>;
  /** True while a Brahmos Browser download runs (slot 1965 "rc"). */
  brahmosBusy(): unknown;
  setBrahmosBusy(busy: boolean): void;
  /** Installs the Brahmos Browser engine, reporting progress (slot 176). */
  installBrahmos(onProgress: (progress: InstallProgress) => void): Promise<unknown>;
  /** Makes an error message safe to show (slot 170). */
  sanitizeMessage(): (text: string) => string;
  /** IPC channel names (slot 336 "v"). */
  channels(): { BrowserDownloadProgress: string };
  /** The catalogue of downloadable browsers (slot 68). */
  downloadCatalog(): BrowserInfo[];
  now(): number;
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;

// Recovered f3817: the installed browsers, noting the result in the log. A logging failure never fails the call.
export async function detectBrowsers(deps: BrowserIpcDeps): Promise<HandlerResult> {
  try {
    const environment = deps.environment();
    const options = { gologinReady: Boolean(deps.profileServiceReady()) };
    const browsers = await deps.detectBrowsers(environment, options);
    try {
      deps.log('browser', await deps.summarizeBrowsers(deps.environment()), 'info');
    } catch {
      // the summary is informational only
    }
    return { ok: true, data: browsers };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3818: open the vendor's download page for a browser in the system browser.
export async function openBrowserDownload(deps: BrowserIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    const download = deps.findBrowserDownload(id);
    if (!download) return failure('No supported download is available for this browser on this system.');
    await deps.openExternal(download.url);
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3819 (+ f3820, f3821): install the Brahmos Browser engine, relaying progress to the asking window. Only one
// download runs at a time.
export async function downloadBrahmos(deps: BrowserIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  if (deps.brahmosBusy()) return failure('A Brahmos Browser download is already in progress.');
  deps.setBrahmosBusy(true);
  const send = (payload: unknown): void => {
    if (!event.sender.isDestroyed()) event.sender.send(deps.channels().BrowserDownloadProgress, payload);
  };
  try {
    try {
      let lastAt = 0;
      let lastPhase = '';
      send({ type: 'brahmos', phase: 'download', message: 'Preparing…' });
      await deps.installBrahmos(progress => {
        const now = deps.now();
        const phase = progress.downloading ? 'download' : 'install';
        if (phase === lastPhase && now - lastAt < 100) return;
        lastAt = now;
        lastPhase = phase;
        const fraction = progress.total > 0 ? Math.min(1, progress.received / progress.total) : 0;
        const overall = progress.total > 0 ? Math.min(1, (progress.step - 1 + fraction) / progress.steps) : undefined;
        send({
          type: 'brahmos',
          phase,
          received: progress.received,
          total: progress.total,
          fraction: overall,
          message: progress.downloading ? 'Downloading ' + progress.label : 'Installing ' + progress.label + '…',
        });
      });
      deps.log('browser', 'Brahmos Browser engine installed in-app', 'info');
      send({ type: 'brahmos', phase: 'done', fraction: 1, message: 'Installed' });
      return { ok: true, data: undefined };
    } catch (error) {
      const sanitize = deps.sanitizeMessage();
      const message = sanitize((messageOf(error) || '') as string) || 'Brahmos Browser download failed.';
      send({ type: 'brahmos', phase: 'error', message });
      return failure(message);
    }
  } finally {
    deps.setBrahmosBusy(false);
  }
}

// Recovered f3825 (+ f3826-f3828): the browser catalogue with an `installed` flag from the detected browsers.
export async function getBrowserDownloads(deps: BrowserIpcDeps): Promise<HandlerResult> {
  try {
    const detected = await deps.detectBrowsers(deps.environment());
    const isInstalled = (type: unknown): boolean => detected.some(browser => browser.type === type && Boolean(browser.installed));
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.downloadCatalog().map(item => ({ ...item, installed: isInstalled(item.id) }));
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}
