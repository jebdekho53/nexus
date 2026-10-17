// PhonePe QR payment orchestration (redirect -> QR -> poll -> settle). Transport stays on the supplied gateway.
import type { Payment } from './settlement';

export interface QrJourney {
  username?: string | null;
  origin?: unknown;
  destination?: unknown;
  upiId?: string;
}

export interface PhonePeActor {
  gateway: {
    phonePeRedirect(request: { accessToken: unknown; username: string; clientTxnId: string; csrf: unknown; rand8: string }): Promise<{ action: string; token: string }>;
    phonePeQr(action: string, token: string): Promise<{ qrBase64: string; phonePeToken: string }>;
    pollPhonePe(token: string, stopped: () => unknown, onWait: () => void): Promise<Payment>;
  };
  api: { currentCsrf: unknown };
  opts: { onQr?: ((qr: { imageBase64: string; amount: unknown; caption: string }) => void) | null };
  stopped?: unknown;
  pnrSeen?: unknown;
  tok(): { accessToken: unknown };
  onProgress(stage: string, message: string): void;
  log(category: string, message: string, level?: string): void;
  paymentSetupFailed(message: string): unknown;
  settlePayment(payment: Payment, responseKey: string, transactionId: string, journey: QrJourney, requireBankResponse?: boolean): Promise<unknown>;
}

export async function runPhonePe(actor: PhonePeActor, journey: QrJourney, transactionId: string, amount: unknown, { random = Math.random }: { random?: () => number } = {}): Promise<unknown> {
  const gateway = actor.gateway, tokens = actor.tok();
  const randomId = String(Math.floor(10000000 + random() * 90000000));
  actor.onProgress('booking:payment', 'Connecting to PhonePe…');
  const redirect = await gateway.phonePeRedirect({
    accessToken: tokens.accessToken, username: journey.username ?? '',
    clientTxnId: transactionId, csrf: actor.api.currentCsrf, rand8: randomId,
  }).catch((error: { message?: string }) => {
    actor.log('gateway', 'phonePeRedirect failed: ' + error.message, 'error'); return { action: '', token: '' };
  });
  const action = redirect.action, token = redirect.token;
  if (!token) return actor.paymentSetupFailed('PhonePe redirect failed (no token) — change your IRCTC ID / IP / GoLogin profile, then retry');
  actor.onProgress('booking:payment', 'Generating PhonePe QR…');
  const qr = await gateway.phonePeQr(action, token).catch((error: { message?: string }) => {
    actor.log('gateway', 'phonePeQr failed: ' + error.message, 'error'); return { qrBase64: '', phonePeToken: '' };
  });
  const image = qr.qrBase64, phonePeToken = qr.phonePeToken;
  if (!image || !phonePeToken) return actor.paymentSetupFailed('PhonePe QR not extracted');
  actor.opts.onQr?.({ imageBase64: image, amount, caption: journey.origin + ' → ' + journey.destination });
  actor.onProgress('booking:qr', 'Scan the PhonePe QR to complete payment');
  const payment = await gateway.pollPhonePe(phonePeToken, () => actor.stopped || actor.pnrSeen,
    () => actor.onProgress('booking:payment', 'Awaiting PhonePe payment…'));
  return await actor.settlePayment(payment, 'response', transactionId, journey, true);
}
