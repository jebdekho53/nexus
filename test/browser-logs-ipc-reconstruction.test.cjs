'use strict';
// Compares the reconstructed browser, log and success-ticket IPC handlers (browser-ipc.ts, logs-ipc.ts) with the recovered
// handlers f3817, f3818, f3819, f3825, f3831, f3832, f3861, f3862 and f3863 on identical synthetic scenarios: traced bootstrap
// helpers, an in-memory file system, a fake save dialog and a scripted clock. Nothing is installed, opened or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => {
  if (typeof value === 'function') return 'fn';
  if (Buffer.isBuffer(value)) return 'buf:' + value.toString('hex');
  if (value && typeof value === 'object') { if (value.__window) return 'win'; try {return JSON.parse(JSON.stringify(value));} catch {return 'object';} }
  return value;
};

function world(options = {}) {
  const trace = [];
  const rec = (name, ...args) => trace.push([name, ...args.map(summary)]);
  const files = new Map();
  const fds = new Map();
  let nextFd = 3;
  const closed = [];
  const fs = {
    openSync(path, flags, mode) {rec('fs.open', path, flags, mode); if (options.openFails && flags === 'w') throw new Error('synthetic open'); if (options.dirFails && flags === 'r') throw new Error('synthetic dir'); const fd = nextFd++; fds.set(fd, path); if (flags === 'w') files.set(path, Buffer.alloc(0)); return fd;},
    writeFileSync(fd, data) {
      rec('fs.write', fds.get(fd), data); if (options.writeFails) throw new Error('synthetic write');
      const stored = options.zeroFill ? Buffer.alloc(data.length) : options.shortWrite ? data.subarray(0, Math.max(0, data.length - 3)) : options.corrupt ? Buffer.concat([data.subarray(0, data.length - 1), Buffer.from('X')]) : data;
      files.set(fds.get(fd), stored);
    },
    fsyncSync(fd) {rec('fs.fsync', fds.get(fd)); if (options.fsyncFails) throw new Error('synthetic fsync');},
    closeSync(fd) {rec('fs.close', fds.get(fd)); closed.push(fd); if (options.closeFails) throw new Error('synthetic close');},
    renameSync(from, to) {rec('fs.rename', from, to); if (options.renameFails) throw new Error('synthetic rename'); files.set(to, files.get(from)); files.delete(from);},
    readFileSync(path) {rec('fs.read', path); if (options.readFails) throw new Error('synthetic read'); return files.get(path);},
    rmSync(path, rmOptions) {rec('fs.rm', path, rmOptions); if (options.rmFails) throw new Error('synthetic rm'); files.delete(path);},
  };
  if (options.existing) files.set(options.existing, Buffer.from('previous content'));
  const send = [];
  const sender = {
    destroyed: !!options.senderDestroyed,
    isDestroyed() {rec('sender.isDestroyed'); return this.destroyed;},
    send(channel, payload) {rec('sender.send', channel, payload);},
  };
  const value = (name, fallback) => (options.returns && name in options.returns ? options.returns[name] : fallback);
  const helper = (slot, name, fallback) => (...args) => {
    rec(name + '#' + slot, ...args);
    const result = value(name, fallback);
    return typeof result === 'function' ? result(...args) : result;
  };
  const tickets = new Map(options.tickets ?? []);
  const wrappedTickets = {set: (k, v) => {rec('ticket.set', k, v); tickets.set(k, v); return tickets;}, get: k => {rec('ticket.get', k); return tickets.get(k);}};
  const times = options.times ?? [1000, 1010, 1020, 1200, 1210, 1500];
  let tick = 0;
  const FakeDate = class {
    constructor() {rec('Date.new');}
    toISOString() {return '2026-10-17T10:20:30.456Z';}
    static now() {const t = times[Math.min(tick++, times.length - 1)]; rec('Date.now'); return t;}
  };
  const electron = {
    shell: {openExternal(url) {rec('shell.open', url); return options.openFails ? Promise.reject(new Error('synthetic open-external')) : Promise.resolve();}},
    BrowserWindow: {fromWebContents(contents) {rec('BrowserWindow.from', contents === sender ? 'sender' : 'other'); return options.parent ? {__window: true} : null;}},
    dialog: {showSaveDialog(...args) {rec('dialog.save', ...args); return Promise.resolve(options.dialog ?? {canceled: false, filePath: '/out/log.json'});}},
  };
  const pairs = options.pairs ?? [
    {pair: 1, label: 'Pair one', formId: 'f1'}, {pair: 2, label: 'Pair two', formId: 'f2'}, {pair: 3, label: 'Pair three', formId: 'f3'},
  ];
  const appLog = options.appLog ?? [{formId: 'f1', t: 1}, {formId: 'f2', t: 2}, {formId: '', t: 3}, {t: 4}];
  const fullLog = options.fullLog ?? [{formId: 'f1', t: 1}, {formId: 'f1', t: 5}, {formId: 'f2', t: 2}, {formId: '', t: 3}, {t: 4}, {formId: 'f3', t: 6}];
  const slots = {
    107: helper(107, 'detect', [{id: 'chrome', type: 'chrome', installed: true}, {id: 'edge', type: 'edge', installed: 0}]),
    1786: helper(1786, 'profileReady', 1), 102: helper(102, 'summary', 'chrome, edge'), 1885: helper(1885, 'log', undefined),
    65: helper(65, 'download', {url: 'https://example.invalid/chrome'}),
    22: options.holes?.includes(22) ? HOLE : electron,
    1965: options.holes?.includes(1965) ? HOLE : (options.busy ?? false),
    176: helper(176, 'install', undefined), 170: helper(170, 'sanitize', text => text.replace(/secret/g, '***')),
    336: options.holes?.includes(336) ? HOLE : {BrowserDownloadProgress: 'browser:progress'},
    68: helper(68, 'catalog', [{id: 'chrome', name: 'Chrome'}, {id: 'edge', name: 'Edge'}, {id: 'firefox', name: 'Firefox'}]),
    1867: options.holes?.includes(1867) ? HOLE : appLog, 1869: options.holes?.includes(1869) ? HOLE : fullLog,
    1881: helper(1881, 'plain', true), 1866: helper(1866, 'pairs', pairs),
    61: helper(61, 'config', options.noKey ? {APP_VERSION: '1.0.11'} : {LOG_ENCRYPT_PUBLIC_KEY: 'PUBKEY', APP_VERSION: '1.0.11'}),
    595: helper(595, 'encrypt', (text, key) => ({k: 'K', ct: Buffer.from(text).toString('base64').slice(0, 24), iv: 'IV', tag: 'TAG'})),
    1886: helper(1886, 'afterExport', undefined), 18: fs, 14: {dirname: path => path.replace(/\/[^/]*$/, '') || '/'},
    1940: options.holes?.includes(1940) ? HOLE : wrappedTickets, 1947: helper(1947, 'showTicket', undefined),
  };
  return {trace, files, slots, sender, FakeDate, rec, closed, environment: {mode: 'test'}, options, process: {platform: 'win32', pid: 4242}};
}

function handlersFor(native, env) {
  const {engine, root} = harness({
    native, slots: env.slots,
    globals: {Date: env.FakeDate, Buffer, process: env.process},
    dependencies: {now: () => env.FakeDate.now(), dateConstructor: env.FakeDate, platform: () => env.process.platform, pid: () => env.process.pid},
  });
  const ctx = engine.context(4, root);
  ctx[2] = root[5];
  ctx[3] = env.environment;
  const make = id => engine.makeFunction(id, ctx);
  make.root = root;
  return make;
}

function scenario(name, options, run) {
  test('browser/log IPC matches the recovered handlers: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const event = {sender: env.sender};
      const result = await outcome(async () => run(handler, event, env));
      return {
        result, trace: env.trace, busy: handler.root[1965] === HOLE ? 'HOLE' : handler.root[1965],
        files: [...env.files].map(([path, data]) => [path, data.toString('hex')]), closed: env.closed.length,
      };
    });
  });
}

// DetectBrowsers
scenario('detect', {}, (h, e) => h('f3817')(e));
scenario('detect, profile service not ready', {returns: {profileReady: 0}}, (h, e) => h('f3817')(e));
scenario('detect fails', {returns: {detect: () => Promise.reject(new Error('synthetic detect'))}}, (h, e) => h('f3817')(e));
scenario('detect throws synchronously', {returns: {detect: () => {throw new Error('synthetic detect');}}}, (h, e) => h('f3817')(e));
scenario('detect summary fails (ignored)', {returns: {summary: () => Promise.reject(new Error('synthetic summary'))}}, (h, e) => h('f3817')(e));
scenario('detect log fails (ignored)', {returns: {log: () => {throw new Error('synthetic log');}}}, (h, e) => h('f3817')(e));
// OpenBrowserDownload
scenario('open download', {}, (h, e) => h('f3818')(e, 'chrome'));
scenario('open download: none available', {returns: {download: undefined}}, (h, e) => h('f3818')(e, 'safari'));
scenario('open download: null', {returns: {download: null}}, (h, e) => h('f3818')(e, 'safari'));
scenario('open download: external open fails', {openFails: true}, (h, e) => h('f3818')(e, 'chrome'));
scenario('open download: lookup throws', {returns: {download: () => {throw new Error('synthetic lookup');}}}, (h, e) => h('f3818')(e, 'chrome'));
scenario('open download: electron uninitialised', {holes: [22]}, (h, e) => h('f3818')(e, 'chrome'));
// DownloadBrahmos
const steps = [
  {downloading: true, received: 10, total: 100, step: 1, steps: 2, label: 'engine'}, {downloading: true, received: 20, total: 100, step: 1, steps: 2, label: 'engine'},
  {downloading: true, received: 100, total: 100, step: 1, steps: 2, label: 'engine'}, {downloading: false, received: 5, total: 0, step: 2, steps: 2, label: 'engine'},
  {downloading: false, received: 50, total: 80, step: 2, steps: 2, label: 'engine'}, {downloading: 0, received: 1, total: 4, step: 2, steps: 2, label: 'tools'},
];
const play = (list, then) => (onProgress) => {for (const item of list) onProgress(item); return then?.();};
scenario('brahmos success with progress', {returns: {install: play(steps)}}, (h, e) => h('f3819')(e));
scenario('brahmos progress faster than the throttle', {times: [1000, 1001, 1002, 1003, 1004, 1005, 1006], returns: {install: play(steps)}}, (h, e) => h('f3819')(e));
scenario('brahmos throttle boundary of exactly 100 ms', {times: [1000, 1100, 1200, 1299, 1300, 1301], returns: {install: play(steps)}}, (h, e) => h('f3819')(e));
scenario('brahmos progress beyond the total', {returns: {install: play([{downloading: true, received: 250, total: 100, step: 1, steps: 1, label: 'x'}, {downloading: false, received: 9, total: 3, step: 3, steps: 2, label: 'y'}])}}, (h, e) => h('f3819')(e));
scenario('brahmos progress beyond the total over several steps', {returns: {install: play([{downloading: true, received: 250, total: 100, step: 1, steps: 4, label: 'x'}])}}, (h, e) => h('f3819')(e));
scenario('a second download while the first runs is refused', {returns: {install: () => new Promise(resolve => setTimeout(resolve, 20))}}, async (h, e) => {
  const first = h('f3819')(e);
  const second = await h('f3819')(e);
  return [second, await first];
});
scenario('brahmos progress with a total of exactly one', {returns: {install: play([{downloading: true, received: 1, total: 1, step: 1, steps: 2, label: 'x'}, {downloading: false, received: 0, total: 1, step: 2, steps: 2, label: 'y'}])}}, (h, e) => h('f3819')(e));
scenario('brahmos no progress', {}, (h, e) => h('f3819')(e));
scenario('brahmos busy', {busy: true}, (h, e) => h('f3819')(e));
scenario('brahmos busy flag uninitialised', {holes: [1965]}, (h, e) => h('f3819')(e));
scenario('brahmos install fails', {returns: {install: () => Promise.reject(new Error('disk full'))}}, (h, e) => h('f3819')(e));
scenario('brahmos install fails with a secret in the message', {returns: {install: () => {throw new Error('token secret leaked');}}}, (h, e) => h('f3819')(e));
scenario('brahmos install fails without a message', {returns: {install: () => Promise.reject({})}}, (h, e) => h('f3819')(e));
scenario('brahmos install fails and sanitising empties the message', {returns: {install: () => Promise.reject(new Error('x')), sanitize: () => ''}}, (h, e) => h('f3819')(e));
scenario('brahmos sanitiser throws', {returns: {install: () => Promise.reject(new Error('x')), sanitize: () => {throw new Error('synthetic sanitiser');}}}, (h, e) => h('f3819')(e));
scenario('brahmos sender destroyed', {senderDestroyed: true, returns: {install: play(steps)}}, (h, e) => h('f3819')(e));
scenario('brahmos channel names uninitialised', {holes: [336]}, (h, e) => h('f3819')(e));
scenario('brahmos log fails', {returns: {log: () => {throw new Error('synthetic log');}}}, (h, e) => h('f3819')(e));
// GetBrowserDownloads
scenario('downloads list', {}, (h, e) => h('f3825')(e));
scenario('downloads none installed', {returns: {detect: []}}, (h, e) => h('f3825')(e));
scenario('downloads empty catalogue', {returns: {catalog: []}}, (h, e) => h('f3825')(e));
scenario('downloads detect fails', {returns: {detect: () => Promise.reject(new Error('synthetic detect'))}}, (h, e) => h('f3825')(e));
scenario('downloads catalogue fails', {returns: {catalog: () => {throw new Error('synthetic catalogue');}}}, (h, e) => h('f3825')(e));
// logs and tickets
scenario('getLogs', {}, (h, e) => h('f3831')(e));
scenario('getLogs is a copy', {}, async (h, e, env) => {const r = await h('f3831')(e); r.data.push('extra'); return [r.data.length, env.slots[1867].length];});
scenario('getLogs buffer uninitialised', {holes: [1867]}, (h, e) => h('f3831')(e));
scenario('getLogPairs', {}, (h, e) => h('f3832')(e));
scenario('openSuccessTicket', {}, (h, e) => h('f3861')(e, 'pnr-1', {train: '12345'}));
scenario('openSuccessTicket overwrites', {tickets: [['pnr-1', 'old']]}, (h, e) => [h('f3861')(e, 'pnr-1', 'new'), h('f3862')(e, 'pnr-1')]);
scenario('openSuccessTicket window fails', {returns: {showTicket: () => {throw new Error('synthetic window');}}}, (h, e) => h('f3861')(e, 'k', 'v'));
scenario('openSuccessTicket store uninitialised', {holes: [1940]}, (h, e) => h('f3861')(e, 'k', 'v'));
scenario('getSuccessTicket known', {tickets: [['pnr-1', {train: '12345'}]]}, (h, e) => h('f3862')(e, 'pnr-1'));
scenario('getSuccessTicket unknown', {}, (h, e) => h('f3862')(e, 'nope'));
scenario('getSuccessTicket stored undefined and null', {tickets: [['u', undefined], ['n', null], ['z', 0]]}, (h, e) => [h('f3862')(e, 'u'), h('f3862')(e, 'n'), h('f3862')(e, 'z')]);
// ExportLogs
for (const formIds of [undefined, null, [], ['f1'], ['f1', 'f2'], ['nope'], ['f3']])
  for (const [mode, options] of [['encrypted', {}], ['plain preferred', {noKey: true}], ['plain, full trail', {noKey: true, returns: {plain: false}}]])
    for (const parent of [false, true])
      scenario('exportLogs / ' + JSON.stringify(formIds) + ' / ' + mode + (parent ? ' / with parent' : ''), {...options, parent}, (h, e) => h('f3863')(e, formIds));
scenario('exportLogs cancelled', {dialog: {canceled: true}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs cancelled with a path', {dialog: {canceled: true, filePath: '/out/x.json'}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs no path', {dialog: {canceled: false}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs empty path', {dialog: {canceled: false, filePath: ''}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs encryption throws', {returns: {encrypt: () => {throw new Error('synthetic encrypt');}}}, (h, e) => h('f3863')(e, undefined));
for (const [name, envelope] of Object.entries({noK: {ct: 'c', iv: 'i', tag: 't'}, noCt: {k: 'k', iv: 'i', tag: 't'}, noIv: {k: 'k', ct: 'c', tag: 't'}, noTag: {k: 'k', ct: 'c', iv: 'i'}, complete: {k: 'k', ct: 'c', iv: 'i', tag: 't'}}))
  scenario('exportLogs envelope ' + name, {returns: {encrypt: () => envelope}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs plain ignores the envelope check', {noKey: true}, (h, e) => h('f3863')(e, ['f1']));
for (const failing of ['openFails', 'writeFails', 'fsyncFails', 'renameFails', 'dirFails', 'closeFails', 'readFails', 'rmFails'])
  scenario('exportLogs / ' + failing, {[failing]: true}, (h, e) => h('f3863')(e, undefined));
for (const bad of ['zeroFill', 'shortWrite', 'corrupt']) {
  scenario('exportLogs / ' + bad, {[bad]: true}, (h, e) => h('f3863')(e, undefined));
  scenario('exportLogs / ' + bad + ' and removal fails', {[bad]: true, rmFails: true}, (h, e) => h('f3863')(e, undefined));
}
scenario('exportLogs replaces an existing file', {existing: '/out/log.json'}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs failure removes the existing file too', {existing: '/out/log.json', writeFails: true}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs after-export hook throws', {returns: {afterExport: () => {throw new Error('synthetic hook');}}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs unserialisable log', {noKey: true, pairs: [{pair: 1, label: 'x', formId: 'f1', big: 10n}]}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs log buffers uninitialised', {holes: [1869], returns: {plain: false}}, (h, e) => h('f3863')(e, undefined));
scenario('exportLogs without electron', {holes: [22]}, (h, e) => h('f3863')(e, undefined));

test('every reviewed handler has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f3817', 'f3818', 'f3819', 'f3825', 'f3831', 'f3832', 'f3861', 'f3862', 'f3863']) assert.equal(typeof factories[id], 'function', id);
  assert.equal(factories.f3822, undefined, 'DownloadChromeAdvance (f3822) is deliberately not migrated');
});
