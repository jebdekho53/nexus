// The Matrix activity log: collects booking stage events and heartbeats with secrets redacted, persists them to
// diagnostics/activity.jsonl, serves the Logs window, and forwards timing to the matching booking panel.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// The renderer's payment-label helper is plain browser JavaScript shared with the renderer; it is loaded by path from
// the project root (this file runs from build/ts/main/runtime).
const payments = require('../../../../src/renderer/matrix-payments.js') as { label(method: unknown): string };

interface LogWindow {
  isDestroyed(): boolean;
  webContents: { isDestroyed(): boolean; getURL(): string; send(channel: string, payload: unknown): void };
}

export interface ActivityElectron {
  BrowserWindow: { getAllWindows(): LogWindow[] };
  ipcMain: { handle(channel: string, handler: (event: { sender: { getURL(): string } }) => unknown): void };
}

interface Row {
  id: number;
  at: number;
  kind: string;
  stage: string;
  message: string;
  runId: string;
  level: string;
  elapsedSeconds: number | null;
  stepSeconds: number | null;
}

interface Run {
  started: number;
  changed: number;
  stage?: string;
  remaining?: { label: string; ms: number; at: number } | null;
  message?: string;
  active?: boolean;
}

export function install(electron: ActivityElectron, root: string) {
  const rows: Row[] = [], runs = new Map<string, Run>(), secrets = new Set<string>(), choices = new Map<unknown, unknown>();
  let id = 0;
  const file = path.join(root, 'diagnostics/activity.jsonl');
  const logUrl = pathToFileURL(path.join(root, 'src/renderer/logs.html')).href.toLowerCase();
  const trusted = (contents: { getURL(): string }): boolean => contents.getURL().split('?')[0]!.toLowerCase() === logUrl;
  const sensitive = /^(password|passcode|otp|apiKey|accessToken|refreshToken|csrfToken|authorization|cookie|secret|greq|bmiyek)$/i;
  function learn(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (sensitive.test(key) && typeof item === 'string' && item.length >= 3) secrets.add(item);
      else if (item && typeof item === 'object') learn(item);
    }
  }
  function clean(text: unknown): string {
    let value = String(text || '');
    for (const secret of secrets) value = value.replaceAll(secret, '[redacted]');
    return value.replace(/\bBrahmos\b/gi, 'Matrix').replace(/Xhamster\s*TS/gi, 'Matrix').replace(/Bearer\s+[\w.+\/-]+/gi, 'Bearer [redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]').replace(/\b(password|accessToken|refreshToken|csrfToken|cookie|authorization|apiKey|otp)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  }
  function emit(kind: string, stage: string, message: unknown, runId = 'app', level = 'info'): Row {
    const now = Date.now(), run = runs.get(runId);
    const row: Row = { id: ++id, at: now, kind, stage: clean(stage), message: clean(message), runId, level, elapsedSeconds: run ? Number(((now - run.started) / 1000).toFixed(1)) : null, stepSeconds: run ? Number(((now - run.changed) / 1000).toFixed(1)) : null };
    rows.push(row);
    if (rows.length > 5000) rows.shift();
    try { if (fs.existsSync(file) && fs.statSync(file).size > 10 * 1024 * 1024) fs.renameSync(file, file + '.previous'); fs.appendFileSync(file, JSON.stringify(row) + '\n'); } catch { /* the log file is best effort */ }
    for (const win of electron.BrowserWindow.getAllWindows()) try { if (!win.isDestroyed() && !win.webContents.isDestroyed() && trusted(win.webContents)) win.webContents.send('matrix:logs:event', row); } catch { /* window closing */ }
    if (run) for (const win of electron.BrowserWindow.getAllWindows()) try { const url = new URL(win.webContents.getURL()); if (!win.isDestroyed() && url.protocol === 'file:' && url.pathname === new URL(pathToFileURL(path.join(root, 'src/renderer/booking-box.html'))).pathname && url.searchParams.get('id') === runId) win.webContents.send('matrix:booking:timing', { runId, stage: row.stage, elapsedSeconds: row.elapsedSeconds, active: run.active, remainingMs: run.remaining ? Math.max(0, run.remaining.ms - (now - run.remaining.at)) : null }); } catch { /* window closing */ }
    return row;
  }
  function stage(name: string, message: unknown, runId = 'app', level = 'info'): void {
    if (!/^(weblogin|booking|search|ui|railone|payment|gologin|browser)(:|$)/.test(name)) return;
    const now = Date.now();
    let run = runs.get(runId);
    if (!run) { run = { started: now, changed: now }; runs.set(runId, run); }
    if (run.stage !== name) { run.changed = now; run.stage = name; }
    const countdown = name === 'booking:countdown' && String(message).match(/^([^|]+)\|(\d+)$/);
    run.remaining = countdown ? { label: countdown[1] as string, ms: Number(countdown[2]), at: now } : null;
    const failed = /(?:error|failed)$/.test(name) || /(?:re-?login|login|booking) failed:|target (?:page|browser|context).*closed/i.test(String(message));
    const terminal = failed || /(?:cancelled|closed|stopped|logout)$/.test(name) || /^booking:done/.test(name) || name === 'weblogin:done';
    const levelName = ['info', 'warn', 'error', 'success'].includes(level) ? level : 'info';
    run.message = clean(message); run.active = levelName !== 'error' && !terminal;
    if (name === 'ui:pay') { const match = String(message).match(/^Selecting payment:\s*(\w+)$/i); if (match) message = 'Selecting ' + payments.label(match[1]) + ' (' + match[1] + ')'; }
    emit('event', name, message, runId, failed ? 'error' : levelName);
  }
  const timer = setInterval(() => {
    for (const [runId, run] of runs) if (run.active) {
      let message = run.message;
      if (run.remaining) { const seconds = Math.max(0, Math.ceil((run.remaining.ms - (Date.now() - run.remaining.at)) / 1000)); message = run.remaining.label + ' resumes in ' + Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); }
      emit('heartbeat', run.stage as string, 'Waiting: ' + message, runId);
    }
  }, 1000);
  timer.unref();
  const allowed = (event: { sender: { getURL(): string } }): boolean => trusted(event.sender);
  electron.ipcMain.handle('matrix:logs:snapshot', event => allowed(event) ? rows : []);
  electron.ipcMain.handle('matrix:logs:clear', event => { if (allowed(event)) rows.length = 0; return { ok: allowed(event) }; });
  emit('event', 'app:ready', 'Matrix activity log ready');
  function observePayment(channel: string, args: unknown[], result: { ok?: unknown; data?: { id?: unknown; payment?: { method?: unknown } } } | null | undefined): void {
    if (channel === 'app:get-form' && result?.ok && result.data?.id) { choices.set(result.data.id, result.data.payment?.method); return; }
    if (channel === 'app:save-form' && result?.ok) {
      const form = args[0] as { id?: unknown; payment?: { method?: unknown } } | undefined, before = choices.get(form?.id), after = form?.payment?.method;
      if (before && after && before !== after) emit('event', 'payment:changed', payments.label(before) + ' → ' + payments.label(after), form.id as string, 'warn');
      if (form?.id) choices.set(form.id, after);
    }
    if (channel === 'app:start-booking') {
      const request = args[0] as { form?: { paymentMethodDisplay?: unknown; payment?: { method?: unknown }; paymentMethod?: unknown }; formId?: string } | undefined;
      const form = request?.form || {}, runId = request?.formId || 'app', selected = form.paymentMethodDisplay || form.payment?.method || form.paymentMethod;
      emit('event', 'payment:request', 'Selected ' + payments.label(selected) + '; request code ' + (form.paymentMethod || selected || 'missing'), runId);
    }
  }
  return {
    learn, stage,
    recovered(args: unknown[]): void { const runId = typeof args[2] === 'string' && /^[0-9a-f-]{36}$/i.test(args[2]) ? args[2] : 'app'; stage(String(args[0] || ''), String(args[1] || ''), runId, String(args[3] || 'info')); },
    observePayment, redact: clean,
    record(event: string, details: { error?: unknown; page?: unknown; check?: unknown } = {}): void { if (/security|check-skipped|function-trace|definitions-loaded|version-gate|window-show-suppressed/.test(event)) return; emit('event', event, details.error || details.page || details.check || event); },
    stop(runId: string): void { const run = runs.get(runId); if (run) run.active = false; },
    dispose(): void { clearInterval(timer); },
  };
}
