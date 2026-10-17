// Posts the bank's response to the provider and follows the confirmation chain until "booking-confirm".
// Waits are provider-required: interstitial delays are honoured in full, other retries wait 3s / 3.5s / 7s.

export interface BankResponseResponse {
  url(): string;
  text(): Promise<string>;
  status(): number;
}

export interface BankResponseActor {
  hosts: { wps: string };
  req: { post(url: string, options: Record<string, unknown>): Promise<BankResponseResponse> };
  gwHeaders(host: string, options: Record<string, unknown>): Promise<unknown>;
  bankResponseOrigin(): Record<string, unknown> | null | undefined;
  sleep(ms: number): Promise<unknown>;
  log(message: string, level?: string): void;
}

/** The delay (ms) a "submit after a timeout" interstitial page asks for, or 0. */
export function interstitialDelay(html: string): number {
  const full = /setTimeout\s*\(\s*function\s*\(\s*\)\s*\{[\s\S]*?\.submit\(\s*\)\s*;?[\s\S]*?\}\s*,\s*(\d+)\s*\)/i.exec(html);
  if (full) return Number.parseInt(full[1] as string, 10);
  const compact = /setTimeout\s*\([\s\S]*?\.submit\(\s*\)[\s\S]*?,\s*(\d+)\s*\)/i.exec(html);
  return compact ? Number.parseInt(compact[1] as string, 10) : 0;
}

interface ChainLabels {
  prefix: string;
}

// The two recovered chains differ only in their form fields and log wording; one loop serves both.
async function followBankChain(
  actor: BankResponseActor,
  form: () => Record<string, unknown>,
  labels: ChainLabels,
  { isBrowserClosed, parseDelay }: { isBrowserClosed?: (error: unknown) => boolean; parseDelay: (html: string) => number },
): Promise<boolean> {
  const url = actor.hosts.wps + '/eticketing/BankResponse';
  let withForm = true, emptyResponses = 0, networkErrors = 0;
  const origin = actor.bankResponseOrigin();
  while (true) {
    let response: BankResponseResponse;
    try {
      response = await actor.req.post(url, {
        headers: await actor.gwHeaders('wps', { navigate: true, ...(origin ?? {}), ...(origin ? { secFetchSite: 'cross-site' } : {}) }),
        timeout: 0,
        ...(withForm ? { form: form() } : {}),
      });
    } catch (error) {
      if (isBrowserClosed?.(error)) {
        actor.log('bankResponse could not complete — the browser was closed and no settlement transport was armed', 'error');
        return false;
      }
      if (++networkErrors > 3) { actor.log(labels.prefix + ' network errors exhausted'); return false; }
      actor.log(labels.prefix + ' network error (' + (error as { message?: string }).message + ') — retry ' + networkErrors + '/3');
      withForm = false;
      await actor.sleep(3000);
      continue;
    }
    if (/booking-confirm/i.test(response.url())) { actor.log(labels.prefix + ' → booking-confirm'); return true; }
    const html = await response.text().catch(() => '');
    if (/booking-confirm/i.test(html)) { actor.log(labels.prefix + ' → booking-confirm (body)'); return true; }
    const delay = parseDelay(html);
    if (delay) {
      actor.log(labels.prefix + ' interstitial → waiting the full ' + delay + 'ms then re-submitting bodiless');
      withForm = false; emptyResponses = 0;
      await actor.sleep(delay);
      continue;
    }
    if (response.status() !== 200) {
      actor.log(labels.prefix + ' non-200 (' + response.status() + ') — chain still in flight, keep following');
      withForm = false;
      await actor.sleep(3500);
      continue;
    }
    if (++emptyResponses > 2) break;
    actor.log(labels.prefix + ': 200 no interstitial/redirect — retry ' + emptyResponses + '/2');
    withForm = false;
    await actor.sleep(7000);
  }
  actor.log(labels.prefix + ' exhausted without booking-confirm');
  return false;
}

export function bankResponse(
  actor: BankResponseActor,
  payload: unknown,
  responseKey = 'encdata',
  helpers: { isBrowserClosed: (error: unknown) => boolean; parseDelay: (html: string) => number },
): Promise<boolean> {
  return followBankChain(actor, () => ({ [responseKey]: payload }), { prefix: 'bankResponse' }, helpers);
}

/** PayTM's bank response is generic about browser closure: it retries like any network error (no closed-browser exit). */
export function paytmBankResponse(
  actor: BankResponseActor,
  input: { mid: string; encData: string; checksum: string },
  { parseDelay }: { parseDelay: (html: string) => number },
): Promise<boolean> {
  return followBankChain(actor, () => ({ MID: input.mid, ENC_DATA: input.encData, CHECKSUMHASH: input.checksum }), { prefix: 'PayTM BankResponse' }, { parseDelay });
}
