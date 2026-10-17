// Closing the auxiliary Matrix windows (forms, proxy, payment, history, tools, updates, logs) from a local Matrix window.
// The booking "pair" windows are preserved.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const auxiliary = new Set(['form.html', 'open-form.html', 'login-data.html', 'proxy.html', 'payment.html', 'history.html', 'tools.html', 'updates.html', 'logs.html']);

export interface AuxWindow {
  webContents: { getURL(): string };
  isDestroyed(): boolean;
  close(): void;
}

export interface AuxElectron<Win extends AuxWindow> {
  BrowserWindow: { fromWebContents(contents: unknown): Win | null; getAllWindows(): Win[] };
}

type Logger = (event: string, details?: Record<string, unknown>) => void;

function localPage(win: AuxWindow, root: string): string | null {
  try {
    const url = new URL(win.webContents.getURL());
    if (url.protocol !== 'file:') return null;
    const file = path.resolve(fileURLToPath(url));
    return path.dirname(file) === path.join(root, 'src/renderer') ? path.basename(file) : null;
  } catch { return null; }
}

export function closeAuxWindows<Win extends AuxWindow>(electron: AuxElectron<Win>, root: string, event: { sender: unknown }, log: Logger = () => undefined): { ok: boolean; error?: string } {
  const caller = electron.BrowserWindow.fromWebContents(event.sender);
  if (!caller || !localPage(caller, root)) return { ok: false, error: 'Use a local Matrix window' };
  let closed = 0;
  for (const win of electron.BrowserWindow.getAllWindows()) {
    const page = localPage(win, root);
    if (win === caller || win.isDestroyed() || !auxiliary.has(page as string)) continue;
    win.close(); closed++;
  }
  log('matrix-aux-windows-closed', { closed, pairWindowsPreserved: true });
  return { ok: true };
}
