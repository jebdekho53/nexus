// Settles a finished payment: asks the user whether to continue when a pause is requested, confirms with the bank
// response and finishes the booking, or reports why the payment did not complete.

export type Payment =
  | { kind: 'paid'; encdata?: string | undefined }
  | { kind: 'declined'; reason: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'timeout' }
  | { kind: 'stopped' };

export interface SettlementActor {
  stopped?: unknown;
  opts: { onQrClose?: (() => void) | null; onConfirm?: ((request: { kind: string; detail: string }) => Promise<unknown>) | null };
  session: { proxy?: { server?: string; username?: string; password?: string } | null };
  gateway?: {
    useSurvivorProxy(proxy: { server: string; username: string | undefined; password: string | undefined } | undefined): void;
    armSurvivor(): Promise<unknown>;
    bankResponse(payload: string, responseKey: string): Promise<boolean>;
  } | null;
  stoppedResult(): unknown;
  beginSettling(): void;
  onProgress(stage: string, message: string): void;
  log(category: string, message: string, level?: string): void;
  finishBooking(booking: unknown): Promise<{ success?: boolean } & Record<string, unknown>> | { success?: boolean } & Record<string, unknown>;
  pollBookingData(transactionId: string, journey: unknown): Promise<unknown>;
}

export async function settlePayment(
  actor: SettlementActor,
  payment: Payment,
  responseKey: string,
  transactionId: string,
  journey: { paymentPause?: unknown },
  requireBankResponse = false,
  { normalizeProxy }: { normalizeProxy?: (server: string) => string } = {},
): Promise<unknown> {
  if (actor.stopped && payment.kind !== 'paid') return actor.stoppedResult();
  const pendingMessage = 'Payment received — IRCTC is still processing it; your ticket MIGHT be booked. Check your IRCTC account before retrying (any amount debited is auto-refunded).';
  if (payment.kind === 'paid') {
    actor.beginSettling(); actor.opts.onQrClose?.();
    if (journey.paymentPause && actor.opts.onConfirm) {
      actor.onProgress('booking:payment', 'Payment received — awaiting your decision to hit the PNR…');
      const proceed = await actor.opts.onConfirm({ kind: 'payment-pause', detail: 'You have paid. Choose to hit the PNR now, or stop (any amount debited is auto-refunded).' }).catch(() => true);
      if (actor.stopped) return actor.stoppedResult();
      if (!proceed) { actor.onProgress('booking:error', 'Payment stopped by user'); return { success: false, message: 'Payment stopped by user' }; }
    }
    if (actor.gateway) {
      const proxy = actor.session.proxy;
      actor.gateway.useSurvivorProxy(proxy?.server?.trim() ? {
        server: (normalizeProxy as (server: string) => string)(proxy.server), username: proxy.username, password: proxy.password,
      } : undefined);
      await actor.gateway.armSurvivor().catch(() => undefined);
    }
    actor.onProgress('booking:payment', 'Payment received — confirming your booking…');
    if (payment.encdata) {
      const reachedConfirm = await (actor.gateway as NonNullable<SettlementActor['gateway']>).bankResponse(payment.encdata, responseKey).catch(() => false);
      if (!reachedConfirm) {
        actor.log('gateway', 'BankResponse did not reach booking-confirm — polling bookingData anyway (booking may still complete → clientUpdate)', 'warn');
        return actor.finishBooking(await actor.pollBookingData(transactionId, journey));
      }
    } else if (requireBankResponse) {
      actor.log('gateway', 'PAID but no encdata for the mandatory BankResponse — best-effort PNR poll then check-account', 'error');
      const result = await actor.finishBooking(await actor.pollBookingData(transactionId, journey));
      if (result.success) return result;
      actor.onProgress('booking:error', pendingMessage); return { success: false, message: pendingMessage };
    }
    actor.onProgress('booking:payment', 'Generating your PNR…');
    return actor.finishBooking(await actor.pollBookingData(transactionId, journey));
  }
  if (payment.kind === 'declined') {
    const message = 'Payment declined: ' + payment.reason; actor.onProgress('booking:error', message); return { success: false, message };
  }
  if (payment.kind === 'failed') {
    const message = 'Payment failed: ' + payment.reason; actor.onProgress('booking:error', message); return { success: false, message };
  }
  if (payment.kind === 'timeout') {
    const message = 'Payment timed out — check your UPI app and try again'; actor.onProgress('booking:error', message); return { success: false, message };
  }
  if (payment.kind === 'stopped') return actor.stoppedResult();
  return undefined;
}
