// Parsing of the provider QR page and QR command responses.

export interface AtobGlobals {
  atob?: (data: string) => string;
  Buffer: { from(data: string, encoding: string): { toString(encoding: string): string } };
}

/** The base64 JSON payload embedded in the page's "app-config-data" textarea, or null when absent or invalid. */
export function appConfig(html: string, globals: AtobGlobals = globalThis as unknown as AtobGlobals): unknown {
  const match = /<textarea[^>]*id=["']app-config-data["'][^>]*>\s*([A-Za-z0-9+/=\r\n\s]+?)\s*<\/textarea>/i.exec(html);
  if (!match) return null;
  try {
    const encoded = (match[1] as string).replace(/\s+/g, '');
    const text = typeof globals.atob === 'function' ? globals.atob(encoded) : globals.Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch { return null; }
}

/** The positive `am=` amount of a UPI payload, or undefined. */
export function qrAmount(payload: string | null | undefined): number | undefined {
  if (!payload) return undefined;
  const match = /[?&]am=([0-9]+(?:\.[0-9]+)?)/i.exec(payload);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export interface CommandStatusBody {
  txnStatus?: unknown;
  txnResponseCode?: unknown;
  responseCode?: unknown;
  respDescription?: unknown;
  txnRespDescription?: unknown;
}

export type CommandStatus = 'paid' | 'pending' | 'declined' | 'unknown';

export function commandStatus(body: CommandStatusBody): CommandStatus {
  const upper = (value: unknown): string => String(value ?? '').toUpperCase();
  const status = upper(body.txnStatus), transactionCode = upper(body.txnResponseCode), responseCode = upper(body.responseCode);
  const description = upper(body.respDescription) + ' ' + upper(body.txnRespDescription);
  if (status === 'SUC' || status === 'SUCCESS' || transactionCode === '0000') return 'paid';
  if (responseCode === 'P0030' || /AWAIT|PENDING|PROCESS|INITIAT|IN[_ ]?PROGRESS/.test(status + ' ' + description)) return 'pending';
  if (/FAIL|DECLIN|CANCEL|REJECT|EXPIR|ABORT|TIMED?[_ ]?OUT|UNSUCCESS/.test(status + ' ' + description)) return 'declined';
  return 'unknown';
}
