// Final PNR lookup ("bookingData") after a payment: one fetch plus bounded re-fetches while the server asks for it.
// Unlike the recovered logger, booking/passenger data and transaction IDs are never serialized into the log.

export interface BookingTokens {
  accessToken: unknown;
  greq: unknown;
  bmiyek: unknown;
}

export interface NormalizedBooking {
  pnr?: string;
  errorMessage?: string;
  [field: string]: unknown;
}

export interface BookingDataActor {
  terminal?: unknown;
  securityQuarantined?: unknown;
  pnrSeen?: boolean;
  opts: { slowDownPayment?: unknown };
  gateway?: {
    bookingData(request: { accessToken: unknown; greq: unknown; bmiyek: unknown; clientTxnId: string; spaCsrf: unknown; stopRetry: () => boolean }): Promise<unknown>;
  } | null;
  canRequestPnr(): boolean;
  beginFinalPnrRequest(): void;
  endFinalPnrRequest(): void;
  onProgress(stage: string, message: string): void;
  spaCsrf(): unknown;
  safeCall(client: string, method: string, url: string, options: { retries: number }): Promise<{ body?: unknown } | null | undefined>;
  tok(): BookingTokens;
  log(category: string, message: string, level?: string): void;
  waitForPnrRetry(ms: number): Promise<boolean>;
}

export interface FetchHelpers {
  bookingDataUrl: (transactionId: string) => string;
}

export interface PollHelpers extends FetchHelpers {
  normalizeBooking: (body: unknown) => NormalizedBooking | null;
  retryAfter: (body: unknown) => number | null;
}

export async function fetchBookingData(actor: BookingDataActor, transactionId: string, tokens: BookingTokens, { bookingDataUrl }: FetchHelpers): Promise<unknown> {
  if (!actor.canRequestPnr()) return null;
  actor.beginFinalPnrRequest(); actor.onProgress('booking:payment', 'Hitting for PNR…');
  if (!actor.canRequestPnr()) { actor.endFinalPnrRequest(); return null; }
  if (actor.gateway) return await actor.gateway.bookingData({
    accessToken: tokens.accessToken, greq: tokens.greq, bmiyek: tokens.bmiyek, clientTxnId: transactionId,
    spaCsrf: actor.spaCsrf(), stopRetry: () => !actor.canRequestPnr(),
  }).catch(() => { actor.log('gateway', 'bookingData request failed', 'warn'); return null; });
  const response = await actor.safeCall('api', 'GET', bookingDataUrl(transactionId), { retries: 0 });
  return actor.terminal ? null : response?.body ?? null;
}

/** Polls for the booking; resolves the booking when it has a PNR or an error message, else null. `_maxAttempts` is unused (kept for the call signature). */
export async function pollBookingData(
  actor: BookingDataActor,
  transactionId: string,
  _journey: unknown,
  _maxAttempts = 20,
  helpers: PollHelpers,
  { env = process.env }: { env?: Record<string, string | undefined> } = {},
): Promise<NormalizedBooking | null> {
  if (!actor.canRequestPnr()) return null;
  const tokens = actor.tok();
  if (actor.opts.slowDownPayment && !actor.securityQuarantined) {
    const delay = Number(env.SLOW_DOWN_PAYMENT_MS) || 2000;
    actor.log('gateway', 'slowDownPayment: waiting ' + delay + 'ms before the bookingData GET', 'info');
    if (!await actor.waitForPnrRetry(delay)) return null;
  }
  let body = await fetchBookingData(actor, transactionId, tokens, helpers);
  for (let retry = 0; retry <= 5; retry++) {
    actor.log('gateway', 'bookingData response received', 'info');
    const booking = helpers.normalizeBooking(body);
    if (booking && (booking.pnr || booking.errorMessage)) { actor.pnrSeen = true; return booking; }
    if (!actor.canRequestPnr()) break;
    const delay = helpers.retryAfter(body);
    if (!delay || retry >= 5) break;
    actor.log('gateway', 'bookingData: server asked to re-verify after ' + delay + 'ms (' + (retry + 1) + '/5) — PRS still settling, waiting then re-firing', 'warn');
    if (!await actor.waitForPnrRetry(delay)) break;
    body = await fetchBookingData(actor, transactionId, tokens, helpers);
  }
  actor.log('gateway', 'bookingData returned no PNR — no retryAfterMili, single-shot', 'warn');
  return null;
}
