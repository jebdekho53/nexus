// Recovered f1712. Final form fields are first requested through the owned PayTM page, then through the ordinary
// request client only if they are missing. Diagnostics omit the supplier response snippet; the snip helper still runs.
import type { PaytmPayment } from './paytm-status';

export interface FinalForm {
  mid?: string;
  encData?: string;
  checksum?: string;
  [field: string]: unknown;
}

export interface FinalStatusActor {
  hosts: { paytm: string };
  paytmInPageFetch(path: string, options: { method: string; body: string; referer: string }): Promise<{ status: number; text: string }>;
  req: { post(url: string, options: { headers: unknown; form: Record<string, unknown> }): Promise<{ status(): number; text(): Promise<string> }> };
  gwHeaders(host: string, options: { referer: string; extra: Record<string, string> }): Promise<unknown>;
  snip(text: string): unknown;
  log(message: string): void;
}

const complete = (status: FinalForm): boolean => !!(status.mid && status.encData && status.checksum);
const mark = (value: unknown): string => (value ? 'y' : '-');

export async function getFinalPaytmStatus(
  actor: FinalStatusActor,
  payment: PaytmPayment,
  { parseForm, globals = globalThis }: { parseForm: (html: string) => FinalForm; globals?: { URLSearchParams: typeof URLSearchParams } },
): Promise<FinalForm> {
  const path = '/theia/transactionStatus?MID=' + encodeURIComponent(payment.merchantId) + '&ORDER_ID=' + encodeURIComponent(payment.orderId);
  const referer = actor.hosts.paytm + '/oltp-web/processTransaction?orderid=' + encodeURIComponent(payment.orderId);
  const form = {
    merchantId: payment.merchantId, acquirementId: payment.acquirementId, cashierRequestId: payment.cashierRequestId,
    paymentMode: payment.paymentMode, orderId: payment.orderId, topicName: payment.topicName, status: payment.status,
    _id: payment._id, transId: payment.acquirementId,
  };
  const inPage = await actor.paytmInPageFetch(path, { method: 'POST', body: new globals.URLSearchParams(form).toString(), referer }).catch(() => null);
  let result = parseForm(inPage?.text ?? '');
  if (inPage) {
    let message = 'PayTM getFinalStatus(in-page) → ' + inPage.status + ' mid=' + mark(result.mid) + ' enc=' + mark(result.encData) + ' chk=' + mark(result.checksum);
    if (!complete(result)) { actor.snip(inPage.text); message += ' :: [response omitted]'; }
    actor.log(message);
  }
  if (complete(result)) return result;
  const response = await actor.req.post('' + actor.hosts.paytm + path, {
    headers: await actor.gwHeaders('paytm', { referer, extra: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
    form,
  }).catch(() => null);
  if (!response) return result;
  const text = await response.text().catch(() => '');
  const parsed = parseForm(text);
  let message = 'PayTM getFinalStatus(req) → ' + response.status() + ' mid=' + mark(parsed.mid) + ' enc=' + mark(parsed.encData) + ' chk=' + mark(parsed.checksum);
  if (!complete(parsed)) { actor.snip(text); message += ' :: [response omitted]'; }
  actor.log(message);
  if (complete(parsed) || !complete(result)) result = parsed;
  return result;
}
