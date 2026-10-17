// Observer called for every recovered-function invocation (the engine's `onInvoke` option): feeds the activity log from
// the recovered progress function (f3720), counts calls while an action trace is active, and records the extra
// diagnostics that the live/isolated test flags ask for. With no flags it only does the first two.

type Logger = (event: string, details?: Record<string, unknown>) => void;

export interface InvokeObserverContext {
  log: Logger;
  activity: { recovered(args: unknown[]): void };
  actionTrace: { active: boolean; calls: Map<string, number> };
}

interface PageLike {
  url: unknown;
  screenshot: unknown;
  evaluate: unknown;
}

declare global {
  // Diagnostic state shared with the live-test runners (test/*.cjs); set only under the live-test flags.
  // eslint-disable-next-line no-var
  var __matrixE2eStages: Array<{ at: string; stage: string }> | undefined;
  // eslint-disable-next-line no-var
  var __matrixActualQrAt: number | undefined;
  // eslint-disable-next-line no-var
  var __matrixWarmupQrReady: boolean | undefined;
  // eslint-disable-next-line no-var
  var __matrixWarmupQrAt: number | undefined;
  // eslint-disable-next-line no-var
  var __matrixDiagnosticPage: unknown;
}

export function createInvokeObserver({ log, activity, actionTrace }: InvokeObserverContext): (id: string, args: unknown[], captured?: unknown) => void {
  return (id, args) => {
    const first = args[0] as { imageBase64?: { length?: number }; payload?: unknown } | null | undefined;
    if (id === 'f3740' && process.argv.includes('--isolated-live-test')) log('e2e-qr-publisher', { keys: Object.keys(first || {}), imageBase64Length: first?.imageBase64?.length || 0, payloadLength: typeof first?.payload === 'string' ? first.payload.length : 0 });
    if (actionTrace.active) actionTrace.calls.set(id, (actionTrace.calls.get(id) || 0) + 1);
    if (id === 'f3720') {
      activity.recovered(args);
    }
    if (id === 'f3720' && process.argv.includes('--live-booking-test')) {
      (globalThis.__matrixE2eStages ??= []).push({ at: new Date().toISOString(), stage: String(args[0] || '') });
      if (String(args[0]) === 'booking:qr' && /Scan.*QR/i.test(String(args[1] || ''))) globalThis.__matrixActualQrAt = performance.now();
      log('matrix-live-raw-stage', { stage: String(args[0] || ''), message: String(args[1] || '').slice(0, 600) });
      if (/Browser Check-Up reached the QR page/.test(String(args[1] || ''))) {
        globalThis.__matrixWarmupQrReady = true;
        globalThis.__matrixWarmupQrAt = performance.now();
      }
    }
    if (process.argv.includes('--live-booking-test') || process.argv.includes('--live-login-test')) {
      const page = args.find(value => value && typeof (value as PageLike).url === 'function' && typeof (value as PageLike).screenshot === 'function' && typeof (value as PageLike).evaluate === 'function');
      if (page) globalThis.__matrixDiagnosticPage = page;
    }
  };
}
