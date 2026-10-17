// Optional HTTP recording. The callback is opt-in: this module does not enable a logger or introduce any
// transport/destination for the record. Without `actor.onHttpRecord` nothing happens.

export interface RecordedResponse {
  status(): number;
  headers(): unknown;
  text(): Promise<string>;
}

export interface HttpRecordOptions {
  form?: Record<string, unknown>;
  data?: unknown;
  headers?: unknown;
}

export interface HttpRecord {
  ts: number;
  method: string;
  url: string;
  status: number;
  reqHeaders: unknown;
  reqBody: string | undefined;
  resHeaders: unknown;
  resBody: string | undefined;
}

export interface HttpRecordActor {
  onHttpRecord?: ((record: HttpRecord) => void) | null;
}

export async function recordHttp(
  actor: HttpRecordActor,
  method: string,
  url: string,
  options: HttpRecordOptions | null | undefined,
  response: RecordedResponse | null | undefined,
  error: unknown,
  { clock = Date }: { clock?: { now(): number } } = {},
): Promise<void> {
  if (!actor.onHttpRecord) return;
  try {
    const form = options?.form;
    const requestBody = form ? Object.entries(form).map(([key, value]) => key + '=' + String(value).slice(0, 600)).join('&') :
      typeof options?.data === 'string' ? options.data.slice(0, 2000) :
      options?.data ? (JSON.stringify(options.data) as string).slice(0, 2000) : undefined;
    const message = (error as { message?: unknown } | null | undefined)?.message ?? error;
    const record: HttpRecord = {
      ts: clock.now(), method: method.toUpperCase() + '*', url, status: response ? response.status() : 0,
      reqHeaders: options?.headers ?? {},
      reqBody: error ? (requestBody ?? '') + ' [THREW: ' + String(message).slice(0, 200) + ']' : requestBody,
      resHeaders: response ? response.headers() : {},
      resBody: response ? (await response.text().catch(() => '')).slice(0, 16000) : undefined,
    };
    actor.onHttpRecord(record);
  } catch { /* recording must never affect the request */ }
}
