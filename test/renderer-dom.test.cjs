'use strict';
// Differential tests for the browser-target renderer scripts: the preserved original scripts and the compiled
// TypeScript output run in identical synthetic jsdom documents with fake bridges and fake timers; the resulting
// DOM and every bridge call must match.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const rendererDir = path.join(root, 'src', 'renderer');
const legacyDir = path.join(__dirname, 'fixtures', 'legacy', 'renderer');
const scriptsUnderTest = ['portals', 'services', 'book-now', 'booking-timer', 'availability', 'payments', 'updates', 'logs', 'brand'];
const source = (variant, name) => fs.readFileSync(variant === 'legacy' ? path.join(legacyDir, `matrix-${name}.legacy.js`) : path.join(rendererDir, `matrix-${name}.js`), 'utf8');

async function boot(variant, page, scripts, setup) {
  const html = fs.readFileSync(path.join(rendererDir, page + '.html'), 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, { url: `file:///app/${page}.html`, runScripts: 'outside-only', pretendToBeVisual: false });
  const { window } = dom;
  await new Promise(resolve => window.document.readyState === 'complete' ? resolve() : window.addEventListener('load', resolve));
  const calls = [], timers = [];
  window.setInterval = (fn, ms) => { timers.push({ fn, ms, repeat: true }); return timers.length; };
  window.setTimeout = (fn, ms) => { timers.push({ fn, ms, repeat: false }); return timers.length; };
  window.clearInterval = window.clearTimeout = () => {};
  const ctx = { window, calls, timers, dom, tick: () => { for (const t of timers.splice(0)) { t.fn(); if (t.repeat) timers.push(t); } } };
  setup?.(ctx);
  for (const name of scripts) window.eval(source(variant, name));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return ctx;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const snapshot = ctx => ({ html: ctx.window.document.documentElement.outerHTML, title: ctx.window.document.title, calls: ctx.calls });
async function compare(name, page, scripts, setup, drive) {
  const results = [];
  for (const variant of ['legacy', 'compiled']) {
    const ctx = await boot(variant, page, scripts, setup);
    await settle(); await drive?.(ctx); await settle();
    results.push(snapshot(ctx));
    ctx.window.close();
  }
  assert.deepEqual(results[1], results[0], name);
  return results[0];
}
const click = (ctx, selector) => ctx.window.document.querySelector(selector).dispatchEvent(new ctx.window.MouseEvent('click', { bubbles: true }));
const fire = (ctx, selector, type = 'change') => ctx.window.document.querySelector(selector).dispatchEvent(new ctx.window.Event(type, { bubbles: true }));

test('compiled renderer scripts are plain classic scripts', () => {
  for (const name of scriptsUnderTest) {
    const text = source('compiled', name);
    assert.doesNotMatch(text, /^\s*(import|export)\s/m, name);
    assert.doesNotMatch(text, /Object\.defineProperty\(exports/, name);
    assert.match(text, /^("use strict";\n)?\/\/ Source: src\/ts\/renderer\//, name);
  }
});

test('committed renderer scripts equal a fresh browser-target build', () => {
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'matrix-renderer-'));
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(root, 'tsconfig.renderer.json'), '--outDir', out], { cwd: root });
  for (const name of scriptsUnderTest) assert.equal(fs.readFileSync(path.join(out, `matrix-${name}.js`), 'utf8'), source('compiled', name), `matrix-${name}.js is stale; run npm run build:renderer`);
  fs.rmSync(out, { recursive: true, force: true });
});

test('portals: buttons call the bridge with their role', async () => {
  const r = await compare('portals', 'tools', ['portals'], ctx => { ctx.window.matrixPortal = { open: role => ctx.calls.push(['open', role]) }; }, ctx => {
    for (const b of ctx.window.document.querySelectorAll('[data-matrix-portal]')) b.dispatchEvent(new ctx.window.MouseEvent('click', { bubbles: true }));
  });
  assert.ok(r.calls.length > 0);
});

for (const [label, status] of [['online', { source: 'online', roundTripMs: 12.4, clockOffsetMs: -3.6 }], ['local', { source: 'local', roundTripMs: 0, clockOffsetMs: 0 }], ['failure', null]]) {
  test(`services: ${label}`, async () => {
    const r = await compare(`services ${label}`, 'tools', ['services'], ctx => { ctx.window.matrixServices = { status: async refresh => { ctx.calls.push(['status', refresh]); if (!status) throw new Error('x'); return status; } }; }, ctx => click(ctx, '#matrix-services-check'));
    assert.equal(r.calls.length, 2);
  });
}

test('book-now / booking-timer / brand on booking-box', async () => {
  for (const quota of ['GN', 'TQ']) for (const flow of ['auto', 'manual', 'direct2']) {
    await compare(`booking-box ${quota}/${flow}`, 'booking-box', ['payments', 'brand', 'book-now', 'booking-timer'], ctx => {
      let listener; ctx.window.MATRIX_BUILD = { version: '9.9.9' };
      ctx.window.matrixBookingTiming = { subscribe: fn => { listener = fn; ctx.calls.push(['subscribe']); } };
      ctx.setListener = () => listener;
      const d = ctx.window.document; (d.getElementById('quotaSel') || {}).value = quota; (d.getElementById('loginFlowSel') || {}).value = flow;
    }, async ctx => {
      const d = ctx.window.document; for (const id of ['quotaSel', 'loginFlowSel']) if (d.getElementById(id)) fire(ctx, '#' + id);
      ctx.tick();
      for (const row of [{ remainingMs: 4200 }, { active: true, elapsedSeconds: 7.9 }, {}]) { ctx.setListener()?.(row); }
      ctx.tick();
    });
  }
});

test('availability: missing fields and filled fields', async () => {
  for (const fill of [false, true]) {
    await compare(`availability ${fill}`, 'form', ['availability'], ctx => { ctx.window.document.addEventListener('change', e => ctx.calls.push(['change', e.target.id])); }, ctx => {
      if (fill) for (const id of ['trainNumber', 'journeyDate', 'fromStation', 'toStation']) ctx.window.document.getElementById(id).value = 'x';
      click(ctx, '#matrixCheckAvailability'); ctx.tick();
    });
  }
});

test('payments catalog: window global and CommonJS export agree with the original', async () => {
  const loadCjs = variant => { const m = { exports: {} }; new Function('module', 'exports', 'require', source(variant, 'payments'))(m, m.exports, require); return m.exports; };
  const a = loadCjs('legacy'), b = loadCjs('compiled');
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
  assert.deepEqual(b.labels, a.labels);
  for (const v of ['paytm', 'paytmupi', 'upi', '', null, undefined, 0, 'zz']) assert.equal(b.label(v), a.label(v));
  for (const t of ['Pay via Paytm QR', 'Razorpay UPI', 'plain', 'Paytm UPI Xhamster TS']) assert.equal(b.normalize(t), a.normalize(t));
  assert.ok(Object.isFrozen(b) === Object.isFrozen(a) && Object.isFrozen(b.labels) === Object.isFrozen(a.labels));
  const g = []; for (const variant of ['legacy', 'compiled']) { const w = new JSDOM('', { runScripts: 'outside-only' }).window; w.eval(source(variant, 'payments')); g.push(Object.keys(w.MATRIX_PAYMENTS).sort()); }
  assert.deepEqual(g[1], g[0]);
});

test('updates: check, install and settings flows', async () => {
  const statuses = [
    { ok: true, currentVersion: '1.0.0', latestVersion: '1.0.0', available: false, autoUpdate: true },
    { ok: true, currentVersion: '1.0.0', latestVersion: '1.1.0', available: true, updaterAvailable: true, installable: true, autoUpdate: false, notes: 'Notes' },
    { ok: true, currentVersion: '1.0.0', latestVersion: '1.1.0', available: true, updaterAvailable: false, installable: true, autoUpdate: false },
    { ok: false, currentVersion: '1.0.0', autoUpdate: false, error: 'offline' },
  ];
  for (const status of statuses) for (const settingsOk of [true, false]) {
    await compare('updates', 'updates', ['updates'], ctx => {
      ctx.window.matrixUpdates = { check: async () => { ctx.calls.push(['check']); return status; }, close: () => ctx.calls.push(['close']), settings: async v => { ctx.calls.push(['settings', v]); return settingsOk ? { ok: true } : { ok: false, error: 'nope' }; }, install: async () => { ctx.calls.push(['install']); return { ok: false, error: 'bad' }; }, subscribe: fn => { ctx.progress = fn; } };
    }, async ctx => {
      await settle(); const box = ctx.window.document.getElementById('autoUpdate'); box.checked = !box.checked; fire(ctx, '#autoUpdate'); await settle();
      const install = [...ctx.window.document.querySelectorAll('button')].find(b => b.textContent.startsWith('Download')); if (install && !install.hidden) { install.click(); await settle(); }
      for (const row of [{ phase: 'downloading', percent: 40 }, { phase: 'installing' }, { phase: 'error', error: 'boom' }]) ctx.progress(row);
      click(ctx, '#checkBtn'); click(ctx, '#checkBtn'); await settle(); click(ctx, '#winClose');
    });
  }
});

test('logs: rendering, filtering, clear and unavailable bridge', async () => {
  const rows = [
    { id: 1, at: 1700000000000, kind: 'log', stage: 'start', message: 'hello', runId: 'abcdef123456', level: 'info', elapsedSeconds: 1.25, stepSeconds: null },
    { id: 2, at: 1700000001500, kind: 'heartbeat', stage: 'wait', message: 'waiting', runId: 'abcdef123456', level: 'warn', elapsedSeconds: 2, stepSeconds: 0.5 },
    { id: 3, at: 1700000002500, kind: 'log', stage: 'boot', message: 'app', runId: 'app', level: 'bogus', elapsedSeconds: null, stepSeconds: null },
  ];
  for (const bridge of [true, false]) {
    await compare('logs', 'logs', ['logs'], ctx => {
      ctx.window.URL.createObjectURL = () => 'blob:x'; ctx.window.URL.revokeObjectURL = () => {}; ctx.window.HTMLAnchorElement.prototype.click = function () { ctx.calls.push(['download', this.download]); };
      ctx.window.close = () => ctx.calls.push(['window.close']);
      ctx.window.Element.prototype.scrollIntoView = function () { ctx.calls.push(['scroll', this.dataset.run]); };
      if (bridge) ctx.window.matrixLogs = { subscribe: fn => { ctx.push = fn; }, snapshot: async () => rows.slice(0, 2), clear: async () => { ctx.calls.push(['clear']); } };
    }, async ctx => {
      await settle(); if (!bridge) return;
      ctx.push(rows[2]); ctx.push(rows[2]);
      const select = ctx.window.document.querySelector('select[aria-label="Filter log runs"]'); select.value = 'app'; select.dispatchEvent(new ctx.window.Event('change'));
      click(ctx, '#downloadBtn'); click(ctx, '#winClose'); click(ctx, '#clearBtn'); await settle();
    });
  }
});

test('brand: rebrands text, attributes, title and mutations on several pages', async () => {
  const pages = fs.readdirSync(rendererDir).filter(f => f.endsWith('.html') && /matrix-brand\.js/.test(fs.readFileSync(path.join(rendererDir, f), 'utf8'))).map(f => f.replace('.html', ''));
  assert.ok(pages.length >= 15);
  for (const page of pages) {
    await compare('brand ' + page, page, ['payments', 'brand'], ctx => { ctx.window.MATRIX_BUILD = { version: '2.3.4' }; }, async ctx => {
      const d = ctx.window.document;
      const p = d.createElement('p'); p.textContent = 'Xhamster TS by Tatkal Software uses Brahmos Browser; Updating TS'; p.title = 'Brahmos'; d.body.append(p);
      d.title = 'Brahmos setup'; await settle(); await new Promise(r => ctx.window.queueMicrotask(r)); await settle();
      for (const sel of ['#paymentMethod', '#paySel']) { const s = d.querySelector(sel); if (s) { s.value = s.options[s.options.length - 1]?.value; fire(ctx, sel); } }
      ctx.tick();
    });
  }
});
