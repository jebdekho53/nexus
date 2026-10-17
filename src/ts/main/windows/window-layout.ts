// Window layout and lifecycle helpers: sizing the controller to the screen, placing a window, tiling the booking windows, loading
// a renderer page, pinning and revealing windows, and keeping a floating window on top only while the app is active.
//
// Reconstructed from the recovered root functions f4091 (controller size), f4092 (placement), f4093 (+ f4094, f4095, f4096: tile
// the booking windows), f4097 (load a renderer page), f4098 (pin on all workspaces), f4116 (reveal), f4117 (show the controller),
// f4118 (focus), f4119 (+ f4120 to f4126: keep a window on top while the app is focused) and f4127 (apply to the visible
// windows). Every dependency is a bootstrap slot read at call time (readBinding with depth 0 in the factory table); the original
// names of the bindings are unknown, so the accessors are named after how the recovered code uses them. Where only the call
// position tells what a callback does it is named for that position and says so.
//
// Not here: the lease and token timers next to these functions (f4085 to f4090). They check the signed bootstrap token and belong
// to the licensing mechanism, which this migration leaves untouched.

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutWindow {
  id?: number;
  isDestroyed(): boolean;
  getTitle?(): string;
  setPosition?(x: number, y: number): void;
  setAlwaysOnTop?(flag: boolean, level?: string): void;
  setVisibleOnAllWorkspaces?(visible: boolean, options: { visibleOnFullScreen: boolean }): void;
  isMinimized?(): boolean;
  isVisible?(): boolean;
  isFocused?(): boolean;
  restore?(): void;
  show?(): void;
  center?(): void;
  focus?(): void;
  moveTop?(): void;
  on?(event: string, listener: () => void): unknown;
  loadFile?(path: string, options?: { search: string }): unknown;
  loadURL?(url: string): unknown;
}

export interface WindowLayoutDeps {
  /** Electron's screen, BrowserWindow and app (slot 22 "x"). */
  electron(): {
    screen: { getPrimaryDisplay(): { workArea: Rectangle } };
    BrowserWindow: { getAllWindows(): LayoutWindow[] };
    app: { focus(options: { steal: boolean }): void };
  };
  /** Spacing used by the controller (slot 2027 "Cn"). */
  edgeMargin(): number;
  /** The controller's design width (slot 2028 "wE") and height (slot 2026 "pu"). */
  controllerBaseWidth(): number;
  controllerBaseHeight(): number;
  /** Ids of booking windows the operator placed by hand; they are not tiled (slot 2036 "_l"). */
  customPlaced(): { has(id: unknown): boolean };
  /** Size of one tile (slots 2033 "Pl" and 2034 "sB"). */
  tileWidth(): number;
  tileHeight(): number;
  /** Called after the booking windows were tiled; roles inferred from the call position only (slots 1936 and 1945). */
  onLayoutApplied(): void;
  onLayoutSettled(): void;
  /** Address of the renderer dev server, or nothing when pages load from files (slot 191). */
  devServerUrl(): string | null | undefined;
  /** The main-process directory renderer pages are found from (bootstrap slot 2) and Node's path module (slot 14 "m"). */
  mainDirectory(): string;
  path(): { join(...parts: string[]): string };
  /** Puts a window at its saved or default place (slot 2040). */
  placeWindow(window: LayoutWindow): void;
  /** The controller window (slot 2053); whether it is ready to be shown (slot 2051 "go"); asks to show it when ready (slot 2052 "Ol"). */
  controllerWindow(): LayoutWindow;
  controllerReady(): unknown;
  showControllerWhenReady(): void;
  showController(window: LayoutWindow): void;
  platform(): string;
  /** Windows by name, as [name, window] pairs (slot 2058 "yr"); the callback re-applies the window's settings (slot 2056). */
  windowEntries(): Iterable<[unknown, LayoutWindow | null | undefined]>;
  applyWindowSettings(window: LayoutWindow): void;
}

export interface ControllerSize {
  width: number;
  height: number;
  zoom: number;
}

// Recovered f4091: the controller's size on a work area; it shrinks (zooms) to fit narrow screens but never below 320 wide.
export function controllerSize(deps: WindowLayoutDeps, workArea: Rectangle): ControllerSize {
  const available = Math.max(320, workArea.width - deps.edgeMargin() * 2);
  const zoom = Math.min(1, available / deps.controllerBaseWidth());
  return {
    width: Math.round(deps.controllerBaseWidth() * zoom),
    height: Math.round(deps.controllerBaseHeight() * zoom),
    zoom,
  };
}

// Recovered f4092: a window rectangle of at most the given size, centred horizontally on the primary work area and centred
// vertically, or pinned to the top when alignment is "top".
export function placement(deps: WindowLayoutDeps, width: number, height: number, alignment?: string): Rectangle {
  const align = alignment !== undefined ? alignment : 'center';
  const work = deps.electron().screen.getPrimaryDisplay().workArea;
  const reserved = deps.controllerBaseHeight() + deps.edgeMargin() + 14;
  const maxHeight = Math.max(360, work.height - reserved);
  const fittedWidth = Math.min(width, work.width - 40);
  const fittedHeight = Math.min(height, maxHeight);
  return {
    x: work.x + Math.round((work.width - fittedWidth) / 2),
    y: align === 'top' ? work.y : work.y + Math.round((maxHeight - fittedHeight) / 2),
    width: fittedWidth,
    height: fittedHeight,
  };
}

const TILE_GAP = 8;
const TILE_PADDING = 8;

// Recovered f4093 (+ f4094, f4095, f4096): tile the live booking windows that were not placed by hand, in window-id order, row
// by row on the primary work area. A window that cannot be moved is skipped.
export function tileBookingWindows(deps: WindowLayoutDeps): void {
  const work = deps.electron().screen.getPrimaryDisplay().workArea;
  const windows = deps
    .electron()
    .BrowserWindow.getAllWindows()
    .filter(window => !window.isDestroyed() && window.getTitle!() === 'Booking' && !deps.customPlaced().has(window.id))
    .sort((a, b) => (a.id as number) - (b.id as number));
  const perRow = Math.max(1, Math.floor((work.width - TILE_PADDING * 2 + TILE_GAP) / (deps.tileWidth() + TILE_GAP)));
  windows.forEach((window, index) => {
    const column = index % perRow;
    const row = Math.floor(index / perRow);
    const x = work.x + TILE_PADDING + column * (deps.tileWidth() + TILE_GAP);
    const y = work.y + TILE_PADDING + row * (deps.tileHeight() + TILE_GAP);
    try {
      window.setPosition!(x, y);
    } catch {
      // a window that cannot be moved stays where it is
    }
  });
  deps.onLayoutApplied();
  deps.onLayoutSettled();
}

// Recovered f4097: load a renderer page into a window, from the dev server when one is configured and from the packaged files
// otherwise. The form id and the new-theme flag travel as the query.
export function loadRendererPage(deps: WindowLayoutDeps, window: LayoutWindow, page: string, formId?: unknown, newTheme?: unknown): void {
  const parts: string[] = [];
  if (formId) parts.push('id=' + encodeURIComponent(formId as string));
  if (newTheme) parts.push('theme=new');
  const query = parts.join('&');
  const devServer = deps.devServerUrl();
  if (!devServer) {
    window.loadFile!(deps.path().join(deps.mainDirectory(), '../renderer/' + page + '.html'), query ? { search: query } : undefined);
  } else {
    window.loadURL!(devServer + '/' + page + '.html' + (query ? '?' + query : ''));
  }
}

// Recovered f4098: keep a window above everything, on every workspace, including over full-screen apps.
export function pinOnAllWorkspaces(window: LayoutWindow): void {
  window.setAlwaysOnTop!(true);
  window.setVisibleOnAllWorkspaces!(true, { visibleOnFullScreen: true });
}

// Recovered f4116: put a window in its place, centre it and bring it to the front.
export function revealWindow(deps: WindowLayoutDeps, window: LayoutWindow): void {
  deps.placeWindow(window);
  window.center!();
  window.show!();
  window.focus!();
}

// Recovered f4117: bring the controller forward; a hidden one is shown now when it is ready, otherwise as soon as it is.
export function activateController(deps: WindowLayoutDeps): void {
  const window = deps.controllerWindow();
  if (!window.isVisible!()) {
    if (!deps.controllerReady()) deps.showControllerWhenReady();
    else deps.showController(window);
    return;
  }
  window.focus!();
}

// Recovered f4118: restore, show and focus a window (stealing focus from other apps on macOS) and raise it.
export function focusWindow(deps: WindowLayoutDeps, window?: LayoutWindow | null): void {
  if (!window) return;
  if (window.isDestroyed()) return;
  if (window.isMinimized!()) window.restore!();
  window.show!();
  if (deps.platform() === 'darwin') deps.electron().app.focus({ steal: true });
  window.focus!();
  window.moveTop!();
}

// Recovered f4119 (+ f4120 to f4126): a floating window is on top ("screen-saver" level) only while it or the app has the focus.
export function keepOnTopWhileFocused(window: LayoutWindow): void {
  const apply = (onTop: unknown): void => {
    if (window.isDestroyed()) return;
    window.setAlwaysOnTop!(onTop as boolean, onTop ? 'screen-saver' : 'normal');
    if (onTop) window.moveTop!();
  };
  const refresh = (): void => apply(!window.isDestroyed() ? window.isFocused!() : false);
  window.on!('focus', () => apply(true));
  window.on!('blur', () => apply(false));
  window.on!('hide', () => apply(false));
  window.on!('minimize', () => apply(false));
  window.on!('restore', refresh);
  window.on!('show', refresh);
}

// Recovered f4127: re-apply the settings of every visible named window except the new-form window.
export function applyToVisibleWindows(deps: WindowLayoutDeps): void {
  for (const [name, window] of deps.windowEntries()) {
    if (name === '__new__') continue;
    if (!window) continue;
    if (window.isDestroyed()) continue;
    if (!window.isVisible!()) continue;
    deps.applyWindowSettings(window);
  }
}
