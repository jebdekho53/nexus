// Small accessors over the booking run's session.

export interface SessionActor {
  session: { tokens?: unknown; page?: { url(): string } | null };
  opts: { providerUrl?: string | null };
  now(): number;
}

export function sessionTokens(actor: Pick<SessionActor, 'session'>): unknown {
  return actor.session.tokens;
}

/** Referrer for payment-page requests: the provider origin plus the payment-options path; undefined when unknown. */
export function paymentPageReferrer(actor: SessionActor): string | undefined {
  try {
    const source = actor.session.page?.url() || actor.opts.providerUrl || '';
    const origin = source ? new URL(source).origin : '';
    return origin ? origin + '/nget/payment/bkgPaymentOptions' : undefined;
  } catch {
    return undefined;
  }
}

export interface RequestIdDeps {
  globals?: { crypto?: { randomUUID?: () => string } };
  random?: () => number;
}

/** "<now>:<uuid>" (a random base-36 suffix when randomUUID is unavailable). */
export function paymentRequestId(actor: Pick<SessionActor, 'now'>, { globals = globalThis, random = Math.random }: RequestIdDeps = {}): string {
  const crypto = globals.crypto;
  const suffix = crypto?.randomUUID ? crypto.randomUUID() : random().toString(36).slice(2);
  return actor.now() + ':' + suffix;
}
