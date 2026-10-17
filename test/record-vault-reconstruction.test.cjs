'use strict';
// Compares the reconstructed record vaults (saved logins, proxies, payments: src/ts/main/storage/record-vault.ts)
// with the recovered methods of their classes, on identical synthetic scenarios: an in-memory file system, a
// reversible fake cipher and a scripted clock. No real file, key, login or proxy is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');

const VAULTS = {
  users: {list: 'f900', save: 'f902', saveMany: 'f903', delete: 'f906', deleteAll: 'f908', readVault: 'f909', locked: 'f910', readAll: 'f911', readForWrite: 'f912', writeAll: 'f913'},
  proxies: {list: 'f916', get: 'f918', save: 'f920', saveMany: 'f921', delete: 'f924', deleteAll: 'f926', readVault: 'f927', locked: 'f928', readAll: 'f929', readForWrite: 'f930', writeAll: 'f931'},
  payments: {list: 'f934', get: 'f936', save: 'f938', saveMany: 'f939', delete: 'f942', deleteAll: 'f944', readVault: 'f945', locked: 'f946', readAll: 'f947', readForWrite: 'f948', writeAll: 'f949'},
};

const record = (id, extra = {}) => ({id, name: 'record ' + id, updatedAt: 100 + ((Number(String(id).replace(/\D/g, '') || 0) * 7) % 5) * 10, ...extra});

function world(collection, options = {}) {
  const trace = [];
  const files = new Map();
  const dirs = [];
  const file = '/data/' + collection + '.vault';
  const fs = {
    existsSync(path) {trace.push(['exists', path]); return files.has(path);},
    readFileSync(path, encoding) {trace.push(['read', path, encoding]); if (options.readThrows) throw new Error('synthetic read'); return files.get(path);},
    writeFileSync(path, data, encoding) {trace.push(['write', path, encoding, data]); if (options.writeThrows) throw new Error('synthetic write'); files.set(path, data);},
    mkdirSync(path, mkOptions) {trace.push(['mkdir', path, mkOptions]); dirs.push(path);},
    renameSync(from, to) {trace.push(['rename', from, to]); files.set(to, files.get(from)); files.delete(from);},
  };
  const encrypt = (key, data) => {trace.push(['encrypt', key, Buffer.isBuffer(data)]); return {k: key, d: data.toString('base64')};};
  const decrypt = (key, envelope) => {trace.push(['decrypt', key]); if (envelope.k !== key || options.decryptThrows) throw new Error('synthetic bad key'); return Buffer.from(envelope.d, 'base64');};
  let clock = 1760000000000;
  const FakeDate = class extends Date {static now() {trace.push(['now']); clock += 7; return clock;}};
  return {trace, files, dirs, file, FakeDate, now: () => FakeDate.now(), slots: {18: fs, 537: encrypt, 538: decrypt}};
}

function seed(env, disk, key = 'K') {
  const put = text => env.files.set(env.file, text);
  if (disk === 'corrupt') put('not json');
  else if (disk === 'wrongKey') put(JSON.stringify({k: 'OTHER', d: Buffer.from('[]').toString('base64')}));
  else if (disk === 'notArray') put(JSON.stringify({k: key, d: Buffer.from('{"x":1}').toString('base64')}));
  else if (disk) put(JSON.stringify({k: key, d: Buffer.from(JSON.stringify(disk)).toString('base64')}));
  env.trace.length = 0;
}

function vaultFor(collection, native, env) {
  const {method} = harness({native, slots: env.slots, globals: {Date: env.FakeDate, Buffer}, dependencies: {now: env.now}});
  const instance = {dir: '/data', key: 'K', file: env.file};
  for (const [name, id] of Object.entries(VAULTS[collection])) instance[name] = method(id);
  return instance;
}

const DISKS = {
  missing: undefined,
  empty: [],
  three: [record('a1'), record('b2'), record('c3')],
  duplicates: [record('a1'), record('a1', {name: 'second'}), record('b2')],
  single: [record('s1')],
  mixedIds: [record(1), record('1'), record(2, {name: 'two'})],
  corrupt: 'corrupt', wrongKey: 'wrongKey', notArray: 'notArray',
};

for (const collection of Object.keys(VAULTS)) {
  const has = name => name in VAULTS[collection];
  const scenario = (name, disk, run, options = {}) => test(collection + ' vault matches the recovered methods: ' + name, async () => {
    await compare(async native => {
      const env = world(collection, options);
      seed(env, DISKS[disk]);
      const instance = vaultFor(collection, native, env);
      const value = await outcome(async () => run(instance));
      const stored = env.files.get(env.file);
      let decoded;
      try {decoded = JSON.parse(Buffer.from(JSON.parse(stored).d, 'base64').toString());} catch {decoded = stored === undefined ? undefined : 'unreadable';}
      return {value, trace: env.trace, decoded, dirs: env.dirs, fileNames: [...env.files.keys()]};
    });
  });
  for (const disk of Object.keys(DISKS)) {
    scenario('readVault / ' + disk, disk, vault => vault.readVault());
    scenario('locked / ' + disk, disk, vault => vault.locked());
    scenario('readAll / ' + disk, disk, vault => vault.readAll());
    scenario('readForWrite / ' + disk, disk, vault => vault.readForWrite());
    scenario('list / ' + disk, disk, vault => vault.list());
    if (has('get')) scenario('get / ' + disk, disk, vault => [vault.get('b2'), vault.get('missing'), vault.get(undefined), vault.get(1), vault.get('1')]);
    scenario('save update / ' + disk, disk, vault => vault.save(record('b2', {name: 'changed'})));
    scenario('save new / ' + disk, disk, vault => vault.save(record('z9')));
    scenario('saveMany / ' + disk, disk, vault => vault.saveMany([record('z9'), record('a1', {name: 'x'}), record('z9', {name: 'again'})]));
    scenario('saveMany empty / ' + disk, disk, vault => vault.saveMany([]));
    scenario('delete / ' + disk, disk, vault => [vault.delete('b2'), vault.delete('nope'), vault.delete(1), vault.delete('1')]);
    scenario('deleteAll / ' + disk, disk, vault => vault.deleteAll());
  }
  scenario('writeAll encrypts and swaps through a temporary file', 'empty', vault => vault.writeAll([record('only')]));
  scenario('write failure leaves the temporary file', 'three', vault => vault.save(record('w1')), {writeThrows: true});
  scenario('read failure reports locked', 'three', vault => [vault.readVault(), vault.locked()], {readThrows: true});
  scenario('decrypt failure reports locked', 'three', vault => vault.readVault(), {decryptThrows: true});
  test(collection + ' vault: the recovered locked message is the reconstructed one', async () => {
    const message = n => compare(async native => {
      const env = world(collection);
      seed(env, 'wrongKey');
      const instance = vaultFor(collection, native, env);
      try {instance.readForWrite();} catch (error) {return error.message;}
      return null;
    });
    const text = await message();
    assert.match(text, /locked/);
  });
}

test('every reviewed vault function has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const ids of Object.values(VAULTS)) for (const id of Object.values(ids)) assert.equal(typeof factories[id], 'function', id);
});
