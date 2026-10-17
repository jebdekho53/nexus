// Delivers payment QR images to the booking panel of their own form (or a popup), never across profiles.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

type Logger = (event: string, details?: Record<string, unknown>) => void;
interface Bounds { x: number; y: number; width: number; height: number }

export interface QrWindow {
  webContents: { getURL(): string; send(channel: string, payload: unknown): void; executeJavaScript(code: string): Promise<unknown> };
  isDestroyed(): boolean;
  getBounds(): Bounds;
  setBounds(bounds: Bounds): void;
  on?: (event: string, listener: () => void) => unknown;
  removeListener?: (event: string, listener: () => void) => unknown;
}

export interface QrElectron<Win extends QrWindow> {
  BrowserWindow: { getAllWindows(): Win[] };
  screen: { getDisplayMatching(bounds: Bounds): { workArea: Bounds } };
}

export interface QrPayload {
  imageBase64?: unknown;
  forcePopup?: boolean;
  caption?: unknown;
  amount?: unknown;
  account?: unknown;
  checkNow?: unknown;
  [field: string]: unknown;
}

/** A recovered function wrapped by a hook; it is called with the original arguments. */
type Original<R = unknown> = (...args: unknown[]) => R;

/** `data:` URL for a PNG/JPEG/SVG payload (raw base64 or already a data URL, up to 3 MB), else null. */
export function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 3000000) return null;
  const raw = value.replace(/^data:image\/[\w.+-]+;base64,/, '');
  const bytes = Buffer.from(raw, 'base64');
  let mime: string;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216) mime = 'image/jpeg';
  else if (/^\s*(<svg\b|<\?xml\b)/i.test(bytes.subarray(0, 100).toString())) mime = 'image/svg+xml';
  else return null;
  return 'data:' + mime + ';base64,' + raw;
}

export function qrDelivery<Win extends QrWindow>(electron: QrElectron<Win>, root: string, log: Logger = () => undefined) {
  let popupMode: unknown = false;
  const popups = new Map<string, Win>(), cached = new Map<string, QrPayload>();
  let publisher: Original<Promise<unknown>> | undefined;
  const bookingPage = path.join(root, 'src/renderer/booking-box.html');
  const booking = (id: string): Win | undefined => electron.BrowserWindow.getAllWindows().find(win => {
    try { const u = new URL(win.webContents.getURL()); return !win.isDestroyed() && u.protocol === 'file:' && path.resolve(fileURLToPath(u)) === bookingPage && u.searchParams.get('view') !== 'ticket' && u.searchParams.get('id') === id; } catch { return false; }
  });
  const place = (popup: QrWindow, id: string): void => {
    const parent = booking(id);
    if (!parent || popup.isDestroyed()) return;
    let b = parent.getBounds();
    const p = popup.getBounds(), area = electron.screen.getDisplayMatching(b).workArea;
    if (b.height + 8 + p.height <= area.height) { const y = Math.max(area.y, Math.min(b.y, area.y + area.height - b.height - 8 - p.height)); if (y !== b.y) { b = { ...b, y }; parent.setBounds(b); } }
    const next = { ...p, x: Math.max(area.x, Math.min(b.x, area.x + area.width - p.width)), y: Math.max(area.y, Math.min(b.y + b.height + 8, area.y + area.height - p.height)) };
    if (next.x !== p.x || next.y !== p.y) popup.setBounds(next);
  };
  const hooks = {
    f3734(original: Original, args: unknown[]): unknown { popupMode = original(...args); return popupMode; },
    f3743(original: Original<Win | undefined>, args: unknown[]): Win | undefined {
      const popup = original(...args), id = args[0];
      if (popup && typeof id === 'string' && !popups.has(id)) {
        popups.set(id, popup);
        const parent = booking(id), follow = (): void => place(popup, id);
        parent?.on?.('move', follow); parent?.on?.('resize', follow); popup.on?.('show', follow);
        popup.on?.('closed', () => { parent?.removeListener?.('move', follow); parent?.removeListener?.('resize', follow); popups.delete(id); cached.delete(id); });
      }
      return popup;
    },
    f3746(original: Original, args: unknown[]): unknown {
      const [popup, id] = args as [QrWindow | undefined, unknown];
      if (popup && typeof id === 'string' && booking(id)) { place(popup, id); return undefined; }
      return original(...args);
    },
    async f4021(original: Original<Promise<{ ok?: unknown } | null | undefined>>, args: unknown[]): Promise<unknown> {
      const active = [...cached];
      const result = await original(...args);
      if (result?.ok) { popupMode = args[1] === true; if (publisher) for (const [id, payload] of active) await hooks.f3740(publisher, [{ ...payload, forcePopup: popupMode }, id]); }
      return result;
    },
    async f3740(original: Original<Promise<unknown>>, args: unknown[]): Promise<unknown> {
      publisher = original;
      const first = args[0] as QrPayload | undefined, second = args[1];
      if (typeof second === 'string' && imageUrl(first?.imageBase64)) cached.set(second, first as QrPayload);
      const result = await original(...args), payload = args[0] as QrPayload | undefined, formId = args[1] as string | undefined;
      const dataUrl = imageUrl(payload?.imageBase64);
      if (!dataUrl) return result;
      if (popupMode || payload?.forcePopup) {
        if (formId) { booking(formId)?.webContents.send('app:qr', { closed: true, formId }); const popup = popups.get(formId); if (popup) place(popup, formId); }
        return result;
      }
      const targets = electron.BrowserWindow.getAllWindows().filter(win => {
        try { const url = new URL(win.webContents.getURL()); return !win.isDestroyed() && url.protocol === 'file:' && path.resolve(fileURLToPath(url)) === bookingPage && url.searchParams.get('view') !== 'ticket' && !!url.searchParams.get('id') && (!formId || url.searchParams.get('id') === formId); } catch { return false; }
      });
      // An unnamed QR must never be routed between multiple profiles.
      if (!formId && targets.length !== 1) return result;
      for (const win of targets) {
        try {
          const present = await win.webContents.executeJavaScript("(()=>{const image=document.getElementById('qrImg'),panel=document.getElementById('qrOverlay');return !!image?.naturalWidth&&!!panel&&!panel.classList.contains('hidden');})()");
          if (present) continue;
          const id = new URL(win.webContents.getURL()).searchParams.get('id');
          win.webContents.send('app:qr', { dataUrl, formId: id, caption: (payload as QrPayload).caption, amount: (payload as QrPayload).amount, account: (payload as QrPayload).account, checkNow: !!(payload as QrPayload).checkNow });
          log('matrix-qr-display-delivered', { page: 'Payment QR delivered to its local booking panel' });
        } catch (error) { log('matrix-qr-display-error', { error: String((error as { message?: unknown }).message) }); }
      }
      return result;
    },
  };
  return hooks;
}
