// Retries a gateway request on network errors (up to maxAttempts, 800ms * attempt apart), but never after the
// browser was closed or when `stopRetry` says to stop.
import type { Timers } from './pnr-lifecycle';

export async function retryGatewayRequest<T>(
  actor: { log(message: string, level?: string): void },
  label: string,
  operation: () => Promise<T>,
  maxAttempts = 4,
  stopRetry: (() => boolean) | undefined,
  { isBrowserClosed, timers = globalThis }: { isBrowserClosed: (error: unknown) => boolean; timers?: Timers },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isBrowserClosed(error)) {
        actor.log(label + ' stopped — the browser was closed (not a network fault, and retrying cannot help)', 'error');
        break;
      }
      if (attempt < maxAttempts - 1 && !stopRetry?.()) {
        actor.log(label + ' network error — retry ' + (attempt + 1) + '/' + maxAttempts + ': ' + ((error as { message?: string } | null | undefined)?.message || 'err'));
        await new Promise<void>(resolve => timers.setTimeout(resolve, 800 * (attempt + 1)));
        if (stopRetry?.()) break;
      } else {
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(label + ' failed (network)');
}
