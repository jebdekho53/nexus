'use strict';
// Compares the reconstructed saved-data IPC handlers (src/ts/main/ipc/data-ipc.ts) with the recovered handlers of f3790
// on identical synthetic scenarios: traced fake vaults, a fake Electron and scripted bootstrap helpers. Nothing is read,
// written, relaunched or sent.
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
  const call = (name, fallback) => (...args) => {
    rec(name, ...args);
    const result = value(name, fallback);
    return typeof result === 'function' ? result(...args) : result;
  };
  // A vault whose every method is traced and may be scripted by the scenario ("<prefix>.<method>").
  const vault = (prefix, defaults) => {
    const target = {};
    for (const [method, fallback] of Object.entries(defaults)) target[method] = call(prefix + '.' + method, fallback);
    return target;
  };
  const records = [{id: 'a', name: 'A', pnr: 'P1'}, {id: 'b', name: 'B', pnr: 'P2'}];
  const forms = vault('forms', {list: records, save: form => ({...form, id: form.id ?? 'new'}), get: records[0], delete: true, deleteAll: 2, duplicate: {id: 'copy'}, reorderForms: 1});
  const users = vault('users', {list: records, save: user => ({...user, id: user.id ?? 'u-new'}), delete: true, deleteAll: 3});
  const payments = vault('payments', {list: records, save: payment => ({...payment, id: payment.id ?? 'p-new'}), delete: true, deleteAll: 4});
  const proxies = vault('proxies', {list: [{id: 'x', host: 'h'}, {id: 'y', host: 'k'}], save: proxy => ({...proxy, id: proxy.id ?? 'x-new'}), delete: true, deleteAll: 5});
  const history = vault('history', {list: records, delete: id => (id === 'a' ? {id: 'a', pnr: 'P1'} : null), deleteAll: {count: 2, pnrs: ['P1', 'P2']}});
  const armed = new Map(options.armed ?? []);
  const armedStore = {has: id => {rec('armed.has', id); return armed.has(id);}, get: id => {rec('armed.get', id); return armed.get(id);}, set: (id, form) => {rec('armed.set', id, form); armed.set(id, form); return armed;}};
  const windows = (options.windowSpec ?? [{id: 1}, {id: 2, destroyed: true}, {id: 3}]).map(spec => ({
    __window: true, id: spec.id,
    isDestroyed() {rec('win.isDestroyed', this.id); return !!spec.destroyed;},
    webContents: {send(channel) {rec('win.send', spec.id, channel);}},
  }));
  const electron = {
    app: {relaunch() {rec('app.relaunch'); if (options.relaunchFails) throw new Error('synthetic relaunch');}, exit(code) {rec('app.exit', code);}},
    BrowserWindow: {getAllWindows() {rec('BrowserWindow.getAllWindows'); return windows;}},
  };
  const timers = [];
  const setTimeoutFake = (callback, ms) => {rec('setTimeout', ms); timers.push(callback);};
  const slots = {
    1712: call('formsVault', forms), 1539: options.holes?.includes(1539) ? HOLE : armedStore,
    1835: call('armedIds', {has: id => {rec('armedIds.has', id); return options.armedIds?.includes(id) ?? false;}}),
    1813: call('runWrite', write => write()), 1801: call('afterFormSaved', undefined), 1720: call('formsChanged', undefined),
    276: call('timing', (timing, epoch) => ({fixed: timing, epoch})), 1611: options.holes?.includes(1611) ? HOLE : 'EPOCH',
    1809: call('lockedVaults', {lockedVaults: options.locked ?? []}), 1810: call('recoverVaults', ['forms.vault.bak']),
    1789: call('usersVault', users), 1800: call('afterUserSaved', undefined), 1721: call('usersChanged', undefined),
    1792: call('historyVault', history), 1793: call('forgetPnr', undefined),
    1796: call('paymentsVault', payments), 261: call('normalizePayment', payment => (payment && payment.upi && payment.upi.includes('@') ? {...payment, upi: payment.upi.toLowerCase()} : null)),
    1798: call('proxiesVault', proxies), 1734: call('proxyTags', ['tag1']), 576: call('speedTest', (address, label) => Promise.resolve({mbps: 12, address, label})),
    265: call('proxyAddress', proxy => 'addr:' + proxy.host), 266: call('proxyLabel', proxy => 'label:' + proxy.host),
    22: options.holes?.includes(22) ? HOLE : electron, 336: options.holes?.includes(336) ? HOLE : {PaymentsChanged: 'payments:changed'},
  };
  return {trace, slots, windows, setTimeoutFake, timers, armed, rec};
}

function handlersFor(native, env) {
  const {engine, root} = harness({
    native, slots: env.slots,
    globals: {setTimeout: env.setTimeoutFake},
    dependencies: {setTimeout: env.setTimeoutFake},
  });
  const ctx = engine.context(12, root);
  ctx[2] = root[5];
  // slot 11 of the registration scope: the payments-changed broadcast (recovered f3972)
  ctx[11] = engine.makeFunction('f3972', ctx);
  return id => engine.makeFunction(id, ctx);
}

function scenario(name, options, run) {
  test('saved-data IPC matches the recovered handlers: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const event = {sender: 'sender'};
      const result = await outcome(async () => run(handler, event, env));
      for (const timer of env.timers) timer();
      return {result, trace: env.trace, armed: [...env.armed]};
    });
  });
}

const throwing = name => ({returns: {[name]: () => {throw new Error('synthetic ' + name);}}});

// forms
scenario('listForms', {}, (h, e) => h('f3938')(e));
scenario('listForms with armed forms', {armedIds: ['b']}, (h, e) => h('f3938')(e));
scenario('listForms vault fails', throwing('forms.list'), (h, e) => h('f3938')(e));
scenario('listForms armed lookup fails', throwing('armedIds'), (h, e) => h('f3938')(e));
for (const [name, armedFirst] of [['unarmed', false], ['armed', true]]) {
  scenario('saveForm ' + name, {armed: armedFirst ? [['a', {id: 'a'}]] : []}, (h, e) => h('f3936')(e, {id: 'a', label: 'x', timing: {t: 1}}));
  scenario('saveForm ' + name + ' without id', {}, (h, e) => h('f3936')(e, {label: 'x'}));
}
scenario('saveForm save fails', throwing('forms.save'), (h, e) => h('f3936')(e, {id: 'a'}));
scenario('saveForm write wrapper fails', throwing('runWrite'), (h, e) => h('f3936')(e, {id: 'a'}));
scenario('saveForm hook fails', throwing('afterFormSaved'), (h, e) => h('f3936')(e, {id: 'a'}));
scenario('saveForm armed store uninitialised', {holes: [1539]}, (h, e) => h('f3936')(e, {id: 'a'}));
scenario('saveForm epoch uninitialised', {armed: [['a', 1]], holes: [1611]}, (h, e) => h('f3936')(e, {id: 'a', timing: 1}));
scenario('getForm armed', {armed: [['a', {id: 'a', armed: true}]]}, (h, e) => h('f3943')(e, 'a'));
scenario('getForm stored', {}, (h, e) => h('f3943')(e, 'a'));
scenario('getForm armed store has a falsy value', {armed: [['a', 0], ['b', null]]}, (h, e) => [h('f3943')(e, 'a'), h('f3943')(e, 'b')]);
scenario('getForm missing', {returns: {'forms.get': undefined}}, (h, e) => h('f3943')(e, 'zz'));
scenario('getForm fails', throwing('forms.get'), (h, e) => h('f3943')(e, 'a'));
scenario('deleteForm', {}, (h, e) => h('f3944')(e, 'a'));
scenario('deleteForm fails', throwing('forms.delete'), (h, e) => h('f3944')(e, 'a'));
scenario('deleteAllForms', {}, (h, e) => h('f3945')(e));
scenario('deleteAllForms fails', throwing('forms.deleteAll'), (h, e) => h('f3945')(e));
scenario('duplicateForm', {}, (h, e) => h('f3946')(e, 'a'));
scenario('duplicateForm unknown', {returns: {'forms.duplicate': null}}, (h, e) => h('f3946')(e, 'zz'));
scenario('duplicateForm fails', throwing('forms.duplicate'), (h, e) => h('f3946')(e, 'a'));
for (const ids of [['a', 'b'], ['a', 1, null, 'b', {}], [], 'ab', undefined, null, {length: 2}])
  scenario('reorderForms / ' + JSON.stringify(ids), {}, (h, e) => h('f3947')(e, ids));
scenario('reorderForms fails', throwing('forms.reorderForms'), (h, e) => h('f3947')(e, ['a']));
scenario('getVaultLockState none locked', {}, (h, e) => h('f3940')(e));
scenario('getVaultLockState one locked', {locked: ['forms']}, (h, e) => h('f3940')(e));
scenario('getVaultLockState locked', {locked: ['forms', 'users']}, (h, e) => h('f3940')(e));
scenario('getVaultLockState lookup fails', throwing('lockedVaults'), (h, e) => h('f3940')(e));
scenario('recoverVaults', {}, (h, e) => h('f3941')(e));
scenario('recoverVaults moved nothing', {returns: {recoverVaults: []}}, (h, e) => h('f3941')(e));
scenario('recoverVaults relaunch fails', {relaunchFails: true}, (h, e) => h('f3941')(e));
scenario('recoverVaults electron uninitialised', {holes: [22]}, (h, e) => h('f3941')(e));
// history
scenario('listHistory', {}, (h, e) => h('f3960')(e));
scenario('listHistory fails', throwing('history.list'), (h, e) => h('f3960')(e));
scenario('deleteHistoryEntry known', {}, (h, e) => h('f3961')(e, 'a'));
scenario('deleteHistoryEntry unknown', {}, (h, e) => h('f3961')(e, 'zz'));
scenario('deleteHistoryEntry fails', throwing('history.delete'), (h, e) => h('f3961')(e, 'a'));
scenario('deleteHistoryEntry forget fails', throwing('forgetPnr'), (h, e) => h('f3961')(e, 'a'));
scenario('clearHistory', {}, (h, e) => h('f3962')(e));
scenario('clearHistory nothing', {returns: {'history.deleteAll': {count: 0, pnrs: []}}}, (h, e) => h('f3962')(e));
scenario('clearHistory forget fails', throwing('forgetPnr'), (h, e) => h('f3962')(e));
scenario('clearHistory fails', throwing('history.deleteAll'), (h, e) => h('f3962')(e));
// users
scenario('listUsers', {}, (h, e) => h('f3959')(e));
scenario('listUsers fails', throwing('users.list'), (h, e) => h('f3959')(e));
scenario('saveUser', {}, (h, e) => h('f3963')(e, {name: 'n'}));
scenario('saveUser fails', throwing('users.save'), (h, e) => h('f3963')(e, {name: 'n'}));
scenario('saveUser hook fails', throwing('afterUserSaved'), (h, e) => h('f3963')(e, {name: 'n'}));
scenario('deleteUser', {}, (h, e) => h('f3965')(e, 'a'));
scenario('deleteUser fails', throwing('users.delete'), (h, e) => h('f3965')(e, 'a'));
scenario('deleteAllUsers', {}, (h, e) => h('f3966')(e));
scenario('deleteAllUsers fails', throwing('users.deleteAll'), (h, e) => h('f3966')(e));
// payments
scenario('listPayments', {}, (h, e) => h('f3973')(e));
scenario('savePayment valid', {}, (h, e) => h('f3974')(e, {upi: 'Name@okhdfc'}));
scenario('savePayment keeps the given id', {}, (h, e) => h('f3974')(e, {id: 'keep', upi: 'Name@okhdfc'}));
scenario('savePayment normaliser supplies an id', {returns: {normalizePayment: payment => ({...payment, id: 'from-normalizer'})}}, (h, e) => h('f3974')(e, {upi: 'a@b'}));
scenario('savePayment normaliser supplies an id, none given', {returns: {normalizePayment: () => ({id: 'n', upi: 'a@b'})}}, (h, e) => h('f3974')(e, null));
scenario('savePayment given id wins over the normaliser id', {returns: {normalizePayment: payment => ({...payment, id: 'from-normalizer'})}}, (h, e) => h('f3974')(e, {id: 'given', upi: 'a@b'}));
scenario('savePayment invalid', {}, (h, e) => h('f3974')(e, {upi: 'nope'}));
scenario('savePayment fails', throwing('payments.save'), (h, e) => h('f3974')(e, {upi: 'a@b'}));
scenario('savePayment normaliser fails', throwing('normalizePayment'), (h, e) => h('f3974')(e, {upi: 'a@b'}));
scenario('deletePayment', {}, (h, e) => h('f3976')(e, 'a'));
scenario('deletePayment fails', throwing('payments.delete'), (h, e) => h('f3976')(e, 'a'));
scenario('deleteAllPayments', {}, (h, e) => h('f3977')(e));
scenario('payments broadcast reaches live windows only', {}, (h, e) => h('f3972')());
scenario('payments broadcast with a window that throws', {windowSpec: [{id: 1}], returns: {}}, (h, e) => h('f3972')());
scenario('payments broadcast channels uninitialised', {holes: [336]}, (h, e) => h('f3972')());
scenario('payments broadcast no windows', {windowSpec: []}, (h, e) => h('f3972')());
// proxies
scenario('listProxies', {}, (h, e) => h('f3978')(e));
scenario('proxyTags', {}, (h, e) => h('f3979')(e));
scenario('proxyTags fails', throwing('proxyTags'), (h, e) => h('f3979')(e));
for (const id of [undefined, '', null, 0, 'x', 'y', 'gone'])
  scenario('runSpeedTest / ' + JSON.stringify(id), {}, (h, e) => h('f3980')(e, id));
scenario('runSpeedTest fails', {returns: {speedTest: () => Promise.reject(new Error('synthetic speed'))}}, (h, e) => h('f3980')(e, 'x'));
scenario('runSpeedTest direct fails', {returns: {speedTest: () => {throw new Error('synthetic speed');}}}, (h, e) => h('f3980')(e, ''));
scenario('saveProxy', {}, (h, e) => h('f3982')(e, {host: 'h'}));
scenario('saveProxy fails', throwing('proxies.save'), (h, e) => h('f3982')(e, {host: 'h'}));
scenario('deleteProxy', {}, (h, e) => h('f3984')(e, 'x'));
scenario('deleteProxy fails', throwing('proxies.delete'), (h, e) => h('f3984')(e, 'x'));
scenario('deleteAllProxies', {}, (h, e) => h('f3985')(e));
scenario('deleteAllProxies fails', throwing('proxies.deleteAll'), (h, e) => h('f3985')(e));

test('every reviewed saved-data handler has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f3936', 'f3938', 'f3940', 'f3941', 'f3943', 'f3944', 'f3945', 'f3946', 'f3947', 'f3959', 'f3960', 'f3961', 'f3962', 'f3963', 'f3965', 'f3966', 'f3972', 'f3973', 'f3974', 'f3976', 'f3977', 'f3978', 'f3979', 'f3980', 'f3982', 'f3984', 'f3985'])
    assert.equal(typeof factories[id], 'function', id);
});
