// Window-management IPC handlers: the controller toolbar, update download, form/booking windows, window sizing,
// external links, ticket printing and quit/restart.
//
// Reconstructed from the handlers that the recovered registration function f4272 passes to `ipcMain.handle`
// (f4273 ... f4295). The registration itself, the channel names and the app-lock PIN handler (f4296, which also
// writes bootstrap state) stay in the recovered code.
//
// The handlers lean on many bootstrap helpers whose original names are unknown. They are injected through
// WindowIpcDeps under names inferred from how the recovered code uses them; each accessor is read at call time, like
// the recovered code reads its bootstrap slots, and the recovered slot number is noted next to it.

export interface FrameLike {
  readonly _brand?: never;
}

export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  mainFrame?: unknown;
  getURL(): string;
  setZoomFactor(factor: number): void;
  invalidate(): void;
  executeJavaScript(code: string): Promise<unknown>;
  printToPDF(options: { printBackground: boolean; pageSize: string; landscape: boolean }): Promise<unknown>;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowLike {
  id: number;
  webContents: WebContentsLike;
  isDestroyed(): boolean;
  getBounds(): Rectangle;
  getPosition(): number[];
  setPosition(x: number, y: number): void;
  setContentSize(width: number, height: number): void;
  isResizable(): boolean;
  setResizable(resizable: boolean): void;
  getTitle(): string;
  close(): void;
  destroy(): void;
  loadFile(path: string): Promise<unknown>;
}

export interface ElectronLike {
  BrowserWindow: {
    new (options: unknown): WindowLike;
    fromWebContents(contents: WebContentsLike): WindowLike | null;
    getAllWindows(): WindowLike[];
  };
  screen: { getDisplayMatching(bounds: Rectangle): { workArea: Rectangle } };
  shell: { openExternal(url: string): Promise<void>; showItemInFolder(path: string): void };
  app: { getVersion(): string; getPath(name: string): string };
}

export interface IpcEvent {
  sender: WebContentsLike;
  senderFrame?: unknown;
}

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface FileSubset {
  mkdtempSync(prefix: string): string;
  writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  unlinkSync(path: string): void;
  rmdirSync(path: string): void;
}

/** Size and zoom the controller window uses on a work area (recovered slot 2031). */
export interface ControllerSize {
  width: number;
  height: number;
  zoom: number;
}

export interface UpdateOutcome {
  ok: boolean;
  path?: string;
  name?: string;
  error?: unknown;
}

export interface WindowIpcDeps {
  electron(): ElectronLike; // slot 22 "x"
  fs(): FileSubset; // slot 18 "y"
  path(): { join(...parts: string[]): string }; // slot 14 "m"
  os(): { tmpdir(): string }; // slot 13 "ce"
  /** Sender/trust check every privileged handler starts with (slot 1247). */
  securityCheck(): boolean;
  /** The current security state; only `message` and `latestVersion` are read (slot 1690, returns an object). */
  securityState(): { message?: unknown; latestVersion?: unknown };
  /** Controller actions allowed without further checks (slot 253 "Hy"). */
  allowedControllerActions(): readonly string[];
  /** Whether the controller may act regardless of the list above (slot 2104). */
  controllerUnlocked(): boolean;
  openNewForm(options?: unknown): void; // slot 2060
  focusFormWindow(): void; // slot 2062
  openFormWindow(): void; // slot 2059
  openUtilityWindow(name: string, title: string, width: number, height: number): void; // slot 2070
  checkForUpdate(options: { fresh: boolean }): Promise<unknown>; // slot 2110
  downloadUpdate(asset: unknown, onProgress: (fraction: unknown, received: unknown, total: unknown) => void): Promise<UpdateOutcome>; // slot 2106
  installUpdate(asset: unknown, version: string): Promise<UpdateOutcome>; // slot 2123
  /** Window that started the running update download (slot 2115 "Ve"). */
  updateWindow(): WindowLike | null | undefined;
  isUpdateDownloading(): boolean; // slot 2118
  channels(): { UpdateProgress: string }; // slot 336 "v"
  canOpenBookingBox(): Promise<boolean>; // slot 2105
  bookingBoxBlocked(id: unknown): boolean; // slot 2065
  openBookingBox(id: unknown): void; // slot 2068
  noteBlockedBookingBox(): void; // slot 2067
  blockedBookingBoxMessage(): unknown; // slot 331 "Vu"
  validatePassengers(passengers: unknown): unknown; // slot 271
  stageTransientForm(form: unknown): void; // slot 1540
  isSizeLocked(window: WindowLike): boolean; // slot 1942
  reportSizeLocked(): void; // slot 1945
  centredWindows(): { add(id: number): unknown; delete(id: number): unknown }; // slot 2036 "_l"
  bottomMargin(): number; // slot 2026 "pu"
  edgeMargin(): number; // slot 2027 "Cn"
  controllerWindow(): WindowLike | null | undefined; // slot 2039 "tt"
  controllerSize(workArea: Rectangle): ControllerSize; // slot 2031
  expandedWidth(): number; // slot 2029 "nB"
  expandedHeight(): number; // slot 2030 "rB"
  trackedWindows(): { values(): Iterable<WindowLike> }; // slot 2063 "Ln"
  enlargeQr(arg: unknown): void; // slot 1929
  checkPaymentNow(arg: unknown): void; // slot 1930
  renderTicketHtml(ticket: unknown): Promise<string>; // slot 1911
  saveTicketPdf(directory: string, ticket: unknown, pdf: unknown): unknown; // slot 205
  requestQuit(): void; // slot 2055
  confirmQuit(restart: boolean): void; // slot 2131
  platform(): string;
  setTimer(callback: (...args: unknown[]) => void, ms: number): unknown;
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;

const SECURITY_FAILED = 'Security check failed.';

// Recovered f4273: toolbar actions on the controller window.
export async function controllerAction(deps: WindowIpcDeps, action: unknown): Promise<HandlerResult> {
  if (!deps.securityCheck()) return failure(SECURITY_FAILED);
  if (!(deps.allowedControllerActions() as readonly unknown[]).includes(action) && !deps.controllerUnlocked()) {
    return failure(deps.securityState().message);
  }
  switch (action) {
    case 'new-form':
      deps.openNewForm();
      return { ok: true };
    case 'open-form':
      deps.focusFormWindow();
      deps.openFormWindow();
      return { ok: true };
    case 'login-data':
      deps.openUtilityWindow('login-data', 'Login Data', 640, 640);
      return { ok: true };
    case 'payment':
      deps.openUtilityWindow('payment', 'Payment', 660, 620);
      return { ok: true };
    case 'proxy':
      deps.openUtilityWindow('proxy', 'Proxy', 660, 660);
      return { ok: true };
    case 'history':
      deps.openUtilityWindow('history', 'Tickets', 680, 640);
      return { ok: true };
    case 'tools':
      deps.openUtilityWindow('tools', 'Tools · Advanced Configuration', 640, 800);
      return { ok: true };
    case 'updates':
      deps.openUtilityWindow('updates', 'Updates', 520, 480);
      return { ok: true };
    case 'logs':
      deps.openUtilityWindow('logs', 'Live Logs', 720, 560);
      return { ok: true };
    default:
      return { ok: true };
  }
}

// Recovered f4274
export async function checkUpdateNow(deps: WindowIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  result.data = await deps.checkForUpdate({ fresh: true });
  return result;
}

// Recovered f4275 (+ f4276, the progress callback): download the update installer. On Windows the update is applied
// by the updater helper; elsewhere the installer is downloaded and its location reported.
export async function downloadUpdate(deps: WindowIpcDeps, event: IpcEvent, asset: unknown): Promise<HandlerResult> {
  try {
    if (deps.platform() !== 'win32') {
      const result = await deps.downloadUpdate(asset, (fraction, received, total) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(deps.channels().UpdateProgress, { fraction, received, total });
        }
      });
      if (result.ok && result.path && result.name) return { ok: true, data: { path: result.path, name: result.name } };
      return failure(result.error || 'Download failed.');
    }
    const wanted = (asset || deps.securityState().latestVersion || deps.electron().app.getVersion()) as string;
    const version = wanted.replace(/^v/i, '');
    const result = await deps.installUpdate(asset, version);
    if (!result.ok) return failure(result.error ?? 'Update failed');
    return { ok: true, data: { path: '', name: '' } };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f4277: only the window that started the download may cancel it.
export function cancelUpdateDownload(deps: WindowIpcDeps, event: IpcEvent): HandlerResult {
  const owner = deps.updateWindow();
  if (owner && !deps.updateWindow()!.isDestroyed()) {
    if (event.sender === deps.updateWindow()!.webContents && event.senderFrame === event.sender.mainFrame) {
      if (!deps.isUpdateDownloading()) return failure('The update is no longer downloading.');
      return { ok: true };
    }
  }
  return failure('No update download belongs to this window.');
}

// Recovered f4278
export async function openFormWindow(deps: WindowIpcDeps, options: unknown): Promise<HandlerResult> {
  if (!deps.securityCheck()) return failure(SECURITY_FAILED);
  deps.openNewForm(options);
  return { ok: true };
}

// Recovered f4279: open the booking box of a saved form, once.
export async function openBookingBox(deps: WindowIpcDeps, id: unknown): Promise<HandlerResult> {
  if (!deps.securityCheck()) return failure(SECURITY_FAILED);
  if (!(await deps.canOpenBookingBox())) return failure(deps.securityState().message);
  if (!deps.bookingBoxBlocked(id)) {
    deps.openBookingBox(id);
    return { ok: true };
  }
  deps.noteBlockedBookingBox();
  return failure(deps.blockedBookingBoxMessage());
}

interface TransientForm {
  id?: unknown;
  passengers?: unknown;
}

// Recovered f4280: the same for a form that is not saved (it must pass the passenger check first).
export async function openBookingBoxTransient(deps: WindowIpcDeps, form: TransientForm): Promise<HandlerResult> {
  if (!deps.securityCheck()) return failure(SECURITY_FAILED);
  if (!(await deps.canOpenBookingBox())) return failure(deps.securityState().message);
  const problem = deps.validatePassengers(form.passengers ?? []);
  if (problem) return failure(problem);
  if (!deps.bookingBoxBlocked(form.id)) {
    deps.stageTransientForm(form);
    deps.openBookingBox(form.id);
    return { ok: true };
  }
  deps.noteBlockedBookingBox();
  return failure(deps.blockedBookingBoxMessage());
}

// Recovered f4281: resize the sender's window to the content size and keep it on screen, centred when asked,
// otherwise nudged above the taskbar margin.
export async function resizeSelf(deps: WindowIpcDeps, event: IpcEvent, width: number, height: number, options?: { center?: unknown } | null): Promise<HandlerResult> {
  const window = deps.electron().BrowserWindow.fromWebContents(event.sender);
  if (!window) return failure('no window');
  if (deps.isSizeLocked(window)) {
    deps.reportSizeLocked();
    return { ok: true };
  }
  const [left] = window.getPosition();
  window.setContentSize(Math.round(width), Math.round(height));
  const work = deps.electron().screen.getDisplayMatching(window.getBounds()).workArea;
  const bounds = window.getBounds();
  if (!options?.center) {
    deps.centredWindows().delete(window.id);
    let top = bounds.y;
    const lowest = work.y + work.height - bounds.height - (deps.bottomMargin() + deps.edgeMargin() + 14);
    if (top > lowest) top = lowest;
    if (top < work.y) top = work.y;
    window.setPosition(left, top);
  } else {
    let x = Math.round(work.x + (work.width - bounds.width) / 2);
    let y = Math.round(work.y + (work.height - bounds.height) / 2);
    x = Math.max(work.x, Math.min(x, work.x + work.width - bounds.width));
    y = Math.max(work.y, Math.min(y, work.y + work.height - bounds.height));
    window.setPosition(x, y);
    deps.centredWindows().add(window.id);
  }
  return { ok: true };
}

// Recovered f4282 (+ f4283): on macOS, repaint a tracked window on request.
export function repaintSelf(deps: WindowIpcDeps, event: IpcEvent): void {
  if (deps.platform() !== 'darwin') return;
  const window = deps.electron().BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window.isDestroyed()) return;
  if (window.webContents.isDestroyed()) return;
  if (![...deps.trackedWindows().values()].some(tracked => tracked === window)) return;
  window.webContents.invalidate();
}

// Recovered f4284
export async function enlargeQr(deps: WindowIpcDeps, arg: unknown): Promise<HandlerResult> {
  deps.enlargeQr(arg);
  return { ok: true };
}

// Recovered f4285
export async function checkNowPayment(deps: WindowIpcDeps, arg: unknown): Promise<HandlerResult> {
  deps.checkPaymentNow(arg);
  return { ok: true };
}

// Recovered f4286: shrink the controller window to its compact size, or restore the expanded one.
export async function controllerMinimize(deps: WindowIpcDeps, event: IpcEvent, expanded: unknown): Promise<HandlerResult> {
  const tracked = deps.controllerWindow();
  const window = tracked && !deps.controllerWindow()!.isDestroyed()
    ? deps.controllerWindow()
    : deps.electron().BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return failure('no controller window');
  const bounds = window.getBounds();
  const work = deps.electron().screen.getDisplayMatching(bounds).workArea;
  const size = deps.controllerSize(work);
  const width = expanded ? deps.expandedWidth() : size.width;
  const height = expanded ? deps.expandedHeight() : size.height;
  const wasResizable = window.isResizable();
  if (!wasResizable) window.setResizable(true);
  window.setContentSize(width, height);
  if (!wasResizable) window.setResizable(false);
  window.webContents.setZoomFactor(expanded ? 1 : size.zoom);
  const resized = window.getBounds();
  const wanted = expanded ? work.x + deps.edgeMargin() : Math.round(work.x + (work.width - resized.width) / 2);
  const left = Math.max(work.x, Math.min(wanted, work.x + work.width - resized.width));
  const top = work.y + work.height - resized.height - deps.edgeMargin();
  window.setPosition(left, top);
  return { ok: true };
}

const EXTERNAL_SCHEMES = ['http:', 'https:', 'tg:'];

// Recovered f4287: open a link in the system browser, only for the schemes the app uses.
export async function openExternal(deps: WindowIpcDeps, link: unknown): Promise<HandlerResult> {
  try {
    const url = new URL(String(link));
    if (!EXTERNAL_SCHEMES.includes(url.protocol)) return failure('blocked scheme');
    await deps.electron().shell.openExternal(url.toString());
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f4288 (+ f4289, f4290): render the ticket page in a hidden window and save it as a PDF on the desktop.
// The temporary page is always removed and the window destroyed.
export async function renderTicketPdf(deps: WindowIpcDeps, ticket: unknown): Promise<unknown> {
  const html = await deps.renderTicketHtml(ticket);
  const window = new (deps.electron().BrowserWindow)({
    width: 820,
    height: 1160,
    show: false,
    webPreferences: { sandbox: true, offscreen: false },
  });
  let directory: string | undefined;
  try {
    directory = deps.fs().mkdtempSync(deps.path().join(deps.os().tmpdir(), 'ts-ticket-'));
    const page = deps.path().join(directory, 'ticket.html');
    deps.fs().writeFileSync(page, html, 'utf8');
    await window.loadFile(page);
    await window.webContents
      .executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : true')
      .catch(() => undefined);
    await new Promise<void>(resolve => {
      deps.setTimer(resolve as (...args: unknown[]) => void, 250);
    });
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: false });
    const saved = await deps.saveTicketPdf(deps.electron().app.getPath('desktop'), ticket, pdf);
    deps.electron().shell.showItemInFolder(saved as string);
    return saved;
  } finally {
    window.destroy();
    if (directory) {
      try {
        deps.fs().unlinkSync(deps.path().join(directory, 'ticket.html'));
      } catch {
        // the page may already be gone
      }
      try {
        deps.fs().rmdirSync(directory);
      } catch {
        // the directory may already be gone or not empty
      }
    }
  }
}

// Recovered f4291
export async function printTicket(deps: WindowIpcDeps, ticket: { pnr?: unknown } | null | undefined): Promise<HandlerResult> {
  try {
    if (!ticket?.pnr) return failure('no PNR');
    const result: HandlerResult = { ok: true, data: undefined };
    result.data = await renderTicketPdf(deps, ticket);
    return result;
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f4292: close every window except the sender, the booking and payment windows, the controller and the
// controller page.
export async function closeAuxWindows(deps: WindowIpcDeps, event: IpcEvent): Promise<HandlerResult> {
  const own = deps.electron().BrowserWindow.fromWebContents(event.sender);
  for (const window of deps.electron().BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    if (window === own) continue;
    const title = window.getTitle();
    if (title === 'Booking') continue;
    if (title === 'Scan to Pay') continue;
    if (window === deps.controllerWindow()) continue;
    if (window.webContents.getURL().includes('controller.html')) continue;
    window.close();
  }
  return { ok: true };
}

// Recovered f4293
export async function requestQuit(deps: WindowIpcDeps): Promise<HandlerResult> {
  deps.requestQuit();
  return { ok: true };
}

// Recovered f4294 and f4295: quit, or restart (restart = true).
export async function confirmQuit(deps: WindowIpcDeps, restart: boolean): Promise<HandlerResult> {
  deps.confirmQuit(restart);
  return { ok: true };
}
