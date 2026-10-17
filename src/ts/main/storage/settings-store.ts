// Settings persistence (f3552-f3556). Secret-bearing settings stay opaque;
// this neither decrypts them nor sends them anywhere. Atomic-replace fallback
// and cleanup order follow the recovered writer exactly.
export interface Settings {
  autoUpdate?: unknown; pinnedVersion?: unknown; aiEnabled?: unknown;
  aiKeyEnc?: unknown; aiKey?: unknown; gologinTokenEnc?: unknown; gologinToken?: unknown;
  qrPopup?: unknown; newTheme?: unknown; pinnedOnTop?: unknown; autoUpdateOffMigrated?: unknown;
  availTimingResetMigrated?: unknown; hostLocationEnc?: unknown; clientUpdateLedgerInitialized?: unknown;
  fingerprintChromiumPath?: unknown;
}
interface FileSystem {
  mkdirSync(path: string, options: {recursive: boolean}): unknown;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, text: string | undefined, encoding: 'utf8'): unknown;
  renameSync(from: string, to: string): unknown;
  unlinkSync(path: string): unknown;
}
export interface SettingsStoreDeps {
  fs(): FileSystem; path(): string; userData(): string; pid(): number; now(): number;
}
const stringOnly = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
export function readSettings(deps: Pick<SettingsStoreDeps, 'fs' | 'path'>): Settings {
  try {
    const fs = deps.fs(), raw = JSON.parse(fs.readFileSync(deps.path(), 'utf8')) as Settings;
    return {
      autoUpdate: raw.autoUpdate === true, pinnedVersion: raw.pinnedVersion,
      aiEnabled: raw.aiEnabled !== false, aiKeyEnc: stringOnly(raw.aiKeyEnc), aiKey: stringOnly(raw.aiKey),
      gologinTokenEnc: stringOnly(raw.gologinTokenEnc), gologinToken: stringOnly(raw.gologinToken),
      qrPopup: raw.qrPopup !== false, newTheme: raw.newTheme === true, pinnedOnTop: raw.pinnedOnTop !== false,
      autoUpdateOffMigrated: raw.autoUpdateOffMigrated === true,
      availTimingResetMigrated: raw.availTimingResetMigrated === true,
      hostLocationEnc: stringOnly(raw.hostLocationEnc), clientUpdateLedgerInitialized: raw.clientUpdateLedgerInitialized === true,
      fingerprintChromiumPath: stringOnly(raw.fingerprintChromiumPath),
    };
  } catch {return {autoUpdate: false, aiEnabled: true, qrPopup: true};}
}
export function writeSettings(value: unknown, deps: SettingsStoreDeps): void {
  const fs = deps.fs(); fs.mkdirSync(deps.userData(), {recursive: true});
  const file = deps.path(), temp = file + '.tmp-' + deps.pid() + '-' + deps.now().toString(36);
  deps.fs().writeFileSync(temp, JSON.stringify(value), 'utf8');
  let failed = false, failure: unknown;
  try {
    try {deps.fs().renameSync(temp, file);}
    catch {
      try {deps.fs().unlinkSync(file);} catch { /* missing/locked old file */ }
      deps.fs().renameSync(temp, file);
    }
  } catch (error) {failed = true; failure = error;}
  try {deps.fs().unlinkSync(temp);} catch { /* normally already moved */ }
  if (failed) throw failure;
}
export const autoUpdate = (read: () => Settings): unknown => read().autoUpdate;
export const windowPinned = (read: () => Settings): boolean => read().pinnedOnTop !== false;
export interface SettingsMigrationDeps {
  readSettings(): Settings;
  writeSettings(settings: Settings): unknown;
  forms(): {clearAvailTimingOverrides(): {ok?: unknown; changed?: unknown}};
  log(category: string, message: string): unknown;
}
// One-time local configuration migrations (f3543/f3544). Preserve their
// best-effort behavior and mark completion only after the relevant work succeeds.
export function migrateAutoUpdate(deps: Pick<SettingsMigrationDeps, 'readSettings' | 'writeSettings'>): void {
  try {
    const settings = deps.readSettings();
    if (!settings.autoUpdateOffMigrated)
      deps.writeSettings({...settings, autoUpdate: false, autoUpdateOffMigrated: true});
  } catch { /* Retry on a later startup if the migration could not be saved. */ }
}
export function migrateAvailabilityTiming(deps: SettingsMigrationDeps): void {
  try {
    const settings = deps.readSettings();
    if (settings.availTimingResetMigrated) return;
    const result = deps.forms().clearAvailTimingOverrides();
    if (!result.ok) return;
    deps.writeSettings({...settings, availTimingResetMigrated: true});
    if (result.changed)
      deps.log('forms', 'cleared stale per-form availability-time override on ' + result.changed + ' saved form(s) → now follow the live server config');
  } catch { /* Original startup migration intentionally tolerates storage errors. */ }
}
export function settingsPath(deps: {
  path(): {join(directory: string, name: string): string};
  app(): {getPath(name: 'userData'): string};
}): string {
  return deps.path().join(deps.app().getPath('userData'), 'settings.json');
}
export interface PinWindow {
  isDestroyed(): boolean;
  setAlwaysOnTop(on: boolean, level?: unknown): unknown;
  setVisibleOnAllWorkspaces(on: boolean, options?: {visibleOnFullScreen: boolean}): unknown;
  setSkipTaskbar(on: boolean): unknown;
  moveTop(): unknown;
}
export function applyWindowPin(window: PinWindow, pinned: unknown, level: unknown): void {
  if (window.isDestroyed()) return;
  if (!pinned) {
    window.setAlwaysOnTop(false); window.setVisibleOnAllWorkspaces(false); window.setSkipTaskbar(false);
  } else {
    window.setAlwaysOnTop(true, level); window.setVisibleOnAllWorkspaces(true, {visibleOnFullScreen: true});
    window.setSkipTaskbar(true); window.moveTop();
  }
}
