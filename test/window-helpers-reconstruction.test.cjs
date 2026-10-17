'use strict';
// Compares the reconstructed window helpers (src/ts/main/windows/window-helpers.ts) with the recovered root functions f3738,
// f3739, f4136, f4254, f4261 and f4262 on identical synthetic scenarios: fake windows, a fake QR store and booking registry, and
// traced bootstrap functions. No window is created and nothing is shown, hidden or sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => {
  if (typeof value === 'function') return 'fn';
  if (value && typeof value === 'object') { if (value.__window) return 'win#' + value.id; if (value.__error) return 'error:' + value.message; try {return JSON.parse(JSON.stringify(value));} catch {return 'object';} }
  return value;
};

function world(options = {}) {
  const trace = [];
  const rec = (label, ...args) => trace.push([label, ...args.map(summary)]);
  const value = (label, fallback) => (options.returns && label in options.returns ? options.returns[label] : fallback);
  const makeWindow = spec => {
    const window = {
      __window: true, id: spec.id, destroyed: !!spec.destroyed, visible: spec.visible !== false, contentsDestroyed: !!spec.contentsDestroyed,
      isDestroyed() {rec('win.isDestroyed', spec.id); if (spec.destroyedThrows) throw new Error('synthetic isDestroyed'); return this.destroyed;},
      isVisible() {rec('win.isVisible', spec.id); if (spec.visibleThrows) throw new Error('synthetic isVisible'); return this.visible;},
      hide() {rec('win.hide', spec.id); if (spec.hideThrows) throw new Error('synthetic hide'); this.visible = false;},
    };
    window.webContents = {
      isDestroyed() {rec('contents.isDestroyed', spec.id); if (spec.contentsDestroyedThrows) throw new Error('synthetic contents'); return window.contentsDestroyed;},
      send(channel, payload) {rec('contents.send', spec.id, channel, payload); if (spec.sendThrows) throw new Error('synthetic send');},
    };
    return window;
  };
  const windows = (options.windows ?? [{id: 1}, {id: 2, visible: false}, {id: 3, destroyed: true}, {id: 4}, {id: 5, hideThrows: true}, {id: 6, visibleThrows: true}]).map(makeWindow);
  const electron = {BrowserWindow: {getAllWindows() {rec('getAllWindows'); return windows;}}};
  const qrStore = new Map(options.qr ?? [['form-1', {dataUrl: 'data:image/png;base64,AAA', caption: 'Scan', amount: '₹10', account: 'acc-1'}], ['current', {dataUrl: 'data:x', caption: 'cur', amount: 5, account: undefined}], ['empty', {dataUrl: ''}], ['nourl', {caption: 'no url'}], ['nul', null]]);
  const bookingObject = id => ({triggerCheckNow() {rec('triggerCheckNow', id); if (options.checkThrows) throw new Error('synthetic check'); return 'checked';}});
  const bookings = new Map(options.bookings ?? [['b1', {booking: bookingObject('b1')}], ['b2', {booking: null}], ['b3', {}], ['b4', null], ['b5', {booking: {}}]]);
  const registry = new Map((options.registry ?? [[1, {id: 1}], [2, {id: 2, destroyed: true}], [3, {id: 3}], [4, {id: 4, destroyed: true}], [5, {id: 5}]]).map(([key, spec]) => [key, {isDestroyed() {rec('registry.isDestroyed', spec.id); if (spec.throws) throw new Error('synthetic registry'); return !!spec.destroyed;}}]));
  const controller = {abort(reason) {rec('abort', reason); if (options.abortThrows) throw new Error('synthetic abort');}};
  const slots = {
    1928: options.holes?.includes(1928) ? HOLE : {get: key => {rec('qr.get', key); return qrStore.get(key);}},
    1922: options.holes?.includes(1922) ? HOLE : (options.currentForm ?? 'current'),
    1932: (...args) => {rec('showQr', ...args); if (options.showThrows) throw new Error('synthetic show');},
    1537: options.holes?.includes(1537) ? HOLE : {get: key => {rec('bookings.get', key); return bookings.get(key);}},
    2063: options.holes?.includes(2063) ? HOLE : registry,
    2116: options.holes?.includes(2116) ? HOLE : (options.download === undefined ? {phase: 'download', controller} : options.download),
    2113: options.holes?.includes(2113) ? HOLE : (options.installing ?? false),
    22: options.holes?.includes(22) ? HOLE : electron,
    2115: options.holes?.includes(2115) ? HOLE : (options.updateWindowIndex === undefined ? null : windows[options.updateWindowIndex]),
    2117: options.holes?.includes(2117) ? HOLE : (options.cached ?? 'none'),
    336: options.holes?.includes(336) ? HOLE : {UpdateProgress: 'update:progress'},
  };
  return {trace, slots, windows, controller};
}

function scenario(name, options, run) {
  test('window helpers match the recovered functions: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const {rootFunction, root} = harness({native, slots: env.slots});
      const result = await outcome(async () => run(rootFunction, env));
      return {result, trace: env.trace, cached: root[2117] === HOLE ? 'HOLE' : root[2117], windows: env.windows.map(window => [window.id, window.visible])};
    });
  });
}

// f3738 show stored QR
for (const formId of ['form-1', 'current', 'empty', 'nourl', 'nul', 'unknown', undefined, null, '', 0])
  scenario('showStoredQr / ' + JSON.stringify(formId), {}, f => f('f3738')(formId));
scenario('showStoredQr with another default form', {currentForm: 'form-1'}, f => f('f3738')());
scenario('showStoredQr show fails', {showThrows: true}, f => f('f3738')('form-1'));
scenario('showStoredQr store uninitialised', {holes: [1928]}, f => f('f3738')('form-1'));
scenario('showStoredQr default uninitialised, id given', {holes: [1922]}, f => f('f3738')('form-1'));
scenario('showStoredQr default uninitialised, id missing', {holes: [1922]}, f => f('f3738')());
// f3739 check now
for (const formId of ['b1', 'b2', 'b3', 'b4', 'b5', 'nope', undefined, null, '', 0])
  scenario('checkNow / ' + JSON.stringify(formId), {}, f => f('f3739')(formId));
scenario('checkNow trigger fails', {checkThrows: true}, f => f('f3739')('b1'));
scenario('checkNow registry uninitialised, id given', {holes: [1537]}, f => f('f3739')('b1'));
scenario('checkNow registry uninitialised, id missing', {holes: [1537]}, f => f('f3739')());
// f4136 live windows
scenario('countLiveWindows', {}, f => f('f4136')());
scenario('countLiveWindows empty', {registry: []}, f => f('f4136')());
scenario('countLiveWindows all destroyed', {registry: [[1, {id: 1, destroyed: true}], [2, {id: 2, destroyed: true}]]}, f => f('f4136')());
scenario('countLiveWindows one throws', {registry: [[1, {id: 1}], [2, {id: 2, throws: true}], [3, {id: 3}]]}, f => f('f4136')());
scenario('countLiveWindows registry uninitialised', {holes: [2063]}, f => f('f4136')());
// f4254 cancel download
scenario('cancelActiveUpdateDownload while downloading', {}, f => f('f4254')());
for (const [name, download] of Object.entries({none: null, undefinedState: undefined, installPhase: {phase: 'install', controller: {abort() {}}}, noPhase: {controller: {abort() {}}}, donePhase: {phase: 'done'}, upper: {phase: 'Download', controller: {abort() {}}}}))
  scenario('cancelActiveUpdateDownload / ' + name, name === 'undefinedState' ? {download: undefined} : {download}, f => f('f4254')());
scenario('cancelActiveUpdateDownload already installing', {installing: true}, f => f('f4254')());
scenario('cancelActiveUpdateDownload installing flag truthy', {installing: 'yes'}, f => f('f4254')());
scenario('cancelActiveUpdateDownload abort fails', {abortThrows: true}, f => f('f4254')());
scenario('cancelActiveUpdateDownload without a controller', {download: {phase: 'download'}}, f => f('f4254')());
scenario('cancelActiveUpdateDownload state uninitialised', {holes: [2116]}, f => f('f4254')());
scenario('cancelActiveUpdateDownload installing flag uninitialised while downloading', {holes: [2113]}, f => f('f4254')());
scenario('cancelActiveUpdateDownload installing flag uninitialised but not downloading', {holes: [2113], download: null}, f => f('f4254')());
// f4261 hide other windows
scenario('hideOtherWindows', {}, (f, env) => f('f4261')(env.windows[0]));
scenario('hideOtherWindows no exception given', {}, f => f('f4261')());
scenario('hideOtherWindows exception is a hidden window', {}, (f, env) => f('f4261')(env.windows[1]));
scenario('hideOtherWindows exception is a destroyed window', {}, (f, env) => f('f4261')(env.windows[2]));
scenario('hideOtherWindows exception is unknown', {}, f => f('f4261')({}));
scenario('hideOtherWindows no windows', {windows: []}, f => f('f4261')());
scenario('hideOtherWindows all visible', {windows: [{id: 1}, {id: 2}, {id: 3}]}, (f, env) => f('f4261')(env.windows[1]));
scenario('hideOtherWindows isDestroyed throws', {windows: [{id: 1}, {id: 2, destroyedThrows: true}, {id: 3}]}, f => f('f4261')());
scenario('hideOtherWindows electron uninitialised', {holes: [22]}, f => f('f4261')());
// f4262 publish update progress
const progress = {fraction: 0.5, received: 50, total: 100};
scenario('publishUpdateProgress to the update window', {updateWindowIndex: 0}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress to another window', {updateWindowIndex: 0}, (f, env) => f('f4262')(env.windows[3], progress));
scenario('publishUpdateProgress no update window', {}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress to a destroyed window that is the update window', {updateWindowIndex: 2}, (f, env) => f('f4262')(env.windows[2], progress));
scenario('publishUpdateProgress contents destroyed', {updateWindowIndex: 0, windows: [{id: 1, contentsDestroyed: true}]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress send fails (ignored)', {updateWindowIndex: 0, windows: [{id: 1, sendThrows: true}]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress contents check fails (ignored)', {updateWindowIndex: 0, windows: [{id: 1, contentsDestroyedThrows: true}]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress window check fails (ignored)', {updateWindowIndex: 0, windows: [{id: 1, destroyedThrows: true}]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress cache uninitialised', {updateWindowIndex: 0, holes: [2117]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress cache uninitialised, other window', {holes: [2117]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress channels uninitialised', {updateWindowIndex: 0, holes: [336]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress window slot uninitialised', {holes: [2115]}, (f, env) => f('f4262')(env.windows[0], progress));
scenario('publishUpdateProgress with falsy progress values', {updateWindowIndex: 0}, (f, env) => [f('f4262')(env.windows[0], undefined), f('f4262')(env.windows[0], null), f('f4262')(env.windows[0], 0)]);

test('every reviewed window helper has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f3738', 'f3739', 'f4136', 'f4254', 'f4261', 'f4262']) assert.equal(typeof factories[id], 'function', id);
});
