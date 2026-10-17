// Chooses the payment flow for the selected method once the payment has been initialised.

export interface GatewayHosts {
  qrGateway?: unknown;
  wps?: unknown;
  paytm?: unknown;
  phonepeApi?: unknown;
  razorpay?: unknown;
}

export interface InitResponse {
  body?: { paramList?: unknown; withoutOTP?: unknown; [field: string]: unknown } | null;
}

export interface DispatchActor {
  opts: { gatewayHosts?: GatewayHosts | null };
  gateway?: {
    walletVerify(request: {
      accessToken: unknown; greq: unknown; bmiyek: unknown; spaCsrf: unknown; clientTxnId: string; amount: unknown;
      init: unknown; stopRetry: () => unknown;
    }): Promise<unknown>;
  } | null;
  api?: { currentCsrf?: unknown } | null;
  session: { page: { waitForTimeout(ms: number): Promise<unknown> } };
  stopped?: unknown;
  securityQuarantined?: unknown;
  now(): number;
  tok(): { accessToken: unknown; greq: unknown; bmiyek: unknown; csrfToken?: unknown };
  log(category: string, message: string, level?: string): void;
  onProgress(stage: string, message: string): void;
  beginSettling(): void;
  beginFinalPnrRequest(): void;
  stopWith(message: string): unknown;
  finishBooking(booking: unknown): unknown;
  paymentSetupFailed(message: string): unknown;
  runProviderQr(journey: unknown, transactionId: string, amount: unknown): Promise<unknown>;
  runPaytmQr(journey: unknown, transactionId: string, amount: unknown): Promise<unknown>;
  runPhonePeQr(journey: unknown, transactionId: string, amount: unknown): Promise<unknown>;
  runRazorpay(journey: unknown, transactionId: string, amount: unknown, mode: 'intent' | 'collect'): Promise<unknown>;
}

export interface DispatchHelpers {
  extractError: (body: unknown) => string | null | undefined;
  normalizeBooking: (response: unknown) => { pnr?: string; errorMessage?: string } | null;
  stoppedResult: () => unknown;
}

export async function dispatchPayment(
  actor: DispatchActor, journey: unknown, transactionId: string, amount: unknown, method: string, initResponse: InitResponse, helpers: DispatchHelpers,
): Promise<unknown> {
  const hosts = actor.opts.gatewayHosts;
  if (method === 'irctcqr' && actor.gateway && hosts?.qrGateway) return await actor.runProviderQr(journey, transactionId, amount);
  if (method === 'wallet' && actor.gateway && hosts?.wps) {
    const initError = helpers.extractError(initResponse.body);
    if (initError) {
      const body = initResponse.body ?? {};
      const params = Array.isArray(body.paramList) ? body.paramList as Array<{ key?: unknown; value?: unknown } | null | undefined> : [];
      const balance = params.find(row => row?.key === 'BALANCE')?.value;
      const balanceText = balance != null ? ' (wallet balance ₹' + balance + ')' : '';
      actor.log('payment', 'wallet bookingInitPayment errored: "' + initError + '" (BALANCE=' + (balance ?? '?') + ', withoutOTP=' + String(body.withoutOTP) + ')', 'warn');
      return actor.stopWith('IRCTC Wallet payment init failed: ' + initError + balanceText);
    }
    actor.onProgress('booking:countdown', 'paying|10000');
    const deadline = actor.now() + 10000;
    while (actor.now() < deadline && !actor.stopped) await actor.session.page.waitForTimeout(150).catch(() => { /* page gone: keep counting down */ });
    if (actor.stopped) return helpers.stoppedResult();
    actor.onProgress('booking:payment', 'Submitting Provider Wallet payment (₹' + (amount || '—') + ')…');
    actor.beginSettling(); actor.beginFinalPnrRequest();
    const tokens = actor.tok();
    const response = await actor.gateway.walletVerify({
      accessToken: tokens.accessToken, greq: tokens.greq, bmiyek: tokens.bmiyek,
      spaCsrf: actor.api?.currentCsrf || actor.tok().csrfToken || '', clientTxnId: transactionId, amount,
      init: initResponse.body ?? {}, stopRetry: () => actor.securityQuarantined,
    }).catch((error: { message?: string }) => { actor.log('gateway', 'walletVerify failed: ' + error.message, 'error'); return null; });
    const booking = helpers.normalizeBooking(response);
    if (booking && (booking.pnr || booking.errorMessage)) return actor.finishBooking(booking);
    const error = helpers.extractError(response);
    return error ? actor.stopWith('Wallet payment failed: ' + error) : actor.finishBooking(booking);
  }
  if (method === 'paytm' && actor.gateway && hosts?.wps && hosts?.paytm) return await actor.runPaytmQr(journey, transactionId, amount);
  if (method === 'phonepay' && actor.gateway && hosts?.wps && hosts?.phonepeApi) return await actor.runPhonePeQr(journey, transactionId, amount);
  if (method === 'razorpayqr' && actor.gateway && hosts?.wps && hosts?.razorpay) return await actor.runRazorpay(journey, transactionId, amount, 'intent');
  if (method === 'paytmupi' && actor.gateway && hosts?.wps && hosts?.razorpay) return await actor.runRazorpay(journey, transactionId, amount, 'collect');
  return actor.paymentSetupFailed(method + ': payment gateway not configured');
}
