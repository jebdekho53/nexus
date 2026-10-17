// Creates the provider QR: sale redirect -> authentication page -> generateAndShowQR.

export interface QrRequestActor {
  hosts: { qrGateway?: string; wps?: string };
  reqRetry<T>(label: string, operation: () => Promise<T>): Promise<T>;
  req: {
    post(url: string, options: Record<string, unknown>): Promise<{ headers(): Record<string, unknown>; status(): number; json(): Promise<Record<string, unknown>> }>;
    get(url: string, options: Record<string, unknown>): Promise<{ text(): Promise<string>; status(): number }>;
  };
  gwHeaders(host: string, options: Record<string, unknown>): Promise<unknown>;
  log(message: string, level?: string): void;
}

export interface CreatedQr {
  payload: string;
  merchantId: string;
  merchantTxnNo: string;
  rid: string;
  authReferer: string;
  pgOrigin: string;
  pageToken: string;
  qrAmount?: number | undefined;
}

export async function createProviderQr(
  actor: QrRequestActor,
  action: string,
  encdata: string,
  { parseConfig, parseAmount }: { parseConfig: (html: string) => { responseParams?: Record<string, unknown> } | null | undefined; parseAmount: (payload: string) => number | undefined },
): Promise<CreatedQr> {
  const empty: CreatedQr = { payload: '', merchantId: '', merchantTxnNo: '', rid: '', authReferer: '', pgOrigin: '', pageToken: '' };
  let pgOrigin = '';
  try { pgOrigin = new URL(action).origin; }
  catch { pgOrigin = (actor.hosts.qrGateway || '').replace(/\/+$/, ''); }
  if (!pgOrigin) {
    actor.log('providerQr: no PG origin from the redirect action', 'error');
    return empty;
  }
  const wpsOrigin = (actor.hosts.wps || '').replace(/\/+$/, '');
  const sale = await actor.reqRetry('providerQr sale', async () => actor.req.post(action, {
    headers: await actor.gwHeaders('qr', { navigate: true, origin: wpsOrigin, referer: wpsOrigin + '/', secFetchSite: 'cross-site' }),
    form: { encdata }, maxRedirects: 0,
  }));
  const location = String(sale.headers().location ?? '');
  let authReferer = '';
  try { authReferer = new URL(location, pgOrigin).toString(); } catch { /* no usable redirect */ }
  actor.log('providerQr sale → ' + sale.status() + ' authRedirect=' + (authReferer ? 'y' : 'NONE'));
  if (!authReferer) return { ...empty, pgOrigin };

  const auth = await actor.reqRetry('providerQr authRedirect', async () => actor.req.get(authReferer, {
    headers: await actor.gwHeaders('qr', { navigate: true, omitOrigin: true, referer: wpsOrigin + '/', secFetchSite: 'cross-site' }),
  }));
  const html = await auth.text();
  const params = parseConfig(html)?.responseParams ?? {};
  let transaction = '';
  try { transaction = new URL(authReferer).searchParams.get('tranCtx') ?? ''; } catch { /* keep empty */ }
  const rid = String(params.rid ?? transaction);
  const merchantId = String(params.merchantId ?? '');
  const merchantTxnNo = String(params.merchantTxnNo ?? params.orderId ?? params.invoiceNo ?? '');
  const pageToken = String(params.isCallFromPaymentOptionsPage ?? '');
  const generateUrl = /^https?:\/\//i.test(String(params.internalGenerateQRApiUrl ?? '')) ? String(params.internalGenerateQRApiUrl) : pgOrigin + '/pg/api/generateAndShowQR';
  actor.log('providerQr authRedirect → ' + auth.status() + ' rid=' + (rid ? 'y' : 'N') + ' mId=' + (merchantId || 'N') + ' mTxn=' + (merchantTxnNo || 'N') + ' tok=' + (pageToken ? 'y' : 'N'));
  if (!rid || !merchantId || !merchantTxnNo) {
    // Do not copy authentication-page HTML into diagnostics.
    actor.log('providerQr: authRedirect page missing ids', 'error');
    return { ...empty, pgOrigin, authReferer, rid, merchantId, merchantTxnNo, pageToken };
  }

  const generated = await actor.reqRetry('providerQr generateAndShowQR', async () => actor.req.post(generateUrl, {
    headers: await actor.gwHeaders('qr', {
      origin: pgOrigin, referer: authReferer, secFetchSite: 'same-origin',
      extra: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json; charset=UTF-8', Accept: '*/*' },
    }),
    data: JSON.stringify({ rid }),
  }));
  const body = await generated.json().catch(() => ({} as Record<string, unknown>));
  const payload = String(body.upiQR ?? body.intent ?? '');
  const amount = parseAmount(payload);
  actor.log('providerQr generateAndShowQR → ' + generated.status() + ' err=' + String(body.errorcode ?? '') + ' qr=' + (payload ? 'y' : 'NONE') + ' am=' + (amount ?? '?'));
  return { payload, merchantId, merchantTxnNo, rid, authReferer, pgOrigin, pageToken, qrAmount: amount };
}
