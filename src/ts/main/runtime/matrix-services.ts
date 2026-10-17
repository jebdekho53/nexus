// Optional Matrix service status. Server capabilities cannot enable unsupported clients or override URLs; any failure
// falls back to the local capability set.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'https://matrix.vaidya-gpt.com';

interface Capabilities { webLogin: boolean; manualCaptcha: boolean; automaticCaptcha: boolean; railOne: boolean }
export interface ServiceState {
  schema: number;
  provider: string;
  capabilities: Capabilities;
  source: 'local' | 'online';
  clockOffsetMs: number | null;
  roundTripMs?: number;
}

const local = (): { schema: number; provider: string; capabilities: Capabilities } => ({ schema: 1, provider: 'Matrix', capabilities: { webLogin: true, manualCaptcha: true, automaticCaptcha: false, railOne: false } });

export interface ServiceOptions {
  fetchImpl?: (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  log?: (event: string, details: Record<string, unknown>) => void;
  now?: () => number;
}

export interface MatrixService {
  refresh(): Promise<ServiceState>;
  snapshot(): ServiceState;
}

export function create({ fetchImpl = (url, init) => globalThis.fetch(url, init as RequestInit), log = () => undefined, now = Date.now }: ServiceOptions = {}): MatrixService {
  let state: ServiceState = { ...local(), source: 'local', clockOffsetMs: null };
  async function refresh(): Promise<ServiceState> {
    try {
      const started = now();
      const response = await fetchImpl(base + '/api/desktop/status', { signal: AbortSignal.timeout(4000), redirect: 'error', credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error('Matrix service HTTP ' + response.status);
      const value = await response.json() as { schema?: unknown; provider?: unknown; ok?: unknown; serverTime?: unknown };
      const ended = now();
      if (value.schema !== 1 || value.provider !== 'Matrix' || value.ok !== true || !Number.isSafeInteger(value.serverTime)) throw new Error('Invalid Matrix service response');
      state = { ...local(), source: 'online', clockOffsetMs: (value.serverTime as number) - (started + ended) / 2, roundTripMs: ended - started };
      log('matrix-services-ready', { source: state.source, roundTripMs: state.roundTripMs, manualCaptcha: true, railOne: false });
    } catch (error) { state = { ...local(), source: 'local', clockOffsetMs: null }; log('matrix-services-local', { reason: String((error as { message?: unknown }).message) }); }
    return snapshot();
  }
  function snapshot(): ServiceState { return { ...state, capabilities: { ...state.capabilities } }; }
  return { refresh, snapshot };
}

export interface ServicesElectron {
  ipcMain: { handle(channel: string, handler: (event: { sender: { getURL(): string } }, refresh: unknown) => unknown): void };
}

export function install(electron: ServicesElectron, root: string, service: MatrixService): void {
  electron.ipcMain.handle('matrix:services:status', async (event, refresh) => {
    try { const url = new URL(event.sender.getURL()); if (url.protocol !== 'file:' || path.resolve(fileURLToPath(url)) !== path.join(root, 'src/renderer/tools.html')) return { error: 'Unavailable' }; } catch { return { error: 'Unavailable' }; }
    return refresh === true ? service.refresh() : service.snapshot();
  });
}
