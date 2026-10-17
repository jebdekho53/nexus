// Import and export IPC handlers for the saved logins and the saved proxies.
//
// Reconstructed from the handlers that the recovered registration function f3790 passes to `ipcMain.handle`:
// ExportUsers f3967, ImportUsers f3969, ImportUserFile f3970, ImportUsersData f3971, ExportProxies f3986,
// ImportProxies f3989, ImportProxyPaste f3991 and ImportProxyFile f3993. The vaults are reconstructed in ../storage; the
// text parsers and formatters (login lines, proxy lines, the private-host test) are recovered helpers injected here under
// names inferred from their use, read at call time.
//
// Not here: the forms export/import handlers.

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface IpcEvent {
  sender: unknown;
}

export interface Record_ {
  id?: unknown;
  [field: string]: unknown;
}

export interface TransferVault {
  list(): Record_[];
  saveMany(records: Record_[]): unknown[];
}

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface SaveOptions {
  defaultPath: string;
  filters: DialogFilter[];
}

export interface OpenOptions {
  properties: string[];
  filters: DialogFilter[];
}

export interface ParsedProxy {
  host?: string;
  port?: unknown;
  username?: unknown;
  password?: unknown;
}

export interface TransferIpcDeps {
  /** Electron's windows and dialogs (slot 22 "x"). */
  windowFor(sender: unknown): unknown;
  showSaveDialog(parent: unknown, options: SaveOptions): Promise<{ canceled: boolean; filePath?: string }>;
  showSaveDialogWithoutParent(options: SaveOptions): Promise<{ canceled: boolean; filePath?: string }>;
  showOpenDialog(parent: unknown, options: OpenOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
  showOpenDialogWithoutParent(options: OpenOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
  fs(): { readFileSync(path: string, encoding: 'utf8'): string; writeFileSync(path: string, data: string, encoding: 'utf8'): void }; // slot 18 "y"
  usersVault(): TransferVault; // slot 1789
  usersChanged(): void; // slot 1721
  /** Parses login text into records appended to the list; returns how many it found (slot 1794). */
  parseUsers(text: string, into: Record_[]): number;
  /** Formats a login as one export line (slot 255); passed straight to Array.prototype.map. */
  formatUser(): (record: Record_, index?: number, all?: Record_[]) => string;
  proxiesVault(): TransferVault; // slot 1798
  /** Formats a proxy as one export line (slot 262). */
  formatProxy(proxy: Record_): string;
  /** Parses one proxy line (slot 263). */
  parseProxy(line: string): ParsedProxy | null | undefined;
  /** Whether a host name is a private or internal address (slot 1464). */
  isPrivateHost(host: string): unknown;
  /** Builds a stored proxy from one line or object (slot 264). */
  proxyFromLine(): (item: unknown, id: string, now: number) => Record_ | null | undefined;
  randomUuid(): string; // slot 23 "j"
  now(): number;
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;
const MAX_PASTED_TEXT = 5242880;
const MAX_PASTED_ITEMS = 200;

// The owning window is looked up before the file name is derived, as the recovered handlers do.
async function pickSaveFile(deps: TransferIpcDeps, event: IpcEvent, defaultPath: () => string): Promise<{ canceled: boolean; filePath?: string }> {
  const parent = deps.windowFor(event.sender) ?? undefined;
  const options: SaveOptions = { defaultPath: defaultPath(), filters: [{ name: 'Text', extensions: ['txt'] }] };
  return parent ? deps.showSaveDialog(parent, options) : deps.showSaveDialogWithoutParent(options);
}

async function pickOpenFiles(deps: TransferIpcDeps, event: IpcEvent, multiple: boolean, filter: DialogFilter): Promise<{ canceled: boolean; filePaths: string[] }> {
  const parent = deps.windowFor(event.sender) ?? undefined;
  const options: OpenOptions = { properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'], filters: [filter] };
  return parent ? deps.showOpenDialog(parent, options) : deps.showOpenDialogWithoutParent(options);
}

const fileName = (base: string, fallback: string): string => (base.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || fallback) + '.txt';
const selectByIds = (all: Record_[], ids: unknown): Record_[] =>
  Array.isArray(ids) && ids.length ? all.filter(record => ids.includes(record.id)) : all;

// Recovered f3967 (+ f3968): save the chosen logins (all when none are named) as one text line each.
export async function exportUsers(deps: TransferIpcDeps, event: IpcEvent, ids: unknown): Promise<HandlerResult> {
  try {
    const selected = selectByIds(deps.usersVault().list(), ids);
    if (selected.length === 0) return failure('No logins to export');
    const base = selected.length === 1 ? ((selected[0].username || 'login') as string) : 'logins-' + selected.length;
    const picked = await pickSaveFile(deps, event, () => fileName(base, 'logins'));
    if (picked.canceled || !picked.filePath) return { ok: true, data: { canceled: true } };
    deps.fs().writeFileSync(picked.filePath, selected.map(deps.formatUser()).join('\n') + '\n', 'utf8');
    return { ok: true, data: { count: selected.length } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3969: read the chosen files into logins; a file that cannot be read or parsed is skipped.
export async function importUsers(deps: TransferIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  try {
    const picked = await pickOpenFiles(deps, event, true, { name: 'Text / JSON', extensions: ['txt', 'json', 'csv'] });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, data: { imported: 0 } };
    const vault = deps.usersVault();
    const records: Record_[] = [];
    for (const file of picked.filePaths) {
      try {
        deps.parseUsers(deps.fs().readFileSync(file, 'utf8'), records);
      } catch {
        // an unreadable file contributes nothing
      }
    }
    const imported = vault.saveMany(records).length;
    if (imported > 0) deps.usersChanged();
    return { ok: true, data: { imported } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3970: read one file and return its first login without saving it.
export async function importUserFile(deps: TransferIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  try {
    const picked = await pickOpenFiles(deps, event, false, { name: 'Text / JSON', extensions: ['txt', 'json', 'csv'] });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, data: { canceled: true } };
    const records: Record_[] = [];
    deps.parseUsers(deps.fs().readFileSync(picked.filePaths[0], 'utf8'), records);
    return records.length === 0 ? failure('No login found in that file') : { ok: true, data: { user: records[0] } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3971: import logins from pasted or dropped file texts (at most 200 items of 5 MiB each).
export async function importUsersData(deps: TransferIpcDeps, items: unknown): Promise<HandlerResult> {
  try {
    if (!Array.isArray(items)) return { ok: true, data: { imported: 0, skipped: 0 } };
    const vault = deps.usersVault();
    const records: Record_[] = [];
    let skipped = 0;
    for (const item of items.slice(0, MAX_PASTED_ITEMS) as ({ text?: unknown } | null | undefined)[]) {
      const text = typeof item?.text === 'string' ? (item as { text: string }).text : '';
      if (!text || text.length > MAX_PASTED_TEXT) {
        skipped++;
        continue;
      }
      try {
        if (deps.parseUsers(text, records) === 0) skipped++;
      } catch {
        skipped++;
      }
    }
    const imported = vault.saveMany(records).length;
    if (imported > 0) deps.usersChanged();
    return { ok: true, data: { imported, skipped } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3986 (+ f3987, f3988)
export async function exportProxies(deps: TransferIpcDeps, event: IpcEvent, ids: unknown): Promise<HandlerResult> {
  try {
    const selected = selectByIds(deps.proxiesVault().list(), ids);
    if (selected.length === 0) return failure('No proxies to export');
    const base = selected.length === 1 ? ((selected[0].label || selected[0].host || 'proxy') as string) : 'proxies-' + selected.length;
    const picked = await pickSaveFile(deps, event, () => fileName(base, 'proxies'));
    if (picked.canceled || !picked.filePath) return { ok: true, data: { canceled: true } };
    deps.fs().writeFileSync(picked.filePath, selected.map(proxy => deps.formatProxy(proxy)).join('\n') + '\n', 'utf8');
    return { ok: true, data: { count: selected.length } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

const trimmedLines = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

// Recovered f3989 (+ f3990): proxies from the chosen files; each file is JSON (one proxy or a list) or one proxy per line.
export async function importProxies(deps: TransferIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  try {
    const picked = await pickOpenFiles(deps, event, true, { name: 'Proxy list', extensions: ['json', 'txt'] });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, data: { imported: 0 } };
    const vault = deps.proxiesVault();
    const records: Record_[] = [];
    for (const file of picked.filePaths) {
      try {
        const text = deps.fs().readFileSync(file, 'utf8');
        let items: unknown[];
        try {
          const parsed: unknown = JSON.parse(text);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          items = trimmedLines(text);
        }
        for (const item of items) {
          const proxy = deps.proxyFromLine()(item, deps.randomUuid(), deps.now());
          if (proxy) records.push(proxy);
        }
      } catch {
        // an unreadable file contributes nothing
      }
    }
    return { ok: true, data: { imported: vault.saveMany(records).length } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3991 (+ f3992): proxies from pasted text, one per line. Lines that do not parse, have no port or point at a
// private or local host are reported back (the first six) instead of being saved.
export async function importProxyPaste(deps: TransferIpcDeps, text: unknown): Promise<HandlerResult> {
  try {
    const lines = trimmedLines(String(text || ''));
    const vault = deps.proxiesVault();
    const valid: Record_[] = [];
    const invalid: string[] = [];
    for (const line of lines) {
      const parsed = deps.parseProxy(line);
      const host = (parsed?.host || '').toLowerCase();
      const local = !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || deps.isPrivateHost(host);
      if (parsed && parsed.port && !local) {
        valid.push({
          id: deps.randomUuid(),
          host: parsed.host,
          port: parsed.port,
          username: parsed.username || undefined,
          password: parsed.password || undefined,
          createdAt: deps.now(),
          updatedAt: deps.now(),
        });
      } else {
        invalid.push(line);
      }
    }
    return { ok: true, data: { imported: vault.saveMany(valid).length, invalid: invalid.length, invalidLines: invalid.slice(0, 6) } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3993 (+ f3994): the first proxy of one chosen file, without saving it.
export async function importProxyFile(deps: TransferIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  try {
    const picked = await pickOpenFiles(deps, event, false, { name: 'Proxy', extensions: ['json', 'txt'] });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, data: { canceled: true } };
    const text = deps.fs().readFileSync(picked.filePaths[0], 'utf8');
    let first: unknown;
    try {
      const parsed: unknown = JSON.parse(text);
      first = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      first = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
    }
    const proxy = deps.proxyFromLine()(first, deps.randomUuid(), deps.now());
    return proxy ? { ok: true, data: { proxy } } : failure('No proxy found in that file');
  } catch (error) {
    return failure(messageOf(error));
  }
}

