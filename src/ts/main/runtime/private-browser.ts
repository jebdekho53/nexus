/// <reference lib="dom" />
// Private (off-the-record) browser sessions for logins. Keeps browser discovery/proxy/process ownership in the
// recovered launcher, but never browses in its disk profile. When the site's security challenge denies the session the
// login is stopped (no retry, no rewrite of challenge URLs) and the session is disposed.
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { observePaymentTiming, type TimingContext } from './payment-timing';

interface LoginState {
  denied: boolean;
  launches: number;
  disposers: Set<() => Promise<void>>;
}

const loginScope = new AsyncLocalStorage<LoginState>();
export const denialMessage = 'IRCTC denied this browser session at its security challenge. Login was stopped; an IP block has not been confirmed.';

type Logger = (event: string, details?: Record<string, unknown>) => void;

/** The bare site origin visited by the legacy preflight is replaced by the application entry, as a normal bookmark does. */
export function canonicalEntry(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.host === 'www.irctc.co.in' && url.pathname === '/' && !url.search && !url.hash) { url.pathname = '/nget/'; return url.href; }
  } catch { /* not a URL: leave unchanged */ }
  return value;
}

export interface ChallengePage {
  evaluate?: (fn: () => boolean) => Promise<boolean>;
}

export async function checkAccessDenied(page: ChallengePage | null | undefined, log: Logger = () => undefined, state: LoginState | undefined = loginScope.getStore()): Promise<boolean> {
  if (typeof page?.evaluate !== 'function') return false;
  let denied = false;
  try { denied = await page.evaluate(() => /access denied/i.test(document.title) && /(_sec\/cpr\/challenge|errors\.edgesuite\.net)/i.test(document.body?.innerText || '')); } catch { /* page gone */ }
  if (denied) { if (state) state.denied = true; log('matrix-irctc-access-denied', { message: denialMessage }); }
  return denied;
}

export async function withPrivateLogin<T>(invoke: () => Promise<T>): Promise<T | { ok: false; error: string; code: string }> {
  return loginScope.run({ denied: false, launches: 0, disposers: new Set() }, async () => {
    const state = loginScope.getStore() as LoginState;
    let result: T | undefined;
    try { result = await invoke(); } catch (error) { if (!state.denied) throw error; }
    if (!state.denied) return result as T;
    await Promise.allSettled([...state.disposers].map(dispose => dispose()));
    return { ok: false as const, error: denialMessage, code: 'IRCTC_ACCESS_DENIED' };
  });
}

interface PrivatePage {
  on(event: string, listener: () => void): unknown;
  goto?: (url: string, ...args: unknown[]) => unknown;
  bringToFront?: () => Promise<unknown>;
  url(): string;
  close(): Promise<unknown>;
}

interface PrivateContext extends TimingContext {
  newPage(): Promise<PrivatePage>;
  close(): Promise<unknown>;
  newCDPSession?: (page: PrivatePage) => Promise<{ send(method: string, params?: unknown): Promise<{ windowId?: unknown }>; detach(): Promise<unknown> }>;
  once(event: 'close', listener: () => void): unknown;
}

interface PrivateBrowserHandle {
  newContext?: (options: Record<string, unknown>) => Promise<PrivateContext>;
  once(event: 'disconnected', listener: () => void): unknown;
}

interface LaunchedSession {
  context: { browser(): PrivateBrowserHandle | undefined; pages(): PrivatePage[] };
  dispose?: () => Promise<unknown>;
  [field: string]: unknown;
}

export interface PrivateBrowserDependencies {
  fs?: Pick<typeof fs, 'mkdtemp' | 'rm'>;
  tmpdir?: string;
  onCreated?: (created: { page: PrivatePage; context: PrivateContext; browser: PrivateBrowserHandle; dispose: () => Promise<void>; directory: string }) => Promise<unknown> | unknown;
}

interface LaunchOptions {
  proxy?: { server?: string };
  [field: string]: unknown;
}

// Native Chromium providers share f184. Keep browser discovery/proxy/process ownership in the recovered launcher,
// but never browse in its disk profile.
export function privateBrowser(log: Logger = () => undefined, dependencies: PrivateBrowserDependencies = {}) {
  const files = dependencies.fs || fs;
  const ownedPages = new WeakSet<PrivatePage>();
  const freshLogin = (original: (credentials: unknown, options: Record<string, unknown>) => Promise<unknown>, [credentials, options = {}]: [unknown, Record<string, unknown>?]): Promise<unknown> => {
    const invoke = (): Promise<unknown> => original(credentials, { ...options, cookieState: undefined, cookieStatePool: undefined, launchHidden: false });
    return loginScope.getStore() ? invoke() : withPrivateLogin(invoke);
  };
  return {
    // A fresh private context must not subsequently receive a saved cookie jar.
    f811: freshLogin,
    f829: freshLogin,
    async f184(original: (options: Record<string, unknown>) => Promise<LaunchedSession>, [options = {}]: [LaunchOptions?]): Promise<unknown> {
      const state = loginScope.getStore();
      if (state?.denied) throw new Error(denialMessage);
      // A selected browser gets one launch per login. Recovered catch/retry branches must not silently rotate
      // through other installed browsers.
      if (state?.launches) throw Object.assign(new Error('The selected browser login failed. Automatic browser switching is disabled. Retry explicitly after checking the error.'), { code: 'MATRIX_BROWSER_RETRY_STOPPED' });
      if (state) state.launches++;
      const directory = await files.mkdtemp(path.join(dependencies.tmpdir || os.tmpdir(), 'matrix-private-'));
      let session: LaunchedSession | undefined, context: PrivateContext | undefined, disposal: Promise<void> | undefined;
      const cleanup = async (): Promise<void> => {
        try { await files.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
        catch (error) { log('matrix-private-cleanup-pending', { error: String((error as { code?: unknown }).code || 'cleanup failed') }); throw error; }
      };
      const dispose = (): Promise<void> => disposal ??= Promise.resolve().then(async () => {
        try { await context?.close(); }
        finally { try { await session?.dispose?.(); } finally { await cleanup(); } }
        log('matrix-private-session-closed');
      });
      try {
        session = await original({ ...options, userDataDir: directory, launchHidden: false, windowPosition: undefined });
        const browser = session?.context?.browser();
        if (typeof browser?.newContext !== 'function') throw new Error('Native browser cannot create a private session');
        // Browser.newContext is Chromium's off-the-record (Incognito) context.
        // Do not copy storageState, cookies, user agents or profile init scripts.
        context = await browser.newContext({ viewport: null, ...(options.proxy?.server ? { proxy: options.proxy } : {}) });
        observePaymentTiming(context, log);
        const page = await context.newPage();
        ownedPages.add(page);
        // Restore the private window, including when the inherited launcher or OS previously left the browser
        // minimized/off screen.
        if (typeof context.newCDPSession === 'function') {
          let cdp: Awaited<ReturnType<NonNullable<PrivateContext['newCDPSession']>>> | undefined;
          try { cdp = await context.newCDPSession(page); const { windowId } = await cdp.send('Browser.getWindowForTarget'); await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); }
          catch { log('matrix-private-window-restore-unavailable'); }
          finally { await cdp?.detach().catch(() => undefined); }
        }
        await page.bringToFront?.();
        // The legacy login preflight visits the site's bare origin before the SPA. Use its supported application
        // entry, as a normal bookmark does. Challenge URLs and denied responses are never rewritten or retried.
        if (typeof page.goto === 'function') {
          const goto = page.goto.bind(page);
          page.goto = (url: string, ...args: unknown[]) => {
            const entry = canonicalEntry(url);
            if (entry !== url) log('matrix-irctc-canonical-entry', { path: '/nget/' });
            return goto(entry, ...args);
          };
        }
        // CDP launchers can expose pages from an already attached context. Never close another pair's page or a
        // restored/nonblank user tab.
        for (const oldPage of session.context.pages()) {
          if (ownedPages.has(oldPage)) continue;
          let url: string;
          try { url = oldPage.url(); } catch { continue; }
          if (url === 'about:blank' || /^(?:chrome|edge|brave):\/\/newtab\/?$/.test(url)) await oldPage.close().catch(() => undefined);
        }
        context.once('close', () => { dispose().catch(() => undefined); });
        browser.once('disconnected', () => { dispose().catch(() => undefined); });
        state?.disposers.add(dispose);
        page.on('domcontentloaded', () => { checkAccessDenied(page as ChallengePage, log, state).catch(() => undefined); });
        log('matrix-private-session-created', { persistent: false, proxy: !!options.proxy?.server });
        if (dependencies.onCreated) await dependencies.onCreated({ page, context, browser, dispose, directory });
        return { ...session, context, page, dispose };
      } catch (error) {
        await dispose().catch(() => undefined);
        throw error;
      }
    },
  };
}
