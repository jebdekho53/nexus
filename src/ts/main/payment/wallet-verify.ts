// Recovered f1722 with callbacks f1723–f1726. Confirms a wallet payment with the booking service. Gateway timeouts
// (502/504) and thrown request errors are retried every 500 ms for up to 600 attempts unless the caller's
// stopRetry() says otherwise. Diagnostics report only status codes; the bank response body is handed to the snip
// helper for its effects and never logged.

const MAX_ATTEMPTS = 600;

export interface WalletVerifyInput {
  init?: Record<string, unknown> | null;
  amount: unknown;
  clientTxnId: string;
  accessToken?: string | null;
  bmiyek: unknown;
  greq: unknown;
  spaCsrf: unknown;
  stopRetry?: () => unknown;
}

export interface WalletVerifyActor {
  hosts: { wps: string };
  gwHeaders(host: string, options: { extra: Record<string, unknown> }): Promise<unknown>;
  req: { post(url: string, options: { headers: unknown; data: unknown }): Promise<{ status(): number; json(): Promise<unknown> }> };
  log(message: string): void;
  sleep(ms: number): Promise<unknown>;
  snip(text: string): unknown;
}

export async function walletVerify(actor: WalletVerifyActor, input: WalletVerifyInput, { clock = Date }: { clock?: DateConstructor } = {}): Promise<unknown> {
  const init = input.init ?? {};
  const now = new clock().toISOString();
  const body = {
    transationId: String(init.transationId ?? '0'),
    bankId: String(init.bankId ?? '0'),
    txnType: String(init.txnType ?? '0'),
    txnStatus: String(init.txnStatus ?? '12'),
    txnDate: String(init.txnDate ?? now),
    amount: String(init.amount ?? input.amount),
    serverId: String(init.serverId ?? ''),
    timeStamp: String(init.timeStamp ?? now),
    upiModeOpted: String(init.upiModeOpted ?? '0'),
    remainingBalance: String(init.remainingBalance ?? '0.0'),
    loyaltyNum: String(init.loyaltyNum ?? '0'),
    withoutOTP: String(init.withoutOTP ?? 'true'),
    paramList: [{ key: 'OTP' }, { key: 'TXN_TYPE', value: 'undefined' }],
  };
  const url = actor.hosts.wps + '/eticketing/protected/mapps1/verifyPayment/' + input.clientTxnId;
  const headers = await actor.gwHeaders('wps', {
    extra: {
      Authorization: input.accessToken ? 'Bearer ' + input.accessToken : '',
      bmiyek: input.bmiyek, greq: input.greq, 'Spa-Csrf-Token': input.spaCsrf,
      'Content-Type': 'application/json; charset=UTF-8',
    },
  });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await actor.req.post(url, { headers, data: body });
      const status = response.status();
      if ((status === 502 || status === 504) && attempt < MAX_ATTEMPTS) {
        if (input.stopRetry?.()) return await response.json().catch(() => ({}));
        actor.log('wallet verifyPayment → ' + status + ' (transient) — retry ' + attempt + ' after 500ms');
        await actor.sleep(500).catch(() => undefined);
        if (input.stopRetry?.()) return {};
        continue;
      }
      const result = await response.json().catch(() => ({}));
      const message = 'wallet verifyPayment → ' + status;
      actor.snip(JSON.stringify(result));
      actor.log(message + ' :: [response omitted]');
      return result;
    } catch (error) {
      actor.log('wallet verifyPayment threw: ' + (error as { message?: string }).message + ' (attempt ' + attempt + ')');
      if (attempt >= MAX_ATTEMPTS || input.stopRetry?.()) throw error;
      await actor.sleep(500).catch(() => undefined);
      if (input.stopRetry?.()) throw error;
    }
  }
  return {};
}
