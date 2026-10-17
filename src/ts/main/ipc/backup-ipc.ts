// User-requested encrypted backup/restore orchestration (f4031-f4033).
// Encryption, decryption and protected-store operations remain injected
// existing helpers; this module changes neither their algorithms nor gates.
type Fields = Record<string, unknown>;
interface Result {ok: boolean; data?: unknown; error?: unknown}
interface Event {sender: unknown}
interface Vault {list(): unknown[]; saveMany(records: unknown[]): unknown[]}
interface Forms {all(): unknown[]; saveMany(records: unknown[]): unknown[]}
interface BackupSelection {forms?: unknown; users?: unknown; proxies?: unknown; payments?: unknown;
  gologinToken?: unknown; aadhaar?: unknown; appLock?: unknown; history?: unknown}
const ALL: Readonly<BackupSelection> = Object.freeze({forms: true, payments: true, users: true, proxies: true,
  gologinToken: true, aadhaar: true, appLock: true, history: true});
interface DialogOptions {defaultPath?: string; properties?: string[]; filters: {name: string; extensions: string[]}[]}
interface DialogResult {canceled: boolean; filePath?: string; filePaths: string[]}
export interface BackupDeps {
  forms(): Forms; users(): Vault; proxies(): Vault; payments(): Vault;
  history(): {list(): unknown[]; importEntries(entries: unknown[]): unknown};
  token(): unknown; setToken(token: string): unknown;
  aadhaar(): Fields; aadhaarPath(): string;
  lock(): Fields | null; restoreLock(lock: {salt: string; hash: string; attempts: number}): unknown;
  seal(payload: Fields, password: string): unknown;
  unseal(envelope: unknown, password: string): unknown;
  fs(): {readFileSync(path: string, encoding: 'utf8'): string;
    writeFileSync(path: string, text: string | undefined, encoding: 'utf8'): void;
    mkdirSync(path: string, options: {recursive: boolean}): unknown};
  userDataPath(): string;
  windowFor(sender: unknown): unknown;
  saveDialog(parent: unknown, options: DialogOptions): Promise<DialogResult>;
  saveDialogWithoutParent(options: DialogOptions): Promise<DialogResult>;
  openDialog(parent: unknown, options: DialogOptions): Promise<DialogResult>;
  openDialogWithoutParent(options: DialogOptions): Promise<DialogResult>;
  normalizeUser(input: unknown, id: unknown, now: number): unknown;
  normalizeProxy(input: unknown, id: unknown, now: number): unknown;
  normalizePayment(input: unknown): Fields | null;
  uuid(): string; now(): number; isoNow(): string;
}
const fail = (error: unknown): Result => ({ok: false, error: (error as {message?: unknown}).message});
const filters = () => [{name: 'TS Backup', extensions: ['tsbak', 'json']}];
export async function getBackupInfo(deps: BackupDeps): Promise<Result> {
  try {
    return {ok: true, data: {forms: deps.forms().all().length, payments: deps.payments().list().length,
      users: deps.users().list().length, proxies: deps.proxies().list().length,
      gologinToken: Boolean(deps.token()), aadhaar: Object.keys(deps.aadhaar()).length,
      appLock: Boolean(deps.lock()), history: deps.history().list().length}};
  } catch (error) {return fail(error);}
}
export async function backupData(deps: BackupDeps, event: Event, password: string | null | undefined, selection?: BackupSelection | null): Promise<Result> {
  try {
    const secret = (password || '').trim();
    if (secret.length < 4) return {ok: false, error: 'Choose a backup password (at least 4 characters)'};
    const selected = selection ?? ALL;
    if (!(selected.forms || selected.payments || selected.users || selected.proxies || selected.gologinToken || selected.aadhaar || selected.appLock || selected.history))
      return {ok: false, error: 'Select at least one thing to back up'};
    const forms = selected.forms ? deps.forms().all() : [];
    const users = selected.users ? deps.users().list() : [];
    const proxies = selected.proxies ? deps.proxies().list() : [];
    const payments = selected.payments ? deps.payments().list() : [];
    const lock = selected.appLock ? deps.lock() : null;
    const history = selected.history ? deps.history().list() : [];
    const payload = {version: 1, exportedAt: deps.isoNow(), forms, users, proxies, payments,
      gologinToken: selected.gologinToken ? deps.token() : '',
      aadhaar: selected.aadhaar ? deps.aadhaar() : {}, appLock: lock ? {salt: lock.salt, hash: lock.hash} : null, history};
    const envelope = deps.seal(payload, secret);
    const parent = deps.windowFor(event.sender) ?? undefined;
    const options = {defaultPath: 'ts-backup-' + deps.isoNow().slice(0, 10) + '.tsbak', filters: filters()};
    const picked = await (parent ? deps.saveDialog(parent, options) : deps.saveDialogWithoutParent(options));
    if (picked.canceled || !picked.filePath) return {ok: true, data: {canceled: true}};
    const fs = deps.fs(); fs.writeFileSync(picked.filePath, JSON.stringify(envelope), 'utf8');
    return {ok: true, data: {count: {forms: forms.length, users: users.length}}};
  } catch (error) {return fail(error);}
}
export async function restoreData(deps: BackupDeps, event: Event, password: string | null | undefined): Promise<Result> {
  try {
    const secret = (password || '').trim();
    if (!secret) return {ok: false, error: 'Enter the backup password'};
    const parent = deps.windowFor(event.sender) ?? undefined;
    const options = {properties: ['openFile'], filters: filters()};
    const picked = await (parent ? deps.openDialog(parent, options) : deps.openDialogWithoutParent(options));
    if (picked.canceled || picked.filePaths.length === 0) return {ok: true, data: {canceled: true}};
    let payload: Fields;
    try {payload = deps.unseal(JSON.parse(deps.fs().readFileSync(picked.filePaths[0], 'utf8')), secret) as Fields;}
    catch {return {ok: false, error: 'Wrong password, or not a valid TS backup file'};}
    let forms = 0, users = 0;
    if (Array.isArray(payload.forms)) {
      const valid: unknown[] = [];
      for (const entry of payload.forms) {
        if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.journey && entry.account) valid.push(entry);
      }
      forms = deps.forms().saveMany(valid).length;
    }
    if (Array.isArray(payload.users)) {
      const valid: unknown[] = [];
      for (const entry of payload.users) {
        const record = deps.normalizeUser(entry, entry?.id || deps.uuid(), deps.now());
        if (record) valid.push(record);
      }
      users = deps.users().saveMany(valid).length;
    }
    if (Array.isArray(payload.proxies)) {
      const valid: unknown[] = [];
      for (const entry of payload.proxies) {
        const record = deps.normalizeProxy(entry, entry?.id || deps.uuid(), deps.now());
        if (record) valid.push(record);
      }
      deps.proxies().saveMany(valid);
    }
    if (Array.isArray(payload.payments)) {
      const valid: unknown[] = [];
      for (const entry of payload.payments) {
        const record = deps.normalizePayment(entry);
        if (record) valid.push({...record, id: entry?.id || record.id});
      }
      if (valid.length) deps.payments().saveMany(valid);
    }
    if (typeof payload.gologinToken === 'string' && payload.gologinToken) deps.setToken(payload.gologinToken);
    // The recovered restore flow makes these three stores best-effort while
    // earlier vault failures propagate. Keep that distinction unchanged.
    if (payload.aadhaar && typeof payload.aadhaar === 'object') {
      try {
        const merged = {...deps.aadhaar(), ...payload.aadhaar};
        const fs = deps.fs(); fs.mkdirSync(deps.userDataPath(), {recursive: true});
        deps.fs().writeFileSync(deps.aadhaarPath(), JSON.stringify(merged), 'utf8');
      } catch { /* best effort, as recovered */ }
    }
    const lock = payload.appLock as Fields | undefined;
    if (lock && typeof lock === 'object' && typeof lock.salt === 'string' && typeof lock.hash === 'string') {
      try {deps.restoreLock({salt: lock.salt, hash: lock.hash, attempts: 0});} catch { /* existing store handles its validation */ }
    }
    if (Array.isArray(payload.history)) {
      try {deps.history().importEntries(payload.history);} catch { /* best effort */ }
    }
    return {ok: true, data: {count: {forms, users}}};
  } catch (error) {return fail(error);}
}
