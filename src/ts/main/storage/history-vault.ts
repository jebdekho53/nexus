// The booking-history vault ("history.vault"): the finished bookings (with their PNR) the app remembers.
//
// Reconstructed from the recovered class whose constructor is f950. Its readVault/readAll/readForWrite/writeAll are the
// same code as the record vaults' (see record-vault.ts, collection "entries"); the methods here are the ones that are
// specific to history: newest-first listing, adding with pruning, importing, deleting and the retention rule.

import type { RecordRead } from './record-vault';

/** A history entry as far as the vault is concerned. Other fields are carried through untouched. */
export interface HistoryEntry {
  id?: unknown;
  pnr?: unknown;
  bookedAt?: unknown;
  [field: string]: unknown;
}

export interface HistoryVaultInstance {
  readVault(): RecordRead;
  readAll(): HistoryEntry[];
  readForWrite(): HistoryEntry[];
  writeAll(entries: HistoryEntry[]): void;
  prune(entries: HistoryEntry[]): HistoryEntry[];
}

/** Retention settings from the application bootstrap, read when pruning (an unset value is a ReferenceError there). */
export interface HistoryDeps {
  /** How long an entry is kept, in milliseconds (bootstrap slot 553, "k0"). */
  maxAgeMs(): number;
  /** How many entries are kept (bootstrap slot 552, "bA"). */
  maxEntries(): number;
  now(): number;
}

// Recovered f952: newest bookings first. Sorts the array readAll() returned.
export function list(vault: HistoryVaultInstance): HistoryEntry[] {
  return vault.readAll().sort((a, b) => (b.bookedAt as number) - (a.bookedAt as number));
}

// Recovered f954: append, prune and store; returns the entry given.
export function add(vault: HistoryVaultInstance, entry: HistoryEntry): HistoryEntry {
  const entries = vault.readForWrite();
  entries.push(entry);
  vault.writeAll(vault.prune(entries));
  return entry;
}

// Recovered f955: import entries that have a string id and a PNR and are not already stored; returns how many.
export function importEntries(vault: HistoryVaultInstance, incoming: unknown): number {
  if (!Array.isArray(incoming) || incoming.length === 0) return 0;
  const entries = vault.readForWrite();
  const known = new Set(entries.map(entry => entry.id));
  let added = 0;
  for (const item of incoming as HistoryEntry[]) {
    if (!item) continue;
    if (typeof item.id !== 'string') continue;
    if (!item.pnr) continue;
    if (known.has(item.id)) continue;
    entries.push(item);
    known.add(item.id);
    added++;
  }
  if (added) vault.writeAll(vault.prune(entries));
  return added;
}

// Recovered f957: the removed entry, or null when the id is unknown.
export function remove(vault: HistoryVaultInstance, id: unknown): HistoryEntry | null {
  const entries = vault.readForWrite();
  const index = entries.findIndex(entry => entry.id === id);
  if (index < 0) return null;
  const [removed] = entries.splice(index, 1);
  vault.writeAll(entries);
  return removed;
}

// Recovered f959: clears the history and reports what it held. Unlike the other writers this does not refuse an
// unreadable vault; it reads it as empty, as the recovered code does.
export function deleteAll(vault: HistoryVaultInstance): { count: number; pnrs: unknown[] } {
  const read = vault.readVault();
  const entries = (read.ok ? read.entries : []) as HistoryEntry[];
  const pnrs = entries.map(entry => entry.pnr).filter(Boolean);
  vault.writeAll([]);
  return { count: entries.length, pnrs };
}

// Recovered f961 (+ f962, f963): drop entries older than the retention age, order newest first and keep the newest
// maxEntries.
export function prune(entries: HistoryEntry[], deps: HistoryDeps): HistoryEntry[] {
  const cutoff = deps.now() - deps.maxAgeMs();
  const kept = entries
    .filter(entry => ((entry.bookedAt as number) || 0) >= cutoff)
    .sort((a, b) => (b.bookedAt as number) - (a.bookedAt as number));
  return kept.length > deps.maxEntries() ? kept.slice(0, deps.maxEntries()) : kept;
}
