// The gateway payment redirect: posts the session form to the provider and extracts the next form from the HTML.

export interface RedirectInput {
  username: string;
  clientTxnId: string;
  accessToken: unknown;
  rand8: string;
  csrf: string;
}

export interface RedirectResponse {
  text(): Promise<string>;
  status(): number;
}

export interface RedirectActor {
  hosts: { wps: string };
  req: { post(url: string, options: { headers: unknown; form: Record<string, unknown> }): Promise<RedirectResponse> };
  reqRetry(label: string, operation: () => Promise<RedirectResponse>): Promise<RedirectResponse>;
  gwHeaders(host: string, options: { navigate: boolean; htmlAccept: boolean }): Promise<unknown>;
  sleep(ms: number): Promise<unknown>;
  log(message: string): void;
  snip(html: string): unknown;
  noteGatewayPage(action: string): void;
}

/** Value of the hidden `<input name="...">`, or '' when the input or its value is missing. */
export function hiddenFormValue(html: string, name: string): string {
  const input = new RegExp('<input[^>]*name=["\']' + name + '["\'][^>]*>', 'i').exec(html)?.[0];
  return input ? /value=["']([^"']*)["']/.exec(input)?.[1] ?? '' : '';
}

export function formAction(html: string): string {
  return /<form[^>]*action=["']([^"']+)["']/.exec(html)?.[1] ?? '';
}

export async function paymentRedirect(
  actor: RedirectActor,
  input: RedirectInput,
  { getAction, getField }: { getAction: (html: string) => string; getField: (html: string, name: string) => string },
): Promise<{ action: string; encdata: string; blocked: boolean }> {
  const transaction = input.username + ':' + input.clientTxnId;
  const form = { token: input.accessToken, txn: transaction, [transaction]: input.rand8 + '.' + input.csrf };
  let action = '', encdata = '', blocked = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await actor.req.post(actor.hosts.wps + '/eticketing/PaymentRedirect', {
      headers: await actor.gwHeaders('wps', { navigate: true, htmlAccept: false }),
      form,
    });
    const html = await response.text();
    action = getAction(html);
    encdata = getField(html, 'encdata');
    blocked = /unable to process/i.test(html);
    actor.log('paymentRedirect → ' + response.status() + ' action=' + (action ? 'y' : 'n') + ' encdata=' + (encdata ? 'y' : 'n') + (blocked ? ' BLOCKED' : '') + (attempt ? ' (try ' + (attempt + 1) + ')' : ''));
    if (action || blocked) break;
    if (attempt < 3) await actor.sleep(700 + attempt * 700);
  }
  actor.noteGatewayPage(action);
  return { action, encdata, blocked };
}

export interface PaytmRedirectForm {
  action: string;
  encData: string;
  mid: string;
  checksum: string;
}

/** Reads the PayTM hand-over form; each field is the first non-empty value among its alternative input names. */
export function paytmRedirectForm(
  html: string,
  { getAction = formAction, getField = hiddenFormValue }: { getAction?: (html: string) => string; getField?: (html: string, name: string) => string } = {},
): PaytmRedirectForm {
  function firstValue(...names: string[]): string {
    for (const name of names) {
      const value = getField(html, name);
      if (value) return value;
    }
    return '';
  }
  return {
    action: getAction(html),
    encData: firstValue('encData', 'ENC_DATA', 'encdata', 'enc_data'),
    mid: firstValue('mid', 'MID'),
    checksum: firstValue('checksum', 'CHECKSUMHASH', 'checksumhash', 'checkSum'),
  };
}

export async function paytmRedirect(
  actor: RedirectActor,
  input: RedirectInput,
  { parseForm }: { parseForm: (html: string) => PaytmRedirectForm },
): Promise<PaytmRedirectForm> {
  const transaction = input.username + ':' + input.clientTxnId;
  const form = { token: input.accessToken, txn: transaction, [transaction]: input.rand8 + '.' + input.csrf };
  let result: PaytmRedirectForm = { action: '', encData: '', mid: '', checksum: '' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await actor.reqRetry('paytmRedirect', async () => actor.req.post(actor.hosts.wps + '/eticketing/PaymentRedirect', {
      headers: await actor.gwHeaders('wps', { navigate: true, htmlAccept: false }), form,
    })).catch(() => null);
    if (!response) {
      if (attempt < 3) await actor.sleep(700 + attempt * 700);
      continue;
    }
    const html = await response.text();
    result = parseForm(html);
    const logger = actor.log;
    const message = 'PaymentRedirect → ' + response.status() + ' action=' + (result.action ? 'y' : '-') + ' mid=' + (result.mid ? 'y' : '-') + ' enc=' + (result.encData ? 'y' : '-') + ' chk=' + (result.checksum ? 'y' : '-') + (attempt ? ' (try ' + (attempt + 1) + ')' : '');
    // Retain helper evaluation/errors, but keep page HTML and action URLs out of logs.
    actor.snip(html);
    logger.call(actor, message);
    if (result.action && result.mid && result.encData && result.checksum) return result;
    if (attempt < 3) await actor.sleep(700 + attempt * 700);
  }
  return result;
}
