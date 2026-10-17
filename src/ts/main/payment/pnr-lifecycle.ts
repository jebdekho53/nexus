// Whether a PNR request may be made, and the cancellable wait between PNR retries.

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PnrActor {
  stopped?: unknown;
  terminal?: unknown;
  securityQuarantined?: unknown;
  session: { page?: { isClosed(): boolean } | null };
  isSettlingPayment(): boolean;
  canRequestPnr(): boolean;
  cancelPnrWait?: (() => void) | undefined;
}

export function canRequestPnr(actor: PnrActor): boolean {
  return !actor.stopped && !actor.terminal && !actor.securityQuarantined &&
    (!actor.session.page?.isClosed() || actor.isSettlingPayment());
}

/** Resolves true after `ms` when a PNR request is still allowed; false when cancelled or no longer allowed. */
export function waitForPnrRetry(actor: PnrActor, ms: number, timers: Timers = globalThis): Promise<boolean> {
  if (!actor.canRequestPnr()) return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const finish = (resume: boolean): void => {
      timers.clearTimeout(timer);
      if (actor.cancelPnrWait === cancel) actor.cancelPnrWait = undefined;
      resolve(resume && actor.canRequestPnr());
    };
    const cancel = (): void => finish(false);
    const timer = timers.setTimeout(() => finish(true), ms);
    actor.cancelPnrWait = cancel;
  });
}
