/// <reference lib="dom" />
// The owned PayTM origin page: opened in the background so in-page requests carry the PayTM origin and cookies.

// Page-side helpers are serialized by the browser driver (page.evaluate), so they must not reference anything
// outside their own bodies.
export function showPaytmProgress(): void {
  try {
    document.title = 'Processing payment…';
    document.body.innerHTML = '<div style="font:600 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d4ed8;text-align:center;margin-top:34vh">Finalizing your booking…</div>';
    document.body.style.background = '#ffffff';
  } catch { /* the page may already be gone */ }
}

export interface PaytmPageHandle {
  isClosed(): boolean;
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  url(): string;
  close(): Promise<unknown>;
  evaluate<Result, Arg = undefined>(fn: (arg: Arg) => Result, arg?: Arg): Promise<Result>;
}

export interface PaytmPageActor {
  paytmPage?: PaytmPageHandle | undefined;
  hosts: { paytm: string };
  page: { context(): { newPage(): Promise<PaytmPageHandle> } };
  paytmOriginPage(): Promise<PaytmPageHandle | null>;
}

export async function paytmOriginPage(actor: PaytmPageActor, globals: { URL: typeof URL } = globalThis): Promise<PaytmPageHandle | null> {
  if (actor.paytmPage && !actor.paytmPage.isClosed()) return actor.paytmPage;
  try {
    const page = await actor.page.context().newPage();
    await page.goto(actor.hosts.paytm + '/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
    if (new globals.URL(page.url()).origin !== new globals.URL(actor.hosts.paytm).origin) {
      await page.close().catch(() => undefined);
      return null;
    }
    await page.evaluate(showPaytmProgress).catch(() => undefined);
    actor.paytmPage = page;
    return page;
  } catch { return null; }
}

export interface InPageRequest {
  url: string;
  method: string;
  body?: string | undefined;
  referer?: string | undefined;
}

// Page-side: performs the request with the page's own cookies; never throws (status 0 on failure).
export async function requestInPaytmPage({ url, method, body, referer }: InPageRequest): Promise<{ status: number; text: string }> {
  try {
    const options: RequestInit = { method, credentials: 'include' };
    if (referer) options.referrer = referer;
    if (method === 'POST') {
      options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      options.body = body || '';
    }
    const response = await fetch(url, options);
    return { status: response.status, text: await response.text() };
  } catch { return { status: 0, text: '' }; }
}

export async function paytmPageRequest(actor: PaytmPageActor, path: string, options: { method: string; body?: string; referer?: string }): Promise<{ status: number; text: string } | null> {
  const page = await actor.paytmOriginPage();
  if (!page) return null;
  const url = '' + actor.hosts.paytm + path;
  return page.evaluate(requestInPaytmPage, { url, method: options.method, body: options.body, referer: options.referer }).catch(() => null);
}

export async function disposePaytmPage(actor: Pick<PaytmPageActor, 'paytmPage'>): Promise<void> {
  const page = actor.paytmPage;
  actor.paytmPage = undefined;
  if (page && !page.isClosed()) await page.close().catch(() => undefined);
}
