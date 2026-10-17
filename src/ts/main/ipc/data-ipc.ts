// IPC handlers for the saved data: forms, booking history, saved logins, payment methods and proxies.
//
// Reconstructed from the handlers that the recovered registration function f3790 passes to `ipcMain.handle`
// (ListForms f3938, SaveForm f3936, GetForm f3943, DeleteForm f3944, DeleteAllForms f3945, DuplicateForm f3946,
// ReorderForms f3947, GetVaultLockState f3940, RecoverVaults f3941, ListHistory f3960, DeleteHistoryEntry f3961,
// ClearHistory f3962, ListUsers f3959, SaveUser f3963, DeleteUser f3965, DeleteAllUsers f3966, ListPayments f3973,
// SavePayment f3974, DeletePayment f3976, DeleteAllPayments f3977, the payments-changed broadcast f3972, ListProxies
// f3978, GetProxyTags f3979, RunSpeedTest f3980, SaveProxy f3982, DeleteProxy f3984, DeleteAllProxies f3985).
// The vaults behind them are reconstructed in ../storage; the registration, the channel names and every bootstrap helper
// named in DataIpcDeps stay recovered and are injected under names inferred from their use, read at call time.
//
// Not here: export/import handlers (file dialogs and parsers), login/licence/RailOne handlers.

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface IpcEvent {
  sender?: unknown;
}

export interface Record_ {
  id?: unknown;
  [field: string]: unknown;
}

export interface Vault<T extends Record_ = Record_> {
  list(): T[];
  save(record: T): T;
  delete(id: unknown): unknown;
  deleteAll(): number;
}

export interface FormsVault extends Vault {
  get(id: unknown): unknown;
  duplicate(id: unknown): Record_ | null;
  reorderForms(ids: unknown[]): number;
}

export interface HistoryVault {
  list(): Record_[];
  delete(id: unknown): { pnr?: unknown } | null | undefined;
  deleteAll(): { count: number; pnrs: unknown[] };
}

export interface WindowLike {
  isDestroyed(): boolean;
  webContents: { send(channel: string): void };
}

export interface DataIpcDeps {
  // forms
  formsVault(): FormsVault; // slot 1712
  /** Forms armed for a RailOne run, kept apart from the vault while they run (slot 1539 "wt"; has/get/set). */
  armedForms(): { has(id: unknown): boolean; get(id: unknown): unknown; set(id: unknown, form: unknown): unknown };
  armedIds(): { has(id: unknown): boolean }; // slot 1835 (called)
  /** Runs a vault write, retrying or reporting as the application does (slot 1813). */
  runWrite<T>(write: () => T): T;
  afterFormSaved(saved: Record_): void; // slot 1801
  formsChanged(): void; // slot 1720
  /** timing(currentTiming, availabilityEpoch) (slots 276, 1611 "ns"). */
  normalizeTiming(timing: unknown): unknown;
  lockedVaults(): { lockedVaults: unknown[] }; // slot 1809
  recoverVaults(): unknown[]; // slot 1810
  // other vaults
  usersVault(): Vault; // slot 1789
  afterUserSaved(saved: Record_): void; // slot 1800
  usersChanged(): void; // slot 1721
  historyVault(): HistoryVault; // slot 1792
  forgetPnr(pnr: unknown): void; // slot 1793
  paymentsVault(): Vault; // slot 1796
  normalizePayment(payment: unknown): Record_ | null | undefined; // slot 261
  /** Tells every open window that the payments changed (f3972 through bootstrap context slot 11). */
  paymentsChanged(): void;
  proxiesVault(): Vault; // slot 1798
  proxyTags(): unknown; // slot 1734
  runSpeedTest(...args: unknown[]): Promise<unknown>; // slot 576
  proxyAddress(proxy: Record_): unknown; // slot 265
  proxyLabel(proxy: Record_): unknown; // slot 266
  // electron and timers
  relaunch(): void;
  exit(code: number): void;
  setTimer(callback: () => void, ms: number): unknown;
  windows(): WindowLike[];
  channels(): { PaymentsChanged: string }; // slot 336 "v"
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;

// ---- forms ----------------------------------------------------------------------------------------------------------

// Recovered f3938: the saved forms, those currently armed for a RailOne run flagged.
export async function listForms(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const armed = deps.armedIds();
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.formsVault().list().map(form => (armed.has(form.id) ? { ...form, railoneArmed: true } : form));
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3936 (+ f3937): save a form. A form that is armed for a run is updated in the armed store only.
export async function saveForm(deps: DataIpcDeps, form: Record_): Promise<HandlerResult> {
  try {
    if (!deps.armedForms().has(form.id)) {
      const saved = deps.runWrite(() => deps.formsVault().save(form));
      deps.afterFormSaved(saved);
      deps.formsChanged();
      return { ok: true, data: { id: saved.id } };
    }
    const armed = deps.armedForms();
    armed.set(form.id, { ...form, timing: deps.normalizeTiming(form.timing) });
    return { ok: true, data: { id: form.id } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3943: the armed copy when there is one, otherwise the stored form.
export async function getForm(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.armedForms().get(id) ?? deps.formsVault().get(id);
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3944
export async function deleteForm(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    deps.formsVault().delete(id);
    deps.formsChanged();
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3945
export async function deleteAllForms(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const deleted = deps.formsVault().deleteAll();
    deps.formsChanged();
    return { ok: true, data: { deleted } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3946
export async function duplicateForm(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    const copy = deps.formsVault().duplicate(id);
    if (copy) deps.formsChanged();
    return copy ? { ok: true, data: { id: copy.id } } : failure('Form not found');
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3947 (+ f3948): remember the order of the given form ids (non-strings are ignored).
export async function reorderForms(deps: DataIpcDeps, ids: unknown): Promise<HandlerResult> {
  try {
    if (Array.isArray(ids)) deps.formsVault().reorderForms(ids.filter(id => typeof id === 'string'));
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3940
export async function getVaultLockState(deps: DataIpcDeps): Promise<HandlerResult> {
  const locked = deps.lockedVaults().lockedVaults;
  return { ok: true, data: { locked: locked.length > 0, lockedVaults: locked } };
}

// Recovered f3941 (+ f3942): move the vaults that cannot be opened aside and restart the app.
export async function recoverVaults(deps: DataIpcDeps): Promise<HandlerResult> {
  const moved = deps.recoverVaults();
  deps.relaunch();
  deps.setTimer(() => deps.exit(0), 300);
  return { ok: true, data: { movedAside: moved.length } };
}

// ---- history --------------------------------------------------------------------------------------------------------

// Recovered f3960
export async function listHistory(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.historyVault().list();
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3961: remove a history entry and forget its PNR.
export async function deleteHistoryEntry(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    const removed = deps.historyVault().delete(id);
    if (removed) deps.forgetPnr(removed.pnr);
    return { ok: true, data: { deleted: Boolean(removed) } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3962
export async function clearHistory(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const cleared = deps.historyVault().deleteAll();
    const count = cleared.count;
    for (const pnr of cleared.pnrs) deps.forgetPnr(pnr);
    return { ok: true, data: { deleted: count } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// ---- saved logins ---------------------------------------------------------------------------------------------------

// Recovered f3959
export async function listUsers(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.usersVault().list();
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3963 (+ f3964)
export async function saveUser(deps: DataIpcDeps, user: Record_): Promise<HandlerResult> {
  try {
    const saved = deps.runWrite(() => deps.usersVault().save(user));
    deps.afterUserSaved(saved);
    deps.usersChanged();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3965
export async function deleteUser(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    deps.usersVault().delete(id);
    deps.usersChanged();
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3966
export async function deleteAllUsers(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const deleted = deps.usersVault().deleteAll();
    deps.usersChanged();
    return { ok: true, data: { deleted } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// ---- payment methods ------------------------------------------------------------------------------------------------

// Recovered f3972: tell every open window that the payment methods changed.
export function broadcastPaymentsChanged(deps: DataIpcDeps): void {
  for (const window of deps.windows()) {
    if (!window.isDestroyed()) window.webContents.send(deps.channels().PaymentsChanged);
  }
}

// Recovered f3973
export async function listPayments(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.paymentsVault().list();
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3974 (+ f3975): save a payment method, rejecting values the normaliser does not accept (an invalid UPI id).
export async function savePayment(deps: DataIpcDeps, payment: Record_): Promise<HandlerResult> {
  try {
    const normalized = deps.normalizePayment(payment);
    if (!normalized) return failure('Enter a valid UPI ID, e.g. name@okhdfc.');
    const saved = deps.runWrite(() => deps.paymentsVault().save({ ...normalized, id: payment?.id || normalized.id }));
    deps.paymentsChanged();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3976
export async function deletePayment(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    deps.paymentsVault().delete(id);
    deps.paymentsChanged();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3977
export async function deleteAllPayments(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const deleted = deps.paymentsVault().deleteAll();
    deps.paymentsChanged();
    return { ok: true, data: { deleted } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// ---- proxies --------------------------------------------------------------------------------------------------------

// Recovered f3978
export async function listProxies(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.proxiesVault().list();
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3979
export function getProxyTags(deps: DataIpcDeps): HandlerResult {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = deps.proxyTags();
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3980 (+ f3981): measure the speed of a saved proxy, or of the host machine without one.
export async function runSpeedTest(deps: DataIpcDeps, proxyId: unknown): Promise<HandlerResult> {
  try {
    if (!proxyId) {
      const result: HandlerResult = { ok: true, data: undefined };
      result.data = await deps.runSpeedTest(undefined, 'Host machine (direct)');
      return result;
    }
    const proxy = deps.proxiesVault().list().find(candidate => candidate.id === proxyId);
    if (!proxy) return failure('That proxy is no longer saved');
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = await deps.runSpeedTest(deps.proxyAddress(proxy), deps.proxyLabel(proxy));
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3982 (+ f3983)
export async function saveProxy(deps: DataIpcDeps, proxy: Record_): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    const body: Record_ = { id: undefined };
    body.id = deps.runWrite(() => deps.proxiesVault().save(proxy)).id;
    result.data = body;
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3984
export async function deleteProxy(deps: DataIpcDeps, id: unknown): Promise<HandlerResult> {
  try {
    deps.proxiesVault().delete(id);
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f3985
export async function deleteAllProxies(deps: DataIpcDeps): Promise<HandlerResult> {
  try {
    const result: HandlerResult = { ok: true, data: undefined };
    const body = { deleted: undefined as unknown };
    body.deleted = deps.proxiesVault().deleteAll();
    result.data = body;
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}
