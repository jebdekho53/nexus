// Development-mode profile and window diagnostics: the user-data directory is pinned to a Matrix profile (never the
// vendor's), and renderer problems, window visibility and page loads are written to the startup log.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { releaseProfile } from './profile';

type Logger = (event: string, details?: Record<string, unknown>) => void;

interface DevWebContents {
  on(event: 'did-fail-load', listener: (event: unknown, code: unknown, description: unknown) => void): unknown;
  on(event: 'render-process-gone', listener: (event: unknown, details: Record<string, unknown>) => void): unknown;
  on(event: 'console-message', listener: (event: unknown, level: number, message: unknown) => void): unknown;
  on(event: 'did-finish-load', listener: () => void): unknown;
  getURL(): string;
  executeJavaScript(code: string): Promise<unknown>;
}

interface DevWindow {
  webContents: DevWebContents;
  on(event: 'show', listener: () => void): unknown;
  getTitle(): string;
}

export interface DevelopmentElectron {
  app: {
    getPath(name: string): string;
    setPath: (name: string, value: string) => void;
    on(event: 'browser-window-created', listener: (event: unknown, window: DevWindow) => void): unknown;
  };
}

export interface DevelopmentWindowsContext {
  electron: DevelopmentElectron;
  projectRoot: string;
  diagnostics: string;
  managedRelease: boolean;
  log: Logger;
}

const QR_PROBE = 'window.__matrixQrProbe=null;window.api.onQr(payload=>{if(payload.closed||!payload.dataUrl)return;const image=new Image();image.onload=()=>{window.__matrixQrProbe={at:Date.now(),formId:payload.formId,ready:true,width:image.naturalWidth,height:image.naturalHeight};};image.src=payload.dataUrl;});true;';

export function installDevelopmentWindows({ electron, projectRoot, diagnostics, managedRelease, log }: DevelopmentWindowsContext): void {
  const profile = process.argv.includes('--release-activation-test') ? path.join(diagnostics, 'release-qa-profile') : process.argv.includes('--isolated-live-test') ? path.join(diagnostics, 'live-e2e-profile') : managedRelease ? releaseProfile(electron.app, projectRoot) : path.join(diagnostics, 'development-profile');
  fs.mkdirSync(profile, { recursive: true });
  const setPath = electron.app.setPath.bind(electron.app);
  setPath('userData', profile);
  electron.app.setPath = (name: string, value: string) => setPath(name, name === 'userData' ? profile : value);
  log('development-profile', { profile });
  electron.app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-fail-load', (_event, code, description) => log('renderer-load-error', { code, description }));
    win.webContents.on('render-process-gone', (_event, details) => log('renderer-process-gone', details));
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) log('renderer-console', { level, message }); });
    win.on('show', () => log('matrix-window-visible', { page: path.basename(win.webContents.getURL().split('?')[0] as string) }));
    // E2E stages are recorded at f3720 in index.cjs. Keep native send untouched: the recovered progress broadcaster also
    // wraps it during initialization.
    win.webContents.on('did-finish-load', () => log('development-window-loaded', {
      title: win.getTitle(), page: path.basename(win.webContents.getURL().split('?')[0] as string),
      ...(win.webContents.getURL().includes('/security-error.html') ? { detail: new URL(win.webContents.getURL()).searchParams.get('detail') } : {}),
    }));
    if (process.argv.includes('--isolated-live-test')) win.webContents.on('did-finish-load', () => {
      if (!win.webContents.getURL().includes('/booking-box.html')) return;
      win.webContents.executeJavaScript(QR_PROBE).catch(error => log('e2e-qr-probe-error', { error: String((error as { message?: unknown }).message) }));
    });
  });
}
