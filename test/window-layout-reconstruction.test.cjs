'use strict';
// Compares the reconstructed window layout helpers (src/ts/main/windows/window-layout.ts) with the recovered root functions
// f4091, f4092, f4093, f4097, f4098, f4116, f4117, f4118, f4119 and f4127 on identical synthetic scenarios: fake windows,
// screens and listeners, and traced bootstrap functions. No window is created, moved or shown.
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
  const makeWindow = (spec = {}) => {
    const listeners = new Map();
    const window = {
      __window: true, id: spec.id, title: spec.title ?? 'Booking', destroyed: !!spec.destroyed, minimized: !!spec.minimized, visible: spec.visible !== false, focused: !!spec.focused, listeners,
      isDestroyed() {rec('win.isDestroyed', spec.id); if (spec.destroyedThrows) throw new Error('synthetic isDestroyed'); return this.destroyed;},
      getTitle() {rec('win.getTitle', spec.id); return this.title;},
      setPosition(x, y) {rec('win.setPosition', spec.id, x, y); if (spec.moveThrows) throw new Error('synthetic move');},
      setAlwaysOnTop(flag, level) {rec('win.setAlwaysOnTop', spec.id, flag, level);},
      setVisibleOnAllWorkspaces(visible, options_) {rec('win.setVisibleOnAllWorkspaces', spec.id, visible, options_);},
      isMinimized() {rec('win.isMinimized', spec.id); return this.minimized;},
      isVisible() {rec('win.isVisible', spec.id); return this.visible;},
      isFocused() {rec('win.isFocused', spec.id); return this.focused;},
      restore() {rec('win.restore', spec.id); this.minimized = false;},
      show() {rec('win.show', spec.id); this.visible = true;},
      center() {rec('win.center', spec.id);},
      focus() {rec('win.focus', spec.id);},
      moveTop() {rec('win.moveTop', spec.id);},
      on(event, listener) {rec('win.on', spec.id, event); listeners.set(event, listener);},
      loadFile(path, options_) {rec('win.loadFile', spec.id, path, options_); return 'loaded-file';},
      loadURL(url) {rec('win.loadURL', spec.id, url); return 'loaded-url';},
    };
    return window;
  };
  const windows = (options.windows ?? [{id: 7}, {id: 3}, {id: 5, title: 'Form'}, {id: 2, destroyed: true}, {id: 9}, {id: 4, moveThrows: true}, {id: 1}]).map(makeWindow);
  const workArea = options.workArea ?? {x: 10, y: 20, width: 1900, height: 1000};
  const electron = {
    screen: {getPrimaryDisplay() {rec('getPrimaryDisplay'); return {workArea};}},
    BrowserWindow: {getAllWindows() {rec('getAllWindows'); return windows;}},
    app: {focus(focusOptions) {rec('app.focus', focusOptions);}},
  };
  const placed = new Set(options.placed ?? [9]);
  const entries = (options.entries ?? [['main', 0], ['__new__', 0], ['gone', null], ['dead', 3], ['hidden', 2], ['also', 6]]).map(([name, index]) => [name, index === null ? null : windows[index]]);
  if (options.entries === undefined && windows[2]) windows[2].visible = false;
  const slots = {
    22: options.holes?.includes(22) ? HOLE : electron,
    2027: options.holes?.includes(2027) ? HOLE : (options.margin ?? 16), 2028: options.holes?.includes(2028) ? HOLE : (options.baseWidth ?? 420), 2026: options.holes?.includes(2026) ? HOLE : (options.baseHeight ?? 640),
    2036: options.holes?.includes(2036) ? HOLE : {has(id) {rec('placed.has', id); return placed.has(id);}},
    2033: options.holes?.includes(2033) ? HOLE : (options.tileWidth ?? 300), 2034: options.holes?.includes(2034) ? HOLE : (options.tileHeight ?? 200),
    1936: call('layoutApplied', undefined), 1945: call('layoutSettled', undefined),
    191: call('devServer', options.devServer), 2: options.mainDirectory ?? 'C:/app/src/main', 14: options.holes?.includes(14) ? HOLE : {join: (...parts) => parts.join('|')},
    2040: call('place', undefined), 2053: call('controller', () => windows[0]), 2051: options.holes?.includes(2051) ? HOLE : (options.ready ?? false), 2052: options.holes?.includes(2052) ? HOLE : false, 2054: call('showController', undefined),
    2058: options.holes?.includes(2058) ? HOLE : entries, 2056: call('applySettings', undefined),
  };
  return {trace, slots, windows, workArea};
}

function scenario(name, options, run) {
  test('window layout matches the recovered functions: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const platform = options.platform ?? 'win32';
      const {rootFunction, root} = harness({native, slots: env.slots, globals: {process: {platform}}, dependencies: {platform: () => platform}});
      const result = await outcome(async () => run(rootFunction, env));
      return {result, trace: env.trace, showWhenReady: root[2052] === HOLE ? 'HOLE' : root[2052], windows: env.windows.map(window => [window.id, window.visible, window.minimized])};
    });
  });
}

// f4091 controller size
for (const width of [200, 319, 320, 380, 420, 500, 1000, 1920, 0, -10])
  scenario('controllerSize / ' + width, {}, f => f('f4091')({x: 0, y: 0, width, height: 800}));
scenario('controllerSize with other bases', {margin: 30, baseWidth: 333, baseHeight: 555}, f => f('f4091')({width: 400}));
scenario('controllerSize margin uninitialised', {holes: [2027]}, f => f('f4091')({width: 400}));
scenario('controllerSize base width uninitialised', {holes: [2028]}, f => f('f4091')({width: 400}));
scenario('controllerSize base height uninitialised', {holes: [2026]}, f => f('f4091')({width: 400}));
// f4092 placement
for (const [w, h] of [[800, 600], [3000, 3000], [100, 100], [1860, 700], [1900, 960]])
  for (const alignment of [undefined, 'top', 'center', 'bottom', null, ''])
    scenario(`placement / ${w}x${h} / ${String(alignment)}`, {}, f => f('f4092')(w, h, alignment));
scenario('placement on a small display', {workArea: {x: 0, y: 0, width: 500, height: 400}}, f => f('f4092')(800, 800));
scenario('placement on a secondary-origin display', {workArea: {x: -1920, y: 100, width: 1920, height: 1040}}, f => f('f4092')(640, 480, 'top'));
scenario('placement electron uninitialised', {holes: [22]}, f => f('f4092')(800, 600));
scenario('placement margin uninitialised', {holes: [2027]}, f => f('f4092')(800, 600));
// f4093 tile booking windows
scenario('tileBookingWindows', {}, f => f('f4093')());
scenario('tileBookingWindows none placed by hand', {placed: []}, f => f('f4093')());
scenario('tileBookingWindows narrow screen', {workArea: {x: 0, y: 0, width: 500, height: 800}, placed: []}, f => f('f4093')());
scenario('tileBookingWindows tile wider than the screen', {tileWidth: 5000, placed: []}, f => f('f4093')());
scenario('tileBookingWindows many windows', {windows: Array.from({length: 13}, (_, i) => ({id: 20 - i})), placed: []}, f => f('f4093')());
for (const width of [908, 907, 1148, 1147, 600, 316, 315])
  scenario('tileBookingWindows row width boundary / ' + width, {workArea: {x: 0, y: 0, width, height: 900}, tileWidth: 292, placed: [], windows: Array.from({length: 9}, (_, i) => ({id: i + 1}))}, f => f('f4093')());
scenario('tileBookingWindows no windows', {windows: []}, f => f('f4093')());
scenario('tileBookingWindows a destroyed window that throws', {windows: [{id: 2, destroyedThrows: true}, {id: 1}]}, f => f('f4093')());
scenario('tileBookingWindows hook fails', {returns: {layoutApplied: () => {throw new Error('synthetic hook');}}, placed: []}, f => f('f4093')());
scenario('tileBookingWindows second hook fails', {returns: {layoutSettled: () => {throw new Error('synthetic hook');}}, placed: []}, f => f('f4093')());
scenario('tileBookingWindows tile width uninitialised', {holes: [2033]}, f => f('f4093')());
scenario('tileBookingWindows tile height uninitialised', {holes: [2034]}, f => f('f4093')());
scenario('tileBookingWindows placed set uninitialised', {holes: [2036]}, f => f('f4093')());
// f4097 load a page
for (const [page, formId, newTheme] of [['form', undefined, undefined], ['booking-box', 'form 1/&', true], ['updates', null, 1], ['logs', '', 0], ['tools', 'a', false]]) {
  for (const devServer of [undefined, '', 'http://localhost:5173'])
    scenario(`loadRendererPage / ${page} / ${JSON.stringify(formId)} / ${newTheme} / ${devServer === undefined ? 'files' : devServer || 'empty dev server'}`, {devServer}, (f, env) => f('f4097')(env.windows[0], page, formId, newTheme));
}
scenario('loadRendererPage path module uninitialised', {holes: [14]}, (f, env) => f('f4097')(env.windows[0], 'form'));
scenario('loadRendererPage path module uninitialised, dev server', {holes: [14], devServer: 'http://x'}, (f, env) => f('f4097')(env.windows[0], 'form'));
// f4098 / f4116 / f4117 / f4118
scenario('pinOnAllWorkspaces', {}, (f, env) => f('f4098')(env.windows[0]));
scenario('revealWindow', {}, (f, env) => f('f4116')(env.windows[1]));
scenario('revealWindow placement fails', {returns: {place: () => {throw new Error('synthetic place');}}}, (f, env) => f('f4116')(env.windows[1]));
for (const [name, options] of [['visible', {}], ['hidden and not ready', {windows: [{id: 1, visible: false}], ready: false}], ['hidden and ready', {windows: [{id: 1, visible: false}], ready: true}], ['hidden, ready flag truthy', {windows: [{id: 1, visible: false}], ready: 'yes'}]])
  scenario('activateController / ' + name, options, f => f('f4117')());
scenario('activateController ready flag uninitialised', {windows: [{id: 1, visible: false}], holes: [2051]}, f => f('f4117')());
scenario('activateController show-when-ready flag uninitialised', {windows: [{id: 1, visible: false}], holes: [2052]}, f => f('f4117')());
scenario('activateController show-when-ready flag uninitialised but controller ready', {windows: [{id: 1, visible: false}], ready: true, holes: [2052]}, f => f('f4117')());
for (const platform of ['win32', 'darwin', 'linux'])
  for (const [name, spec] of [['normal', {id: 1}], ['minimized', {id: 1, minimized: true}], ['destroyed', {id: 1, destroyed: true}]])
    scenario(`focusWindow / ${platform} / ${name}`, {platform, windows: [spec]}, (f, env) => f('f4118')(env.windows[0]));
scenario('focusWindow without a window', {}, f => [f('f4118')(), f('f4118')(null), f('f4118')(0)]);
scenario('focusWindow darwin electron uninitialised', {platform: 'darwin', holes: [22]}, (f, env) => f('f4118')(env.windows[0]));
// f4119 keep on top while focused
const EVENTS = ['focus', 'blur', 'hide', 'minimize', 'restore', 'show'];
scenario('keepOnTopWhileFocused registers six listeners', {}, (f, env) => f('f4119')(env.windows[0]));
for (const [name, spec] of [['alive and focused', {id: 1, focused: true}], ['alive and not focused', {id: 1, focused: false}], ['destroyed', {id: 1, destroyed: true}]])
  scenario('keepOnTopWhileFocused events / ' + name, {windows: [spec]}, (f, env) => {
    f('f4119')(env.windows[0]);
    const results = [];
    for (const event of [...EVENTS, 'focus', 'show', 'restore', 'blur']) results.push([event, env.windows[0].listeners.get(event)()]);
    return results;
  });
scenario('keepOnTopWhileFocused window without on()', {}, f => f('f4119')({isDestroyed() {return false;}}));
scenario('keepOnTopWhileFocused a window that is destroyed after the first event', {windows: [{id: 1, focused: true}]}, (f, env) => {
  f('f4119')(env.windows[0]);
  const first = env.windows[0].listeners.get('focus')();
  env.windows[0].destroyed = true;
  return [first, env.windows[0].listeners.get('show')(), env.windows[0].listeners.get('focus')()];
});
// f4127 apply to visible windows
scenario('applyToVisibleWindows', {}, f => f('f4127')());
scenario('applyToVisibleWindows empty', {entries: []}, f => f('f4127')());
scenario('applyToVisibleWindows only the new-form window', {entries: [['__new__', 0]]}, f => f('f4127')());
scenario('applyToVisibleWindows a settings callback fails', {returns: {applySettings: () => {throw new Error('synthetic apply');}}}, f => f('f4127')());
scenario('applyToVisibleWindows registry uninitialised', {holes: [2058]}, f => f('f4127')());

test('every reviewed window layout helper has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f4091', 'f4092', 'f4093', 'f4097', 'f4098', 'f4116', 'f4117', 'f4118', 'f4119', 'f4127']) assert.equal(typeof factories[id], 'function', id);
  for (const id of ['f4085', 'f4087', 'f4089', 'f4090']) assert.equal(factories[id], undefined, id + ' belongs to the licensing lease and stays recovered');
});
