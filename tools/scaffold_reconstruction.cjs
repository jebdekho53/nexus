'use strict';
// Prepares the mechanical part of reconstructing recovered functions in TypeScript. Offline; executes no recovered code.
//
//   node tools/scaffold_reconstruction.cjs <name> f3949 f3950 ... [--children] [--no-fixture]
//
// For the given function ids (and, with --children, every function created inside them) it writes diagnostics/scaffold/<name>/:
//   dossier.md          readable compiled body of each function (decoder lookups and constants resolved), size, parent,
//                       name hint, and the bootstrap slots it reads or writes
//   slots.md            every bootstrap slot the functions use, with the hole-check name where the recovered code checks it,
//                       and ready-to-paste dependency accessors for src/main/runtime/reconstructed-payment.cjs
//   <name>.entry.cjs    the three-line .cjs entry point for a TypeScript module
//   <name>.test.skeleton.cjs   a test file skeleton wired to test/helpers/recovered-harness.cjs (not in test/, so it never fails the suite)
// It first extends test/fixtures/payment-strings.json for the id range (local string table only, additions only) so the dossier
// shows real property names. The judgment work stays manual: what the function does, its names, types and which parts are
// excluded (licensing, protection, fingerprints, captcha, credentials).
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const positional = args.filter(arg => !arg.startsWith('--'));
const name = positional.shift();
const ids = positional.filter(id => /^f\d+$/.test(id));
if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || !ids.length) {
  console.error('Usage: node tools/scaffold_reconstruction.cjs <module-name> f1234 [f1235 ...] [--children] [--no-fixture]');
  process.exit(2);
}

// ---- inventory -------------------------------------------------------------------------------------------------------
const csv = file => fs.readFileSync(path.join(root, 'docs/reconstruction-inventory', file), 'utf8').trim().split('\n').slice(1).map(line => line.split(','));
const nameInfo = new Map(csv('function-names.csv').map(row => [row[0], {parent: row[1], name: row[2]}]));
const instructions = new Map(csv('functions.csv').map(row => [row[0], Number(row[1])]));
const children = new Map();
for (const [id, info] of nameInfo) {
  if (!children.has(info.parent)) children.set(info.parent, []);
  children.get(info.parent).push(id);
}
const wanted = [];
const visit = id => {
  if (wanted.includes(id)) return;
  wanted.push(id);
  if (flags.has('--children')) for (const child of children.get(id) ?? []) visit(child);
};
ids.forEach(visit);
const numeric = id => Number(id.slice(1));

// ---- string fixture --------------------------------------------------------------------------------------------------
if (!flags.has('--no-fixture')) {
  const low = Math.min(...wanted.map(numeric)), high = Math.max(...wanted.map(numeric));
  const python = process.env.REA_PYTHON || process.env.PYTHON || 'python';
  const node = process.execPath;
  const result = spawnSync(python, [path.join(root, 'tools/export_payment_fixture.py'), '--node', node,
    '--decoder', path.join(root, '../recovery-tools/strdecode.py'), '--string-table', path.join(root, '../recovered-source/main-reconstruction/string-array.txt'),
    '--range', low + '-' + high, '--merge'], {encoding: 'utf8'});
  console.error(result.status === 0 ? 'fixture: ' + result.stdout.trim() : 'fixture NOT extended (' + (result.error?.message || result.stderr.trim().split('\n').pop()) + '); set PYTHON to a Python 3 and re-run, or pass --no-fixture');
}

// ---- compiled bodies -------------------------------------------------------------------------------------------------
const compiledDirectory = path.join(root, 'src/main/compiled');
const meta = require(path.join(compiledDirectory, 'meta.cjs'));
const parts = fs.readdirSync(compiledDirectory).filter(file => /^part-\d+\.cjs$/.test(file)).map(file => fs.readFileSync(path.join(compiledDirectory, file), 'utf8'));
const strings = Object.assign({}, ...Object.values(JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/payment-strings.json'), 'utf8'))));
const QUOTED = '"(?:[^"\\\\]|\\\\.)*"';
const decoderPatterns = [
  new RegExp('\\b(?:r\\d+|d\\d*)\\((\\d+),(' + QUOTED + ')\\)', 'g'),
  new RegExp('rt\\.call\\([^()]*(?:\\([^()]*\\)[^()]*)*,undefined,\\[(\\d+),(' + QUOTED + ')\\]\\)', 'g'),
];
const plain = value => {
  if (value && typeof value === 'object') {
    if (value.type === 'object') return '{' + value.entries.map(([key, entry]) => key + ':' + plain(entry)).join(',') + '}';
    if (value.type === 'array') return '[' + value.values.map(plain).join(',') + ']';
    if (value.type === 'uninitialized') return '_';
  }
  return JSON.stringify(value);
};
function bodyOf(id) {
  for (const part of parts) {
    const start = part.indexOf('exports.' + id + '=');
    if (start < 0) continue;
    const next = part.indexOf('\nexports.f', start + 10);
    return part.slice(start, next < 0 ? undefined : next);
  }
  return null;
}
function readable(id) {
  const raw = bodyOf(id);
  if (raw === null) return null;
  let text = raw.replace(/\n\s*\n/g, '\n');
  let unresolved = 0;
  for (const pattern of decoderPatterns) {
    text = text.replace(pattern, (match, index, quoted) => {
      const value = strings[index + '|' + JSON.parse(quoted)];
      if (value === undefined) { unresolved++; return match; }
      return '<' + JSON.stringify(value) + '>';
    });
  }
  text = text.replace(/K\[(\d+)\]/g, (match, n) => 'K' + n + '=' + plain(meta[id].constants[Number(n)]));
  text = text.replace(/if\(acc===HOLE\)throw new ReferenceError\("Cannot access "\+"([A-Za-z0-9_$]*)"\+" before initialization"\);/g, '/*hole:$1*/');
  return {text, unresolved};
}

// ---- slots ------------------------------------------------------------------------------------------------------------
const slotUse = new Map();
const note = (slot, kind, id, hole) => {
  if (!slotUse.has(slot)) slotUse.set(slot, {readers: new Set(), writers: new Set(), hole: new Set()});
  const entry = slotUse.get(slot);
  (kind === 'write' ? entry.writers : entry.readers).add(id);
  if (hole) entry.hole.add(hole);
};
const outputs = [];
for (const id of wanted) {
  const result = readable(id);
  if (!result) { outputs.push({id, missing: true}); continue; }
  const lines = result.text.split('\n');
  lines.forEach((line, index) => {
    // rt.outer(ctx,N)[slot] and rt.outer(rK,N)[slot]; the next line may carry the hole-check name
    for (const match of line.matchAll(/rt\.outer\((?:ctx|r\d+),(\d+)\)\[(\d+)\](=[^=])?/g)) {
      const hole = /\/\*hole:([^*]+)\*\//.exec(lines[index + 1] || '')?.[1];
      note(Number(match[2]), match[3] ? 'write' : 'read', id, hole);
    }
  });
  outputs.push({id, ...result});
}

const outDir = path.join(root, 'diagnostics/scaffold', name);
fs.mkdirSync(outDir, {recursive: true});
const dossier = ['# Dossier: ' + name, '', 'Generated by tools/scaffold_reconstruction.cjs; readable compiled bodies, not original source.', 'Registers (`rN`), `acc` and labels are compiler artefacts. `<"x">` is a resolved decoder string; `K<n>=` a constant-pool literal; `/*hole:name*/` marks an uninitialised-binding check.', ''];
for (const out of outputs) {
  const info = nameInfo.get(out.id) ?? {};
  dossier.push('## ' + out.id + (info.name ? ' (' + info.name + ')' : '') + ' — ' + (instructions.get(out.id) ?? '?') + ' instructions, parent ' + (info.parent || '-'), '');
  if (out.missing) { dossier.push('(no compiled body)', ''); continue; }
  if (out.unresolved) dossier.push('> ' + out.unresolved + ' decoder lookup(s) unresolved: extend the fixture range or run without --no-fixture.', '');
  dossier.push('```js', out.text.trim(), '```', '');
}
fs.writeFileSync(path.join(outDir, 'dossier.md'), dossier.join('\n'), 'utf8');

const slotLines = ['# Bootstrap slots used by ' + name, '', 'Depth in `rt.outer(ctx,N)` is relative to the scope of the function that reads it; handlers created directly in a registration function', 'use depth 1 for root slots (readBinding(slot, name, 1)) and depth 0 for that function\'s own context. Check which with the dossier.', '', '| Slot | Hole-check name | Read by | Written by |', '| ---: | --- | --- | --- |'];
for (const [slot, entry] of [...slotUse].sort((a, b) => a[0] - b[0])) {
  slotLines.push(`| ${slot} | ${[...entry.hole].join(', ') || '-'} | ${[...entry.readers].join(', ') || '-'} | ${[...entry.writers].join(', ') || '-'} |`);
}
slotLines.push('', '## Dependency accessors to paste into reconstructed-payment.cjs (rename the keys by what the slot is used for)', '', '```js',
  'const slot=(number,name)=>()=>readBinding(number,name,1);', 'const call=number=>(...args)=>readBinding(number,undefined,1)(...args);', '{');
for (const [slot, entry] of [...slotUse].sort((a, b) => a[0] - b[0])) {
  const hole = [...entry.hole][0];
  const write = entry.writers.size ? `, set_${slot}:value=>writeBinding(${slot},value,1)` : '';
  slotLines.push(`  slot${slot}:${hole ? `slot(${slot},'${hole}')` : `call(${slot})`}${write},`);
}
slotLines.push('}', '```', '');
fs.writeFileSync(path.join(outDir, 'slots.md'), slotLines.join('\n'), 'utf8');

fs.writeFileSync(path.join(outDir, name + '.entry.cjs'), `'use strict';\n// Implementation: src/ts/main/<dir>/${name}.ts (compiled by \`npm run build:ts\` into build/ts).\nmodule.exports=require('../runtime/ts-build.cjs').loadTs('main/<dir>/${name}');\n`, 'utf8');
fs.writeFileSync(path.join(outDir, name + '.test.skeleton.cjs'), `'use strict';
// Skeleton: compares the reconstructed ${name} with the recovered functions ${wanted.filter(id => ids.includes(id)).join(', ')}.
// Fill the slots with traced fakes, write one scenario per branch seen in the dossier (every error path, every falsy/empty input,
// both sides of every comparison), then run it and mutate the compiled TypeScript with tools/mutation_check.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, outcome, compare} = require('./helpers/recovered-harness.cjs');
const {HOLE} = require('../src/main/runtime/engine.cjs');

const summary = value => (typeof value === 'function' ? 'fn' : value && typeof value === 'object' ? (() => { try { return JSON.parse(JSON.stringify(value)); } catch { return 'object'; } })() : value);

function world(options = {}) {
  const trace = [];
  const rec = (label, ...a) => trace.push([label, ...a.map(summary)]);
  const call = (label, fallback) => (...a) => { rec(label, ...a); const r = options.returns && label in options.returns ? options.returns[label] : fallback; return typeof r === 'function' ? r(...a) : r; };
  const slots = {
    // slot: call('label', defaultValue) — see slots.md; use HOLE for the hole-checked slots to test the uninitialised case
  };
  return {trace, slots};
}

function handlersFor(native, env) {
  const {engine, root} = harness({native, slots: env.slots});
  const ctx = engine.context(4, root); // handlers created in a registration function: slot 2 holds the decoder
  ctx[2] = root[5];
  return id => engine.makeFunction(id, ctx);
}

function scenario(label, options, run) {
  test('${name} matches the recovered functions: ' + label, async () => {
    await compare(async native => {
      const env = world(options);
      const handler = handlersFor(native, env);
      const result = await outcome(async () => run(handler, {sender: 'sender'}, env));
      return {result, trace: env.trace};
    });
  });
}

// scenario('example', {}, (h, e) => h('${ids[0]}')(e));
`, 'utf8');

console.log(`${name}: ${wanted.length} function(s), ${slotUse.size} bootstrap slot(s)`);
console.log('wrote ' + path.relative(root, outDir) + '/{dossier.md,slots.md,' + name + '.entry.cjs,' + name + '.test.skeleton.cjs}');
