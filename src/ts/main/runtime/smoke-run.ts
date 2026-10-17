// The isolated `--smoke-test` run: after a fixed duration it inspects every window (DOM state, screenshot), optionally
// runs the offline diagnostics requested by flags, writes diagnostics/smoke-result.json and exits through the
// development policy (or the app) with 0 when windows exist.
import * as fs from 'node:fs';
import * as path from 'node:path';

type Logger = (event: string, details?: Record<string, unknown>) => void;

interface SmokeContents {
  getURL(): string;
  executeJavaScript(code: string): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- diagnostics return page-defined shapes
  capturePage(): Promise<{ toPNG(): Buffer }>;
}

interface SmokeWindow {
  webContents: SmokeContents;
  getTitle(): string;
  isDestroyed(): boolean;
}

export interface SmokeContext {
  electron: { BrowserWindow: { getAllWindows(): SmokeWindow[] }; app: { exit(code: number): void } };
  projectRoot: string;
  diagnostics: string;
  isDevelopment: boolean;
  log: Logger;
  errorDetails: (error: unknown) => Record<string, unknown>;
  activity: { stage(name: string, message: string, runId: string): void };
  developmentPolicy: { stats?: unknown; finishSmoke(code: number): void } | null | undefined;
}

interface WindowReport {
  url: string;
  title: string;
  destroyed: boolean;
  dom?: { licensePromptVisible?: boolean };
  domError?: string;
  activity?: unknown;
  screenshot?: string;
  captureError?: string;
}

interface SmokeReport {
  windows: WindowReport[];
  nativeBytecodeLoaded: boolean;
  developmentMode: boolean;
  durationMs: number;
  policy: unknown;
  panel?: unknown;
  loginDiagnostic?: unknown;
  screenActions?: unknown;
  storage?: unknown;
}

type Diagnostic = { toString(): string };
const flag = (name: string): boolean => process.argv.includes(name);
const message = (error: unknown): string => String((error as { message?: unknown }).message);

export function scheduleSmoke(context: SmokeContext): void {
  const { electron, projectRoot, diagnostics, isDevelopment, log, errorDetails, activity, developmentPolicy } = context;
  if (flag('--smoke-activity')) {
    setTimeout(() => activity.stage('weblogin:diagnostic', 'Synthetic wait test — no real login', 'diagnostic'), 25000);
    setTimeout(() => activity.stage('weblogin:done', 'Synthetic log test complete', 'diagnostic'), 31000);
  }
  const durationArg = process.argv.find(arg => arg.startsWith('--smoke-duration='));
  const duration = durationArg ? Number(durationArg.split('=')[1]) : 18000;
  if (!Number.isFinite(duration) || duration < 18000 || duration > 300000) throw new Error('Smoke duration must be 18000..300000 milliseconds');
  let screenResult: { actions?: unknown } | undefined, screenError: Record<string, unknown> | undefined;
  if (flag('--smoke-screens')) setTimeout(async () => {
    try {
      const controller = electron.BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('/controller.html'));
      if (!controller) throw new Error('Controller unavailable for screen test');
      const actions = require(path.join(projectRoot, 'test/offline-screens.cjs')) as Diagnostic;
      screenResult = await controller.webContents.executeJavaScript('(' + actions.toString() + ')()');
      log('screen-actions-complete', { actions: screenResult?.actions });
    } catch (error) { screenError = errorDetails(error); log('screen-actions-error', screenError); }
  }, 20000);
  setTimeout(async () => {
    try {
      let windows = electron.BrowserWindow.getAllWindows();
      const report: SmokeReport = { windows: [], nativeBytecodeLoaded: false, developmentMode: isDevelopment, durationMs: duration, policy: developmentPolicy?.stats };
      if (flag('--smoke-panel')) report.panel = await (require(path.join(projectRoot, 'test/packaged-panel.cjs')) as { run(electron: unknown, root: string): Promise<unknown> }).run(electron, projectRoot);
      if (flag('--smoke-login')) {
        const diagnosticWindow = windows.find(win => win.webContents.getURL().endsWith('/controller.html')) as SmokeWindow;
        const diagnostic = require(path.join(projectRoot, 'test/offline-login.cjs')) as Diagnostic;
        report.loginDiagnostic = await Promise.race([
          diagnosticWindow.webContents.executeJavaScript('(' + diagnostic.toString() + ')()'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Login diagnostic timed out')), 8000)),
        ]);
      }
      if (flag('--smoke-screens')) {
        if (screenError || !screenResult) throw new Error('Screen actions did not complete: ' + JSON.stringify(screenError));
        report.screenActions = screenResult;
      }
      if (flag('--smoke-storage')) {
        const testWindow = windows.find(win => win.webContents.getURL().endsWith('/form.html'));
        if (!testWindow) throw new Error('Form window unavailable for storage test');
        const storage = require(path.join(projectRoot, 'test/offline-storage.cjs')) as Diagnostic;
        report.storage = await Promise.race([
          testWindow.webContents.executeJavaScript('(' + storage.toString() + ')()'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Storage diagnostic timed out')), 8000)),
        ]);
        windows = electron.BrowserWindow.getAllWindows();
      }
      for (const win of windows) {
        const info: WindowReport = { url: win.webContents.getURL(), title: win.getTitle(), destroyed: win.isDestroyed() };
        const deadline = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Renderer diagnostic timed out')), 4000))]);
        try { info.dom = await deadline(win.webContents.executeJavaScript('({ready:document.readyState,text:document.body?.innerText?.slice(0,1200),elements:document.querySelectorAll("*").length,apiAvailable:typeof window.api,font:getComputedStyle(document.body).fontFamily,background:getComputedStyle(document.body).backgroundColor,brandTheme:!!document.querySelector("link[href*=matrix-theme]"),licensePromptVisible:!!document.getElementById("licOverlay")&&!document.getElementById("licOverlay").classList.contains("hidden")})')); }
        catch (error) { info.domError = message(error); }
        if (flag('--smoke-activity') && info.url.split('?')[0]!.endsWith('/logs.html')) {
          info.activity = await win.webContents.executeJavaScript('window.matrixLogs.snapshot().then(rows=>({rows:rows.length,heartbeats:rows.filter(row=>row.kind==="heartbeat"&&row.runId==="diagnostic").length,redacted:!rows.some(row=>row.message.includes("synthetic-secret"))}))');
        }
        try {
          const image = await deadline(win.webContents.capturePage());
          const file = path.join(diagnostics, `window-${report.windows.length + 1}.png`);
          fs.writeFileSync(file, image.toPNG()); info.screenshot = file;
        } catch (error) { info.captureError = message(error); }
        report.windows.push(info);
      }
      if (isDevelopment && windows.some(win => win.webContents.getURL().includes('/security-error.html'))) throw new Error('Security Check returned during the development stability test');
      if (report.windows.some(win => win.dom?.licensePromptVisible)) throw new Error('Vendor license prompt is visible in the local workspace');
      fs.writeFileSync(path.join(diagnostics, 'smoke-result.json'), JSON.stringify(report, null, 2));
      log('smoke-complete', { windows: report.windows.length });
      if (developmentPolicy) developmentPolicy.finishSmoke(windows.length ? 0 : 2); else electron.app.exit(windows.length ? 0 : 2);
    } catch (error) { log('smoke-error', errorDetails(error)); if (developmentPolicy) developmentPolicy.finishSmoke(1); else electron.app.exit(1); }
  }, duration);
}
