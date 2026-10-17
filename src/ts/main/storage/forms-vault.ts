// The saved-forms vault: one encrypted file ("forms.vault") holding the user's booking forms.
//
// Reconstructed from the recovered class whose constructor is f862 (it stores `dir`, `key`, `availabilityEpoch` and
// the vault `file`). The constructor and the class itself stay in the recovered bootstrap; the methods below replace
// the recovered method bodies one by one (see the factory table). Methods call each other through the instance, like
// the recovered code, so a replaced method and a recovered one can be mixed freely.
//
// The stored file is JSON of an encryption envelope. Encryption and decryption are the application's own helpers
// (recovered root functions) and are injected, not reimplemented here.

/** A saved form as far as the vault is concerned. Other fields are carried through untouched. */
export interface VaultForm {
  id?: unknown;
  label?: unknown;
  order?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  timing?: unknown;
  account?: { username?: unknown } | null;
  [field: string]: unknown;
}

export type VaultRead = { ok: true; forms: VaultForm[] } | { ok: false };

/** The instance state the recovered constructor establishes. */
export interface VaultInstance {
  dir: string;
  key: unknown;
  file: string;
  availabilityEpoch(): unknown;
  readVault(): VaultRead;
  readAll(): VaultForm[];
  readForWrite(): VaultForm[];
  writeAll(forms: VaultForm[]): void;
  saveMany(forms: VaultForm[]): VaultForm[];
  normalizeTiming(form: VaultForm): VaultForm;
}

export interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  mkdirSync(path: string, options: { recursive: boolean }): unknown;
  renameSync(from: string, to: string): void;
}

/** Everything the vault takes from the application bootstrap. Each accessor is read at call time. */
export interface VaultDeps {
  fs(): FileSystem;
  /** encrypt(key, data) -> JSON-serialisable envelope */
  encrypt(): (key: unknown, data: Buffer) => unknown;
  /** decrypt(key, envelope) -> Buffer-like (its toString('utf8') is the stored JSON) */
  decrypt(): (key: unknown, envelope: unknown) => { toString(encoding: 'utf8'): string };
  /** Applied to every form read from disk (receives (form, index, array) like Array.prototype.map). */
  normalizeForm(): (form: VaultForm, index?: number, all?: VaultForm[]) => VaultForm;
  /** Compact projection used by list(). */
  summarize(): (form: VaultForm) => unknown;
  /** timing(currentTiming, availabilityEpoch) -> the timing to store (the same object when unchanged). */
  timing(): (timing: unknown, epoch: unknown) => unknown;
  /** label(baseLabel, username) -> the label with its numbering suffix. */
  label(): (base: string, username: string) => string;
  randomUuid(): string;
  now(): number;
}

const numeric = (value: unknown): number | bigint => (typeof value === 'bigint' ? value : Number(value));

// Recovered f889: read and decrypt the vault. A missing file is an empty vault; any failure to read, decrypt or parse
// reports { ok: false } so that callers never overwrite data they could not read.
export function readVault(vault: VaultInstance, deps: VaultDeps): VaultRead {
  if (!deps.fs().existsSync(vault.file)) return { ok: true, forms: [] };
  try {
    const envelope: unknown = JSON.parse(deps.fs().readFileSync(vault.file, 'utf8'));
    const plain = deps.decrypt()(vault.key, envelope).toString('utf8');
    const forms: unknown = JSON.parse(plain);
    return { ok: true, forms: Array.isArray(forms) ? (forms as VaultForm[]).map(deps.normalizeForm()) : [] };
  } catch {
    return { ok: false };
  }
}

// Recovered f890
export function locked(vault: VaultInstance): boolean {
  return !vault.readVault().ok;
}

// Recovered f891: all forms, timing normalised; an unreadable vault reads as empty.
export function readAll(vault: VaultInstance): VaultForm[] {
  const read = vault.readVault();
  if (!read.ok) return [];
  return read.forms.map(form => vault.normalizeTiming(form));
}

export const LOCKED_MESSAGE =
  'Saved data is locked: the secure vault exists but could not be decrypted (its encryption key is unavailable — e.g. the OS keychain is locked or changed after an update). Not saving, to avoid overwriting your existing data. Restart the app; if it persists, restore from a backup.';

// Recovered f893: the same, but an unreadable vault is an error so that a write never replaces data that exists.
export function readForWrite(vault: VaultInstance): VaultForm[] {
  const read = vault.readVault();
  if (!read.ok) throw new Error(LOCKED_MESSAGE);
  return read.forms.map(form => vault.normalizeTiming(form));
}

// Recovered f895: encrypt and replace the file through a temporary sibling.
export function writeAll(vault: VaultInstance, forms: VaultForm[], deps: VaultDeps): void {
  deps.fs().mkdirSync(vault.dir, { recursive: true });
  const envelope = deps.encrypt()(vault.key, Buffer.from(JSON.stringify(forms)));
  const temporary = vault.file + '.tmp';
  deps.fs().writeFileSync(temporary, JSON.stringify(envelope), 'utf8');
  deps.fs().renameSync(temporary, vault.file);
}

// Recovered f888: store a form's timing in its normalised shape; the form itself when nothing changes.
export function normalizeTiming(vault: VaultInstance, form: VaultForm, deps: VaultDeps): VaultForm {
  const timing = deps.timing()(form.timing, vault.availabilityEpoch());
  return timing === form.timing ? form : { ...form, timing };
}

// Recovered f865: the list shown in the UI, ordered by the user's order (newest first when none was set).
export function list(vault: VaultInstance, deps: VaultDeps): unknown[] {
  return vault
    .readAll()
    .map(form => ({ s: deps.summarize()(form), k: form.order ?? -numeric(form.createdAt) }))
    .sort((a, b) => (a.k as number) - (b.k as number))
    .map(entry => entry.s);
}

// Recovered f869: remember the order of the given ids; returns how many forms moved.
export function reorderForms(vault: VaultInstance, ids: unknown[]): number {
  const read = vault.readVault();
  if (!read.ok) return 0;
  const ranks = new Map(ids.map((id, index) => [id, index] as [unknown, number]));
  let changed = 0;
  for (const form of read.forms) {
    const rank = ranks.get(form.id);
    if (rank === undefined) continue;
    if (form.order === rank) continue;
    form.order = rank;
    changed++;
  }
  if (changed) vault.writeAll(read.forms);
  return changed;
}

// Recovered f871: all forms, most recently updated first.
export function all(vault: VaultInstance): VaultForm[] {
  return vault.readAll().slice().sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));
}

// Recovered f873
export function get(vault: VaultInstance, id: unknown): VaultForm | null {
  return vault.readAll().find(form => form.id === id) ?? null;
}

// Recovered f875
export function save(vault: VaultInstance, form: VaultForm): VaultForm {
  return vault.saveMany([form])[0];
}

// Recovered f876: insert or replace by id, stamping updatedAt; returns the stored forms in the order given.
export function saveMany(vault: VaultInstance, forms: VaultForm[], deps: VaultDeps): VaultForm[] {
  if (!forms.length) return [];
  const stored = vault.readForWrite();
  const positions = new Map<unknown, number>();
  stored.forEach((form, index) => {
    if (!positions.has(form.id)) positions.set(form.id, index);
  });
  const saved = forms.map(form => {
    const normalized = vault.normalizeTiming(deps.normalizeForm()({ ...form, updatedAt: deps.now() }));
    const position = positions.get(form.id);
    if (position === undefined) {
      positions.set(form.id, stored.length);
      stored.push(normalized);
    } else {
      stored[position] = normalized;
    }
    return normalized;
  });
  vault.writeAll(stored);
  return saved;
}

// Recovered f879: false when nothing matched.
export function remove(vault: VaultInstance, id: unknown): boolean {
  const stored = vault.readForWrite();
  const kept = stored.filter(form => !(form.id === id));
  if (kept.length === stored.length) return false;
  vault.writeAll(kept);
  return true;
}

// Recovered f881: returns how many forms were removed.
export function deleteAll(vault: VaultInstance): number {
  const stored = vault.readForWrite();
  if (stored.length === 0) return 0;
  const count = stored.length;
  vault.writeAll([]);
  return count;
}

// Recovered f882: a copy of a form under a new id, keeping the label; null when the id is unknown.
export function duplicate(vault: VaultInstance, id: unknown, deps: VaultDeps): VaultForm | null {
  const stored = vault.readForWrite();
  const original = stored.find(form => form.id === id);
  if (!original) return null;
  const now = deps.now();
  const copy: VaultForm = { ...original, id: deps.randomUuid(), label: original.label, createdAt: now, updatedAt: now };
  stored.push(copy);
  vault.writeAll(stored);
  return copy;
}

const NUMBERING_SUFFIX = /\s*\((?:copy|pair)\)\s*$/i;

// Recovered f884: rewrite each label without its "(copy)"/"(pair)" suffixes, numbered by the label helper.
export function migrateLabels(vault: VaultInstance, deps: VaultDeps): number {
  const read = vault.readVault();
  if (!read.ok) return 0;
  let changed = 0;
  for (const form of read.forms) {
    let base = ((form.label || '') as string).trim();
    while (NUMBERING_SUFFIX.test(base)) base = base.replace(NUMBERING_SUFFIX, '').trim();
    const makeLabel = deps.label();
    const label = makeLabel(base, (form.account?.username || '') as string);
    if (label !== form.label) {
      form.label = label;
      changed++;
    }
  }
  if (changed) vault.writeAll(read.forms);
  return changed;
}

// Recovered f885: drop per-form availability timing overrides (keeping login timing).
export function clearAvailTimingOverrides(vault: VaultInstance): { ok: boolean; changed: number } {
  const read = vault.readVault();
  if (!read.ok) return { ok: false, changed: 0 };
  let changed = 0;
  for (const form of read.forms) {
    const timing = form.timing as { availTimes?: unknown; loginTimes?: unknown } | null | undefined;
    if (timing?.availTimes) {
      delete timing.availTimes;
      if (!timing.loginTimes) delete form.timing;
      changed++;
    }
  }
  if (changed) vault.writeAll(read.forms);
  return { ok: true, changed };
}

// Recovered f886: apply the availability defaults for the given epoch to every form.
export function adoptAvailabilityDefaults(vault: VaultInstance, epoch: unknown, deps: VaultDeps): { ok: boolean; changed: number } {
  const read = vault.readVault();
  if (!read.ok) return { ok: false, changed: 0 };
  let changed = 0;
  const forms = read.forms.map(form => {
    const timing = deps.timing()(form.timing, epoch);
    if (timing === form.timing) return form;
    changed++;
    return { ...form, timing };
  });
  if (changed) vault.writeAll(forms);
  return { ok: true, changed };
}

export interface FormSummary {
  id: unknown;
  label: unknown;
  origin: unknown;
  destination: unknown;
  journeyDate: unknown;
  loginMode: unknown;
  paymentMethod: unknown;
  passengerCount: unknown;
  search: string;
  createdAt: unknown;
  updatedAt: unknown;
}

interface SummarisableForm {
  id?: unknown;
  label?: unknown;
  loginMode?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  journey: { origin?: unknown; destination?: unknown; trainNumber?: unknown; journeyDate?: unknown };
  payment: { method?: unknown };
  passengers: { name?: unknown }[];
  account: { username?: unknown; mobileNumber?: unknown };
}

// Recovered f896 (+ f897): the compact record shown in the saved-forms list, with a lower-cased search string made
// of the label, journey, account and passenger names.
export function summarizeForm(form: SummarisableForm): FormSummary {
  const summary: FormSummary = {
    id: form.id,
    label: form.label,
    origin: form.journey.origin,
    destination: form.journey.destination,
    journeyDate: form.journey.journeyDate,
    loginMode: form.loginMode,
    paymentMethod: form.payment.method,
    passengerCount: form.passengers.length,
    search: '',
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
  const parts: unknown[] = [
    form.label,
    form.journey.origin,
    form.journey.destination,
    form.journey.trainNumber,
    form.journey.journeyDate,
    form.account.username,
    form.account.mobileNumber,
    ...form.passengers.map(passenger => passenger.name),
  ];
  summary.search = parts.filter(Boolean).join(' ').toLowerCase();
  return summary;
}
