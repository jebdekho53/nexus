'use strict';
// Compares the reconstructed window creators (src/ts/main/windows/window-factory.ts) with the recovered root functions f4099,
// f4105, f4112, f4128 and f4132 on identical synthetic scenarios: a fake BrowserWindow constructor that records the options it was
// given and the listeners registered on it, traced bootstrap helpers, and deterministic state. After a window is created its
// listeners are fired and the resulting state and traces are compared too. No real window is created.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => {
  if (typeof value === 'function') return 'fn';
  if (value && typeof value === 'object') { if (value.__window) return 'win#' + value.id; try {return JSON.parse(JSON.stringify(value));} catch {return 'object';} }
  return value;
};

function world(options = {}) {
  const trace = [];
  const rec = (label, ...args) => trace.push([label, ...args.map(summary)]);
  const value = (label, fallback) => (options.returns && label in options.returns ? options.returns[label] : fallback);
  const call = (label, fallback) => (...args) => {rec(label, ...args); const r = value(label, fallback); return typeof r === 'function' ? r(...args) : r;};
  const created = [];
  let nextId = 100;
  function BrowserWindow(constructorOptions) {
    this.__window = true;
    this.id = ++nextId;
    this.destroyed = false;
    this.listeners = new Map();
    this.contentsListeners = new Map();
    rec('BrowserWindow.new', constructorOptions);
    const self = this;
    this.webContents = {
      on(event, listener) {rec('contents.on', self.id, event); self.contentsListeners.set(event, listener);},
      setZoomFactor(factor) {rec('contents.setZoomFactor', self.id, factor);},
    };
    created.push(this);
  }
  BrowserWindow.prototype.isDestroyed = function () {rec('win.isDestroyed', this.id); return this.destroyed;};
  BrowserWindow.prototype.show = function () {rec('win.show', this.id);};
  BrowserWindow.prototype.hide = function () {rec('win.hide', this.id);};
  BrowserWindow.prototype.destroy = function () {rec('win.destroy', this.id); this.destroyed = true;};
  BrowserWindow.prototype.on = function (event, listener) {rec('win.on', this.id, event); this.listeners.set(event, listener);};
  const existing = spec => {
    const window = new BrowserWindow({existing: true});
    trace.length = 0; created.length = 0;
    window.destroyed = !!spec?.destroyed;
    return window;
  };
  const workArea = options.workArea ?? {x: 0, y: 0, width: 1920, height: 1040};
  const electron = {
    BrowserWindow,
    screen: {getPrimaryDisplay() {rec('getPrimaryDisplay'); return {workArea};}},
    dialog: {showErrorBox(title, text) {rec('showErrorBox', title, text); if (options.errorBoxThrows) throw new Error('synthetic dialog');}},
  };
  const registry = new Map();
  const state = {
    2039: options.controller === undefined ? null : existing(options.controller),
    2050: options.confirm === undefined ? null : existing(options.confirm),
    2061: options.openForm === undefined ? null : existing(options.openForm),
    2051: options.ready ?? false, 2052: options.showWhenReady ?? false, 1971: options.quitting ?? false,
    2041: options.crashes ?? [], 2042: options.crashLimit ?? 3, 2043: options.crashWindow ?? 60000,
  };
  for (const [key, spec] of options.registry ?? []) registry.set(key, existing(spec));
  const slots = {
    22: options.holes?.includes(22) ? HOLE : electron, 14: options.holes?.includes(14) ? HOLE : {join: (...parts) => parts.join('|')}, 2: 'C:/app/src/main',
    1972: options.holes?.includes(1972) ? HOLE : (options.devTools ?? false), 2027: options.holes?.includes(2027) ? HOLE : 16,
    2058: options.holes?.includes(2058) ? HOLE : registry,
    2031: call('controllerSize', workArea_ => ({width: Math.min(420, workArea_.width), height: 640, zoom: options.zoom ?? 1})),
    2032: call('placement', (w, h, align) => ({x: 5, y: 6, width: w, height: h, align})),
    2038: call('loadPage', undefined), 2040: call('place', undefined), 2057: call('keepOnTop', undefined), 2056: call('applySettings', undefined),
    1771: call('setPin', undefined), 1770: call('pinned', options.pinned ?? false), 1623: call('newTheme', 'theme-flag'), 1624: call('splashTheme', 'splash-flag'),
    2044: call('recreate', undefined), 2054: call('showController', undefined),
  };
  for (const slot of [2039, 2050, 2061, 2051, 2052, 1971, 2041, 2042, 2043]) slots[slot] = options.holes?.includes(slot) ? HOLE : state[slot];
  return {trace, slots, created, registry, existing};
}

function scenario(name, options, run) {
  test('window creators match the recovered functions: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const clock = {now: () => 1000000 + (options.clockStep ?? 0)};
      const {rootFunction, root} = harness({native, slots: env.slots, globals: {Date: clock}, dependencies: {now: clock.now}});
      const result = await outcome(async () => run(rootFunction, env, root));
      const rootState = {};
      for (const slot of [2039, 2050, 2061, 2051, 2052, 2041]) rootState[slot] = root[slot] === HOLE ? 'HOLE' : (root[slot] && root[slot].__window ? 'win#' + root[slot].id : root[slot]);
      return {result, trace: env.trace, rootState, registry: [...env.registry].map(([key, window]) => [key, window.id]), created: env.created.map(window => window.id)};
    });
  });
}

const fire = (window, event, ...args) => { const listener = window.listeners.get(event); return listener ? listener(...args) : 'no-listener'; };
const fireContents = (window, event, ...args) => { const listener = window.contentsListeners.get(event); return listener ? listener(...args) : 'no-listener'; };
const preventable = () => ({defaultPrevented: false, preventDefault() {this.defaultPrevented = true;}});

// f4099 controller
scenario('controller: new', {}, f => f('f4099')());
scenario('controller: new on a narrow screen (zoomed)', {zoom: 0.8, workArea: {x: 0, y: 0, width: 360, height: 700}}, f => f('f4099')());
scenario('controller: with dev tools and a pinned setting', {devTools: true, pinned: 'on'}, f => f('f4099')());
scenario('controller: existing alive', {controller: {}}, f => f('f4099')());
scenario('controller: existing destroyed', {controller: {destroyed: true}}, f => f('f4099')());
scenario('controller: events', {zoom: 0.5}, (f, env) => {
  const window = f('f4099')();
  return [fire(window, 'ready-to-show'), fireContents(window, 'did-finish-load'), fire(window, 'closed')];
});
scenario('controller: closed after another window replaced it', {}, (f, env, root) => {
  const window = f('f4099')();
  root[2039] = {other: true};
  return fire(window, 'closed');
});
scenario('controller: renderer gone, first time', {}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone while quitting', {quitting: true}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone, window already destroyed', {}, (f, env) => { const w = f('f4099')(); w.destroyed = true; return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone, a recent crash recorded', {crashes: [999500, 10], clockStep: 0}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone at the crash limit', {crashes: [999000, 999100, 999200]}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone just under the crash limit', {crashes: [999000, 999100]}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone at the limit, error box fails', {crashes: [999000, 999100, 999200], errorBoxThrows: true}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: crash exactly at the time window edge', {crashes: [940000, 940001], crashWindow: 60000, crashLimit: 2}, (f, env) => { const w = f('f4099')(); return fireContents(w, 'render-process-gone'); });
scenario('controller: renderer gone replaced by another window first', {}, (f, env, root) => { const w = f('f4099')(); root[2039] = {other: true}; return fireContents(w, 'render-process-gone'); });
for (const hole of [22, 2027, 14, 1972, 2039, 2041])
  scenario('controller: binding ' + hole + ' uninitialised', {holes: [hole]}, f => f('f4099')());
for (const hole of [1971, 2041, 2042, 2043, 2039])
  scenario('controller: crash binding ' + hole + ' uninitialised', {holes: [hole]}, (f, env, root) => {
    const saved = Object.fromEntries([1971, 2041, 2042, 2043, 2039].map(slot => [slot, root[slot]]));
    for (const slot of Object.keys(saved)) root[slot] = slot == hole ? HOLE : (slot == 2039 ? null : saved[slot]);
    const w = f('f4099')();
    for (const slot of Object.keys(saved)) root[slot] = slot == hole ? HOLE : saved[slot];
    return fireContents(w, 'render-process-gone');
  });
// f4105 splash
scenario('splash', {}, f => f('f4105')());
scenario('splash events', {}, f => { const w = f('f4105')(); return fire(w, 'ready-to-show'); });
scenario('splash with dev tools', {devTools: 'yes'}, f => f('f4105')());
for (const hole of [22, 14, 1972]) scenario('splash: binding ' + hole + ' uninitialised', {holes: [hole]}, f => f('f4105')());
scenario('splash placement fails', {returns: {place: () => {throw new Error('synthetic place');}}}, f => f('f4105')());
// f4112 confirm quit
scenario('confirm-quit: new', {}, f => f('f4112')());
scenario('confirm-quit: existing alive', {confirm: {}}, f => f('f4112')());
scenario('confirm-quit: existing destroyed', {confirm: {destroyed: true}, ready: true}, f => f('f4112')());
scenario('confirm-quit: events when not quitting', {}, f => { const w = f('f4112')(); const e = preventable(); return [fire(w, 'close', e), e.defaultPrevented, fire(w, 'ready-to-show'), fire(w, 'closed')]; });
scenario('confirm-quit: close while quitting', {quitting: true}, f => { const w = f('f4112')(); const e = preventable(); return [fire(w, 'close', e), e.defaultPrevented]; });
scenario('confirm-quit: ready when someone is waiting', {showWhenReady: true}, f => { const w = f('f4112')(); return fire(w, 'ready-to-show'); });
scenario('confirm-quit: ready when nobody is waiting', {showWhenReady: false}, f => { const w = f('f4112')(); return fire(w, 'ready-to-show'); });
scenario('confirm-quit: closed resets the flags', {ready: true}, (f, env, root) => { const w = f('f4112')(); fire(w, 'ready-to-show'); fire(w, 'closed'); return [root[2050], root[2051]]; });
for (const hole of [22, 2051, 2050, 14, 1972]) scenario('confirm-quit: binding ' + hole + ' uninitialised', {holes: [hole]}, f => f('f4112')());
scenario('confirm-quit: events with bindings uninitialised later', {}, (f, env, root) => { const w = f('f4112')(); root[2050] = HOLE; return fire(w, 'closed'); });
scenario('confirm-quit: ready event with the ready flag uninitialised later', {}, (f, env, root) => { const w = f('f4112')(); root[2051] = HOLE; return fire(w, 'ready-to-show'); });
scenario('confirm-quit: ready event with the wait flag uninitialised later', {}, (f, env, root) => { const w = f('f4112')(); root[2052] = HOLE; return fire(w, 'ready-to-show'); });
scenario('confirm-quit: close event with the quitting flag uninitialised later', {}, (f, env, root) => { const w = f('f4112')(); root[1971] = HOLE; return fire(w, 'close', preventable()); });
// f4128 form window
for (const formId of [undefined, null, 'form-1', '', 0, 'x y'])
  for (const show of [undefined, true, false, 0])
    scenario(`form window: new / ${JSON.stringify(formId)} / show ${String(show)}`, {}, f => f('f4128')(formId, show));
scenario('form window: existing is reloaded and brought forward', {registry: [['form-1', {}]]}, f => f('f4128')('form-1'));
scenario('form window: existing is reloaded and left alone when show is false', {registry: [['form-1', {}]]}, f => f('f4128')('form-1', false));
scenario('form window: existing destroyed is replaced', {registry: [['form-1', {destroyed: true}]]}, f => f('f4128')('form-1'));
scenario('form window: the new-form key', {registry: [['__new__', {}]]}, f => f('f4128')());
scenario('form window: events', {}, f => { const w = f('f4128')('form-1', true); const e = preventable(); return [fire(w, 'ready-to-show'), fire(w, 'close', e), e.defaultPrevented, fire(w, 'closed')]; });
scenario('form window: events while quitting', {quitting: true}, f => { const w = f('f4128')('form-1', true); const e = preventable(); return [fire(w, 'close', e), e.defaultPrevented, fire(w, 'closed')]; });
scenario('form window: hidden window does not show when ready', {}, f => { const w = f('f4128')('form-1', false); return fire(w, 'ready-to-show'); });
scenario('form window: closed after the registry holds another window', {}, (f, env) => { const w = f('f4128')('form-1', true); env.registry.set('form-1', env.existing({})); return fire(w, 'closed'); });
for (const hole of [22, 2058, 14, 1972]) scenario('form window: binding ' + hole + ' uninitialised', {holes: [hole]}, f => f('f4128')('form-1'));
scenario('form window: placement fails', {returns: {placement: () => {throw new Error('synthetic placement');}}}, f => f('f4128')('form-1'));
scenario('form window: page load fails', {returns: {loadPage: () => {throw new Error('synthetic load');}}}, f => f('f4128')('form-1'));
// f4132 open-form window
for (const show of [undefined, true, false, 0, null])
  scenario('open-form window: new / show ' + String(show), {}, f => f('f4132')(show));
scenario('open-form window: existing alive, shown', {openForm: {}}, f => f('f4132')());
scenario('open-form window: existing alive, not shown', {openForm: {}}, f => f('f4132')(false));
scenario('open-form window: existing destroyed', {openForm: {destroyed: true}}, f => f('f4132')());
scenario('open-form window: events', {}, f => { const w = f('f4132')(true); const e = preventable(); return [fire(w, 'ready-to-show'), fire(w, 'close', e), e.defaultPrevented, fire(w, 'closed')]; });
scenario('open-form window: events while quitting, hidden', {quitting: true}, f => { const w = f('f4132')(false); const e = preventable(); return [fire(w, 'ready-to-show'), fire(w, 'close', e), e.defaultPrevented]; });
for (const hole of [22, 2061, 14, 1972]) scenario('open-form window: binding ' + hole + ' uninitialised', {holes: [hole]}, f => f('f4132')());
scenario('open-form window: closed with the binding uninitialised later', {}, (f, env, root) => { const w = f('f4132')(true); root[2061] = HOLE; return fire(w, 'closed'); });

test('every reviewed window creator has a factory; the passcode window stays recovered', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f4099', 'f4105', 'f4112', 'f4128', 'f4132']) assert.equal(typeof factories[id], 'function', id);
  assert.equal(factories.f4109, undefined);
});
