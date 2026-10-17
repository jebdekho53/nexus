// Windows stay hidden until the renderer has loaded fonts and painted two frames (or 1.2s elapsed), so users never see
// a white flash. The original preload is swapped for the Matrix preload, and background throttling is disabled.
import * as path from 'node:path';

export interface ReadinessWindow {
  show?: () => void;
  showInactive?: () => void;
  isDestroyed(): boolean;
  webContents: {
    on(event: 'did-start-loading' | 'did-finish-load', listener: () => unknown): unknown;
    executeJavaScript(code: string): Promise<unknown>;
  };
}

export interface WindowOptions {
  show?: boolean;
  transparent?: boolean;
  webPreferences?: { preload?: string; [field: string]: unknown };
  [field: string]: unknown;
}

export interface ElectronWithWindows<Win extends ReadinessWindow> {
  BrowserWindow: new (options?: WindowOptions) => Win;
  [field: string]: unknown;
}

type Logger = (event: string, details?: Record<string, unknown>) => void;

export function install<Win extends ReadinessWindow, E extends ElectronWithWindows<Win>>(electron: E, root: string, log: Logger): E {
  const Native = electron.BrowserWindow;
  const Window = new Proxy(Native, {
    construct(target, args: [WindowOptions?]) {
      const options = args[0] || {}, preferences = { ...(options.webPreferences || {}), backgroundThrottling: false };
      if (preferences.preload && path.resolve(preferences.preload) === path.join(root, 'src/preload/index.js')) preferences.preload = path.join(root, 'src/preload/matrix.js');
      const win = Reflect.construct(target, [{ ...options, show: false, backgroundColor: options.transparent ? '#00000000' : '#10191d', webPreferences: preferences }]) as Win;
      let ready = false, pending: (() => void) | null = options.show === false ? null : (win.show as () => void).bind(win);
      for (const method of ['show', 'showInactive'] as const) if (typeof win[method] === 'function') {
        const native = (win[method] as () => void).bind(win);
        win[method] = () => { if (ready) native(); else pending = native; };
      }
      win.webContents.on('did-start-loading', () => { ready = false; });
      win.webContents.on('did-finish-load', async () => {
        try {
          await Promise.race([win.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))'), new Promise(resolve => setTimeout(resolve, 1200))]);
        } catch (error) { log('window-readiness-error', { error: String((error as { message?: unknown }).message) }); }
        if (win.isDestroyed()) return;
        ready = true;
        if (pending) { const show = pending; pending = null; show(); }
      });
      return win;
    },
  });
  return new Proxy(electron, { get(target, key) { return key === 'BrowserWindow' ? Window : Reflect.get(target, key); } });
}
