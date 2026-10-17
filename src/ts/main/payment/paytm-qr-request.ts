// Fetching and parsing the PayTM QR page (the QR image and the order id).

export interface UrlGlobals {
  URL: typeof URL;
}
export interface AtobGlobals {
  atob?: (data: string) => string;
  Buffer: { from(data: string, encoding: string): { toString(encoding: string): string } };
}

export interface PaytmAppData {
  qr?: { dataurl?: unknown; dataUrl?: unknown; image?: unknown } | null;
  orderId?: unknown;
  orderid?: unknown;
  ORDER_ID?: unknown;
}

/** The JSON embedded as a base64 `pushAppData` string, or null when absent or invalid. */
export function paytmAppData(html: string, globals: AtobGlobals = globalThis as unknown as AtobGlobals): PaytmAppData | null {
  const match = /pushAppData\s*=\s*["']([^"']+)["']/.exec(html);
  if (!match) return null;
  try {
    const encoded = match[1] as string;
    const text = typeof globals.atob === 'function' ? globals.atob(encoded) : globals.Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(text) as PaytmAppData | null;
  } catch { return null; }
}

/** The PNG as bare base64 (data-URL prefix removed), or '' when there is no image string. */
export function paytmQrImage(data: PaytmAppData | null | undefined): string {
  const qr = data?.qr;
  const image = qr?.dataurl ?? qr?.dataUrl ?? qr?.image ?? '';
  return typeof image === 'string' ? image.replace(/^data:image\/png;base64,/, '') : '';
}

export function paytmOrderFromUrl(url: string, globals: UrlGlobals = globalThis): string {
  try {
    const parsed = new globals.URL(url);
    return parsed.searchParams.get('orderid') || parsed.searchParams.get('orderId') || parsed.searchParams.get('ORDER_ID') || '';
  } catch { return ''; }
}

export function paytmOrderFromData(data: PaytmAppData | null | undefined, url: string, globals: UrlGlobals = globalThis): string {
  const order = data?.orderId ?? data?.orderid ?? data?.ORDER_ID;
  if (order) return String(order);
  return paytmOrderFromUrl(url, globals);
}

export interface QrActor {
  hosts: { paytm: string };
  reqRetry<T>(label: string, operation: () => Promise<T>): Promise<T>;
  req: { post(url: string, options: { headers: unknown; form: Record<string, unknown> }): Promise<{ text(): Promise<string>; url(): string; status(): number }> };
  gwHeaders(host: string, options: { extra: Record<string, string> }): Promise<unknown>;
  log(message: string): void;
  snip(html: string): unknown;
}

export interface QrHelpers {
  parseData: (html: string) => PaytmAppData | null;
  extractImage: (data: PaytmAppData | null) => string;
  orderFromUrl: (url: string) => string;
  orderFromData: (data: PaytmAppData | null, url: string) => string;
  globals?: UrlGlobals;
}

export async function fetchPaytmQr(
  actor: QrActor,
  input: { action?: string; mid: string; encData: string; checksum: string },
  { parseData, extractImage, orderFromUrl, orderFromData, globals = globalThis }: QrHelpers,
): Promise<{ qrBase64: string; orderId: string }> {
  const url = new globals.URL(input.action || '/', actor.hosts.paytm).toString();
  const response = await actor.reqRetry('paytmFetchQr', async () => actor.req.post(url, {
    headers: await actor.gwHeaders('paytm', { extra: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html,application/xhtml+xml' } }),
    form: { MID: input.mid, ENC_DATA: input.encData, CHECKSUMHASH: input.checksum },
  }));
  const html = await response.text();
  const data = parseData(html);
  const qrBase64 = extractImage(data);
  const orderId = orderFromUrl(url) || orderFromData(data, url) || orderFromUrl(response.url()) || orderFromData(data, response.url());
  const logger = actor.log;
  const status = response.status();
  response.url(); // Preserve the original diagnostic helper's evaluation/errors.
  const message = 'PayTM enc → ' + status + ' pushApp=' + (data ? 'y' : '-') + ' qr=' + (qrBase64 ? qrBase64.length + 'b' : '-') + ' orderId=' + (orderId ? 'y' : '-');
  actor.snip(html);
  logger.call(actor, message);
  return { qrBase64, orderId };
}
