/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// Login settle-time improvements wrapped around the recovered login handlers: a short readiness probe that spends the
// existing settle budget, and a verified Playwright fill for login fields.
import * as privateBrowser from './private-browser';

type Logger = (event: string, details?: Record<string, unknown>) => void;

interface LoginPage {
  waitForFunction(fn: () => boolean, arg: undefined, options: { timeout: number; polling: number }): Promise<unknown>;
}

interface SettleSettings {
  maxMs?: number;
  quietMs?: number;
  [field: string]: unknown;
}

interface Field {
  fill(value: string, options: { timeout: number }): Promise<unknown>;
  inputValue(): Promise<string>;
}

export function loginPerformance(log: Logger = () => undefined, dependencies: { now?: () => number } = {}) {
  const now = dependencies.now || ((): number => performance.now());
  return {
    async f698(original: (page: LoginPage, options: SettleSettings) => unknown, [page, settings = {}]: [LoginPage, SettleSettings?]): Promise<unknown> {
      if (await privateBrowser.checkAccessDenied(page as never, log)) throw new Error(privateBrowser.denialMessage);
      // Readiness probing consumes the existing settle budget, not an extra four seconds before that budget.
      // Keep popup handling in one invocation.
      const started = now(), budget = Number.isFinite(settings.maxMs) ? Math.max(0, settings.maxMs as number) : 9000;
      let ready = false;
      try {
        if (budget > 0) {
          await page.waitForFunction(() => {
            const root = document.querySelector('app-root');
            if (document.readyState === 'loading' || !root?.children.length) return false;
            if (!root.querySelector('header,nav,input,button,a')) return false;
            return ![...document.querySelectorAll('.loading-overlay,.ui-blockui,.block-ui-wrapper,.ngx-spinner-overlay')]
              .some(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
          }, undefined, { timeout: Math.min(4000, budget), polling: 100 });
          ready = true;
        }
      } catch { /* probe timed out: fall back to the full settle budget */ }
      const probeMs = Math.max(0, now() - started), remaining = Math.max(0, budget - probeMs);
      const options = { ...settings, maxMs: ready ? Math.min(remaining, 1500) : remaining, ...(ready ? { quietMs: Math.min(settings.quietMs ?? 2600, 200) } : {}) };
      if (ready) log('matrix-login-ready-short-wait');
      try { return await original(page, options); }
      finally { log('matrix-login-settle-timing', { ready, probeMs: Math.round(probeMs), handlerBudgetMs: Math.round(options.maxMs), durationMs: Math.round(Math.max(0, now() - started)) }); }
    },
    async f583(original: (actor: unknown, field: Field, value: string) => unknown, [actor, field, value]: [unknown, Field, string]): Promise<unknown> {
      // Playwright fill dispatches input/change and checks editability.
      try {
        await field.fill(value, { timeout: 5000 });
        if (await field.inputValue() === value) {
          log('matrix-login-field-fill-verified');
          return true;
        }
      } catch { /* fall back to the recovered typing path */ }
      return original(actor, field, value);
    },
  };
}
