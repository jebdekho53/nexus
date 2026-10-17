'use strict';
// Compares the reconstructed booking-history vault (history-vault.ts, with the shared record-vault readers/writers)
// with the recovered methods of the class constructed by f950 on identical synthetic scenarios: an in-memory file
// system, a reversible fake cipher and a scripted clock. No real file, key or booking is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');

const MEMBERS = {
  list: 'f952', add: 'f954', importEntries: 'f955', delete: 'f957', deleteAll: 'f959', prune: 'f961',
  readVault: 'f964', readAll: 'f965', readForWrite: 'f966', writeAll: 'f967',
};
const NOW = 1760000000000;
const DAY = 86400000;
const entry = (id, ageDays, extra = {}) => ({id, pnr: 'P' + id, bookedAt: NOW - ageDays * DAY, train: '12345', ...extra});

function world(options = {}) {
  const trace = [];
  const files = new Map();
  const dirs = [];
  const file = '/data/history.vault';
  const fs = {
    existsSync(path) {trace.push(['exists', path]); return files.has(path);},
    readFileSync(path, encoding) {trace.push(['read', path, encoding]); return files.get(path);},
    writeFileSync(path, data, encoding) {trace.push(['write', path, encoding, data]); if (options.writeThrows) throw new Error('synthetic write'); files.set(path, data);},
    mkdirSync(path, mkOptions) {trace.push(['mkdir', path, mkOptions]); dirs.push(path);},
    renameSync(from, to) {trace.push(['rename', from, to]); files.set(to, files.get(from)); files.delete(from);},
  };
  const encrypt = (key, data) => {trace.push(['encrypt', key, Buffer.isBuffer(data)]); return {k: key, d: data.toString('base64')};};
  const decrypt = (key, envelope) => {trace.push(['decrypt', key]); if (envelope.k !== key) throw new Error('synthetic bad key'); return Buffer.from(envelope.d, 'base64');};
  const FakeDate = class extends Date {static now() {trace.push(['now']); return NOW;}};
  const slots = {18: fs, 537: encrypt, 538: decrypt};
  if (!options.unsetRetention) {slots[552] = options.maxEntries ?? 3; slots[553] = options.maxAge ?? 30 * DAY;}
  return {trace, files, dirs, file, FakeDate, now: () => FakeDate.now(), slots};
}

function seed(env, disk) {
  const put = text => env.files.set(env.file, text);
  if (disk === 'corrupt') put('not json');
  else if (disk === 'wrongKey') put(JSON.stringify({k: 'OTHER', d: Buffer.from('[]').toString('base64')}));
  else if (disk) put(JSON.stringify({k: 'K', d: Buffer.from(JSON.stringify(disk)).toString('base64')}));
  env.trace.length = 0;
}

function vaultFor(native, env) {
  const {method} = harness({native, slots: env.slots, globals: {Date: env.FakeDate, Buffer}, dependencies: {now: env.now}});
  const instance = {dir: '/data', key: 'K', file: env.file};
  for (const [name, id] of Object.entries(MEMBERS)) instance[name] = method(id);
  return instance;
}

const DISKS = {
  missing: undefined,
  empty: [],
  few: [entry('a', 1), entry('b', 5), entry('c', 3)],
  many: [entry('a', 1), entry('b', 2), entry('c', 3), entry('d', 4), entry('e', 5)],
  stale: [entry('a', 1), entry('old1', 40), entry('old2', 31), entry('edge', 30), entry('undated', 0, {bookedAt: undefined})],
  single: [entry('s', 2)],
  corrupt: 'corrupt', wrongKey: 'wrongKey',
};

function scenario(name, disk, run, options = {}) {
  test('history vault matches the recovered methods: ' + name, async () => {
    await compare(async native => {
      const env = world(options);
      seed(env, DISKS[disk]);
      const instance = vaultFor(native, env);
      const value = await outcome(async () => run(instance));
      const stored = env.files.get(env.file);
      let decoded;
      try {decoded = JSON.parse(Buffer.from(JSON.parse(stored).d, 'base64').toString());} catch {decoded = stored === undefined ? undefined : 'unreadable';}
      return {value, trace: env.trace, decoded, dirs: env.dirs, fileNames: [...env.files.keys()]};
    });
  });
}

for (const disk of Object.keys(DISKS)) {
  scenario('readVault / ' + disk, disk, vault => vault.readVault());
  scenario('readAll / ' + disk, disk, vault => vault.readAll());
  scenario('readForWrite / ' + disk, disk, vault => vault.readForWrite());
  scenario('list / ' + disk, disk, vault => vault.list());
  scenario('add / ' + disk, disk, vault => vault.add(entry('new', 0)));
  scenario('add old entry / ' + disk, disk, vault => vault.add(entry('ancient', 90)));
  scenario('delete / ' + disk, disk, vault => [vault.delete('b'), vault.delete('nope'), vault.delete(undefined), vault.delete('a')]);
  scenario('deleteAll / ' + disk, disk, vault => vault.deleteAll());
  scenario('prune / ' + disk, disk, vault => vault.prune([entry('x', 1), entry('y', 100), entry('z', 2), {id: 'w'}, entry('v', 0)]));
  scenario('importEntries / ' + disk, disk, vault => vault.importEntries([
    entry('imp1', 1), entry('a', 1), null, {id: 5, pnr: 'N'}, {id: 'nopnr'}, {id: 'imp1', pnr: 'dup'}, undefined, entry('imp2', 2),
  ]));
  scenario('importEntries nothing valid / ' + disk, disk, vault => vault.importEntries([{id: 'x'}, null, {pnr: 'P'}]));
  scenario('importEntries not an array / ' + disk, disk, vault => [vault.importEntries('x'), vault.importEntries(undefined), vault.importEntries([]), vault.importEntries({length: 1})]);
}
scenario('prune keeps the newest maxEntries', 'few', vault => vault.prune([entry('1', 1), entry('2', 2), entry('3', 3), entry('4', 4), entry('5', 5)]), {maxEntries: 2});
scenario('prune with a zero retention age drops everything old', 'few', vault => vault.prune([entry('1', 0), entry('2', 1)]), {maxAge: 0});
scenario('prune reports the retention settings as unset when they are', 'few', vault => vault.prune([entry('1', 1)]), {unsetRetention: true});
scenario('add reports the retention settings as unset when they are', 'few', vault => vault.add(entry('new', 0)), {unsetRetention: true});
scenario('write failure surfaces', 'few', vault => vault.add(entry('new', 0)), {writeThrows: true});

test('the locked message of the history vault is the recovered one', async () => {
  const text = await compare(async native => {
    const env = world();
    seed(env, 'wrongKey');
    const instance = vaultFor(native, env);
    try {instance.readForWrite();} catch (error) {return error.message;}
    return null;
  });
  assert.match(text, /^Booking history vault could not be decrypted/);
});

test('every reviewed history function has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of Object.values(MEMBERS)) assert.equal(typeof factories[id], 'function', id);
});
