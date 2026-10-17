'use strict';
// Compares the reconstructed saved-forms vault (src/ts/main/storage/forms-vault.ts) with the recovered methods of the
// class constructed by f862, on identical synthetic scenarios: an in-memory file system, a reversible fake cipher and
// scripted helpers. No real file, key or profile is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');

const MEMBERS = {
  list: 'f865', reorderForms: 'f869', all: 'f871', get: 'f873', save: 'f875', saveMany: 'f876', delete: 'f879',
  deleteAll: 'f881', duplicate: 'f882', migrateLabels: 'f884', clearAvailTimingOverrides: 'f885',
  adoptAvailabilityDefaults: 'f886', normalizeTiming: 'f888', readVault: 'f889', locked: 'f890', readAll: 'f891',
  readForWrite: 'f893', writeAll: 'f895',
};

function form(id, extra = {}) {
  return {
    id, label: 'Form ' + id, createdAt: 1000 + Number(String(id).replace(/\D/g, '') || 0), updatedAt: 5000 + ((Number(String(id).replace(/\D/g, '') || 0) * 7) % 5) * 10,
    journey: {origin: 'NDLS', destination: 'BSB', trainNumber: '12345', journeyDate: '20-10-2026'},
    payment: {method: 'paytm'}, passengers: [{name: 'Asha'}, {name: 'Ravi'}], account: {username: 'user' + id, mobileNumber: '9000000000'},
    loginMode: 'auto', ...extra,
  };
}

// A scenario describes the starting disk: a list of forms, a corrupt file, a missing file or a wrong key.
function world(options = {}) {
  const trace = [];
  const files = new Map();
  const dirs = [];
  const fs = {
    existsSync(path) {trace.push(['exists', path]); return files.has(path);},
    readFileSync(path, encoding) {trace.push(['read', path, encoding]); if (options.readThrows) throw new Error('synthetic read'); return files.get(path);},
    writeFileSync(path, data, encoding) {trace.push(['write', path, encoding, data]); if (options.writeThrows) throw new Error('synthetic write'); files.set(path, data);},
    mkdirSync(path, mkOptions) {trace.push(['mkdir', path, mkOptions]); dirs.push(path);},
    renameSync(from, to) {trace.push(['rename', from, to]); files.set(to, files.get(from)); files.delete(from);},
  };
  const cipher = {
    encrypt(key, data) {trace.push(['encrypt', key, Buffer.isBuffer(data)]); return {k: key, d: data.toString('base64')};},
    decrypt(key, envelope) {trace.push(['decrypt', key]); if (envelope.k !== key || options.decryptThrows) throw new Error('synthetic bad key'); return Buffer.from(envelope.d, 'base64');},
  };
  let uuid = 0, clock = 1760000000000;
  const FakeDate = class extends Date {static now() {trace.push(['now']); clock += 7; return clock;}};
  const normalizeForm = function (value, index, all) {trace.push(['normalizeForm', value.id, index, all?.length]); return {...value, normalized: true};};
  const timing = (current, epoch) => {trace.push(['timing', current === undefined ? 'undefined' : JSON.stringify(current), epoch]); return current?.fix ? {...current, fix: false, epoch} : current;};
  const label = (base, username) => {trace.push(['label', base, username]); return options.stableLabels ? base : base + '#' + username;};
  const crypto = {randomUUID() {trace.push(['uuid']); return 'uuid-' + (++uuid);}};
  const slots = {18: fs, 23: crypto, 276: timing, 281: label, 537: cipher.encrypt, 538: cipher.decrypt, 546: normalizeForm, 548: 'f896'};
  const env = {trace, files, dirs, slots, FakeDate, fs, cipher, now: () => FakeDate.now()};
  return env;
}

function seed(env, forms, key = 'K') {
  if (forms === 'corrupt') env.files.set('/data/forms.vault', 'not json');
  else if (forms === 'garbageEnvelope') env.files.set('/data/forms.vault', JSON.stringify({k: key, d: Buffer.from('{"x":1}').toString('base64')}));
  else if (forms === 'wrongKey') env.files.set('/data/forms.vault', JSON.stringify({k: 'OTHER', d: Buffer.from('[]').toString('base64')}));
  else if (forms) env.files.set('/data/forms.vault', JSON.stringify({k: key, d: Buffer.from(JSON.stringify(forms)).toString('base64')}));
  env.trace.length = 0;
}

function vaultFor(native, env) {
  const {method} = harness({native, slots: env.slots, globals: {Date: env.FakeDate, Buffer}, dependencies: {now: env.now}});
  const instance = {dir: '/data', key: 'K', file: '/data/forms.vault', availabilityEpoch() {env.trace.push(['epoch']); return 'E2';}};
  for (const [name, id] of Object.entries(MEMBERS)) instance[name] = method(id);
  return instance;
}

function snapshot(env, instance, value) {
  const stored = env.files.get('/data/forms.vault');
  let decoded;
  try {decoded = JSON.parse(Buffer.from(JSON.parse(stored).d, 'base64').toString());} catch {decoded = stored === undefined ? undefined : 'unreadable';}
  return {value, trace: env.trace, decoded, dirs: env.dirs, fileNames: [...env.files.keys()]};
}

const DISKS = {
  missing: undefined,
  empty: [],
  three: [form('a1', {order: 2}), form('b2'), form('c3', {order: 0, timing: {fix: true, availTimes: ['x'], loginTimes: ['y']}})],
  withTimings: [form('a1', {timing: {availTimes: [1]}}), form('b2', {timing: {availTimes: [1], loginTimes: [2]}}), form('c3', {timing: {fix: true}})],
  copies: [form('a1', {label: 'Trip (copy) (pair)'}), form('b2', {label: '  Trip (PAIR)  '}), form('c3', {label: 'Plain'}), form('d4', {label: ''}), form('e5', {label: undefined, account: null})],
  duplicates: [form('a1'), form('a1', {label: 'second'}), form('b2')],
  single: [form('s1')],
  mixedIds: [form(1), form('1'), form(2, {label: 'two'})],
  corrupt: 'corrupt',
  garbageEnvelope: 'garbageEnvelope',
  wrongKey: 'wrongKey',
};

function scenario(name, disk, run, options = {}) {
  test('forms vault matches the recovered methods: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      seed(env, DISKS[disk]);
      const instance = vaultFor(native, env);
      const value = await outcome(async () => run(instance, env));
      return snapshot(env, instance, value);
    });
  });
}

for (const disk of Object.keys(DISKS)) {
  scenario('readVault / ' + disk, disk, vault => vault.readVault());
  scenario('locked / ' + disk, disk, vault => vault.locked());
  scenario('readAll / ' + disk, disk, vault => vault.readAll());
  scenario('readForWrite / ' + disk, disk, vault => vault.readForWrite());
  scenario('list / ' + disk, disk, vault => vault.list());
  scenario('all / ' + disk, disk, vault => vault.all());
  scenario('get / ' + disk, disk, vault => [vault.get('b2'), vault.get('missing'), vault.get(undefined), vault.get(1), vault.get('1')]);
  scenario('save update / ' + disk, disk, vault => vault.save(form('b2', {label: 'changed', timing: {fix: true}})));
  scenario('save new / ' + disk, disk, vault => vault.save(form('z9')));
  scenario('saveMany / ' + disk, disk, vault => vault.saveMany([form('z9'), form('a1', {label: 'x'}), form('z9', {label: 'again'})]));
  scenario('saveMany empty / ' + disk, disk, vault => vault.saveMany([]));
  scenario('delete / ' + disk, disk, vault => [vault.delete('b2'), vault.delete('nope'), vault.delete(1), vault.delete('1')]);
  scenario('deleteAll / ' + disk, disk, vault => vault.deleteAll());
  scenario('duplicate / ' + disk, disk, vault => [vault.duplicate('c3'), vault.duplicate('nope'), vault.duplicate(1)]);
  scenario('reorderForms / ' + disk, disk, vault => vault.reorderForms(['c3', 'a1', 'b2', 'ghost']));
  scenario('reorderForms unchanged / ' + disk, disk, vault => vault.reorderForms([]));
  scenario('migrateLabels / ' + disk, disk, vault => vault.migrateLabels());
  scenario('clearAvailTimingOverrides / ' + disk, disk, vault => vault.clearAvailTimingOverrides());
  scenario('adoptAvailabilityDefaults / ' + disk, disk, vault => vault.adoptAvailabilityDefaults('E9'));
  scenario('normalizeTiming / ' + disk, disk, vault => [vault.normalizeTiming(form('q', {timing: {fix: true}})), vault.normalizeTiming(form('q2'))]);
}

scenario('migrateLabels stable labels write nothing', 'copies', vault => vault.migrateLabels(), {stableLabels: true});
scenario('writeAll surfaces a write failure and leaves the temporary file', 'three', vault => vault.save(form('w1')), {writeThrows: true});
scenario('readVault reports a read failure as locked', 'three', vault => [vault.readVault(), vault.locked()], {readThrows: true});
scenario('readVault reports a decrypt failure as locked', 'three', vault => vault.readVault(), {decryptThrows: true});
scenario('writeAll encrypts and swaps through a temporary file', 'empty', vault => vault.writeAll([form('only')]));

// The summary used by list() (f896) alone, including missing parts.
for (const [name, value] of Object.entries({
  full: form('s1'), noPassengers: form('s2', {passengers: []}), blanks: form('s3', {label: '', journey: {}, account: {}, passengers: [{name: ''}, {name: 'Z'}]}),
  missingJourney: {id: 'x', payment: {}, passengers: [], account: {}}, missingPayment: {id: 'x', journey: {}, passengers: [], account: {}},
  missingAccount: {id: 'x', journey: {}, payment: {}, passengers: []}, missingPassengers: {id: 'x', journey: {}, payment: {}, account: {}},
  numeric: form('s4', {label: 7, journey: {origin: 'AB', destination: 5, trainNumber: 0, journeyDate: 'D'}}),
})) {
  test('summarizeForm matches the recovered projection: ' + name, async () => {
    await compare(async native => {
      const {rootFunction} = harness({native});
      return outcome(async () => rootFunction('f896')(value));
    });
  });
}

test('the vault replaces exactly the reviewed recovered functions', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of [...Object.values(MEMBERS), 'f896']) assert.equal(typeof factories[id], 'function', id);
});
