// Scheduling, clock and message-formatting helpers used by the booking controllers.
// Each function notes the recovered function it reconstructs. Behaviour (including how missing, null, empty and zero
// values are treated) matches the recovered JavaScript; test/ts-time-helpers.test.cjs compares both implementations.

/** India Standard Time offset from UTC (UTC+05:30) in milliseconds. */
export const IST_OFFSET_MS = 19800000;

export type RandomSource = () => number;

/** Wall-clock time of day. `second` and `millisecond` are optional when supplied to {@link istDayAt}. */
export interface ClockTime {
  hour: number;
  minute: number;
  second?: number;
  millisecond?: number;
}

/** A {@link ClockTime} after validation: every field is present. */
export type ValidClockTime = Required<ClockTime>;

export interface FailureDescriptionDeps {
  /** Extracts message text from a response body (the controllers pass their error-text reader). */
  messageOf: (text: unknown) => string;
  /** Message used for HTTP 409 (a second login for the same account). */
  duplicateLoginMessage: () => string;
}

export type QuotaFamily = 'eightAm' | 'acTatkal' | 'slTatkal';

// Recovered f2271: min + a random whole number below (max - min).
export function randomBetween(min: number, max: number, random: RandomSource = Math.random): number {
  return min + Math.floor(random() * (max - min));
}

// Recovered f2367: a random element of the list.
export function pickRandom<T>(list: readonly T[], random: RandomSource = Math.random): T {
  return list[Math.floor(random() * list.length)] as T;
}

// Recovered f2368: step table lookup (1-based index, clamped); empty or non-numeric entries give 35.
export function pickStep(list: readonly unknown[], position: number): number {
  if (!list.length) return 35;
  const value = list[Math.min(Math.max(position, 1) - 1, list.length - 1)];
  return typeof value === 'number' && Number.isFinite(value) ? value : 35;
}

// Recovered f2369 (+f2370): message text from a string or an error-like object.
export function errorText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!(value && typeof value === 'object')) return '';
  const fields = value as Record<string, unknown>;
  return [fields.error_description, fields.errorMessage, fields.errorMsg, fields.error]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

// Recovered f2373: human-readable failure for an API response.
export function describeFailure(status: number, text: unknown, deps: FailureDescriptionDeps): string {
  const message = deps.messageOf(text);
  if (status === 401 || /invalid_token|invalid access token/i.test(message)) return 'session expired (invalid token) — re-login & retry';
  if (status === 403) return 'access blocked by the Provider (403)';
  if (status === 409) return deps.duplicateLoginMessage();
  return message || 'error ' + status;
}

// Recovered f2375: which timing family a quota belongs to.
export function quotaFamily(
  quota: string,
  classCode: string | null | undefined,
  deps: { acClasses: () => ReadonlySet<string> },
): QuotaFamily | null {
  if (quota === '8AM' || quota === 'LD' || quota === 'SS') return 'eightAm';
  if (quota === 'TQ' || quota === 'PT') return deps.acClasses().has((classCode || '').toUpperCase()) ? 'acTatkal' : 'slTatkal';
  return null;
}

function validInteger(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Recovered f2376: validated {hour, minute, second, millisecond} or null. Hour and minute are required; an invalid
// second or millisecond falls back to 0.
export function parseClockTime(value: unknown): ValidClockTime | null {
  if (!(value && typeof value === 'object')) return null;
  const fields = value as Record<string, unknown>;
  const hour = Number(fields.hour);
  const minute = Number(fields.minute);
  if (!validInteger(hour, 0, 23) || !validInteger(minute, 0, 59)) return null;
  const second = Number(fields.second);
  const millisecond = Number(fields.millisecond);
  return {
    hour,
    minute,
    second: validInteger(second, 0, 59) ? second : 0,
    millisecond: validInteger(millisecond, 0, 999) ? millisecond : 0,
  };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

// Recovered f2377 (+f2378): India Standard Time clock text "HH:MM:SS.mmm" for an epoch time.
export function formatIstClock(epochMs: number): string {
  const date = new Date(epochMs + IST_OFFSET_MS);
  return pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds()) + '.' + pad(date.getUTCMilliseconds(), 3);
}

// Recovered f2379: provider timestamp text -> epoch ms (IST assumed when no zone is given) or null.
export function parseServerTimestamp(value: unknown): number | null {
  if (!(typeof value === 'string' && value.trim())) return null;
  let text = value.trim().replace(' ', 'T');
  if (!/(?:[+-]\d{2}:?\d{2}|Z)$/.test(text)) text += '+05:30';
  const epoch = new Date(text).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

// Recovered f2380: epoch ms of the IST calendar day containing `dayMs` at the given clock time.
export function istDayAt(dayMs: number, time: ClockTime): number {
  const day = new Date(dayMs + IST_OFFSET_MS);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), time.hour, time.minute, time.second ?? 0, time.millisecond ?? 0) - IST_OFFSET_MS;
}

// Recovered f2381: text preview of a value (long JSON is cut at 20000 characters unless `full`).
export function preview(value: unknown, full = false): string {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!text) return '';
    if (full) return text;
    return text.length > 20000 ? text.slice(0, 20000) + '…' : text;
  } catch {
    return '';
  }
}

// Recovered f2383: random reference number "REF-XXXXXXXX".
export function referenceNumber(random: RandomSource = Math.random): string {
  return 'REF-' + random().toString(36).slice(2, 10).toUpperCase();
}

// Recovered f2385: "<prefix>|<last four digits>".
export function maskedKey(prefix: string, value?: string | null): string {
  return prefix + '|' + (value || '').replace(/\D/g, '').slice(-4);
}
