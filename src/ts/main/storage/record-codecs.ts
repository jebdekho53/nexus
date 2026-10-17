// Saved-record text/schema conversion (f414-f424). No proxy connection,
// provider request or payment submission is performed by these functions.
type Fields = Record<string, unknown>;
export const scalarText = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
export const exportLogin = (record: {username?: unknown; password?: unknown}): string => record.username + ':' + record.password;
export function loginFromLine(input: string | null | undefined, id: unknown, now: unknown, mobile: () => unknown): Fields | null {
  const line = (input || '').trim();
  if (!line) return null;
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const username = line.slice(0, colon).trim(), password = line.slice(colon + 1);
  return username && password ? {id, username, password, mobileNumber: mobile(), createdAt: now, updatedAt: now} : null;
}
export function loginFromObject(input: unknown, id: unknown, now: unknown): Fields | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Fields;
  const username = scalarText(source.username ?? source.userId ?? source.user).trim();
  const password = scalarText(source.password ?? source.pass);
  const digits = scalarText(source.mobileNumber ?? source.mobile ?? source.phone).replace(/\D/g, '');
  const mobileNumber = digits.length > 10 ? digits.slice(-10) : digits;
  if (!username && !password) return null;
  return {id, username, password, mobileNumber, createdAt: now, updatedAt: now, ...(source.railone === true ? {railone: true} : {})};
}
export interface ProxyRecord {
  host: string; port: string; username?: string; password?: string; label?: string;
}
export function exportProxy(record: ProxyRecord, includeLabel: unknown = true): string {
  let text = record.host + ':' + record.port;
  if (record.username || record.password) text += ':' + (record.username ?? '') + ':' + (record.password ?? '');
  const label = (record.label || '').trim();
  return includeLabel && label ? label + '=' + text : text;
}
export function parseProxy(input: string | null | undefined, parse: (line: string) => ProxyRecord | null): ProxyRecord | null {
  let line = (input || '').trim();
  if (!line) return null;
  const equals = line.indexOf('=');
  if (equals > 0) {
    const label = line.slice(0, equals).trim(), rest = line.slice(equals + 1).trim();
    if (label && !label.includes(':')) {
      const parsed = rest ? parse(rest) : null;
      if (parsed && parsed.port) return {...parsed, label};
    }
  }
  line = line.replace(/^[a-z0-9.+-]+:\/\//i, '');
  let username = '', password = '';
  const at = line.lastIndexOf('@');
  if (at >= 0) {
    const auth = line.slice(0, at); line = line.slice(at + 1);
    const colon = auth.indexOf(':');
    username = colon >= 0 ? auth.slice(0, colon) : auth;
    password = colon >= 0 ? auth.slice(colon + 1) : '';
  }
  const parts = line.split(':'), host = (parts[0] || '').trim(), port = (parts[1] || '').replace(/\D/g, '');
  if (!username && parts.length >= 4) {username = parts[2] || ''; password = parts.slice(3).join(':') || '';}
  return host ? {host, port, username, password} : null;
}
export function proxyFromInput(input: unknown, id: unknown, now: unknown, parse: (line: string) => ProxyRecord | null): Fields | null {
  let host = '', port = '', label = '';
  let username: string | undefined = '', password: string | undefined = '';
  if (typeof input === 'string') {
    const parsed = parse(input);
    if (!parsed) return null;
    ({host, port} = parsed); username = parsed.username; password = parsed.password;
    label = (parsed.label || '').trim();
  } else if (input && typeof input === 'object') {
    const source = input as Fields;
    label = scalarText(source.label ?? source.name).trim();
    host = scalarText(source.host ?? source.ip ?? source.server ?? source.address ?? source.hostname).trim();
    port = scalarText(source.port).replace(/\D/g, '');
    username = scalarText(source.username ?? source.user ?? source.login);
    password = scalarText(source.password ?? source.pass);
    if (host && /[:@]/.test(host)) {
      const parsed = parse(host);
      if (parsed) {host = parsed.host; port ||= parsed.port; username ||= parsed.username; password ||= parsed.password;}
    }
  } else return null;
  return host ? {id, label: label || undefined, host, port, username: username || undefined, password: password || undefined, createdAt: now, updatedAt: now} : null;
}
export const validUpi = (value: string | null | undefined, pattern: () => {test(value: string): boolean}): boolean =>
  Boolean(value) && pattern().test(value!.trim());
export function railPaymentMethod(method: unknown, upi: unknown, validate: (value: unknown) => unknown): string {
  if (method === 'wallet' || method === 'railoneupi' || method === 'railoneqr') return method;
  return method === 'paytmupi' && validate(upi) ? 'railoneupi' : 'railoneqr';
}
export interface PaymentRecordDeps {valid(value: string): unknown; now(): number; random(): number}
export function paymentFromInput(input: unknown, timestamp: unknown, deps: PaymentRecordDeps): Fields | null {
  const now = timestamp !== undefined ? timestamp : deps.now();
  if (!input || typeof input !== 'object') return null;
  const source = input as Fields;
  const upiId = String(source.upiId ?? source.upi ?? source.vpa ?? '').trim();
  if (!deps.valid(upiId)) return null;
  const label = String(source.label ?? source.name ?? '').trim();
  return {id: typeof source.id === 'string' && source.id ? source.id : 'upi-' + now + '-' + deps.random().toString(36).slice(2, 8),
    kind: 'upi', upiId, ...(label ? {label} : {}),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : now};
}
