// Diagnostic-log and success-ticket IPC handlers.
//
// Reconstructed from the handlers that the recovered registration function f3790 passes to `ipcMain.handle`:
// GetLogs (f3831), GetLogPairs (f3832), ExportLogs (f3863-f3868), OpenSuccessTicket (f3861) and GetSuccessTicket (f3862).
// The log buffers, the pair grouping, the log encryption and the ticket window are recovered helpers that are injected here
// under names inferred from their use; each accessor is read at call time.

export interface IpcEvent {
  sender: unknown;
}

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface LogEntry {
  formId?: unknown;
  [field: string]: unknown;
}

export interface LogPair {
  pair?: unknown;
  label?: unknown;
  formId?: unknown;
  [field: string]: unknown;
}

export interface SaveDialogOptions {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface LogFileSystem {
  openSync(path: string, flags: string, mode?: number): number;
  writeFileSync(fd: number, data: Buffer): void;
  fsyncSync(fd: number): void;
  closeSync(fd: number): void;
  renameSync(from: string, to: string): void;
  readFileSync(path: string): Buffer;
  rmSync(path: string, options: { force: boolean }): void;
}

export interface LogsIpcDeps {
  /** The in-memory application log (slot 1867 "bn"). */
  appLog(): LogEntry[];
  /** The full-trail log (slot 1869 "un"). */
  fullLog(): LogEntry[];
  /** Whether the plain application log is the one to export when no encryption key is set (slot 1881). */
  preferPlainLog(): unknown;
  /** The log entries grouped by pair, in pair order (slot 1866). */
  logPairs(): LogPair[];
  /** Application constants: LOG_ENCRYPT_PUBLIC_KEY, APP_VERSION (slot 61). */
  config(): { LOG_ENCRYPT_PUBLIC_KEY?: unknown; APP_VERSION?: unknown };
  /** Encrypts the log text into an envelope for the given public key (slot 595). */
  encryptLog(text: string, key: unknown): unknown;
  /** Called after a verified export (slot 1886). */
  afterExport(): void;
  fs(): LogFileSystem; // slot 18 "y"
  path(): { dirname(path: string): string }; // slot 14 "m"
  /** Electron's BrowserWindow and dialog (slot 22 "x"). */
  windowFor(sender: unknown): unknown;
  showSaveDialog(parent: unknown, options: SaveDialogOptions): Promise<SaveDialogResult>;
  showSaveDialogWithoutParent(options: SaveDialogOptions): Promise<SaveDialogResult>;
  /** Tickets opened by the success flow, keyed by id (slot 1940 "la"). */
  successTickets(): { set(key: unknown, value: unknown): unknown; get(key: unknown): unknown };
  /** Shows the success ticket window for an id (slot 1947). */
  showSuccessTicket(key: unknown): void;
  platform(): string;
  pid(): number;
  now(): Date;
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;

// Recovered f3831
export async function getLogs(deps: LogsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  result.data = deps.appLog().slice();
  return result;
}

// Recovered f3832
export async function getLogPairs(deps: LogsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  result.data = deps.logPairs();
  return result;
}

// Recovered f3861
export function openSuccessTicket(deps: LogsIpcDeps, key: unknown, value: unknown): HandlerResult {
  deps.successTickets().set(key, value);
  deps.showSuccessTicket(key);
  return { ok: true };
}

// Recovered f3862
export function getSuccessTicket(deps: LogsIpcDeps, key: unknown): HandlerResult {
  const result: HandlerResult = { ok: true, data: undefined };
  result.data = deps.successTickets().get(key) ?? null;
  return result;
}

const removeQuietly = (deps: LogsIpcDeps, path: string): void => {
  try {
    deps.fs().rmSync(path, { force: true });
  } catch {
    // best-effort clean-up
  }
};

// Recovered f3863 (+ f3864-f3868): save the diagnostic log (all pairs, or the pairs of the given forms) through a save
// dialog. The file is written to a temporary sibling, flushed, renamed into place and read back; a file that did not save
// correctly is removed and the logs are kept.
export async function exportLogs(deps: LogsIpcDeps, event: IpcEvent, formIds: unknown): Promise<HandlerResult> {
  const stamp = deps.now().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const parent = deps.windowFor(event.sender) ?? undefined;
  const pairs = deps.logPairs();
  const selection = formIds && (formIds as unknown[]).length ? new Set(formIds as unknown[]) : null;
  const chosen = selection ? pairs.filter(pair => selection.has(pair.formId)) : pairs;
  let suffix: string;
  if (selection && chosen.length === 1) suffix = '-pair' + chosen[0].pair;
  else if (!selection) suffix = '';
  else suffix = '-selected';
  const key = deps.config().LOG_ENCRYPT_PUBLIC_KEY;
  const extension = key ? 'tslog' : 'json';
  const options: SaveDialogOptions = {
    title: 'Save diagnostic log',
    defaultPath: 'TS-log-' + stamp + suffix + '.' + extension,
    filters: [{ name: key ? 'TS encrypted log' : 'JSON', extensions: [extension] }],
  };
  const picked = parent ? await deps.showSaveDialog(parent, options) : await deps.showSaveDialogWithoutParent(options);
  const { canceled, filePath } = picked;
  if (canceled || !filePath) return failure('cancelled');

  const source = key || !deps.preferPlainLog() ? deps.fullLog() : deps.appLog();
  const groups: LogPair[] = chosen.map(pair => ({
    pair: pair.pair,
    label: pair.label,
    formId: pair.formId,
    entries: source.filter(entry => entry.formId === pair.formId),
  }));
  if (!selection) {
    const loose = source.filter(entry => !entry.formId);
    if (loose.length) groups.push({ pair: 0, label: 'General (app)', formId: '', entries: loose });
  }
  const document = {
    app: 'TS',
    version: deps.config().APP_VERSION,
    platform: deps.platform(),
    exportedAt: deps.now().toISOString(),
    note: key
      ? 'Encrypted diagnostic log (FULL trail) — readable only by the team decrypter page.'
      : 'Diagnostic log (dev plaintext — full trail). Entries grouped + sorted by pair (minibox) order.',
    pairs: chosen,
    groups,
  };
  const part = filePath + '.' + deps.pid() + '.part';
  try {
    const text = JSON.stringify(document, null, 2);
    const bytes = Buffer.from(key ? JSON.stringify(deps.encryptLog(text, key)) : text, 'utf8');
    try {
      const parsed = JSON.parse(bytes.toString('utf8')) as { k?: unknown; ct?: unknown; iv?: unknown; tag?: unknown };
      if (key && !(parsed.k && parsed.ct && parsed.iv && parsed.tag)) throw new Error('envelope is missing k/iv/ct/tag');
    } catch (error) {
      return failure('Could not build the log file (' + messageOf(error) + '). Your logs were NOT deleted.');
    }
    let fd: number | undefined;
    try {
      fd = deps.fs().openSync(part, 'w', 0o600);
      deps.fs().writeFileSync(fd, bytes);
      deps.fs().fsyncSync(fd);
    } finally {
      if (fd !== undefined) {
        try {
          deps.fs().closeSync(fd);
        } catch {
          // already closed
        }
      }
    }
    deps.fs().renameSync(part, filePath);
    let directory: number | undefined;
    try {
      try {
        directory = deps.fs().openSync(deps.path().dirname(filePath), 'r');
        deps.fs().fsyncSync(directory);
      } catch {
        // not every platform can flush a directory
      }
    } finally {
      if (directory !== undefined) {
        try {
          deps.fs().closeSync(directory);
        } catch {
          // already closed
        }
      }
    }
    const saved = deps.fs().readFileSync(filePath);
    let problem: string;
    if (saved.length === bytes.length) {
      if (!saved.some(byte => !(byte === 0))) problem = 'all ' + saved.length + ' bytes are zero';
      else problem = saved.equals(bytes) ? '' : 'the saved bytes differ from what was written';
    } else {
      problem = 'saved ' + saved.length + ' of ' + bytes.length + ' bytes';
    }
    if (!problem) {
      deps.afterExport();
      return { ok: true };
    }
    removeQuietly(deps, filePath);
    return failure('The log could not be saved correctly (' + problem + '). Your logs were NOT deleted, so nothing is lost — please try saving again, to a different folder.');
  } catch (error) {
    for (const leftover of [part, filePath]) removeQuietly(deps, leftover);
    return failure(messageOf(error));
  }
}
