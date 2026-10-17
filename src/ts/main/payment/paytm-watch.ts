// Watches for the PayTM payment through two independent sources (WebSocket and status polling).
// The caller's Promise executor uses the first truthy payment result. A falsy WebSocket result must not
// discard a later successful polling response.

export interface IntervalTimers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface WatchActor {
  stopped?: unknown;
  pnrSeen?: unknown;
  onProgress(stage: string, message: string): void;
}

export interface WatchGateway<Payment> {
  waitForPaytmWs(mid: string, orderId: string, timeoutMs: undefined, stopped: () => unknown): Promise<Payment | null | undefined>;
  pollPaytmStatus(mid: string, orderId: string, stopped: () => unknown, onWait: () => void): Promise<Payment | null | undefined>;
}

export function startPaytmWatch<Payment>(
  resolve: (value: Payment | null) => void,
  actor: WatchActor,
  gateway: WatchGateway<Payment>,
  redirect: { mid: string },
  orderId: string,
  timers: IntervalTimers = globalThis,
): void {
  let pending = 2, settled = false, timer: unknown;
  const finish = (value: Payment | null): void => {
    if (settled) return;
    settled = true;
    if (timer) timers.clearInterval(timer);
    resolve(value);
  };
  const accept = (value: Payment | null | undefined): void => { if (value) finish(value); };
  const completed = (): void => { if (--pending === 0) finish(null); };
  timer = timers.setInterval(() => { if (actor.stopped) finish(null); }, 300);
  const stopped = (): unknown => actor.stopped || settled || actor.pnrSeen;
  gateway.waitForPaytmWs(redirect.mid, orderId, undefined, stopped)
    .then(accept).catch(() => undefined).finally(completed);
  gateway.pollPaytmStatus(redirect.mid, orderId, stopped, () => {
    if (!stopped()) actor.onProgress('booking:payment', 'Awaiting PayTM payment…');
  }).then(accept).catch(() => undefined).finally(completed);
}
