// Booking rules: proxy records, lower-berth limits, quota opening times, availability times and booking-mode routing.
// Each function notes the recovered function it reconstructs. Dependencies that the recovered code reads from the
// bootstrap scope (defaults, limits, callbacks) are passed in, and are read lazily exactly when the recovered code reads them.
import { parseClockTime } from './time-helpers';

export type QuotaFamilyName = 'eightAm' | 'acTatkal' | 'slTatkal';

export interface ProxyRecord {
  host: string;
  port?: string | number | null;
  username?: string | null;
  password?: string | null;
  label?: string | null;
}

export interface ProxySettings {
  server: string;
  username: string | undefined;
  password: string | undefined;
}

// Recovered f425: Playwright-style proxy settings from a stored proxy record.
export function proxySettings(proxy: ProxyRecord): ProxySettings {
  return {
    server: proxy.port ? proxy.host + ':' + proxy.port : proxy.host,
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

// Recovered f426: display name for a proxy record (its trimmed label, else host[:port]).
export function proxyLabel(proxy: ProxyRecord): string {
  const label = proxy.label && proxy.label.trim();
  return label || (proxy.port ? proxy.host + ':' + proxy.port : proxy.host);
}

// Recovered f427: senior citizen (men 60+, women 58+).
export function isSeniorCitizen(gender: string, age: number): boolean {
  return (gender === 'M' && age >= 60) || (gender === 'F' && age >= 58);
}

export interface PassengerForBerth {
  age?: unknown;
  childBerth?: unknown;
  berthPreference?: unknown;
  gender?: unknown;
}

// Recovered f428 (+f430): whether a passenger counts toward the lower-berth limit. A blank preference counts
// for senior citizens because the booking service allots them a lower berth automatically.
export function countsAsLowerBerth(
  passenger: PassengerForBerth,
  { isSenior = isSeniorCitizen }: { isSenior?: (gender: string, age: number) => boolean } = {},
): boolean {
  const age = Number(passenger.age) || 0;
  if (age > 0 && age < 5 && passenger.childBerth === false) return false;
  const preference = String(passenger.berthPreference ?? '').toUpperCase().trim();
  if (preference === 'LB') return true;
  if (preference !== '') return false;
  return isSenior(String(passenger.gender ?? ''), age);
}

// Recovered f429 (+f430): number of passengers that count as lower berths.
export function countLowerBerths<P>(passengers: readonly P[], deps: { counts: (passenger: P) => boolean }): number {
  return passengers.reduce((total, passenger) => total + (deps.counts(passenger) ? 1 : 0), 0);
}

// Recovered f431: warning text when too many passengers need lower berths, else null.
export function lowerBerthWarning<P>(
  passengers: readonly P[],
  deps: { countLower: (passengers: readonly P[]) => number; limit: () => number },
): string | null {
  const lower = deps.countLower(passengers);
  if (lower <= deps.limit()) return null;
  return 'Only ' + deps.limit() + ' lower berths are allowed per booking — this form has ' + lower
    + '. IRCTC auto-allots a lower berth to senior citizens (men 60+, women 58+) even when the berth is left blank, so a senior counts as a lower. Give a senior citizen a non-lower berth, or reduce the Lower-berth passengers to '
    + deps.limit() + '.';
}

const FAMILIES: readonly QuotaFamilyName[] = ['eightAm', 'acTatkal', 'slTatkal'];

export type OpeningTimes = Record<QuotaFamilyName, unknown>;

// Recovered f433: opening-time defaults per quota family (stored values when valid, else built-in ones).
export function openingTimes(
  stored: { default?: Partial<Record<QuotaFamilyName, unknown>> | null } | null | undefined,
  { parse = parseClockTime, defaults }: { parse?: (value: unknown) => unknown; defaults: () => Record<QuotaFamilyName, unknown> },
): OpeningTimes {
  const times = {} as OpeningTimes;
  for (const family of FAMILIES) times[family] = parse(stored?.default?.[family]) ?? defaults()[family];
  return times;
}

export interface AvailabilityConfig {
  availabilityEpoch?: unknown;
  availTimes?: {
    default?: Partial<Record<QuotaFamilyName, unknown>> | null;
    special?: Partial<Record<QuotaFamilyName, unknown>> | null;
  } | null;
  [field: string]: unknown;
}

// Recovered f435: availability config tagged with the epoch it was captured in (availTimes are dropped when the
// epoch changed).
export function withAvailabilityEpoch(config: AvailabilityConfig | null | undefined, epoch: unknown): AvailabilityConfig | null | undefined {
  if (!epoch || config?.availabilityEpoch === epoch) return config;
  const { availTimes: _dropped, ...rest } = config ?? {};
  void _dropped;
  rest.availabilityEpoch = epoch;
  return rest;
}

// Recovered f436: default availability time for a family, only when the stored epoch matches the current one.
export function storedAvailabilityTime(
  stored: AvailabilityConfig | null | undefined,
  current: AvailabilityConfig,
  family: QuotaFamilyName,
): unknown {
  if (current.availabilityEpoch && stored?.availabilityEpoch !== current.availabilityEpoch) return undefined;
  return stored?.availTimes?.default?.[family];
}

// Recovered f437: the flag is exactly true and the minute of day is before the cutoff.
export function beforeCutoff(flag: unknown, minuteOfDay: number, deps: { cutoff: () => number }): boolean {
  return flag === true && minuteOfDay < deps.cutoff();
}

// Recovered f438: availability time for a family — a special-train override first, else the stored default.
export function availabilityTime(
  stored: AvailabilityConfig | null | undefined,
  current: AvailabilityConfig,
  family: QuotaFamilyName,
  special: unknown,
  { parse = parseClockTime, lookup = storedAvailabilityTime }: {
    parse?: (value: unknown) => unknown;
    lookup?: (stored: AvailabilityConfig | null | undefined, current: AvailabilityConfig, family: QuotaFamilyName) => unknown;
  } = {},
): unknown {
  if (special) {
    const overridden = parse(current.availTimes?.special?.[family]);
    if (overridden != null) return overridden;
    return current.availTimes?.default?.[family];
  }
  const resolved = parse(lookup(stored, current, family));
  if (resolved != null) return resolved;
  return current.availTimes?.default?.[family];
}

// Recovered f439: "name · detail" unless the detail is empty, contains whitespace or is already in the name.
export function joinLabel(name: string | null | undefined, detail: string | null | undefined): string {
  const second = (detail || '').trim();
  const first = (name || '').trim();
  if (!second || /\s/.test(second) || first.includes(second)) return first;
  return first + ' · ' + second;
}

// Recovered f440: is the mode in the list.
export function listIncludes<T>(list: readonly T[], mode: T): boolean {
  return list.includes(mode);
}

// Recovered f441: 'alt' when the configuration enables Rail-Brahmos and the list has the mode, else 'normal'.
export function railBrahmosKind<L>(
  config: { railBrahmos?: unknown } | null | undefined,
  list: L,
  deps: { includes: (list: L) => boolean },
): 'alt' | 'normal' {
  return config?.railBrahmos === true && deps.includes(list) ? 'alt' : 'normal';
}

export interface LoginOptions {
  manualLogin?: unknown;
  brahmosLogin?: unknown;
  directLogin?: unknown;
}

// Recovered f444: login mode from the option flags.
export function loginMode<M>(options: LoginOptions | null | undefined, deps: { brahmosMode: () => M }): 'manual' | M | 'direct' | 'auto' {
  if (options?.manualLogin === true) return 'manual';
  if (options?.brahmosLogin === true) return deps.brahmosMode();
  if (options?.directLogin === true) return 'direct';
  return 'auto';
}

// Recovered f445: option flags for a login mode.
export function loginFlags(mode: unknown, deps: { brahmosMode: () => unknown }): { manualLogin: boolean; directLogin: boolean; brahmosLogin: boolean } {
  const brahmos = mode === deps.brahmosMode();
  return { manualLogin: mode === 'manual', directLogin: mode === 'direct' || brahmos, brahmosLogin: brahmos };
}

// Recovered f446: the mode if allowed (the list, or the default list when empty), else the first allowed one.
export function allowedMode<M>(mode: M, list: readonly M[], deps: { defaults: () => Iterable<M> }): M | undefined {
  const allowed = list.length ? list : [...deps.defaults()];
  return allowed.includes(mode) ? mode : allowed[0];
}

// Recovered f447: dispatch by booking mode (rail-one and UI-login runs have their own handling).
export function modeDispatch<C, A, M>(
  mode: unknown,
  config: C,
  args: Iterable<A>,
  deps: {
    railKind: (config: C, args: Iterable<A>) => M;
    loginModeOf: (config: C) => M;
    allowedModeOf: (mode: M, list: A[]) => M | undefined;
  },
): M | 'uilogin' | undefined {
  if (mode === 'railone') return deps.railKind(config, args);
  if (mode === 'uilogin') return 'uilogin';
  return deps.allowedModeOf(deps.loginModeOf(config), [...args]);
}

export interface ProxyForm {
  enabled?: unknown;
  host?: string | null;
  port?: string | null;
  username?: string | null;
  password?: string | null;
}

// Recovered f448: proxy settings from the saved proxy form (disabled or host-less configurations give nothing).
export function proxyFromConfig(config: ProxyForm | null | undefined): ProxySettings | undefined {
  if (!(config?.enabled && config.host?.trim())) return undefined;
  const host = config.host.trim();
  const port = config.port?.trim();
  return {
    server: port ? host + ':' + port : host,
    username: config.username || undefined,
    password: config.password || undefined,
  };
}

// Recovered f449.
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Recovered f450: the value when it is a string, else the fallback (default empty text).
export function stringOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// Recovered f451: the candidate when it is a member of the allowed text, else the fallback.
export function memberOr<F>(allowed: string | readonly string[], candidate: unknown, fallback: F): string | F {
  return typeof candidate === 'string' && allowed.includes(candidate) ? candidate : fallback;
}

// Recovered f452: a positive amount from a number or text such as "₹1,234.50" (anything else: undefined).
export function positiveAmount(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

// Recovered f453: passenger count from a number or text, kept within 1–4 (invalid input: 1).
export function passengerCount(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN;
  return Number.isFinite(number) ? Math.max(1, Math.min(4, Math.floor(number))) : 1;
}

// Recovered f454: quota family with case-insensitive input.
export function quotaFamilyCaseless(
  quota: string | null | undefined,
  classCode: string | null | undefined,
  deps: { acClasses: () => ReadonlySet<string> },
): QuotaFamilyName | null {
  const code = (quota || '').toUpperCase();
  if (code === '8AM' || code === 'LD' || code === 'SS') return 'eightAm';
  if (code === 'TQ' || code === 'PT') return deps.acClasses().has((classCode || '').toUpperCase()) ? 'acTatkal' : 'slTatkal';
  return null;
}

/** Opening time as the recovered code stores it: hour/minute plus a display label. */
export interface OpeningTime {
  h: number;
  m: number;
  label: string;
}

const IST_OFFSET_MS = 19800000;

// Recovered f455: whether the booking window of a quota is open at `now` (IST opening time of the same day).
export function bookingWindow(
  quota: string | null | undefined,
  classCode: string | null | undefined,
  now: number,
  deps: {
    family: (quota: string | null | undefined, classCode: string | null | undefined) => QuotaFamilyName | null;
    openingTimes: () => Record<QuotaFamilyName, OpeningTime>;
  },
): { open: true } | { open: false; opensAtLabel: string } {
  const name = deps.family(quota, classCode);
  if (!name) return { open: true };
  const opening = deps.openingTimes()[name];
  const day = new Date(now + IST_OFFSET_MS);
  const opensAt = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), opening.h, opening.m, 0) - IST_OFFSET_MS;
  return now >= opensAt ? { open: true } : { open: false, opensAtLabel: opening.label };
}

const PREMIUM_NAMES = ['vande', 'shatabdi', 'rajdhani', 'gatimaan', 'tejas'];

// Recovered f456 (+f457): premium trains by name or by (trimmed) train number.
export function isPremiumTrain(
  number: string | null | undefined,
  name: string | null | undefined,
  deps: { premiumNumbers: () => ReadonlySet<string> },
): boolean {
  const lowered = (name ?? '').toLowerCase();
  if (lowered && PREMIUM_NAMES.some(part => lowered.includes(part))) return true;
  const trimmed = (number ?? '').trim();
  return Boolean(trimmed) && deps.premiumNumbers().has(trimmed);
}
