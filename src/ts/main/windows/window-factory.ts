// Creation of the application's ordinary windows: the controller toolbar, the splash screen, the quit confirmation, the form
// window and the "open form" window.
//
// Reconstructed from the recovered root functions f4099 (controller; its listeners f4100 to f4104), f4105 (splash; f4106),
// f4112 (quit confirmation; f4113 to f4115), f4128 (form window; f4129 to f4131) and f4132 (open-form window; f4133 to f4135).
// All of them are created in the bootstrap scope, so every dependency is a bootstrap binding read at call time (readBinding and
// writeBinding with depth 0 in the factory table); the original binding names are unknown and are named after how the recovered
// code uses them. A Binding keeps the two ways the recovered code stores into a binding: with the "uninitialised" check on its
// own read first (checkedStore) or as a plain store (store); both only differ while the bootstrap is still running.
//
// Also here: f4147 (+ f4148 to f4150), the generic utility window (login data, payment, proxy, history, tools, updates, logs) and
// f4157 (+ f4158 to f4160), the delayed restart.
//
// Not here: the passcode window f4109 (app lock), the lease and token timers (f4085 to f4090), the pair-limit check and window
// (f4137, f4138, f4141: the limit decision), and the version-blocked, security-check and start-error windows (f4151, f4154, f4161).

export interface BindingLike<T> {
  get(): T;
  /** The same read; named for call sites that only read once. */
  checkedGet(): T;
  /** A plain assignment. */
  store(value: T): void;
  /** An assignment that first reads the binding, which throws a ReferenceError while it is uninitialised. */
  checkedStore(value: T): void;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebContentsLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  setZoomFactor(factor: number): void;
}

export interface WindowLike {
  isDestroyed(): boolean;
  show(): void;
  hide(): void;
  destroy(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
  webContents: WebContentsLike;
}

export interface WindowFactoryDeps {
  /** Electron: BrowserWindow, screen and dialog (slot 22 "x"). */
  electron(): {
    BrowserWindow: new (options: Record<string, unknown>) => WindowLike;
    screen: { getPrimaryDisplay(): { workArea: Rectangle } };
    dialog: { showErrorBox(title: string, content: string): void };
  };
  path(): { join(...parts: string[]): string }; // slot 14 "m"
  mainDirectory(): string; // bootstrap slot 2
  devTools(): unknown; // slot 1972 "Pt"
  edgeMargin(): number; // slot 2027 "Cn"
  // bindings
  controllerWindow: BindingLike<WindowLike | null | undefined>; // slot 2039 "tt"
  confirmWindow: BindingLike<WindowLike | null | undefined>; // slot 2050 "Ni"
  controllerReady: BindingLike<boolean>; // slot 2051 "go"
  showWhenReady: BindingLike<boolean>; // slot 2052 "Ol"
  openFormWindow: BindingLike<WindowLike | null | undefined>; // slot 2061 "rn"
  quitting: BindingLike<unknown>; // slot 1971 "xe"
  crashTimes: BindingLike<number[]>; // slot 2041 "Hs"
  crashLimit: BindingLike<number>; // slot 2042 "aB"
  crashWindowMs: BindingLike<number>; // slot 2043 "MB"
  windowRegistry: BindingLike<{ get(key: unknown): WindowLike | undefined; set(key: unknown, window: WindowLike): unknown; delete(key: unknown): unknown }>; // slot 2058 "yr"
  // recovered helper functions
  controllerSize(workArea: Rectangle): { width: number; height: number; zoom: number }; // slot 2031 (f4091)
  placement(width: number, height: number, alignment?: string): Rectangle; // slot 2032 (f4092)
  loadPage(window: WindowLike, page: string, formId?: unknown, newTheme?: unknown): void; // slot 2038 (f4097)
  placeWindow(window: WindowLike): void; // slot 2040
  keepOnTop(window: WindowLike): void; // slot 2057 (f4119)
  applyWindowSettings(window: WindowLike): void; // slot 2056
  setWindowPin(window: WindowLike, pinned: unknown, level: string): void; // slot 1771
  pinnedSetting(): unknown; // slot 1770
  newThemeEnabled(): unknown; // slot 1623
  splashTheme(): unknown; // slot 1624
  recreateController(): void; // slot 2044
  showController(window: WindowLike): void; // slot 2054
  now(): number;
  /** Whether a restart is already scheduled (slot 2077 "jl"); pending work that must settle first (slot 2076 "mo"). */
  restartScheduled: BindingLike<boolean>;
  pendingWork: BindingLike<{ catch(handler: () => unknown): Promise<unknown> } | null | undefined>;
  /** Relaunch and exit (Electron app, slot 22 "x"; the exit function is slot 203). */
  relaunch(): void;
  exitApp(code: number): void;
  /** Utility windows by name (slot 2069 "oc"). */
  utilityWindows: BindingLike<{ get(key: unknown): WindowLike | undefined; set(key: unknown, window: WindowLike): unknown; delete(key: unknown): unknown }>;
  setTimer(callback: () => void, ms: number): unknown;
}

const PAGE_WEB_PREFERENCES = (deps: WindowFactoryDeps): Record<string, unknown> => ({
  preload: deps.path().join(deps.mainDirectory(), '../preload/index.js'),
  contextIsolation: true,
  sandbox: false,
  nodeIntegration: false,
  devTools: deps.devTools(),
});

// Recovered f4099 (+ f4100 to f4104): the borderless, always-on-top controller toolbar at the bottom of the screen. Zoomed out on
// narrow screens. If its renderer keeps crashing, it is recreated a limited number of times and then an error is shown.
export function createController(deps: WindowFactoryDeps): WindowLike {
  if (deps.controllerWindow.get()) {
    if (!deps.controllerWindow.get()!.isDestroyed()) {
      deps.controllerWindow.get()!.show();
      return deps.controllerWindow.get()!;
    }
  }
  const electron = deps.electron();
  const workArea = electron.screen.getPrimaryDisplay().workArea;
  const size = deps.controllerSize(workArea);
  const x = workArea.x + Math.round((workArea.width - size.width) / 2);
  const y = workArea.y + workArea.height - size.height - deps.edgeMargin();
  const webPreferences = PAGE_WEB_PREFERENCES(deps);
  const options: Record<string, unknown> = {
    width: size.width,
    height: size.height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences,
  };
  const window = new electron.BrowserWindow(options);
  deps.controllerWindow.store(window);
  window.on('closed', () => {
    if (deps.controllerWindow.get() === window) deps.controllerWindow.store(null);
  });
  window.webContents.on('render-process-gone', () => handleRendererGone(deps, window));
  deps.setWindowPin(window, deps.pinnedSetting(), 'floating');
  window.on('ready-to-show', () => window.show());
  if (size.zoom < 1) window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(size.zoom));
  deps.loadPage(window, 'controller', undefined, deps.newThemeEnabled());
  return window;
}

// Recovered f4101 (+ f4102): the controller's renderer died. Unless the app is quitting, drop the window and recreate it; after too
// many crashes within the window of time, stop and tell the user.
function handleRendererGone(deps: WindowFactoryDeps, window: WindowLike): void {
  if (deps.quitting.get()) return;
  if (!window.isDestroyed()) window.destroy();
  if (deps.controllerWindow.get() === window) deps.controllerWindow.store(null);
  const now = deps.now();
  deps.crashTimes.store(deps.crashTimes.get().filter(time => now - time < deps.crashWindowMs.get()));
  if (deps.crashTimes.get().length >= deps.crashLimit.get()) {
    try {
      deps.electron().dialog.showErrorBox('TS could not start', 'The app window kept closing unexpectedly. Please restart TS. If it continues, reinstall a genuine copy.');
    } catch {
      // the dialog is a courtesy
    }
    return;
  }
  deps.crashTimes.get().push(now);
  deps.recreateController();
}

// Recovered f4105 (+ f4106): the splash screen, shown centred once its page is ready.
export function createSplash(deps: WindowFactoryDeps): WindowLike {
  const electron = deps.electron();
  const options: Record<string, unknown> = {
    width: 460,
    height: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: { ...PAGE_WEB_PREFERENCES(deps), autoplayPolicy: 'no-user-gesture-required' },
  };
  const window = new electron.BrowserWindow(options);
  deps.placeWindow(window);
  window.on('ready-to-show', () => window.show());
  deps.loadPage(window, 'splash', undefined, deps.splashTheme());
  return window;
}

// Recovered f4112 (+ f4113 to f4115): the quit confirmation window; one at a time. Closing it only hides it, unless the app is
// quitting. When it becomes ready it is shown right away if someone already asked for it.
export function createConfirmQuit(deps: WindowFactoryDeps): WindowLike {
  if (deps.confirmWindow.get()) {
    if (!deps.confirmWindow.get()!.isDestroyed()) return deps.confirmWindow.get()!;
  }
  deps.controllerReady.checkedStore(false);
  const electron = deps.electron();
  const options: Record<string, unknown> = {
    width: 400,
    height: 236,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
    webPreferences: PAGE_WEB_PREFERENCES(deps),
  };
  const window = new electron.BrowserWindow(options);
  deps.confirmWindow.store(window);
  window.on('closed', () => {
    deps.confirmWindow.checkedStore(null);
    deps.controllerReady.checkedStore(false);
  });
  window.on('close', (event: { preventDefault(): void }) => {
    if (!deps.quitting.get()) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('ready-to-show', () => {
    deps.controllerReady.checkedStore(true);
    if (deps.showWhenReady.get()) {
      deps.showWhenReady.store(false);
      deps.showController(window);
    }
  });
  deps.loadPage(window, 'confirm-quit');
  return window;
}

// Recovered f4128 (+ f4129 to f4131): the window for one form (or for a new one when no id is given). An open one is reloaded and
// optionally brought forward; otherwise a new window is created. Closing it only hides it, unless the app is quitting.
export function createFormWindow(deps: WindowFactoryDeps, formId?: unknown, showWindow?: boolean): WindowLike {
  const show = showWindow !== undefined ? showWindow : true;
  const key = formId == null ? '__new__' : formId;
  const existing = deps.windowRegistry.get().get(key);
  if (existing && !existing.isDestroyed()) {
    deps.loadPage(existing, 'form', formId);
    if (show) deps.applyWindowSettings(existing);
    return existing;
  }
  const electron = deps.electron();
  const options: Record<string, unknown> = { ...deps.placement(880, 900, 'top') };
  options.minWidth = 560;
  options.show = false;
  options.frame = false;
  options.title = formId ? 'Edit Form' : 'New Form';
  options.backgroundColor = '#ffffff';
  options.webPreferences = PAGE_WEB_PREFERENCES(deps);
  const window = new electron.BrowserWindow(options);
  deps.windowRegistry.get().set(key, window);
  deps.keepOnTop(window);
  window.on('close', (event: { preventDefault(): void }) => {
    if (!deps.quitting.get()) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => {
    if (deps.windowRegistry.get().get(key) === window) deps.windowRegistry.get().delete(key);
  });
  window.on('ready-to-show', () => {
    if (show) window.show();
  });
  deps.loadPage(window, 'form', formId);
  return window;
}

// Recovered f4132 (+ f4133 to f4135): the "open form" window, one at a time, created hidden and shown when ready if asked to.
export function createOpenFormWindow(deps: WindowFactoryDeps, showWindow?: boolean): WindowLike {
  const show = showWindow !== undefined ? showWindow : true;
  if (deps.openFormWindow.get()) {
    if (!deps.openFormWindow.get()!.isDestroyed()) {
      if (show) deps.applyWindowSettings(deps.openFormWindow.get()!);
      return deps.openFormWindow.get()!;
    }
  }
  const electron = deps.electron();
  const options: Record<string, unknown> = { ...deps.placement(1120, 760) };
  options.minWidth = 360;
  options.show = false;
  options.frame = false;
  options.title = 'Open Form';
  options.backgroundColor = '#ffffff';
  options.webPreferences = PAGE_WEB_PREFERENCES(deps);
  const window = new electron.BrowserWindow(options);
  deps.openFormWindow.store(window);
  deps.keepOnTop(window);
  window.on('close', (event: { preventDefault(): void }) => {
    if (!deps.quitting.get()) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on('closed', () => deps.openFormWindow.checkedStore(null));
  window.on('ready-to-show', () => {
    if (show) window.show();
  });
  deps.loadPage(window, 'open-form');
  return window;
}

export interface UtilityWindowOptions {
  reveal?: unknown;
  pin?: unknown;
}

// Recovered f4147 (+ f4148 to f4150): a named utility window of a given size. An open one is reused (and brought forward unless asked
// not to); a new one keeps on top while focused and only hides when closed, unless it is pinned, in which case it is just placed.
// The last argument is either a boolean (reveal) or an object { reveal, pin }.
export function createUtilityWindow(deps: WindowFactoryDeps, name: string, title: string, width: number, height: number, option?: boolean | UtilityWindowOptions): WindowLike {
  const choice = option !== undefined ? option : true;
  const reveal = typeof choice === 'boolean' ? choice : !((choice as UtilityWindowOptions).reveal === false);
  const pin = typeof choice === 'object' ? Boolean((choice as UtilityWindowOptions).pin) : false;
  const existing = deps.utilityWindows.get().get(name);
  if (existing && !existing.isDestroyed()) {
    if (reveal) deps.applyWindowSettings(existing);
    return existing;
  }
  const electron = deps.electron();
  const options: Record<string, unknown> = { ...deps.placement(width, height) };
  options.show = false;
  options.frame = false;
  options.title = title;
  options.backgroundColor = '#ffffff';
  options.webPreferences = PAGE_WEB_PREFERENCES(deps);
  const window = new electron.BrowserWindow(options);
  deps.utilityWindows.get().set(name, window);
  if (!pin) deps.keepOnTop(window);
  else deps.placeWindow(window);
  if (!pin) {
    window.on('close', (event: { preventDefault(): void }) => {
      if (!deps.quitting.get()) {
        event.preventDefault();
        window.hide();
      }
    });
  }
  window.on('closed', () => deps.utilityWindows.get().delete(name));
  window.on('ready-to-show', () => {
    if (reveal) window.show();
  });
  deps.loadPage(window, name);
  return window;
}

// Recovered f4157 (+ f4158 to f4160): restart the app after a delay, once, unless it is already quitting. Work that is still pending
// is waited for (its failure is ignored) before the delay starts; when the delay is over and the app is still not quitting, it marks
// itself as quitting, relaunches and exits.
export function scheduleRestart(deps: WindowFactoryDeps, delayMs: number): void {
  if (deps.restartScheduled.get()) return;
  if (deps.quitting.get()) return;
  deps.restartScheduled.store(true);
  const pending = deps.pendingWork.checkedGet();
  void (async () => {
    if (pending) await pending.catch(() => undefined);
    deps.setTimer(() => {
      if (deps.quitting.get()) return;
      deps.quitting.store(true);
      deps.relaunch();
      deps.exitApp(0);
    }, delayMs);
  })();
}
