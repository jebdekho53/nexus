// Observe only: never retain URLs, query strings, bodies, headers or credentials.

type Logger = (event: string, data: Record<string, unknown>) => void;

interface TimedRequest { url(): string }
interface TimedResponse { request(): TimedRequest; status(): number }
export interface TimingContext {
  on(event: 'request', listener: (request: TimedRequest) => void): unknown;
  on(event: 'response', listener: (response: TimedResponse) => void): unknown;
  on(event: 'requestfinished' | 'requestfailed', listener: (request: TimedRequest) => void): unknown;
}

const defaultNow = (): number => performance.now();

export function observePaymentTiming(context: Partial<TimingContext> | null | undefined, log: Logger = () => undefined, now: () => number = defaultNow): void {
  if (typeof context?.on !== 'function') return;
  const target = context as TimingContext;
  const pending = new WeakMap<TimedRequest, { id: number; endpoint: string; started: number }>();
  let sequence = 0;
  const emit = (event: string, data: Record<string, unknown>): void => { try { log(event, data); } catch { /* logging must not affect the request */ } };
  const request = (req: TimedRequest): void => {
    let endpoint: string | undefined;
    try {
      const url = new URL(req.url());
      if (url.protocol !== 'https:' || !/(^|\.)irctc\.co\.in$/i.test(url.hostname)) return;
      endpoint = url.pathname.match(/\/(allLapAvlFareEnq|addonServices|bookingInitPayment|boardingStationEnq)(?:\/|$)/)?.[1];
    } catch { return; }
    if (!endpoint) return;
    const record = { id: ++sequence, endpoint, started: now() };
    pending.set(req, record);
    emit('matrix-payment-request-start', { id: record.id, endpoint });
  };
  const finish = (req: TimedRequest, failed: boolean): void => {
    const record = pending.get(req);
    if (!record) return;
    pending.delete(req);
    emit('matrix-payment-request-end', { id: record.id, endpoint: record.endpoint, durationMs: Math.round(Math.max(0, now() - record.started)), failed });
  };
  const response = (res: TimedResponse): void => {
    const record = pending.get(res.request());
    if (!record) return;
    emit('matrix-payment-response', { id: record.id, endpoint: record.endpoint, status: res.status(), responseMs: Math.round(Math.max(0, now() - record.started)) });
  };
  target.on('request', request); target.on('response', response);
  target.on('requestfinished', req => finish(req, false)); target.on('requestfailed', req => finish(req, true));
}

type Step = (original: (...args: unknown[]) => unknown, args: unknown[]) => Promise<unknown>;

export function paymentTiming(log: Logger = () => undefined, now: () => number = defaultNow): Record<string, Step> {
  let sequence = 0;
  const emit = (event: string, data: Record<string, unknown>): void => { try { log(event, data); } catch { /* logging must not affect the step */ } };
  return Object.fromEntries(Object.entries({ f2172: 'payment-init', f2176: 'gateway-dispatch', f2186: 'provider-qr' }).map(([id, step]): [string, Step] => [id, async (original, args) => {
    const requestId = ++sequence, started = now();
    let failed = true;
    emit('matrix-payment-step-start', { requestId, step });
    try { const result = await original(...args); failed = false; return result; }
    finally { emit('matrix-payment-step-end', { requestId, step, durationMs: Math.round(Math.max(0, now() - started)), failed }); }
  }]));
}
