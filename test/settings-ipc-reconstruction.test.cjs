'use strict';
// Compares the reconstructed settings IPC handlers (src/ts/main/ipc/settings-ipc.ts) with the recovered handlers
// f4013-f4021 on identical synthetic scenarios: a traced settings store, fake windows and scripted bootstrap helpers.
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
  const rec = (name, ...args) => trace.push([name, ...args.map(summary)]);
  const value = (name, fallback) => (options.returns && name in options.returns ? options.returns[name] : fallback);
  const call = (name, fallback) => (...args) => {rec(name, ...args); const result = value(name, fallback); return typeof result === 'function' ? result(...args) : result;};
  let stored = options.settings ?? {autoUpdate: true, theme: 'dark', pinnedOnTop: false, aiEnabled: false, qrPopup: true};
  const windows = (options.windowSpec ?? [
    {id: 1, url: 'file:///app/controller.html'}, {id: 2, url: 'file:///app/booking-box.html?x=1'}, {id: 3, url: 'file:///app/form.html'},
    {id: 4, url: 'file:///app/CONTROLLER.HTML', destroyed: true}, {id: 5, url: 'file:///app/Booking-Box.html'}, {id: 6, url: 'file:///app/controller.html booking-box.html'}, {id: 7, url: 'file:///app/Controller.HTML'},
  ]).map(spec => ({
    __window: true, id: spec.id,
    isDestroyed() {rec('win.isDestroyed', spec.id); return !!spec.destroyed;},
    webContents: {getURL() {rec('win.getURL', spec.id); return spec.url;}, send(channel, pinned) {rec('win.send', spec.id, channel, pinned);}},
  }));
  const electron = {BrowserWindow: {getAllWindows() {rec('getAllWindows'); return windows;}}};
  const slots = {
    1768: call('read', () => stored), 1769: call('write', next => {if (options.writeFails) throw new Error('synthetic write'); stored = next;}),
    1770: call('pinned', options.pinned ?? false), 1771: call('applyPin', undefined),
    22: options.holes?.includes(22) ? HOLE : electron, 336: options.holes?.includes(336) ? HOLE : {WindowPinChanged: 'window:pin'},
    1784: call('aiKey', options.aiKey ?? false), 1925: call('qr', true), 1623: call('theme', 0),
  };
  return {trace, slots, get stored() {return stored;}, environment: options.environment ?? {}};
}

function handlersFor(native, env) {
  const {engine, root} = harness({native, slots: env.slots});
  const ctx = engine.context(4, root);
  ctx[2] = root[5];
  ctx[3] = env.environment;
  return id => engine.makeFunction(id, ctx);
}

function scenario(name, options, run) {
  test('settings IPC matches the recovered handlers: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const result = await outcome(async () => run(handler, {sender: 's'}, env));
      return {result, trace: env.trace, stored: env.stored};
    });
  });
}

for (const [getter, setter, field] of [['f4013', 'f4014', 'autoUpdate'], ['f4017', 'f4018', 'aiEnabled'], ['f4019', 'f4021', 'qrPopup']]) {
  scenario(getter + ' read', {}, (h, e) => h(getter)(e));
  scenario(getter + ' read, setting missing', {settings: {}}, (h, e) => h(getter)(e));
  scenario(getter + ' read, setting truthy but not true', {settings: {[field]: 1}}, (h, e) => h(getter)(e));
  scenario(getter + ' read, store fails', {returns: {read: () => {throw new Error('synthetic read');}}}, (h, e) => h(getter)(e));
  for (const given of [true, false, 1, 'true', undefined, null, 0, {}])
    scenario(setter + ' set ' + JSON.stringify(given), {}, (h, e) => h(setter)(e, given));
  scenario(setter + ' write fails', {writeFails: true}, (h, e) => h(setter)(e, true));
  scenario(setter + ' read fails', {returns: {read: () => {throw new Error('synthetic read');}}}, (h, e) => h(setter)(e, true));
  scenario(setter + ' keeps other settings and an existing key order', {settings: {zeta: 1, [field]: 'old', alpha: 2}}, (h, e) => h(setter)(e, true));
}
scenario('getAiEnabled with a stored key', {aiKey: true}, (h, e) => h('f4017')(e));
scenario('getAiEnabled with an environment key', {environment: {CLAUDE_API_KEY: 'k'}}, (h, e) => h('f4017')(e));
scenario('getAiEnabled with an empty environment key', {environment: {CLAUDE_API_KEY: ''}}, (h, e) => h('f4017')(e));
scenario('getAiEnabled with both', {aiKey: true, environment: {CLAUDE_API_KEY: 'k'}, settings: {aiEnabled: true}}, (h, e) => h('f4017')(e));
scenario('getAiEnabled key lookup fails', {returns: {aiKey: () => {throw new Error('synthetic key');}}}, (h, e) => h('f4017')(e));
scenario('getWindowPin', {pinned: true}, (h, e) => h('f4015')(e));
scenario('getWindowPin not pinned', {}, (h, e) => h('f4015')(e));
scenario('getNewTheme', {}, (h, e) => h('f4020')(e));
scenario('getNewTheme truthy', {returns: {theme: 'on'}}, (h, e) => h('f4020')(e));
for (const pinned of [true, false, undefined, 'yes', 1])
  scenario('setWindowPin ' + JSON.stringify(pinned), {}, (h, e) => h('f4016')(e, pinned));
scenario('setWindowPin no windows', {windowSpec: []}, (h, e) => h('f4016')(e, true));
scenario('setWindowPin write fails', {writeFails: true}, (h, e) => h('f4016')(e, true));
scenario('setWindowPin apply fails', {returns: {applyPin: () => {throw new Error('synthetic apply');}}}, (h, e) => h('f4016')(e, true));
scenario('setWindowPin electron uninitialised', {holes: [22]}, (h, e) => h('f4016')(e, true));
scenario('setWindowPin channels uninitialised', {holes: [336]}, (h, e) => h('f4016')(e, true));

test('every reviewed settings handler has a factory; SetAiKey is deliberately left recovered', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f4013', 'f4014', 'f4015', 'f4016', 'f4017', 'f4018', 'f4019', 'f4020', 'f4021']) assert.equal(typeof factories[id], 'function', id);
  assert.equal(factories.f4022, undefined);
});
