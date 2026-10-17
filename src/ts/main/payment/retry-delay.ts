// Server-requested retry delay for booking calls: 1–20 seconds, or null when the response does not ask for one.
export function bookingRetryDelay(response: unknown): number | null {
  const text = typeof response === 'string' ? response : JSON.stringify(response ?? '');
  const match = /"retryAfterMili(?:s)?"\s*:\s*"?(\d+)"?/i.exec(text);
  if (!match) return null;
  const delay = Number(match[1]);
  return !Number.isFinite(delay) || delay <= 0 ? null : Math.min(20000, Math.max(1000, delay));
}
