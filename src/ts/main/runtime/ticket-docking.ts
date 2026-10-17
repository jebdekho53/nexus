// Docks a ticket window beneath its booking panel (same form id), following the panel as it moves or resizes and
// keeping both on the display's work area.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Bounds { x: number; y: number; width: number; height: number }

export interface DockWindow {
  webContents: { getURL(): string; on(event: 'did-finish-load', listener: () => unknown): unknown };
  isDestroyed(): boolean;
  getBounds(): Bounds;
  setBounds(bounds: Bounds, ...args: unknown[]): unknown;
  setPosition?: (...args: unknown[]) => unknown;
  on(event: string, listener: () => unknown): unknown;
  removeListener(event: string, listener: () => unknown): unknown;
}

export interface DockElectron<Win extends DockWindow> {
  app: { on(event: 'browser-window-created', listener: (event: unknown, window: Win) => void): unknown };
  BrowserWindow: { getAllWindows(): Win[] };
  screen: { getDisplayMatching(bounds: Bounds): { workArea: Bounds } };
}

export function install<Win extends DockWindow>(electron: DockElectron<Win>, root: string): void {
  const route = (win: DockWindow): URL | null => {
    try { const u = new URL(win.webContents.getURL()); return u.protocol === 'file:' && path.resolve(fileURLToPath(u)) === path.join(root, 'src/renderer/booking-box.html') ? u : null; } catch { return null; }
  };
  electron.app.on('browser-window-created', (_event, ticket) => {
    let parent: Win | undefined, placing = false, attached = false;
    const nativeBounds = ticket.setBounds.bind(ticket);
    const isTicket = (): boolean => route(ticket)?.searchParams.get('view') === 'ticket';
    function place(): boolean {
      if (placing || ticket.isDestroyed() || !isTicket()) return false;
      const id = (route(ticket) as URL).searchParams.get('id');
      if (!id) return false;
      const found = electron.BrowserWindow.getAllWindows().find(w => w !== ticket && !w.isDestroyed() && route(w)?.searchParams.get('id') === id && route(w)?.searchParams.get('view') !== 'ticket');
      if (!found) return false;
      if (found !== parent) { detach(); parent = found; parent.on('move', place); parent.on('resize', place); attached = true; }
      placing = true;
      try {
        let b = (parent as Win).getBounds();
        const t = ticket.getBounds(), area = electron.screen.getDisplayMatching(b).workArea;
        if (b.height + 8 + t.height <= area.height) { const y = Math.max(area.y, Math.min(b.y, area.y + area.height - b.height - 8 - t.height)); if (y !== b.y) { b = { ...b, y }; (parent as Win).setBounds(b); } }
        const x = Math.max(area.x, Math.min(b.x, area.x + area.width - t.width)), y = Math.max(area.y, Math.min(b.y + b.height + 8, area.y + area.height - t.height));
        if (x !== t.x || y !== t.y) nativeBounds({ ...t, x, y });
        return true;
      } finally { placing = false; }
    }
    function detach(): void { if (attached) { parent?.removeListener('move', place); parent?.removeListener('resize', place); } attached = false; }
    ticket.setBounds = (bounds: Bounds, ...args: unknown[]) => { const result = nativeBounds(bounds, ...args); place(); return result; };
    if (typeof ticket.setPosition === 'function') { const native = ticket.setPosition.bind(ticket); ticket.setPosition = (...args: unknown[]) => { const result = native(...args); place(); return result; }; }
    ticket.webContents.on('did-finish-load', place); ticket.on('show', place); ticket.on('resize', place); ticket.on('closed', detach);
  });
}
