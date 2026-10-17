// Offline smoke-test harness: the isolated smoke run blocks every network request and child process, hides all windows
// (rendering them offscreen), keeps a separate profile and records renderer problems. Nothing here is used outside
// `--smoke-test`.
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as childProcess from 'node:child_process';

type Logger = (event: string, details?: Record<string, unknown>) => void;

interface SmokeWebContents {
  on(event: string, listener: (...args: any[]) => void): unknown; // eslint-disable-line @typescript-eslint/no-explicit-any -- Electron event signatures vary per event
}

export interface SmokeWindow {
  id: number;
  webContents: SmokeWebContents;
}

interface SmokeWindowClass {
  new (options?: Record<string, unknown>): SmokeWindow;
  prototype: { show: () => unknown; getTitle?: () => string };
}

export interface SmokeElectron {
  app: {
    setPath(name: string, value: string): void;
    commandLine: { appendSwitch(name: string): void };
    whenReady(): Promise<unknown>;
  };
  dialog: { showErrorBox: (title: string, content: string) => void };
  BrowserWindow: SmokeWindowClass;
  net?: { request: unknown };
  session: { defaultSession: { webRequest: { onBeforeRequest(listener: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void): void } } };
}

export function install<E extends SmokeElectron>(electron: E, root: string, log: Logger): E {
  const profile = path.join(root, 'diagnostics', 'smoke-profile');
  fs.mkdirSync(profile, { recursive: true });
  electron.app.setPath('userData', profile);
  const setPath = electron.app.setPath.bind(electron.app);
  electron.app.setPath = (name: string, value: string) => setPath(name, name === 'userData' ? profile : value);
  const deniedError = (): Error => Object.assign(new Error('Network disabled during source recovery smoke test'), { code: 'ENETUNREACH' });
  interface DeniedRequest extends EventEmitter {
    setHeader(): DeniedRequest; getHeader(): undefined; removeHeader(): DeniedRequest; setTimeout(): DeniedRequest;
    write(): boolean; abort(): void; destroy(): void; end(): DeniedRequest;
  }
  function request(): DeniedRequest {
    const req = new EventEmitter() as DeniedRequest;
    req.setHeader = () => req; req.getHeader = () => undefined; req.removeHeader = () => req;
    req.setTimeout = () => req; req.write = () => true; req.abort = () => undefined; req.destroy = () => undefined;
    req.end = () => { process.nextTick(() => req.emit('error', deniedError())); return req; };
    return req;
  }
  for (const module of [http, https] as unknown as Array<Record<string, unknown>>) { module.request = request; module.get = () => request().end(); }
  net.Socket.prototype.connect = function (this: net.Socket) { process.nextTick(() => this.emit('error', deniedError())); return this; } as typeof net.Socket.prototype.connect;
  globalThis.fetch = async () => { throw deniedError(); };
  if (electron.net) electron.net.request = request;
  for (const name of ['spawn', 'exec', 'execFile', 'spawnSync', 'execSync', 'execFileSync', 'fork'] as const) (childProcess as unknown as Record<string, unknown>)[name] = () => { throw new Error('Child processes disabled during source recovery smoke test'); };
  electron.dialog.showErrorBox = (title, content) => log('dialog', { title, content });
  const NativeWindow = electron.BrowserWindow;
  const HiddenWindow = new Proxy(NativeWindow, {
    construct(target, args: [Record<string, unknown>?]) {
      const original = args[0] || {};
      const win = Reflect.construct(target, [{ ...original, show: false, webPreferences: { ...((original.webPreferences as Record<string, unknown> | undefined) || {}), offscreen: true, backgroundThrottling: false } }]) as SmokeWindow;
      win.webContents.on('did-fail-load', (_event: unknown, code: unknown, description: unknown) => log('renderer-load-error', { code, description }));
      win.webContents.on('render-process-gone', (_event: unknown, details: Record<string, unknown>) => log('renderer-process-gone', details));
      win.webContents.on('console-message', (_event: unknown, level: number, message: unknown) => { if (level >= 2) log('renderer-console', { level, message }); });
      win.webContents.on('paint', (_event: unknown, _rect: unknown, image: { toPNG?: () => Buffer } | null) => {
        if (image && typeof image.toPNG === 'function') fs.writeFileSync(path.join(root, 'diagnostics', `paint-${win.id}.png`), image.toPNG());
      });
      return win;
    },
  });
  NativeWindow.prototype.show = function (this: { getTitle(): string }) { log('window-show-suppressed', { title: this.getTitle() }); };
  electron.app.commandLine.appendSwitch('disable-gpu');
  electron.app.whenReady().then(() => {
    electron.session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:|^wss?:/.test(details.url) }));
  });
  log('offline-smoke-installed', { profile });
  return new Proxy(electron, { get(target, key) { return key === 'BrowserWindow' ? HiddenWindow : Reflect.get(target, key); } });
}
