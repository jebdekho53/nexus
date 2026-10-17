// Matrix updates: manifest validation, verified download (size and SHA-256 must match) and the Updates window's IPC.
// Only the exact updater URL on the Matrix origin is accepted; redirects are refused.
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = 'https://matrix.vaidya-gpt.com';

export interface UpdaterMeta {
  url: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  version: string;
  notes: string;
  updater: UpdaterMeta | null;
}

/** 1 when a is newer, -1 when older, 0 when equal. Versions must be strictly "major.minor.patch" numbers. */
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 {
  const parse = (v: unknown): number[] => { if (!/^\d+\.\d+\.\d+$/.test(String(v))) throw Error('Invalid release version'); return (v as string).split('.').map(Number); };
  const x = parse(a) as [number, number, number], y = parse(b) as [number, number, number];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

export function validateManifest(data: unknown): Manifest {
  const manifest = data as { version?: unknown; notes?: unknown; updaterExe?: { url: string; bytes: number; sha256: string } | null } | null | undefined;
  compareVersions(manifest?.version, '0.0.0');
  const checked = manifest as { version: string; notes?: unknown; updaterExe?: { url: string; bytes: number; sha256: string } | null };
  const item = checked.updaterExe;
  if (!item) return { version: checked.version, notes: String(checked.notes || ''), updater: null };
  const url = new URL(item.url, BASE);
  if (url.origin !== BASE || url.pathname !== '/downloads/Matrix-Updater-' + checked.version + '.exe' || url.search || url.hash || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 64 * 1024 * 1024 || !/^[a-f0-9]{64}$/i.test(item.sha256)) throw Error('Invalid updater metadata');
  return { version: checked.version, notes: String(checked.notes || ''), updater: { url: url.href, bytes: item.bytes, sha256: item.sha256.toLowerCase() } };
}

type Fetch = (url: string, init: { redirect: 'error'; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; body: AsyncIterable<Uint8Array> }>;

export async function downloadVerified(meta: UpdaterMeta, destination: string, request: Fetch = globalThis.fetch as unknown as Fetch, onProgress: (percent: number) => void = () => undefined): Promise<string> {
  let file: fsp.FileHandle | null | undefined;
  try {
    const response = await request(meta.url, { redirect: 'error', signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error('Update download HTTP ' + response.status);
    file = await fsp.open(destination, 'w');
    let bytes = 0;
    const hash = crypto.createHash('sha256');
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > meta.bytes) throw Error('Update file size mismatch');
      hash.update(chunk);
      await file.writeFile(chunk);
      onProgress(Math.floor(bytes / meta.bytes * 100));
    }
    await file.close();
    file = null;
    if (bytes !== meta.bytes || hash.digest('hex') !== meta.sha256) throw Error('Update verification failed');
    return destination;
  } catch (error) {
    if (file) await file.close();
    await fsp.unlink(destination).catch(() => undefined);
    throw error;
  }
}

interface UpdateWindow {
  isDestroyed(): boolean;
  webContents: { send(channel: string, payload: unknown): void; getURL(): string };
  close(): void;
}

export interface UpdatesElectron {
  app: { getPath(name: string): string };
  BrowserWindow: { getAllWindows(): UpdateWindow[]; fromWebContents(contents: unknown): UpdateWindow | null };
  ipcMain: { handle(channel: string, handler: (event: { sender: { getURL(): string } }, value: unknown) => unknown): void };
}

export interface UpdatesOptions {
  managedRelease?: boolean;
  finish?: (code: number) => void;
}

export function install(electron: UpdatesElectron, root: string, options: UpdatesOptions = {}) {
  const currentVersion = (require(path.join(root, 'package.json')) as { version: string }).version;
  let latest: Manifest | undefined, busy = false;
  const settings = path.join(electron.app.getPath('userData'), 'matrix-updates.json');
  const getAuto = (): boolean => { try { return JSON.parse(fs.readFileSync(settings, 'utf8')).enabled === true; } catch { return false; } };
  const trusted = (event: { sender: { getURL(): string } }): boolean => { try { const url = new URL(event.sender.getURL()); return url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === path.join(root, 'src/renderer/updates.html'); } catch { return false; } };
  const progress = (row: Record<string, unknown>): void => { for (const win of electron.BrowserWindow.getAllWindows()) if (!win.isDestroyed() && trusted({ sender: win.webContents })) win.webContents.send('matrix:updates:progress', row); };
  async function check(): Promise<Record<string, unknown>> {
    try {
      const response = await globalThis.fetch(BASE + '/api/portal/downloads', { redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw Error('Update service HTTP ' + response.status);
      latest = validateManifest(await response.json());
      return { ok: true, currentVersion, latestVersion: latest.version, available: compareVersions(latest.version, currentVersion) > 0, updaterAvailable: !!latest.updater, installable: options.managedRelease === true, autoUpdate: getAuto(), notes: latest.notes };
    } catch (error) { return { ok: false, currentVersion, autoUpdate: getAuto(), error: String((error as { message?: unknown }).message) }; }
  }
  async function apply(): Promise<Record<string, unknown>> {
    if (busy) return { ok: false, error: 'An update is already running.' };
    if (!options.managedRelease) return { ok: false, error: 'Use the download page to update a development checkout.' };
    busy = true;
    try {
      const status = await check();
      if (!status.ok) throw Error(status.error as string);
      if (!status.available) return { ok: true, updated: false };
      const manifest = latest as Manifest;
      if (!manifest.updater) throw Error('Small updater unavailable. Use the full installer from Downloads.');
      const folder = path.join(electron.app.getPath('temp'), 'Matrix-updates');
      await fsp.mkdir(folder, { recursive: true });
      const file = path.join(folder, 'Matrix-Updater-' + manifest.version + '.exe');
      progress({ phase: 'downloading', percent: 0 });
      await downloadVerified(manifest.updater, file, globalThis.fetch as unknown as Fetch, percent => progress({ phase: 'downloading', percent }));
      progress({ phase: 'installing', percent: 100 });
      const child = require('node:child_process').spawn(file, ['/S', '/target=' + root], { detached: true, windowsHide: true, stdio: 'ignore' }) as import('node:child_process').ChildProcess;
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      child.unref();
      options.finish?.(0);
      return { ok: true, updated: true };
    } catch (error) {
      progress({ phase: 'error', error: String((error as { message?: unknown }).message) });
      return { ok: false, error: String((error as { message?: unknown }).message) };
    } finally { busy = false; }
  }
  const handlers: Record<string, (value: unknown, event: { sender: { getURL(): string } }) => unknown> = {
    check,
    install: apply,
    settings: async value => {
      if (typeof value === 'boolean') { await fsp.mkdir(path.dirname(settings), { recursive: true }); await fsp.writeFile(settings, JSON.stringify({ enabled: value })); }
      return { ok: true, enabled: getAuto() };
    },
    close: async (_value, event) => { electron.BrowserWindow.fromWebContents(event.sender)?.close(); return { ok: true }; },
  };
  for (const [channel, handler] of Object.entries(handlers)) electron.ipcMain.handle('matrix:updates:' + channel, (event, value) => trusted(event) ? handler(value, event) : { ok: false, error: 'Updates window required' });
  return { check, async applyOnStartup(): Promise<boolean> { return options.managedRelease && getAuto() ? (await apply()).updated === true : false; } };
}
