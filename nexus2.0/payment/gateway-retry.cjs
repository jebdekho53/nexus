'use strict';

async function retryGatewayRequest(actor, label, operation, maxAttempts=4, stopRetry, {isBrowserClosed,timers=globalThis}) {
  let lastError;
  for (let attempt=0; attempt<maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isBrowserClosed(error)) {
        actor.log(label + ' stopped — the browser was closed (not a network fault, and retrying cannot help)', 'error');
        break;
      }
      if (attempt < maxAttempts - 1 && !stopRetry?.()) {
        actor.log(label + ' network error — retry ' + (attempt + 1) + '/' + maxAttempts + ': ' + (error?.message || 'err'));
        await new Promise(resolve => timers.setTimeout(resolve, 800 * (attempt + 1)));
        if (stopRetry?.()) break;
      } else {
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(label + ' failed (network)');
}

module.exports = {retryGatewayRequest};
