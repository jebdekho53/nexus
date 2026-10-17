// Matrix branding over the recovered application: window titles, menu labels, log text, icon, app name/version/id,
// and the compact dock size of the controller window.
import * as path from 'node:path';

const brand = (text: unknown): string => String(text || '').replace(/Xhamster\s*TS/gi, 'Matrix').replace(/Tatkal Software/gi, 'Matrix').replace(/\bBrahmos\b/gi, 'Matrix').replace(/\bTS\b/g, 'Matrix');
const brahmos = /brahmos/gi;
const logBrand = (text: string): string => text.replace(brahmos, m => m === m.toUpperCase() ? 'MATRIX' : 'Matrix');

type WriteChunk = string | Uint8Array;
interface BrandableStream { write: (chunk: WriteChunk, ...rest: unknown[]) => boolean }

function brandStream(stream: BrandableStream): void {
  const write = stream.write.bind(stream);
  stream.write = (chunk: WriteChunk, ...rest: unknown[]) => {
    if (typeof chunk === 'string') chunk = logBrand(chunk);
    else if (Buffer.isBuffer(chunk) && /brahmos/i.test(chunk.toString('latin1'))) chunk = Buffer.from(logBrand(chunk.toString('utf8')), 'utf8');
    return write(chunk, ...rest);
  };
}

interface Bounds { x: number; y: number; width: number; height: number }
interface BrandWindow {
  setIcon?: (path: string) => void;
  isDestroyed(): boolean;
  getBounds(): Bounds;
  setBounds(bounds: Bounds): void;
  on(event: string, listener: (event: { preventDefault(): void }, value: string) => void): unknown;
  once(event: string, listener: () => void): unknown;
  webContents: { on(event: 'did-finish-load', listener: () => void): unknown };
  setTitle(title: string): void;
  getTitle(): string;
}
interface MenuItem { label?: string; submenu?: Menu | null }
interface Menu { items?: MenuItem[] }

export interface BrandElectron {
  app: {
    getVersion: () => string;
    setName: (name?: string) => void;
    setAppUserModelId(id: string): void;
    on(event: 'browser-window-created', listener: (event: unknown, window: BrandWindow) => void): unknown;
  };
  screen: { getDisplayMatching(bounds: Bounds): { workArea: Bounds } };
  Menu: { setApplicationMenu: (menu: Menu | null) => unknown };
}

export function install(electron: BrandElectron, root: string): void {
  brandStream(process.stdout as unknown as BrandableStream);
  brandStream(process.stderr as unknown as BrandableStream);
  const version = (require(path.join(root, 'package.json')) as { version: string }).version;
  electron.app.getVersion = () => version;
  electron.app.setName('Matrix');
  const nativeName = electron.app.setName.bind(electron.app);
  electron.app.setName = () => nativeName('Matrix');
  if (process.platform === 'win32') electron.app.setAppUserModelId('com.matrix.workspace');
  electron.app.on('browser-window-created', (_event, win) => {
    if (typeof win.setIcon === 'function') win.setIcon(path.join(root, 'resources/icon.png'));
    const title = (value: unknown): string => { const next = brand(value); return next.startsWith('Matrix') ? next : 'Matrix · ' + next; };
    // Compact dock: the app opens the controller at 974x80 — shrink it to the slim Matrix dock, keeping it bottom-anchored.
    let fitting = false;
    const fitDock = (): void => {
      if (fitting || win.isDestroyed()) return;
      const b = win.getBounds();
      if (b.width !== 974 || b.height !== 80) return;
      fitting = true;
      const w = 620, h = 58, area = electron.screen.getDisplayMatching(b).workArea;
      const x = Math.min(Math.max(b.x + Math.round((b.width - w) / 2), area.x), area.x + area.width - w);
      win.setBounds({ x, y: b.y + b.height - h, width: w, height: h });
      fitting = false;
    };
    win.on('resize', fitDock);
    win.webContents.on('did-finish-load', fitDock);
    win.once('ready-to-show', fitDock);
    const nativeTitle = win.setTitle.bind(win);
    win.setTitle = (value: string) => nativeTitle(title(value));
    win.on('page-title-updated', (event, value) => { event.preventDefault(); const next = title(value); if (win.getTitle() !== next) win.setTitle(next); });
    win.webContents.on('did-finish-load', () => win.setTitle(title(win.getTitle())));
  });
  const setMenu = electron.Menu.setApplicationMenu.bind(electron.Menu);
  const clean = (menu: Menu | null | undefined): void => { for (const item of menu?.items || []) { if (item.label) item.label = brand(item.label); if (item.submenu) clean(item.submenu); } };
  electron.Menu.setApplicationMenu = menu => { clean(menu); return setMenu(menu); };
}
