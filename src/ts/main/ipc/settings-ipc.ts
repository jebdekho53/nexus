// IPC handlers for the user's application settings: automatic updates, keeping windows on top, the AI assistant switch,
// the QR popup and the theme flag.
//
// Reconstructed from the handlers that the recovered registration function f3790 passes to `ipcMain.handle`:
// GetAutoUpdate f4013, SetAutoUpdate f4014, GetWindowPin f4015, SetWindowPin f4016, GetAiEnabled f4017, SetAiEnabled f4018,
// GetQrPopup f4019, GetNewTheme f4020 and SetQrPopup f4021. The settings store itself is a recovered helper pair that is
// injected here (read the stored settings, write them back).
//
// Not here: SetAiKey (f4022, stores an API key), the app-lock and GoLogin handlers, and the version and update-status
// handlers, which feed the version gate.

export interface HandlerResult {
  ok: boolean;
  error?: unknown;
  data?: unknown;
}

export interface Settings {
  autoUpdate?: unknown;
  pinnedOnTop?: unknown;
  aiEnabled?: unknown;
  qrPopup?: unknown;
  [field: string]: unknown;
}

export interface WindowLike {
  isDestroyed(): boolean;
  webContents: { getURL(): string; send(channel: string, value: unknown): void };
}

export interface SettingsIpcDeps {
  /** The stored settings (slot 1768). */
  readSettings(): Settings;
  /** Replaces the stored settings (slot 1769). */
  writeSettings(settings: Settings): void;
  /** Whether windows are currently kept on top (slot 1770). */
  windowPinned(): unknown;
  /** Applies the on-top mode to one window; level is "floating" for the controller and "screen-saver" for the booking box (slot 1771). */
  applyWindowPin(window: WindowLike, pinned: unknown, level: string): void;
  /** Electron's windows (slot 22 "x") and the channel names (slot 336 "v"). */
  windows(): WindowLike[];
  channels(): { WindowPinChanged: string };
  /** Whether an AI key is configured in the app's own store (slot 1784). */
  aiKeyConfigured(): unknown;
  /** The settings/environment object of the main process (bootstrap context slot 3 of the registration scope). */
  environment(): { CLAUDE_API_KEY?: unknown };
  qrPopupEnabled(): unknown; // slot 1925
  newThemeEnabled(): unknown; // slot 1623
}

const failure = (error: unknown): HandlerResult => ({ ok: false, error });
const messageOf = (error: unknown): unknown => (error as { message?: unknown }).message;

async function saveSetting(deps: SettingsIpcDeps, field: string, value: unknown): Promise<HandlerResult> {
  try {
    const settings: Settings = { ...deps.readSettings() };
    settings[field] = value;
    deps.writeSettings(settings);
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f4013
export async function getAutoUpdate(deps: SettingsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  const body = { enabled: undefined as unknown };
  body.enabled = deps.readSettings().autoUpdate;
  result.data = body;
  return result;
}

// Recovered f4014: only `true` turns it on.
export function setAutoUpdate(deps: SettingsIpcDeps, enabled: unknown): Promise<HandlerResult> {
  return saveSetting(deps, 'autoUpdate', enabled === true);
}

// Recovered f4015
export async function getWindowPin(deps: SettingsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  const body = { pinned: undefined as unknown };
  body.pinned = deps.windowPinned();
  result.data = body;
  return result;
}

// Recovered f4016: store the choice, apply it to the controller and booking-box windows, then tell every window.
export async function setWindowPin(deps: SettingsIpcDeps, pinned: unknown): Promise<HandlerResult> {
  try {
    deps.writeSettings({ ...deps.readSettings(), pinnedOnTop: pinned });
    for (const window of deps.windows()) {
      if (window.isDestroyed()) continue;
      const url = window.webContents.getURL();
      if (/controller\.html/i.test(url)) deps.applyWindowPin(window, pinned, 'floating');
      else if (/booking-box\.html/i.test(url)) deps.applyWindowPin(window, pinned, 'screen-saver');
    }
    for (const window of deps.windows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(deps.channels().WindowPinChanged, pinned);
    }
    return { ok: true };
  } catch (error) {
    return failure(messageOf(error));
  }
}

// Recovered f4017: whether the AI assistant is switched on and whether any key is available (the key itself is not returned).
export async function getAiEnabled(deps: SettingsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  const body = { enabled: undefined as unknown, hasKey: undefined as unknown };
  body.enabled = deps.readSettings().aiEnabled === true;
  body.hasKey = Boolean(deps.aiKeyConfigured() || deps.environment().CLAUDE_API_KEY);
  result.data = body;
  return result;
}

// Recovered f4018
export function setAiEnabled(deps: SettingsIpcDeps, enabled: unknown): Promise<HandlerResult> {
  return saveSetting(deps, 'aiEnabled', enabled === true);
}

// Recovered f4019
export async function getQrPopup(deps: SettingsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  const body = { enabled: undefined as unknown };
  body.enabled = deps.qrPopupEnabled();
  result.data = body;
  return result;
}

// Recovered f4020
export async function getNewTheme(deps: SettingsIpcDeps): Promise<HandlerResult> {
  const result: HandlerResult = { ok: true, data: undefined };
  const body = { enabled: undefined as unknown };
  body.enabled = deps.newThemeEnabled();
  result.data = body;
  return result;
}

// Recovered f4021
export function setQrPopup(deps: SettingsIpcDeps, enabled: unknown): Promise<HandlerResult> {
  return saveSetting(deps, 'qrPopup', enabled === true);
}
