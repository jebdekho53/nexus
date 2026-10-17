// Server-time bookkeeping for a booking run. The offset (server minus local clock, in ms) is kept on the run
// and mirrored into the session tokens so a relaunched browser starts from the same estimate.

export type LogLevel = 'warn' | 'error' | 'info';

/** Session tokens as far as server-time bookkeeping is concerned. Other token fields are left untouched. */
export interface SessionTokens {
  serverTimeOffsetMs?: unknown;
  [field: string]: unknown;
}

export interface ApiResponse {
  body?: {
    timeStamp?: unknown;
    data?: { timeStamp?: unknown } | null;
  } | null;
}

/** The parts of a booking run (the recovered "actor") that server-time bookkeeping reads and writes. */
export interface ServerTimeActor {
  timeOffset: number;
  session: { tokens?: SessionTokens | null };
  opts: { serverTimeSync?: unknown };
  api?: { call(method: string, path: string): Promise<ApiResponse | null | undefined> } | null;
  now(): number;
  serverNow(): number;
  log(category: string, message: string, level?: LogLevel): void;
  applyServerTimeStamp(stamp: unknown, t0: number, t1: number, label?: string): boolean;
}

/** Offsets of this size or larger are treated as a wrong machine date and rejected. */
const MAX_PLAUSIBLE_OFFSET_MS = 3600000;

function capturedOffset(actor: ServerTimeActor): number | undefined {
  const captured = actor.session.tokens?.serverTimeOffsetMs;
  return typeof captured === 'number' && Number.isFinite(captured) ? captured : undefined;
}

const signed = (value: number): string => (value >= 0 ? '+' : '') + Math.round(value);

// Recovered f2272: the corrected "now".
export function serverNow(actor: ServerTimeActor): number {
  const captured = capturedOffset(actor);
  return actor.now() + (captured !== undefined ? captured : actor.timeOffset);
}

export interface ApplyStampDeps {
  parseStamp: (stamp: unknown) => number | null;
  formatClock: (epochMs: number) => string;
}

// Recovered f2274. Accepts a provider timestamp measured between two local clock readings (t0, t1) and
// refuses offsets of an hour or more (a wrong machine date), keeping the previous estimate.
export function applyServerTimeStamp(
  actor: ServerTimeActor,
  stamp: unknown,
  t0: number,
  t1: number,
  label: string | undefined,
  deps: ApplyStampDeps,
): boolean {
  const name = label === undefined ? 'sync' : label;
  const server = deps.parseStamp(stamp);
  if (server == null) {
    actor.log('time', '⏱ ' + name + ': NO/BAD timeStamp (' + String(stamp ?? 'none') + ') — keeping offset ' + Math.round(actor.timeOffset) + 'ms (serverNow ' + deps.formatClock(actor.serverNow()) + ')', 'warn');
    return false;
  }
  const local = (t0 + t1) / 2;
  const offset = server - local;
  if (Math.abs(offset) >= MAX_PLAUSIBLE_OFFSET_MS) {
    actor.log('time', '⏱ ' + name + ': offset ' + Math.round(offset) + 'ms > 1h — REJECTED (wrong machine date?), keeping ' + Math.round(actor.timeOffset) + 'ms', 'warn');
    return false;
  }
  const previous = actor.timeOffset;
  actor.timeOffset = offset;
  if (actor.session.tokens) actor.session.tokens.serverTimeOffsetMs = offset;
  actor.log('time', '⏱ ' + name + ': server=' + deps.formatClock(server) + ' local=' + deps.formatClock(local) + ' → offset ' + signed(offset) + 'ms (rtt ' + Math.round(t1 - t0) + 'ms, Δ vs last ' + signed(offset - previous) + 'ms) · serverNow=' + deps.formatClock(actor.serverNow()));
  return true;
}

// Recovered f2276 (+f2277). Keepalive: refresh the offset from the recent-transactions response.
// Without server-time sync enabled nothing is requested.
export async function syncServerTime(actor: ServerTimeActor, deps: { basePath: () => string }): Promise<undefined> {
  if (!actor.opts.serverTimeSync) return undefined;
  const t0 = actor.now();
  // Like the recovered code this assumes an api client exists whenever sync is enabled (a missing one throws).
  const response = await actor.api!.call('GET', deps.basePath() + '/recentTxnsDetails').catch(() => null);
  const t1 = actor.now();
  const body = response?.body;
  const stamp = body?.timeStamp ?? body?.data?.timeStamp;
  actor.applyServerTimeStamp(stamp, t0, t1, 'keepalive sync (recentTxns)');
  return undefined;
}

// Recovered f2278 (+f2279). First estimate: the one captured during login, else fetchJourneyDetails.
export async function ensureServerTimeSynced(
  actor: ServerTimeActor,
  deps: { basePath: () => string; formatClock: (epochMs: number) => string },
): Promise<undefined> {
  const captured = capturedOffset(actor);
  if (captured !== undefined) {
    actor.log('time', '⏱ initial sync: offset ' + signed(captured) + 'ms (captured from login fetchJourneyDetails) · serverNow=' + deps.formatClock(actor.serverNow()));
    return undefined;
  }
  if (!actor.api) return undefined;
  const t0 = actor.now();
  const response = await actor.api.call('GET', deps.basePath() + '/fetchJourneyDetails').catch(() => null);
  const t1 = actor.now();
  const stamp = response?.body?.timeStamp;
  if (!actor.applyServerTimeStamp(stamp, t0, t1, 'initial sync (fetchJourneyDetails)'))
    actor.log('time', '⏱ initial sync unavailable → using LOCAL clock', 'warn');
  return undefined;
}
