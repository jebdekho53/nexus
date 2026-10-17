// Classification and text extraction for payment failures.

/** A payment response is either text or a body object whose error text may sit in several fields. */
export type PaymentResponse = string | { errorMessage?: unknown; errorMsg?: unknown; error_description?: unknown; error?: unknown; message?: unknown } | null | undefined;

export function isBankProcessingError(response: PaymentResponse): boolean {
  const message = typeof response === 'string' ? response : String(response?.errorMessage ?? response?.error ?? response?.message ?? '');
  return /unable to process payment|issue at bank end|unable to process the request due to issue at bank/i.test(message);
}

/** First non-blank error text of a response body, trimmed; empty when there is none (or the response is plain text). */
export function paymentResponseError(response: PaymentResponse): string {
  if (typeof response === 'string') return '';
  const body = response ?? {};
  for (const key of ['errorMessage', 'errorMsg', 'error_description', 'error'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** True when the failure means the browser/page/context was closed (retrying cannot help). */
export function isBrowserClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return !!message && /Request context disposed|Target (?:page|context|browser)[\s\S]{0,40}has been closed|Target closed|browser has been closed|has been closed|Execution context was destroyed|Protocol error[\s\S]{0,30}(?:Target closed|Session closed)/i.test(message);
}
