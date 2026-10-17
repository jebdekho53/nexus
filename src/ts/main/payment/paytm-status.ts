// Polls the PayTM transaction status until it reports success (provider waits: 2500ms before the first poll, 2000ms after).

export interface PaytmPayment {
  merchantId: string;
  orderId: string;
  paymentMode: string;
  topicName: string;
  acquirementId: string;
  cashierRequestId: string;
  _id: string;
  status: 'SUCCESS';
}

export interface StatusActor {
  hosts: { paytm: string };
  req: { get(url: string, options: { headers: unknown }): Promise<{ ok(): boolean; text(): Promise<string> }> };
  sleep(ms: number): Promise<unknown>;
  paytmInPageFetch(path: string, options: { method: string; referer: string; body?: string }): Promise<{ status: number; text: string }>;
  gwHeaders(host: string, options: { referer: string; extra?: Record<string, string> }): Promise<unknown>;
  log(message: string): void;
  snip(text: string): unknown;
}

export async function pollPaytmStatus(
  actor: StatusActor,
  mid: string,
  orderId: string,
  stopped: () => unknown,
  onWait: (() => void) | undefined,
  maxAttempts = 800,
  { getField }: { getField: (text: string, name: string) => string },
): Promise<PaytmPayment | null> {
  const referer = actor.hosts.paytm + '/oltp-web/processTransaction?orderid=' + encodeURIComponent(orderId);
  const path = '/theia/transactionStatus?MID=' + encodeURIComponent(mid) + '&ORDER_ID=' + encodeURIComponent(orderId);
  for (let attempt = 0; attempt < maxAttempts && !stopped(); attempt++) {
    await actor.sleep(attempt === 0 ? 2500 : 2000);
    onWait?.();
    let text = '';
    const inPage = await actor.paytmInPageFetch(path, { method: 'GET', referer }).catch(() => null);
    if (inPage && inPage.status >= 200 && inPage.status < 300) text = inPage.text;
    else {
      const response = await actor.req.get('' + actor.hosts.paytm + path, { headers: await actor.gwHeaders('paytm', { referer }) }).catch(() => null);
      if (!response || !response.ok()) continue;
      text = await response.text().catch(() => '');
    }
    if (/SUCCESS|TXN_SUCCESS|"status"\s*:\s*"SUCCESS"|status="SUCCESS"|Transaction Successful/i.test(text)) {
      actor.log('PayTM transactionStatus → SUCCESS (poll ' + (attempt + 1) + ')');
      return {
        merchantId: getField(text, 'merchantId') || mid,
        orderId: getField(text, 'orderId') || orderId,
        paymentMode: getField(text, 'paymentMode') || 'UPI',
        topicName: getField(text, 'topicName') || 'DYNAMIC_QR',
        acquirementId: getField(text, 'acquirementId'),
        cashierRequestId: getField(text, 'cashierRequestId'),
        _id: getField(text, '_id') || mid + '_' + orderId,
        status: 'SUCCESS',
      };
    }
    if (attempt === 0 || attempt % 10 === 0) {
      const hints = (text.match(/RESPCODE[^<"]{0,32}|STATUS[^<"]{0,32}|txnStatus[^<"]{0,32}|resultStatus[^<"]{0,32}|TXN_[A-Z]+|acquirementId[^<"]{0,24}/) || []).slice(0, 5).join(' | ');
      const logger = actor.log;
      const message = 'PayTM transactionStatus poll ' + (attempt + 1) + (hints ? ' [status hints present]' : ' [no status hints — gateway shell]');
      actor.snip(text);
      logger.call(actor, message);
    }
  }
  return null;
}
