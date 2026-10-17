'use strict';
// Compares the reconstructed window-management IPC handlers (src/ts/main/windows/window-ipc.ts) with the recovered
// handlers f4273-f4295 on identical synthetic scenarios: fake windows and screens, traced bootstrap helpers, a fake
// file system and a scripted clock. No window is created, nothing is opened, printed or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => {
  if (typeof value === 'function') return 'fn';
  if (value && typeof value === 'object') {
    if (value.__window) return 'win#' + value.id;
    if (value.__contents) return 'contents#' + value.id;
    try {return JSON.parse(JSON.stringify(value));} catch {return 'object';}
  }
  return value;
};

function world(options = {}) {
  const trace = [];
  const rec = (name, ...args) => trace.push([name, ...args.map(summary)]);
  let contentsId = 0;
  const makeContents = (owner, destroyed = false) => ({
    __contents: true, id: ++contentsId, destroyed, url: owner.url ?? 'file:///app/form.html', mainFrame: {frame: owner.id},
    isDestroyed() {rec('contents.isDestroyed', this); return this.destroyed;},
    send(channel, payload) {rec('contents.send', channel, payload);},
    getURL() {rec('contents.getURL', this); return this.url;},
    setZoomFactor(factor) {rec('contents.setZoom', factor); this.zoom = factor;},
    invalidate() {rec('contents.invalidate', this);},
    executeJavaScript(code) {rec('contents.exec', code); return options.execFails ? Promise.reject(new Error('synthetic exec')) : Promise.resolve(true);},
    printToPDF(printOptions) {rec('contents.pdf', printOptions); return options.pdfFails ? Promise.reject(new Error('synthetic pdf')) : Promise.resolve('PDFDATA');},
  });
  const windows = [];
  const makeWindow = (spec = {}) => {
    const window = {
      __window: true, id: spec.id ?? windows.length + 1, title: spec.title ?? 'Window', url: spec.url, destroyed: !!spec.destroyed,
      bounds: spec.bounds ?? {x: 100, y: 120, width: 400, height: 300}, position: spec.position ?? [100, 120], resizable: spec.resizable ?? true, closed: false,
      isDestroyed() {rec('win.isDestroyed', this); return this.destroyed;},
      getBounds() {rec('win.getBounds', this); return {...this.bounds};},
      getPosition() {rec('win.getPosition', this); return [...this.position];},
      setPosition(x, y) {rec('win.setPosition', this, x, y); this.position = [x, y]; this.bounds = {...this.bounds, x, y};},
      setContentSize(w, h) {rec('win.setContentSize', this, w, h); this.bounds = {...this.bounds, width: w, height: h + 10};},
      isResizable() {rec('win.isResizable', this); return this.resizable;},
      setResizable(flag) {rec('win.setResizable', this, flag); this.resizable = flag;},
      getTitle() {rec('win.getTitle', this); return this.title;},
      close() {rec('win.close', this); this.closed = true;},
      destroy() {rec('win.destroy', this); this.destroyed = true;},
      loadFile(path) {rec('win.loadFile', this, path); return options.loadFails ? Promise.reject(new Error('synthetic load')) : Promise.resolve();},
    };
    window.webContents = makeContents(window, !!spec.contentsDestroyed);
    windows.push(window);
    return window;
  };
  const own = makeWindow({id: 1, title: 'Form', url: 'file:///app/form.html'});
  const controller = makeWindow({id: 2, title: 'Matrix', url: 'file:///app/controller.html'});
  const booking = makeWindow({id: 3, title: 'Booking'});
  const scan = makeWindow({id: 4, title: 'Scan to Pay'});
  const other = makeWindow({id: 5, title: 'Logs'});
  const gone = makeWindow({id: 6, title: 'Gone', destroyed: true});
  const trackedMap = new Map([[1, own]]);
  const BrowserWindow = function (constructorOptions) {
    rec('BrowserWindow.new', constructorOptions);
    return makeWindow({id: 90 + windows.length, title: 'hidden'});
  };
  BrowserWindow.fromWebContents = contents => {
    rec('BrowserWindow.fromWebContents', contents);
    if (options.noWindow) return null;
    return windows.find(window => window.webContents === contents) ?? null;
  };
  BrowserWindow.getAllWindows = () => {rec('BrowserWindow.getAllWindows'); return [...windows];};
  const electron = {
    BrowserWindow,
    screen: {getDisplayMatching(bounds) {rec('screen.getDisplayMatching', bounds); return {workArea: options.workArea ?? {x: 0, y: 0, width: 1920, height: 1040}};}},
    shell: {
      openExternal(url) {rec('shell.openExternal', url); return options.openFails ? Promise.reject(new Error('synthetic open')) : Promise.resolve();},
      showItemInFolder(path) {rec('shell.show', path);},
    },
    app: {getVersion() {rec('app.getVersion'); return '1.0.11';}, getPath(name) {rec('app.getPath', name); return '/desktop';}},
  };
  const files = new Set();
  const fs = {
    mkdtempSync(prefix) {rec('fs.mkdtemp', prefix); return prefix + 'abc';},
    writeFileSync(path, data, encoding) {rec('fs.write', path, data, encoding); if (options.writeFails) throw new Error('synthetic write'); files.add(path);},
    unlinkSync(path) {rec('fs.unlink', path); if (options.unlinkFails) throw new Error('synthetic unlink'); files.delete(path);},
    rmdirSync(path) {rec('fs.rmdir', path); if (options.rmdirFails) throw new Error('synthetic rmdir');},
  };
  const value = (name, fallback) => (options.returns && name in options.returns ? options.returns[name] : fallback);
  const helper = (slot, name, fallback) => (...args) => {rec(name + '#' + slot, ...args); const result = value(name, fallback); return typeof result === 'function' ? result(...args) : result;};
  const centred = new Set(options.centred ?? []);
  const slots = {
    22: options.holes?.includes(22) ? HOLE : electron, 18: fs,
    14: {join: (...parts) => parts.join('/')}, 13: {tmpdir: () => '/tmp'},
    1247: helper(1247, 'security', true), 1690: helper(1690, 'state', {message: 'locked by policy', latestVersion: options.latest}),
    253: options.holes?.includes(253) ? HOLE : (options.actions ?? ['new-form', 'logs']),
    2104: helper(2104, 'unlocked', false),
    2060: helper(2060, 'openNewForm', undefined), 2062: helper(2062, 'focusForm', undefined), 2059: helper(2059, 'openFormWindow', undefined),
    2070: helper(2070, 'openUtility', undefined), 2110: helper(2110, 'checkUpdate', {version: '2'}),
    2106: helper(2106, 'downloadUpdate', {ok: true, path: '/dl/setup.exe', name: 'setup.exe'}), 2123: helper(2123, 'installUpdate', {ok: true}),
    2115: options.holes?.includes(2115) ? HOLE : (options.updateWindow === undefined ? own : options.updateWindow),
    2118: helper(2118, 'downloading', true), 336: options.holes?.includes(336) ? HOLE : {UpdateProgress: 'update:progress'},
    2105: helper(2105, 'canOpen', true), 2065: helper(2065, 'blocked', false), 2068: helper(2068, 'openBox', undefined), 2067: helper(2067, 'noteBlocked', undefined),
    331: options.holes?.includes(331) ? HOLE : 'box limit reached', 271: helper(271, 'passengers', undefined), 1540: helper(1540, 'stage', undefined),
    1942: helper(1942, 'sizeLocked', false), 1945: helper(1945, 'reportLocked', undefined),
    2036: options.holes?.includes(2036) ? HOLE : {add: id => {rec('centred.add', id); centred.add(id);}, delete: id => {rec('centred.delete', id); centred.delete(id);}},
    2026: options.holes?.includes(2026) ? HOLE : 40, 2027: options.holes?.includes(2027) ? HOLE : 16,
    2039: options.holes?.includes(2039) ? HOLE : (options.controller === undefined ? controller : options.controller),
    2031: helper(2031, 'controllerSize', {width: 360, height: 120, zoom: 0.9}),
    2029: options.holes?.includes(2029) ? HOLE : 640, 2030: options.holes?.includes(2030) ? HOLE : 800,
    2063: options.holes?.includes(2063) ? HOLE : trackedMap,
    1929: helper(1929, 'enlargeQr', undefined), 1930: helper(1930, 'checkPayment', undefined),
    1911: helper(1911, 'ticketHtml', '<html>ticket</html>'), 205: helper(205, 'savePdf', '/desktop/ticket.pdf'),
    2055: helper(2055, 'requestQuit', undefined), 2131: helper(2131, 'confirmQuit', undefined),
  };
  const timers = [];
  const setTimeoutFake = (callback, ms) => {rec('setTimeout', ms); timers.push(ms); callback();};
  const platform = options.platform ?? 'win32';
  return {trace, slots, windows, windowsByName: {own, controller, booking, scan, other, gone}, centred, files, platform, setTimeoutFake, timers, rec};
}

function handlersFor(native, env) {
  const {engine, root} = harness({
    native, slots: env.slots,
    globals: {process: {platform: env.platform}, setTimeout: env.setTimeoutFake},
    dependencies: {platform: () => env.platform, setTimeout: env.setTimeoutFake},
  });
  const ctx = engine.context(4, root);
  ctx[2] = root[5];
  ctx[3] = engine.makeFunction('f4288', ctx);
  return id => engine.makeFunction(id, ctx);
}

// maskErrorText: the interpreter words a call of a non-function differently from V8 (documented failure-only difference).
function scenario(name, options, run, maskErrorText = false) {
  test('window IPC matches the recovered handlers: ' + name, async () => {
    const normalize = maskErrorText ? result => ({...result, value: {...result.value, value: {...result.value.value, error: typeof result.value.value?.error}}}) : undefined;
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const value = await outcome(async () => run(handler, env));
      return {
        value, trace: env.trace, centred: [...env.centred], files: [...env.files], timers: env.timers,
        windows: env.windows.map(window => ({id: window.id, pos: window.position, bounds: window.bounds, resizable: window.resizable, closed: window.closed, destroyed: window.destroyed, zoom: window.webContents.zoom})),
      };
    }, normalize);
  });
}

const eventFor = (env, which = 'own', extra = {}) => ({sender: env.windowsByName[which].webContents, senderFrame: env.windowsByName[which].webContents.mainFrame, ...extra});

// f4273 controller actions
for (const action of ['new-form', 'open-form', 'login-data', 'payment', 'proxy', 'history', 'tools', 'updates', 'logs', 'unknown', undefined]) {
  scenario('controllerAction / ' + String(action), {actions: ['new-form', 'open-form', 'login-data', 'payment', 'proxy', 'history', 'tools', 'updates', 'logs']}, (h, env) => h('f4273')(eventFor(env), action));
  scenario('controllerAction not listed but unlocked / ' + String(action), {actions: [], returns: {unlocked: true}}, (h, env) => h('f4273')(eventFor(env), action));
  scenario('controllerAction not listed and locked / ' + String(action), {actions: []}, (h, env) => h('f4273')(eventFor(env), action));
}
scenario('controllerAction security check fails', {returns: {security: false}}, (h, env) => h('f4273')(eventFor(env), 'logs'));
scenario('controllerAction action list uninitialised', {holes: [253]}, (h, env) => h('f4273')(eventFor(env), 'logs'));

// f4274 / f4275 / f4277 updates
scenario('checkUpdateNow', {}, h => h('f4274')({}));
scenario('checkUpdateNow rejects', {returns: {checkUpdate: () => Promise.reject(new Error('synthetic check'))}}, h => h('f4274')({}));
for (const platform of ['win32', 'linux', 'darwin']) {
  scenario('downloadUpdate / ' + platform + ' / explicit asset', {platform}, (h, env) => h('f4275')(eventFor(env), 'v2.0.1'));
  scenario('downloadUpdate / ' + platform + ' / latest version from state', {platform, latest: 'v3.1.0'}, (h, env) => h('f4275')(eventFor(env), undefined));
  scenario('downloadUpdate / ' + platform + ' / installed version fallback', {platform}, (h, env) => h('f4275')(eventFor(env), ''));
  scenario('downloadUpdate / ' + platform + ' / failure with error', {platform, returns: {downloadUpdate: {ok: false, error: 'disk full'}, installUpdate: {ok: false, error: 'disk full'}}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
  scenario('downloadUpdate / ' + platform + ' / failure without error', {platform, returns: {downloadUpdate: {ok: false}, installUpdate: {ok: false}}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
  scenario('downloadUpdate / ' + platform + ' / incomplete result', {platform, returns: {downloadUpdate: {ok: true, path: '/x'}}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
  scenario('downloadUpdate / ' + platform + ' / helper throws', {platform, returns: {downloadUpdate: () => {throw new Error('synthetic download');}, installUpdate: () => Promise.reject(new Error('synthetic install'))}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
}
scenario('downloadUpdate reports progress to a live sender', {platform: 'linux', returns: {downloadUpdate: (asset, progress) => {progress(0.5, 50, 100); progress(1, 100, 100); return {ok: true, path: '/p', name: 'n'};}}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
scenario('downloadUpdate skips progress for a destroyed sender', {platform: 'linux', returns: {downloadUpdate: (asset, progress) => {progress(0.5, 50, 100); return {ok: true, path: '/p', name: 'n'};}}}, (h, env) => {
  env.windowsByName.own.webContents.destroyed = true;
  return h('f4275')(eventFor(env), 'v2');
});
scenario('downloadUpdate progress channel uninitialised', {platform: 'linux', holes: [336], returns: {downloadUpdate: (asset, progress) => {progress(0.5, 50, 100); return {ok: true, path: '/p', name: 'n'};}}}, (h, env) => h('f4275')(eventFor(env), 'v2'));
scenario('downloadUpdate non-string asset', {platform: 'win32'}, (h, env) => h('f4275')(eventFor(env), 12), true);
for (const [name, options, build] of [
  ['owner', {}, env => eventFor(env, 'own')],
  ['other sender', {}, env => eventFor(env, 'other')],
  ['owner but other frame', {}, env => eventFor(env, 'own', {senderFrame: {other: true}})],
  ['no download window', {updateWindow: null}, env => eventFor(env, 'own')],
  ['download window destroyed', {updateWindow: 'destroyed'}, env => eventFor(env, 'own')],
  ['no longer downloading', {returns: {downloading: false}}, env => eventFor(env, 'own')],
  ['window slot uninitialised', {holes: [2115]}, env => eventFor(env, 'own')],
]) scenario('cancelUpdateDownload / ' + name, options.updateWindow === 'destroyed' ? {...options, updateWindow: undefined, returns: {...options.returns}} : options, (h, env) => {
  if (options.updateWindow === 'destroyed') env.windowsByName.own.destroyed = true;
  return h('f4277')(build(env));
});

// f4278 - f4280 windows
scenario('openFormWindow', {}, (h, env) => h('f4278')(eventFor(env), {formId: 'a'}));
scenario('openFormWindow security fails', {returns: {security: false}}, (h, env) => h('f4278')(eventFor(env), {formId: 'a'}));
scenario('openBookingBox opens', {}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
scenario('openBookingBox blocked', {returns: {blocked: true}}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
scenario('openBookingBox blocked message uninitialised', {returns: {blocked: true}, holes: [331]}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
scenario('openBookingBox not allowed', {returns: {canOpen: false}}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
scenario('openBookingBox security fails', {returns: {security: false}}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
scenario('openBookingBox helper rejects', {returns: {canOpen: () => Promise.reject(new Error('synthetic can-open'))}}, (h, env) => h('f4279')(eventFor(env), 'form-1'));
for (const [name, form, options] of [
  ['valid', {id: 'x', passengers: [{name: 'A'}]}, {}],
  ['no passengers field', {id: 'x'}, {}],
  ['passenger problem', {id: 'x', passengers: []}, {returns: {passengers: 'Add at least one passenger'}}],
  ['blocked', {id: 'x', passengers: [{name: 'A'}]}, {returns: {blocked: true}}],
  ['not allowed', {id: 'x', passengers: []}, {returns: {canOpen: false}}],
  ['security fails', {id: 'x', passengers: []}, {returns: {security: false}}],
]) scenario('openBookingBoxTransient / ' + name, options, (h, env) => h('f4280')(eventFor(env), form));

// f4281 resize
for (const [name, center, options] of [
  ['default', undefined, {}], ['centre', {center: true}, {}], ['centre false', {center: false}, {}], ['null options', null, {}],
  ['near bottom edge', undefined, {workArea: {x: 0, y: 0, width: 1920, height: 400}}],
  ['above top edge', undefined, {workArea: {x: 0, y: 500, width: 1920, height: 1040}}],
  ['centre on a secondary display', {center: true}, {workArea: {x: 1920, y: 0, width: 1280, height: 720}}],
  ['centre bigger than the display', {center: true}, {workArea: {x: 0, y: 0, width: 200, height: 100}}],
  ['no window', undefined, {noWindow: true}],
  ['size locked', undefined, {returns: {sizeLocked: true}}],
  ['previously centred window', undefined, {centred: [1]}],
  ['centred set uninitialised', undefined, {holes: [2036]}],
  ['margin uninitialised', undefined, {holes: [2026]}],
])
  for (const [width, height] of [[800.4, 600.6], [300, 200]])
    scenario('resizeSelf / ' + name + ' / ' + width + 'x' + height, options, (h, env) => h('f4281')(eventFor(env), width, height, center));

// f4282 repaint (sync)
for (const platform of ['darwin', 'win32', 'linux'])
  for (const [name, mutate] of [
    ['tracked window', () => {}],
    ['untracked window', env => {env.slots[2063].clear(); env.slots[2063].set(2, env.windowsByName.controller);}],
    ['destroyed window', env => {env.windowsByName.own.destroyed = true;}],
    ['destroyed contents', env => {env.windowsByName.own.webContents.destroyed = true;}],
  ])
    scenario('repaintSelf / ' + platform + ' / ' + name, {platform}, (h, env) => {mutate(env); return h('f4282')(eventFor(env));});
scenario('repaintSelf no window', {platform: 'darwin', noWindow: true}, (h, env) => h('f4282')(eventFor(env)));
scenario('repaintSelf windows map uninitialised', {platform: 'darwin', holes: [2063]}, (h, env) => h('f4282')(eventFor(env)));

// f4284 / f4285 / f4286 / f4287
scenario('enlargeQr', {}, (h, env) => h('f4284')(eventFor(env), {src: 'x'}));
scenario('checkNowPayment', {}, (h, env) => h('f4285')(eventFor(env), 'pnr'));
for (const expanded of [false, true, undefined, 1])
  for (const [name, options] of [
    ['tracked controller', {}], ['no tracked controller', {controller: null}], ['tracked controller destroyed', {controller: 'destroyed'}],
    ['not resizable', {}], ['no window at all', {controller: null, noWindow: true}], ['small display', {workArea: {x: 50, y: 30, width: 500, height: 400}}],
  ])
    scenario('controllerMinimize / ' + String(expanded) + ' / ' + name, options.controller === 'destroyed' ? {...options, controller: undefined} : options, (h, env) => {
      if (options.controller === 'destroyed') env.windowsByName.controller.destroyed = true;
      if (name === 'not resizable') for (const window of env.windows) window.resizable = false;
      return h('f4286')(eventFor(env, 'own'), expanded);
    });
scenario('controllerMinimize expanded size uninitialised', {holes: [2029]}, (h, env) => h('f4286')(eventFor(env), true));
scenario('controllerMinimize edge margin uninitialised', {holes: [2027]}, (h, env) => h('f4286')(eventFor(env), true));
for (const link of ['https://example.org/a?b=1', 'http://example.org', 'tg://resolve?domain=x', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', '', undefined, 12, 'ftp://example.org'])
  scenario('openExternal / ' + String(link), {}, (h, env) => h('f4287')(eventFor(env), link));
scenario('openExternal open fails', {openFails: true}, (h, env) => h('f4287')(eventFor(env), 'https://example.org'));

// f4288 / f4291 print
scenario('printTicket success', {}, (h, env) => h('f4291')(eventFor(env), {pnr: '1234567890', train: '12345'}));
for (const ticket of [undefined, null, {}, {pnr: ''}, {pnr: 0}])
  scenario('printTicket without a PNR / ' + JSON.stringify(ticket), {}, (h, env) => h('f4291')(eventFor(env), ticket));
for (const failing of ['loadFails', 'execFails', 'pdfFails', 'writeFails', 'unlinkFails', 'rmdirFails'])
  scenario('printTicket / ' + failing, {[failing]: true}, (h, env) => h('f4291')(eventFor(env), {pnr: '1'}));
scenario('printTicket html helper rejects', {returns: {ticketHtml: () => Promise.reject(new Error('synthetic html'))}}, (h, env) => h('f4291')(eventFor(env), {pnr: '1'}));
scenario('printTicket save helper throws', {returns: {savePdf: () => {throw new Error('synthetic save');}}}, (h, env) => h('f4291')(eventFor(env), {pnr: '1'}));
scenario('renderTicketPdf directly', {}, (h) => h('f4288')({pnr: '9'}));

// f4292 .. f4295
scenario('closeAuxWindows', {}, (h, env) => h('f4292')(eventFor(env, 'own')));
scenario('closeAuxWindows from another window', {}, (h, env) => h('f4292')(eventFor(env, 'other')));
scenario('closeAuxWindows controller slot cleared', {controller: null}, (h, env) => h('f4292')(eventFor(env, 'own')));
scenario('closeAuxWindows controller slot uninitialised', {holes: [2039]}, (h, env) => h('f4292')(eventFor(env, 'own')));
scenario('closeAuxWindows sender without a window', {noWindow: true}, (h, env) => h('f4292')(eventFor(env, 'own')));
scenario('requestQuit', {}, h => h('f4293')({}));
scenario('confirmQuit', {}, h => h('f4294')({}));
scenario('restartApp', {}, h => h('f4295')({}));

test('every reviewed window IPC handler has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f4273', 'f4274', 'f4275', 'f4277', 'f4278', 'f4279', 'f4280', 'f4281', 'f4282', 'f4284', 'f4285', 'f4286', 'f4287', 'f4288', 'f4291', 'f4292', 'f4293', 'f4294', 'f4295']) assert.equal(typeof factories[id], 'function', id);
});
