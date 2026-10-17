// Run controls for a booking: cancellation, stop results, browser window handling, live-form edits, sign-in waiting,
// session-drop detection, the duplicate-login watch and the AI-helper hand-off. Each function notes the recovered
// function it reconstructs. (The proxy routing, the high-load delay and the storage debug dump stay in controls.cjs.)

type Level = string | undefined;

/** The parts of a booking run that these controls read and write. */
export interface ControlsActor {
  pnrSeen?: unknown;
  settlingPayment?: unknown;
  paymentCancelled?: string | undefined;
  stopped?: unknown;
  stuck?: unknown;
  terminal?: string | undefined;
  relaunch?: unknown;
  ai?: unknown;
  liveForm?: Record<string, unknown> | undefined;
  chosenPaymentMethod?: unknown;
  duplicateWatchAttached?: boolean;
  duplicateLogin?: boolean;
  spaFiredTc?: boolean;
  tcPrimed?: unknown;
  opts: { hideBrowser?: boolean; vendorBrowser?: unknown; onSwitchBrowser?: (() => void) | null };
  session: { page?: ControlsPage | null; tokens?: { accessToken?: string | null } | null; mode?: string };
  cancelPnrWait?: (() => void) | undefined;
  now(): number;
  stop(): void;
  endSettling(): void;
  endFinalPnrRequest(): void;
  onProgress(stage: string, message: string): void;
  log(category: string, message: string, level?: Level): void;
  focusBrowser(): Promise<unknown>;
  aiResolve(goal: string, reason?: string): Promise<unknown>;
  dismissPostBookingPopup(page: ControlsPage): Promise<unknown>;
}

interface Locator {
  filter(options: { visible: boolean }): Locator;
  first(): Locator;
  count(): Promise<number>;
  click(options: { timeout: number }): Promise<unknown>;
}

export interface ControlsPage {
  isClosed(): boolean;
  waitForTimeout(ms: number): Promise<unknown>;
  context(): { newCDPSession(page: ControlsPage): Promise<{ send(method: string, params?: unknown): Promise<{ windowId?: unknown }>; detach(): Promise<unknown> }> };
  locator(selector: string): Locator;
  on(event: 'response', listener: (response: { url(): string; status(): number }) => unknown): unknown;
}

// Recovered f2046. A cancellation is ignored once a PNR was seen or settlement started.
export function cancelPayment(actor: ControlsActor, reason: string): void {
  if (actor.pnrSeen || actor.settlingPayment) return;
  actor.paymentCancelled = reason;
  actor.stopped = true;
  actor.cancelPnrWait?.();
}

// Recovered f2047. Ends any settling/final PNR request, then reports either the operator cancellation or the generic
// stopped result supplied by the bootstrap.
export function stoppedResult<R>(actor: ControlsActor, { defaultResult }: { defaultResult: () => R }): R | { success: false; message: string } {
  actor.endSettling();
  actor.endFinalPnrRequest();
  if (actor.paymentCancelled) {
    actor.onProgress('booking:error', actor.paymentCancelled);
    return { success: false, message: actor.paymentCancelled };
  }
  return defaultResult();
}

// Recovered f2055. Brings the run's browser page to the front; failures are ignored.
export async function focusBrowser(actor: ControlsActor, { bringToFront }: { bringToFront: (page: ControlsPage) => Promise<unknown> }): Promise<void> {
  if (actor.session.page) await bringToFront(actor.session.page).catch(() => undefined);
}

// Recovered f2057. Moves a locally owned browser off-screen so the operator uses the mini box.
export async function hideBrowser(actor: ControlsActor, { moveOffScreen }: { moveOffScreen: (page: ControlsPage, hidden: boolean) => Promise<unknown> }): Promise<void> {
  if (actor.session.page && !actor.opts.vendorBrowser) {
    await moveOffScreen(actor.session.page, true).catch(() => undefined);
    actor.log('booking', 'browser moved off-screen — operator interacts via the mini box (captcha/QR/status)');
  }
}

// Recovered f2049. Minimizes the run's browser window through the DevTools protocol; never throws.
export async function minimizeBrowser(actor: ControlsActor): Promise<void> {
  if (actor.session.page) {
    try {
      const page = actor.session.page;
      const cdp = await page.context().newCDPSession(page);
      const target = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId: target.windowId, bounds: { windowState: 'minimized' } });
      await cdp.detach().catch(() => undefined);
      actor.log('payment', 'minimized this run’s browser — pay via the QR in the mini box');
    } catch (error) {
      actor.log('payment', 'minimize failed (non-fatal): ' + (error as { message?: string }).message, 'warn');
    }
  }
}

// Recovered f2059. Surfaces the browser and clicks the page's print control (UI-login runs only).
export async function printTicketInBrowser(actor: ControlsActor, { bringToFront }: { bringToFront: (page: ControlsPage) => Promise<unknown> }): Promise<boolean> {
  const page = actor.session.page;
  if (!(actor.session.mode === 'uilogin' && page)) return false;
  try {
    await bringToFront(page);
    await actor.dismissPostBookingPopup(page);
    const control = page.locator('a.fa-print, a[title="Print Ticket"], [title="Print Ticket"], .fa-print').filter({ visible: true }).first();
    if (await control.count()) {
      await control.click({ timeout: 5000 }).catch(() => undefined);
      actor.log('ui', 'Print Ticket: surfaced the browser + clicked the print control');
    } else {
      actor.log('ui', 'Print Ticket: print control not found — browser surfaced for a manual print', 'warn');
    }
    return true;
  } catch (error) {
    actor.log('ui', 'Print Ticket failed: ' + (error as { message?: string }).message, 'warn');
    return false;
  }
}

// Recovered f2079 (+f2080). Ends settlement, optionally asks the AI helper to recover a dead session, and reports the
// run as stopped.
export async function stopWith(
  actor: ControlsActor,
  reason: string,
  options: { noRelaunch?: unknown } | undefined,
  { shouldRecover }: { shouldRecover: (reason: string, hasAi: boolean, noRelaunch: boolean) => boolean },
): Promise<{ success: false; message: string; stuck?: true }> {
  actor.endSettling();
  actor.endFinalPnrRequest();
  if (actor.stuck) {
    actor.onProgress('booking:stuck', 'Waiting for Response…');
    return { success: false, message: 'Stopped: ' + reason, stuck: true };
  }
  if (!actor.stopped) {
    if (shouldRecover(reason, !!actor.ai, !!options?.noRelaunch)) {
      await actor.aiResolve('Recover the dead session so the booking can continue (relaunch on a fresh browser if needed).', reason);
      if (actor.relaunch) return { success: false, message: 'Stopped: ' + reason };
    }
  }
  if (actor.opts.hideBrowser ?? true) await actor.focusBrowser().catch(() => undefined);
  actor.onProgress('booking:error', 'Stopped: ' + reason);
  return { success: false, message: 'Stopped: ' + reason };
}

export interface LivePatch {
  date?: unknown;
  classCode?: unknown;
  quota?: unknown;
  paymentMethod?: unknown;
  paymentMethodDisplay?: unknown;
  upiId?: unknown;
}

// Recovered f2081. Applies a mid-run edit of the live form and logs which fields changed.
export function updateLiveForm(actor: ControlsActor, patch: LivePatch): undefined {
  const form = actor.liveForm;
  if (!form) return undefined;
  const changes: string[] = [];
  for (const [field, label] of [['date', 'date='], ['classCode', 'class='], ['quota', 'quota='], ['paymentMethod', 'pay=']] as const) {
    if (patch[field] !== undefined && patch[field] !== form[field]) {
      form[field] = patch[field];
      changes.push(label + String(patch[field]));
    }
  }
  if (patch.paymentMethodDisplay !== undefined) form.paymentMethodDisplay = patch.paymentMethodDisplay;
  if (patch.upiId !== undefined) form.upiId = patch.upiId;
  if (patch.paymentMethod !== undefined || patch.paymentMethodDisplay !== undefined)
    actor.chosenPaymentMethod = form.paymentMethodDisplay || form.paymentMethod || '';
  if (changes.length) actor.log('edit', 'live edit applied (mid-run): ' + changes.join(', '));
  return undefined;
}

// Recovered f2083 (+f2084–f2086). Refuses to continue without an access token; waits up to 90 s (checking every 500 ms,
// reporting every 10 s) for the operator to finish signing in, then stops the run.
export async function ensureAuthToken(
  actor: ControlsActor,
  { bringToFront, terminalClosed, terminalNoToken }: { bringToFront: (page: ControlsPage) => Promise<unknown>; terminalClosed: () => string; terminalNoToken: () => string },
): Promise<boolean> {
  const page = actor.session.page;
  if (!page) return true;
  const hasToken = (): string => (actor.session.tokens?.accessToken ?? '').trim();
  if (hasToken()) return true;
  const waitMs = 90000;
  const started = actor.now();
  actor.log('login', 'NO access token — refusing to fire protected calls; waiting for the sign-in to complete', 'warn');
  actor.onProgress('booking:login', 'Waiting for sign-in to complete…');
  let reported = 0;
  while (!actor.stopped && actor.now() - started < waitMs) {
    if (page.isClosed()) {
      actor.terminal = terminalClosed();
      return false;
    }
    await page.waitForTimeout(500).catch(() => undefined);
    if (hasToken()) {
      actor.log('login', 'access token captured after ' + ((actor.now() - started) / 1000).toFixed(1) + 's — continuing');
      return true;
    }
    const tick = Math.floor((actor.now() - started) / 10000);
    if (tick > reported) {
      reported = tick;
      actor.log('login', 'still waiting for the sign-in (' + (tick * 10) + 's) — finish the login in the browser window', 'warn');
    }
  }
  if (!actor.stopped) {
    actor.log('login', 'no access token after the wait — stopping instead of booking an unauthenticated session', 'error');
    await bringToFront(page).catch(() => undefined);
    actor.terminal = terminalNoToken();
  }
  return false;
}

// Recovered f2087 (+f2088–f2093). When the login form reappears the session was dropped: the run stops and asks to be
// relaunched on a fresh browser, unless the page is positively logged in.
export async function relaunchIfLoggedOut(
  actor: ControlsActor,
  { loginButtonVisible, positivelyLoggedIn, waitForHydration }: { loginButtonVisible: (page: ControlsPage) => Promise<boolean>; positivelyLoggedIn: (page: ControlsPage) => Promise<boolean>; waitForHydration: (page: ControlsPage) => Promise<unknown> },
): Promise<boolean> {
  const page = actor.session.page;
  if (!(page && await loginButtonVisible(page).catch(() => false))) return false;
  if (await positivelyLoggedIn(page).catch(() => false)) {
    actor.log('login', 'LOGIN button present but the page is positively logged in (MY ACCOUNT / search form) — NOT relaunching');
    return false;
  }
  if (actor.session.tokens?.accessToken) {
    await page.waitForTimeout(2500).catch(() => undefined);
    await waitForHydration(page).catch(() => undefined);
    if ((await positivelyLoggedIn(page).catch(() => false)) || !(await loginButtonVisible(page).catch(() => false))) {
      actor.log('login', 'login button showed transiently after login but the SPA hydrated logged-in — NOT relaunching');
      return false;
    }
  }
  actor.log('login', 'login form reappeared (session dropped) — relaunching on a fresh browser to re-login', 'warn');
  actor.onProgress('booking:error', 'Session dropped (login form reappeared) — re-logging in on a fresh browser');
  actor.relaunch = true;
  actor.stopped = true;
  return true;
}

// Recovered f2094 (+f2095). Watches page responses once per run: notices the page's own journey-context request and a
// 409 from the protected API, which means the same IRCTC ID signed in elsewhere.
export function attachDuplicateLoginWatch(actor: ControlsActor, page: ControlsPage, { isJourneyContextUrl }: { isJourneyContextUrl: (url: string, primed: unknown) => boolean }): undefined {
  if (actor.duplicateWatchAttached) return undefined;
  actor.duplicateWatchAttached = true;
  page.on('response', response => {
    try {
      if (!actor.spaFiredTc && isJourneyContextUrl(response.url(), actor.tcPrimed)) {
        actor.spaFiredTc = true;
        actor.log('search', 'SPA fired its own altAvlEnq/TC (' + response.status() + ') — journey context primed by the page');
      }
      if (actor.duplicateLogin) return undefined;
      if (response.status() === 409 && /\/eticketing\/protected\//.test(response.url())) {
        actor.duplicateLogin = true;
        actor.log('browser', 'Duplicate IRCTC ID login detected (409 ' + (response.url().split('?')[0] as string).split('/').pop() + ') — stopping this pair', 'warn');
      }
    } catch { /* detection must never break the page */ }
    return undefined;
  });
  return undefined;
}

// Recovered f2128 (+f2129–f2131). Hands a stuck page to the AI helper. The helper may ask to relaunch the browser or
// to switch to another profile; both requests are recorded on the run.
export async function aiResolve(
  actor: ControlsActor & { ai?: { resolve(page: ControlsPage, snapshot: unknown, goal: string, extra: string, hooks: { onRelogin: () => Promise<boolean>; onSwitchBrowser: () => void }): Promise<unknown> } | null },
  goal: string,
  extra: string | undefined,
  { createSnapshot }: { createSnapshot: (page: ControlsPage) => unknown },
): Promise<unknown> {
  if (!(actor.ai && actor.session.page)) return false;
  actor.onProgress('booking:ai', '🤖 AI fallback: ' + goal);
  const snapshot = createSnapshot(actor.session.page);
  const resolved = await actor.ai.resolve(actor.session.page, snapshot, goal, extra ?? '', {
    onRelogin: () => {
      actor.relaunch = true;
      actor.stop();
      return Promise.resolve(false);
    },
    onSwitchBrowser: () => {
      actor.opts.onSwitchBrowser?.();
      actor.terminal = 'Session lost — use a different browser profile (this one is flagged for today)';
    },
  }).catch(() => false);
  actor.log('ai', resolved ? 'AI resolved: ' + goal : 'AI could not resolve: ' + goal, resolved ? 'info' : 'warn');
  return resolved;
}
