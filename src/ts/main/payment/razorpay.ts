// Razorpay payment orchestration: QR (intent) or UPI collect, polled until paid, then settled.
import type { Payment } from './settlement';
import type { QrJourney } from './phonepe';

export type RazorpayFlow = 'intent' | 'collect';

export interface RazorpayOrder {
  keyId: string;
  orderId: string;
  callbackUrl?: unknown;
  [field: string]: unknown;
}

export interface RazorpayActor {
  gateway: {
    razorpayRedirect(request: { accessToken: unknown; username: string; clientTxnId: string; csrf: unknown; rand8: string }): Promise<{ action: string; encdata: string }>;
    razorpayCheckout(action: string, encryptedData: string): Promise<RazorpayOrder | null>;
    razorpaySessionToken(keyId: string, intent: boolean): Promise<string>;
    razorpayCreate(request: { keyId: string; sessionToken: string; order: RazorpayOrder; amount: unknown; flow: RazorpayFlow; vpa: unknown }): Promise<{ paymentId: string; intentUrl: string; pollUrl: string }>;
    pollRazorpay(request: { paymentId: string; pollUrl: string; callbackUrl: unknown; order: RazorpayOrder }, stopped: () => unknown, onWait: () => void, intervalMs: number): Promise<Payment>;
  };
  api: { currentCsrf: unknown };
  opts: {
    onQr?: ((qr: { payload: string; amount: unknown; caption: string }) => void) | null;
    onUpiCollect?: ((request: { vpa: unknown; amount: unknown; caption: string }) => void) | null;
    razorpayPollSec?: number;
  };
  stopped?: unknown;
  pnrSeen?: unknown;
  tok(): { accessToken: unknown };
  onProgress(stage: string, message: string): void;
  log(category: string, message: string, level?: string): void;
  paymentSetupFailed(message: string): unknown;
  settlePayment(payment: Payment, responseKey: string, transactionId: string, journey: QrJourney): Promise<unknown>;
}

export async function runRazorpay(
  actor: RazorpayActor, journey: QrJourney, transactionId: string, amount: unknown, flow: RazorpayFlow, { random = Math.random }: { random?: () => number } = {},
): Promise<unknown> {
  const gateway = actor.gateway, tokens = actor.tok();
  const randomId = String(Math.floor(10000000 + random() * 90000000));
  actor.onProgress('booking:payment', 'Connecting to Razorpay…');
  const redirect = await gateway.razorpayRedirect({
    accessToken: tokens.accessToken, username: journey.username ?? '',
    clientTxnId: transactionId, csrf: actor.api.currentCsrf, rand8: randomId,
  }).catch((error: { message?: string }) => { actor.log('gateway', 'razorpayRedirect failed: ' + error.message, 'error'); return { action: '', encdata: '' }; });
  const action = redirect.action, encryptedData = redirect.encdata;
  if (!action || !encryptedData) return actor.paymentSetupFailed('Razorpay redirect failed — change your IRCTC ID / IP / GoLogin profile, then retry');
  const order = await gateway.razorpayCheckout(action, encryptedData).catch((error: { message?: string }) => {
    actor.log('gateway', 'razorpayCheckout failed: ' + error.message, 'error'); return null;
  });
  if (!order || !order.keyId || !order.orderId) return actor.paymentSetupFailed('Razorpay order not parsed');
  const sessionToken = await gateway.razorpaySessionToken(order.keyId, flow === 'intent').catch(() => '');
  actor.onProgress('booking:payment', flow === 'intent' ? 'Generating Razorpay QR…' : 'Sending the UPI collect request…');
  const created = await gateway.razorpayCreate({ keyId: order.keyId, sessionToken, order, amount, flow, vpa: journey.upiId })
    .catch((error: { message?: string }) => { actor.log('gateway', 'razorpayCreate failed: ' + error.message, 'error'); return { paymentId: '', intentUrl: '', pollUrl: '' }; });
  const paymentId = created.paymentId, intentUrl = created.intentUrl, pollUrl = created.pollUrl;
  if (!paymentId) return actor.paymentSetupFailed('Razorpay payment not created');
  if (flow === 'intent' && intentUrl) {
    actor.opts.onQr?.({ payload: intentUrl, amount, caption: journey.origin + ' → ' + journey.destination });
    actor.onProgress('booking:qr', 'Scan the Razorpay QR to complete payment');
  } else if (flow === 'intent') {
    actor.log('gateway', 'Razorpay returned no intent_url → cannot render the QR (see razorpayCreate response shape above)', 'error');
    return actor.paymentSetupFailed('Could not generate the Razorpay QR — tap Try Again, or switch the payment method');
  } else {
    actor.opts.onUpiCollect?.({ vpa: journey.upiId, amount, caption: journey.origin + ' → ' + journey.destination });
    actor.onProgress('booking:qr', 'UPI collect request sent' + (journey.upiId ? ' to ' + journey.upiId : '') + ' — approve in your UPI app');
  }
  const interval = (actor.opts.razorpayPollSec && actor.opts.razorpayPollSec > 0 ? actor.opts.razorpayPollSec : 5) * 1000;
  const payment = await gateway.pollRazorpay({ paymentId, pollUrl, callbackUrl: order.callbackUrl, order },
    () => actor.stopped || actor.pnrSeen, () => actor.onProgress('booking:payment', 'Awaiting Razorpay payment…'), interval);
  return await actor.settlePayment(payment, 'encdata', transactionId, journey);
}
