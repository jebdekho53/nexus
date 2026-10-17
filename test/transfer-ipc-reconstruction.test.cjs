'use strict';
// Compares the reconstructed login/proxy import and export handlers (src/ts/main/ipc/transfer-ipc.ts) with the recovered
// handlers f3967, f3969, f3970, f3971, f3986, f3989, f3991 and f3993 on identical synthetic scenarios: fake dialogs, an
// in-memory file system, traced vaults and scripted parsers. No real dialog opens and no real file is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => {
  if (typeof value === 'function') return 'fn';
  if (value && typeof value === 'object') { if (value.__window) return 'win'; try {return JSON.parse(JSON.stringify(value));} catch {return 'object';} }
  return value;
};

function world(options = {}) {
  const trace = [];
  const rec = (name, ...args) => trace.push([name, ...args.map(summary)]);
  const value = (name, fallback) => (options.returns && name in options.returns ? options.returns[name] : fallback);
  const call = (name, fallback) => (...args) => {rec(name, ...args); const result = value(name, fallback); return typeof result === 'function' ? result(...args) : result;};
  const files = new Map(Object.entries(options.files ?? {}));
  const written = new Map();
  const fs = {
    readFileSync(path, encoding) {rec('fs.read', path, encoding); if (!files.has(path)) throw new Error('synthetic missing file'); return files.get(path);},
    writeFileSync(path, data, encoding) {rec('fs.write', path, data, encoding); if (options.writeFails) throw new Error('synthetic write'); written.set(path, data);},
  };
  const dialogs = {
    showSaveDialog(...args) {rec('dialog.save', ...args); return Promise.resolve(options.save ?? {canceled: false, filePath: '/out/x.txt'});},
    showOpenDialog(...args) {rec('dialog.open', ...args); return Promise.resolve(options.open ?? {canceled: false, filePaths: ['/in/a.txt']});},
  };
  const electron = {BrowserWindow: {fromWebContents(contents) {rec('fromWebContents', contents); return options.parent ? {__window: true} : null;}}, dialog: dialogs};
  const users = [{id: 'u1', username: 'alice'}, {id: 'u2', username: 'bob'}, {id: 'u3', username: ''}, {id: 'u4'}];
  const proxies = [{id: 'p1', label: 'Office', host: 'one.example'}, {id: 'p2', host: 'two.example'}, {id: 'p3'}];
  const vault = (prefix, list) => ({
    list: call(prefix + '.list', options[prefix + 'List'] ?? list),
    saveMany: call(prefix + '.saveMany', records => records.slice(0, options.saveLimit ?? records.length)),
  });
  let uuid = 0;
  let clock = 50000;
  const FakeDate = {now() {rec('Date.now'); return clock++;}};
  const slots = {
    22: options.holes?.includes(22) ? HOLE : electron, 18: fs,
    1789: call('usersVault', vault('users', users)), 1721: call('usersChanged', undefined),
    1794: call('parseUsers', (text, into) => {
      if (text === 'THROW') throw new Error('synthetic parse');
      let n = 0;
      for (const line of String(text).split('\n').filter(Boolean)) {into.push({username: line, id: 'imp-' + into.length}); n++;}
      return n;
    }),
    255: call('formatUser', record => 'LOGIN:' + record.username),
    1798: call('proxiesVault', vault('proxies', proxies)),
    262: call('formatProxy', proxy => 'PROXY:' + (proxy.host ?? 'none')),
    263: call('parseProxy', line => {
      const m = /^(?:(\w+):(\w+)@)?([^:\s]+)(?::(\d+))?$/.exec(line);
      if (!m) return null;
      return {username: m[1], password: m[2], host: m[3], port: m[4]};
    }),
    1464: call('isPrivateHost', host => /^(10\.|192\.168\.|127\.)/.test(host)),
    264: call('proxyFromLine', (item, id, now) => {
      if (item === 'THROW') throw new Error('synthetic proxy');
      if (!item || (typeof item === 'object' && !item.host) || (typeof item === 'string' && !item.includes(':'))) return null;
      return {id, now, source: item};
    }),
    23: options.holes?.includes(23) ? HOLE : {randomUUID() {rec('randomUUID'); return 'uuid-' + (++uuid);}},
  };
  return {trace, slots, written, FakeDate, rec};
}

function handlersFor(native, env) {
  const {engine, root} = harness({native, slots: env.slots, globals: {Date: env.FakeDate}, dependencies: {now: () => env.FakeDate.now()}});
  const ctx = engine.context(4, root);
  ctx[2] = root[5];
  return id => engine.makeFunction(id, ctx);
}

// maskErrorText: calling a method of a non-string fails with a TypeError whose wording names the failing expression, which differs
// between the interpreter and the TypeScript (the documented failure-only wording difference); the error class and result shape must match.
function scenario(name, options, run, maskErrorText = false) {
  test('login/proxy transfer IPC matches the recovered handlers: ' + name, async () => {
    const normalize = maskErrorText ? result => ({...result, result: {...result.result, value: {...result.result.value, error: typeof result.result.value?.error}}}) : undefined;
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const result = await outcome(async () => run(handler, {sender: 'sender'}, env));
      return {result, trace: env.trace, written: [...env.written]};
    }, normalize);
  });
}

const throwing = name => ({returns: {[name]: () => {throw new Error('synthetic ' + name);}}});
const FILES = {'/in/a.txt': 'alice\nbob\n', '/in/b.txt': 'carol', '/in/bad.txt': 'THROW', '/in/empty.txt': '', '/in/p.json': '["h1:80","h2:81"]', '/in/p1.json': '{"host":"x","port":1}',
  '/in/p.txt': 'h3:82\nh4:83\n\n  h5:84  \nnoport\n', '/in/pbad.json': '[null, "THROW", "h9:9"]', '/in/pnone.txt': 'nothing here'};

// ---- users ----
for (const parent of [false, true]) {
  for (const ids of [undefined, null, [], ['u1'], ['u1', 'u2'], ['nope'], 'u1', {length: 1}, ['u3'], ['u4']])
    scenario('exportUsers / ' + JSON.stringify(ids) + (parent ? ' / parent' : ''), {parent}, (h, e) => h('f3967')(e, ids));
}
scenario('exportUsers cancelled', {save: {canceled: true}}, (h, e) => h('f3967')(e, undefined));
scenario('exportUsers no path', {save: {canceled: false}}, (h, e) => h('f3967')(e, undefined));
scenario('exportUsers write fails', {writeFails: true}, (h, e) => h('f3967')(e, undefined));
scenario('exportUsers vault fails', throwing('users.list'), (h, e) => h('f3967')(e, undefined));
scenario('exportUsers formatter fails', throwing('formatUser'), (h, e) => h('f3967')(e, undefined));
scenario('exportUsers with a long and odd name', {usersList: [{id: 'a', username: 'A very/long user name with $pecial chars ' + 'x'.repeat(80)}]}, (h, e) => h('f3967')(e, undefined));
scenario('exportUsers with an all-symbol name', {usersList: [{id: 'a', username: '///'}]}, (h, e) => h('f3967')(e, undefined));
scenario('exportUsers with a numeric username', {usersList: [{id: 'a', username: 42}]}, (h, e) => h('f3967')(e, undefined), true);
scenario('exportUsers electron uninitialised', {holes: [22]}, (h, e) => h('f3967')(e, undefined));
for (const parent of [false, true]) {
  scenario('importUsers / ' + (parent ? 'parent' : 'no parent'), {parent, files: FILES, open: {canceled: false, filePaths: ['/in/a.txt', '/in/b.txt']}}, (h, e) => h('f3969')(e));
  scenario('importUserFile / ' + (parent ? 'parent' : 'no parent'), {parent, files: FILES}, (h, e) => h('f3970')(e));
}
scenario('importUsers cancelled', {open: {canceled: true, filePaths: ['/in/a.txt']}}, (h, e) => h('f3969')(e));
scenario('importUsers no files', {open: {canceled: false, filePaths: []}}, (h, e) => h('f3969')(e));
scenario('importUsers skips unreadable and unparsable files', {files: FILES, open: {canceled: false, filePaths: ['/in/missing.txt', '/in/bad.txt', '/in/a.txt']}}, (h, e) => h('f3969')(e));
scenario('importUsers saves nothing', {files: FILES, open: {canceled: false, filePaths: ['/in/empty.txt']}}, (h, e) => h('f3969')(e));
scenario('importUsers saveMany keeps some', {files: FILES, saveLimit: 1, open: {canceled: false, filePaths: ['/in/a.txt']}}, (h, e) => h('f3969')(e));
scenario('importUsers saveMany fails', {files: FILES, returns: {'users.saveMany': () => {throw new Error('synthetic save');}}}, (h, e) => h('f3969')(e));
scenario('importUsers change hook fails', {files: FILES, returns: {usersChanged: () => {throw new Error('synthetic hook');}}}, (h, e) => h('f3969')(e));
scenario('importUsers dialog rejects', {files: FILES, open: undefined, returns: {}}, async (h, e, env) => {env.slots[22].dialog.showOpenDialog = () => Promise.reject(new Error('synthetic dialog')); return h('f3969')(e);});
scenario('importUserFile cancelled', {open: {canceled: true}}, (h, e) => h('f3970')(e));
scenario('importUserFile none chosen', {open: {canceled: false, filePaths: []}}, (h, e) => h('f3970')(e));
scenario('importUserFile finds nothing', {files: FILES, open: {canceled: false, filePaths: ['/in/empty.txt']}}, (h, e) => h('f3970')(e));
scenario('importUserFile unreadable file', {files: FILES, open: {canceled: false, filePaths: ['/in/missing.txt']}}, (h, e) => h('f3970')(e));
scenario('importUserFile parse fails', {files: FILES, open: {canceled: false, filePaths: ['/in/bad.txt']}}, (h, e) => h('f3970')(e));
for (const items of [undefined, null, 'x', {}, [], [{text: 'alice\nbob'}], [{text: 'carol'}, null, undefined, {}, {text: ''}, {text: 5}, {text: 'THROW'}, {text: 'dave'}],
  [{text: 'x'.repeat(5242880)}, {text: 'x'.repeat(5242881)}], Array.from({length: 205}, (_, i) => ({text: 'user' + i}))])
  scenario('importUsersData / ' + JSON.stringify(items)?.slice(0, 60), {}, (h, e) => h('f3971')(e, items));
scenario('importUsersData saveMany keeps some', {saveLimit: 1}, (h, e) => h('f3971')(e, [{text: 'a\nb\nc'}]));
scenario('importUsersData saveMany fails', {returns: {'users.saveMany': () => {throw new Error('synthetic save');}}}, (h, e) => h('f3971')(e, [{text: 'a'}]));
// ---- proxies ----
for (const parent of [false, true]) {
  for (const ids of [undefined, [], ['p1'], ['p2'], ['p3'], ['p1', 'p2'], ['nope']])
    scenario('exportProxies / ' + JSON.stringify(ids) + (parent ? ' / parent' : ''), {parent}, (h, e) => h('f3986')(e, ids));
}
scenario('exportProxies cancelled', {save: {canceled: true}}, (h, e) => h('f3986')(e, undefined));
scenario('exportProxies write fails', {writeFails: true}, (h, e) => h('f3986')(e, undefined));
scenario('exportProxies empty vault', {proxiesList: []}, (h, e) => h('f3986')(e, undefined));
scenario('exportProxies single proxy without label or host', {proxiesList: [{id: 'z'}]}, (h, e) => h('f3986')(e, undefined));
for (const parent of [false, true])
  scenario('importProxies / ' + (parent ? 'parent' : 'no parent'), {parent, files: FILES, open: {canceled: false, filePaths: ['/in/p.json', '/in/p1.json', '/in/p.txt', '/in/pnone.txt']}}, (h, e) => h('f3989')(e));
scenario('importProxies cancelled', {open: {canceled: true}}, (h, e) => h('f3989')(e));
scenario('importProxies none chosen', {open: {canceled: false, filePaths: []}}, (h, e) => h('f3989')(e));
scenario('importProxies unreadable file', {files: FILES, open: {canceled: false, filePaths: ['/in/missing.txt', '/in/p.txt']}}, (h, e) => h('f3989')(e));
scenario('importProxies a throwing item abandons the rest of its file', {files: FILES, open: {canceled: false, filePaths: ['/in/pbad.json', '/in/p.txt']}}, (h, e) => h('f3989')(e));
scenario('importProxies saveMany fails', {files: FILES, returns: {'proxies.saveMany': () => {throw new Error('synthetic save');}}}, (h, e) => h('f3989')(e));
scenario('importProxies uuid source uninitialised', {files: FILES, holes: [23], open: {canceled: false, filePaths: ['/in/p.txt']}}, (h, e) => h('f3989')(e));
for (const text of ['one.example:80\ntwo.example:81', '\n  \n', 'alice:pw@proxy.example:8080', 'localhost:80\nfoo.localhost:81\nhost.local:82\n10.0.0.1:83\n192.168.1.9:84\n127.0.0.1:85\npublic.example:86',
  'noport.example', 'weird line!!', undefined, null, 0, '', 123, 'a:1\nb:2\nc:3\nd:4\ne:5\nf:6\ng:7\nh:8\nbad line one\nbad two', ' PUBLIC.Example:90 '])
  scenario('importProxyPaste / ' + JSON.stringify(text), {}, (h, e) => h('f3991')(e, text));
scenario('importProxyPaste reports only the first six invalid lines', {}, (h, e) => h('f3991')(e, 'x1\nx2\nx3\nx4\nx5\nx6\nx7\nx8'));
scenario('importProxyPaste hosts that only look like local ones', {}, (h, e) => h('f3991')(e, 'notlocal:1\nmy.locale:2\nxlocalhost:3\na.local:4\nb.localhost:5'));
scenario('importProxyPaste saveMany fails', {returns: {'proxies.saveMany': () => {throw new Error('synthetic save');}}}, (h, e) => h('f3991')(e, 'a.example:1'));
scenario('importProxyPaste parser throws', throwing('parseProxy'), (h, e) => h('f3991')(e, 'a.example:1'));
scenario('importProxyPaste private-host check throws', throwing('isPrivateHost'), (h, e) => h('f3991')(e, 'a.example:1'));
scenario('importProxyPaste saveMany keeps some', {saveLimit: 1}, (h, e) => h('f3991')(e, 'a.example:1\nb.example:2'));
for (const parent of [false, true])
  scenario('importProxyFile / ' + (parent ? 'parent' : 'no parent'), {parent, files: FILES, open: {canceled: false, filePaths: ['/in/p.json']}}, (h, e) => h('f3993')(e));
for (const file of ['/in/p1.json', '/in/p.txt', '/in/pnone.txt', '/in/empty.txt', '/in/pbad.json', '/in/missing.txt'])
  scenario('importProxyFile / ' + file, {files: FILES, open: {canceled: false, filePaths: [file]}}, (h, e) => h('f3993')(e));
scenario('importProxyFile cancelled', {open: {canceled: true}}, (h, e) => h('f3993')(e));
scenario('importProxyFile none chosen', {open: {canceled: false, filePaths: []}}, (h, e) => h('f3993')(e));

test('every reviewed transfer handler has a factory', () => {
  const {reconstructedPayment} = require('../src/main/runtime/reconstructed-payment.cjs');
  const factories = reconstructedPayment({development: true, enabled: true});
  for (const id of ['f3967', 'f3969', 'f3970', 'f3971', 'f3986', 'f3989', 'f3991', 'f3993']) assert.equal(typeof factories[id], 'function', id);
});
