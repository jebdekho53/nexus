// PayTM QR payment orchestration. Transport stays on the supplied gateway; this module does not create a session or
// initiate a real payment by itself.
import { startPaytmWatch, type IntervalTimers, type WatchGateway } from './paytm-watch';

export interface PaytmActor {
  gateway: WatchGateway<unknown> & {
    paytmRedirect(request: { accessToken: unknown; username: string; clientTxnId: string; csrf: unknown; rand8: string }): Promise<{ action?: string; mid: string } & Record<string, unknown>>;
    paytmFetchQr(redirect: unknown): Promise<{ qrBase64: string; orderId: string }>;
    getFinalPaytmStatus(payment: unknown): Promise<{ mid?: string; encData?: string; checksum?: string } | null>;
    disposePaytmPage(): Promise<unknown>;
    paytmBankResponse(status: unknown): Promise<unknown>;
  };
  api: { currentCsrf: unknown };
  opts: { onQr?: ((qr: { imageBase64: string; amount: unknown; caption: string }) => void) | null; onQrClose?: (() => void) | null };
  stopped?: unknown;
  pnrSeen?: unknown;
  tok(): { accessToken: unknown };
  onProgress(stage: string, message: string): void;
  log(category: string, message: string, level?: string): void;
  paymentSetupFailed(message: string): unknown;
  stoppedResult(): unknown;
  beginSettling(): void;
  finishBooking(booking: unknown): unknown;
  pollBookingData(transactionId: string, journey: unknown): Promise<unknown>;
}

export interface PaytmJourney {
  username?: string | null;
  origin?: unknown;
  destination?: unknown;
}

export async function runPaytm(
  actor: PaytmActor,
  journey: PaytmJourney,
  transactionId: string,
  amount: unknown,
  { random = Math.random, timers = globalThis }: { random?: () => number; timers?: IntervalTimers } = {},
): Promise<unknown> {
  const gateway = actor.gateway, tokens = actor.tok();
  const randomId = String(Math.floor(10000000 + random() * 90000000));
  actor.onProgress('booking:payment', 'Connecting to PayTM…');
  const redirect = await gateway.paytmRedirect({
    accessToken: tokens.accessToken, username: journey.username ?? '',
    clientTxnId: transactionId, csrf: actor.api.currentCsrf, rand8: randomId,
  }).catch((error: { message?: string }) => { actor.log('gateway', 'paytmRedirect failed: ' + error.message, 'error'); return null; });
  if (!redirect || !redirect.action) return actor.paymentSetupFailed('PayTM redirect failed (no form) — change your IRCTC ID / IP / GoLogin profile, then retry');
  actor.onProgress('booking:payment', 'Generating PayTM QR…');
  const qr = await gateway.paytmFetchQr(redirect).catch((error: { message?: string }) => {
    actor.log('gateway', 'paytmFetchQr failed: ' + error.message, 'error'); return { qrBase64: '', orderId: '' };
  });
  const qrBase64 = qr.qrBase64, orderId = qr.orderId;
  if (!qrBase64) return actor.paymentSetupFailed('PayTM QR not extracted');
  actor.opts.onQr?.({ imageBase64: qrBase64, amount, caption: journey.origin + ' → ' + journey.destination });
  actor.onProgress('booking:qr', 'Scan the PayTM QR to complete payment');
  const payment = await new Promise<unknown>(resolve => startPaytmWatch(resolve, actor, gateway, redirect, orderId, timers));
  if (actor.stopped) return actor.stoppedResult();
  if (!payment) {
    const message = 'Payment timed out — complete the PayTM QR and try again';
    actor.onProgress('booking:error', message); return { success: false, message };
  }
  actor.beginSettling(); actor.opts.onQrClose?.();
  actor.onProgress('booking:payment', 'Payment received — finalizing booking…');
  const finalStatus = await gateway.getFinalPaytmStatus(payment).catch((error: { message?: string }) => {
    actor.log('gateway', 'PayTM getFinalStatus failed: ' + error.message, 'error'); return null;
  });
  await gateway.disposePaytmPage().catch(() => undefined);
  if (!finalStatus || !finalStatus.mid || !finalStatus.encData || !finalStatus.checksum) {
    const message = 'PayTM finalization failed (no final status) — money is safe, no ticket issued; please retry';
    actor.onProgress('booking:error', message); return { success: false, message };
  }
  const confirmed = await gateway.paytmBankResponse(finalStatus).catch(() => false);
  if (!confirmed) actor.log('gateway', 'PayTM BankResponse did not reach booking-confirm — polling bookingData anyway (PNR may still land → clientUpdate)', 'warn');
  return actor.finishBooking(await actor.pollBookingData(transactionId, journey));
}
