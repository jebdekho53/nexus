// Encrypted record vaults for the user's saved logins ("users.vault"), proxies ("proxies.vault") and payment
// methods ("payments.vault").
//
// The three recovered classes (constructors f898, f914, f932) have identical methods that differ only in the name of
// the property that holds the records and in the text of the "locked" error; the saved-logins vault has no `get`.
// Each class keeps its recovered constructor; the methods below replace the recovered method bodies and call each other
// through the instance. Encryption and decryption are the application's own helpers and are injected.
//
// Same file format as the forms vault: JSON of an encryption envelope whose plain text is a JSON array.

/** A stored record as far as the vault is concerned. Other fields are carried through untouched. */
export interface VaultRecord {
  id?: unknown;
  updatedAt?: unknown;
  [field: string]: unknown;
}

export type RecordRead = { ok: true; [collection: string]: unknown } | { ok: false };

export interface RecordVaultInstance {
  dir: string;
  key: unknown;
  file: string;
  readVault(): RecordRead;
  readAll(): VaultRecord[];
  readForWrite(): VaultRecord[];
  writeAll(records: VaultRecord[]): void;
  saveMany(records: VaultRecord[]): VaultRecord[];
}

export interface FileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  mkdirSync(path: string, options: { recursive: boolean }): unknown;
  renameSync(from: string, to: string): void;
}

/** What differs between the three vaults, plus the bootstrap helpers (read at call time). */
export interface RecordVaultDeps {
  /** Name of the property holding the records in readVault()'s result: "users", "proxies" or "payments". */
  collection: string;
  /** Text of the error thrown when the vault exists but cannot be decrypted. */
  lockedMessage: string;
  fs(): FileSystem;
  encrypt(): (key: unknown, data: Buffer) => unknown;
  decrypt(): (key: unknown, envelope: unknown) => { toString(encoding: 'utf8'): string };
  now(): number;
}

// The recovered locked-vault messages, keyed by collection ("entries" is the booking-history vault, see history-vault.ts).
export const LOCKED_MESSAGES: Record<string, string> = {
  users:
    'Saved login data is locked: the secure vault could not be decrypted (its encryption key is unavailable). Not saving, to avoid overwriting your existing logins. Restart the app; if it persists, restore from a backup.',
  proxies:
    'Saved proxies are locked: the secure vault could not be decrypted (its encryption key is unavailable). Not saving, to avoid overwriting your existing proxies. Restart the app; if it persists, restore from a backup.',
  entries:
    'Booking history vault could not be decrypted — not writing (to avoid overwriting existing history).',
  payments:
    'Saved payments are locked: the secure vault could not be decrypted (its encryption key is unavailable). Not saving, to avoid overwriting your existing payments. Restart the app; if it persists, restore from a backup.',
};

// Recovered f909 / f927 / f945: read and decrypt. A missing file is an empty vault; any failure to read, decrypt or
// parse reports { ok: false } so that callers never overwrite data they could not read. Records are not normalised.
export function readVault(vault: RecordVaultInstance, deps: RecordVaultDeps): RecordRead {
  if (!deps.fs().existsSync(vault.file)) return { ok: true, [deps.collection]: [] };
  try {
    const envelope: unknown = JSON.parse(deps.fs().readFileSync(vault.file, 'utf8'));
    const records: unknown = JSON.parse(deps.decrypt()(vault.key, envelope).toString('utf8'));
    return { ok: true, [deps.collection]: Array.isArray(records) ? records : [] };
  } catch {
    return { ok: false };
  }
}

// Recovered f910 / f928 / f946
export function locked(vault: RecordVaultInstance): boolean {
  return !vault.readVault().ok;
}

// Recovered f911 / f929 / f947: the stored array itself; an unreadable vault reads as empty.
export function readAll(vault: RecordVaultInstance, deps: RecordVaultDeps): VaultRecord[] {
  const read = vault.readVault();
  return read.ok ? (read[deps.collection] as VaultRecord[]) : [];
}

// Recovered f912 / f930 / f948: an unreadable vault is an error so that a write never replaces data that exists.
export function readForWrite(vault: RecordVaultInstance, deps: RecordVaultDeps): VaultRecord[] {
  const read = vault.readVault();
  if (!read.ok) throw new Error(deps.lockedMessage);
  return read[deps.collection] as VaultRecord[];
}

// Recovered f913 / f931 / f949: encrypt and replace the file through a temporary sibling.
export function writeAll(vault: RecordVaultInstance, records: VaultRecord[], deps: RecordVaultDeps): void {
  deps.fs().mkdirSync(vault.dir, { recursive: true });
  const envelope = deps.encrypt()(vault.key, Buffer.from(JSON.stringify(records)));
  const temporary = vault.file + '.tmp';
  deps.fs().writeFileSync(temporary, JSON.stringify(envelope), 'utf8');
  deps.fs().renameSync(temporary, vault.file);
}

// Recovered f900 / f916 / f934: most recently updated first. Sorts the array readAll() returned.
export function list(vault: RecordVaultInstance): VaultRecord[] {
  return vault.readAll().sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));
}

// Recovered f918 / f936 (not present on the saved-logins vault): undefined when the id is unknown.
export function get(vault: RecordVaultInstance, id: unknown): VaultRecord | undefined {
  return vault.readAll().find(record => record.id === id);
}

// Recovered f902 / f920 / f938
export function save(vault: RecordVaultInstance, record: VaultRecord): VaultRecord {
  return vault.saveMany([record])[0];
}

// Recovered f903 / f921 / f939: insert or replace by id, stamping updatedAt; returns the stored records in call order.
export function saveMany(vault: RecordVaultInstance, records: VaultRecord[], deps: RecordVaultDeps): VaultRecord[] {
  if (!records.length) return [];
  const stored = vault.readForWrite();
  const positions = new Map<unknown, number>();
  stored.forEach((record, index) => {
    if (!positions.has(record.id)) positions.set(record.id, index);
  });
  const saved = records.map(record => {
    const next: VaultRecord = { ...record, updatedAt: deps.now() };
    const position = positions.get(record.id);
    if (position === undefined) {
      positions.set(record.id, stored.length);
      stored.push(next);
    } else {
      stored[position] = next;
    }
    return next;
  });
  vault.writeAll(stored);
  return saved;
}

// Recovered f906 / f924 / f942: false when nothing matched.
export function remove(vault: RecordVaultInstance, id: unknown): boolean {
  const stored = vault.readForWrite();
  const kept = stored.filter(record => !(record.id === id));
  if (kept.length === stored.length) return false;
  vault.writeAll(kept);
  return true;
}

// Recovered f908 / f926 / f944: returns how many records were removed.
export function deleteAll(vault: RecordVaultInstance): number {
  const stored = vault.readForWrite();
  if (stored.length === 0) return 0;
  const count = stored.length;
  vault.writeAll([]);
  return count;
}
