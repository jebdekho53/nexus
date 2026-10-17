'use strict';
// Function-level inventory of the TypeScript migration. Generated, offline, no recovered code is executed.
//
// Inputs: the module table of docs/typescript-migration.md (which recovered functions each TypeScript module replaces
// and how it is verified), the factory table src/main/runtime/reconstructed-payment.cjs (which functions are replaced by
// native code at all) and docs/reconstruction-inventory/functions.csv (size of each recovered function).
//
// Output: docs/reconstruction-inventory/typescript-modules.csv, typescript-functions.csv and TYPESCRIPT.md.
// The inventory keeps three things apart that module counts blur:
//   business_logic         reconstructed application logic that replaces recovered functions one for one
//   application_service    application features that wrap or observe the recovered code (interceptors, window helpers)
//   runtime_infrastructure typed engine, runtime support and the offline smoke harness: no business function is migrated
//   renderer_script        ordinary browser scripts
// and separates TypeScript from JavaScript-native replacements and from functions that still run as recovered code.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const csv = file => read(file).trim().split('\n').map(line => line.split(','));

const INFRASTRUCTURE = new Set(['engine', 'compiled-runtime', 'runtime-support', 'recovered-contract', 'offline-smoke', 'smoke-run', 'startup-support', 'development-windows', 'invoke-observer']);

function categoryOf(file) {
  if (file.startsWith('src/ts/renderer/')) return 'renderer_script';
  if (/^src\/ts\/main\/(booking|payment|storage|ipc|windows)\//.test(file)) return 'business_logic';
  if (INFRASTRUCTURE.has(path.basename(file, '.ts'))) return 'runtime_infrastructure';
  return 'application_service';
}

function expand(cell) {
  const ids = new Set();
  for (const match of cell.matchAll(/f(\d+)(?:\s*[–-]\s*f?(\d+))?/g)) {
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    if (to < from || to - from > 400) throw new Error('Implausible function range in the module table: ' + match[0]);
    for (let n = from; n <= to; n++) ids.add('f' + n);
  }
  return ids;
}

// ---- modules from the documentation table ----------------------------------------------------------------------------
const modules = [];
for (const line of read('docs/typescript-migration.md').split('\n')) {
  const match = /^\| `(src\/ts\/[^`]+)` \| (.*?) \| (.*?) \| (.*?) \|$/.exec(line);
  if (!match) continue;
  const [, file, purpose, functions, test] = match;
  modules.push({file, purpose, ids: expand(functions), test: test.replace(/`/g, ''), category: categoryOf(file)});
}
const sources = fs.readdirSync(path.join(root, 'src/ts'), {recursive: true}).filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts')).map(name => 'src/ts/' + name.replace(/\\/g, '/'));
// The browser-target renderer scripts are documented in their own section of the migration document, without function ids.
for (const file of sources.filter(name => name.startsWith('src/ts/renderer/') && !modules.some(module => module.file === name))) {
  modules.push({file, purpose: 'Browser-target renderer script (compiled to src/renderer/' + path.basename(file, '.ts') + '.js)', ids: new Set(), test: 'renderer-dom', category: 'renderer_script'});
}
const missing = sources.filter(file => !modules.some(module => module.file === file));

// ---- function sizes and factories ------------------------------------------------------------------------------------
const rows = csv('docs/reconstruction-inventory/functions.csv');
const header = rows.shift();
const instructions = new Map(rows.map(row => [row[0], Number(row[header.indexOf('instructions')])]));
const status = new Map(rows.map(row => [row[0], row[header.indexOf('status')]]));
const {reconstructedPayment} = require(path.join(root, 'src/main/runtime/reconstructed-payment.cjs'));
const factories = new Set(Object.keys(reconstructedPayment({development: true, enabled: true})));

// A function can be replaced by one module and wrapped by an interceptor module at the same time; the replacing module owns it.
const owner = new Map();
for (const module of modules) for (const id of module.ids) {
  const current = owner.get(id);
  if (!current || (current.category !== 'business_logic' && module.category === 'business_logic')) owner.set(id, module);
}

const functions = [];
for (const id of instructions.keys()) {
  const module = owner.get(id);
  let implementation = 'recovered';
  if (factories.has(id)) implementation = module ? 'typescript' : 'javascript_native';
  else if (module) implementation = 'typescript_interceptor_or_helper';
  if (implementation === 'recovered' && status.get(id) === 'pinned_support') implementation = 'recovered_pinned_support';
  functions.push({id, instructions: instructions.get(id), implementation, module: module ? module.file : '', category: module ? module.category : (implementation === 'javascript_native' ? 'business_logic' : ''), test: module ? module.test : ''});
}

// ---- output ----------------------------------------------------------------------------------------------------------
const quote = value => '"' + String(value).replace(/"/g, '""') + '"';
const out = file => path.join(root, 'docs/reconstruction-inventory', file);
fs.writeFileSync(out('typescript-modules.csv'), ['module,category,functions,instructions,verification,purpose',
  ...modules.map(m => [m.file, m.category, m.ids.size, [...m.ids].reduce((sum, id) => sum + (instructions.get(id) || 0), 0), quote(m.test), quote(m.purpose)].join(','))].join('\n') + '\n', {encoding: 'utf8'});
fs.writeFileSync(out('typescript-functions.csv'), ['id,instructions,implementation,module,category,verification',
  ...functions.filter(f => f.implementation !== 'recovered').map(f => [f.id, f.instructions, f.implementation, f.module, f.category, quote(f.test)].join(','))].join('\n') + '\n', {encoding: 'utf8'});

const total = functions.length;
const totalInstructions = functions.reduce((sum, f) => sum + f.instructions, 0);
const sum = predicate => { const picked = functions.filter(predicate); return {count: picked.length, instructions: picked.reduce((s, f) => s + f.instructions, 0)}; };
const pct = (part, whole) => (whole ? (100 * part / whole).toFixed(2) : '0') + '%';
const lines = [];
const row = (label, predicate) => { const s = sum(predicate); lines.push(`| ${label} | ${s.count} | ${s.instructions} | ${pct(s.instructions, totalInstructions)} |`); };

lines.push('# TypeScript migration inventory', '',
  'Generated by tools/typescript_inventory.cjs from docs/typescript-migration.md, the factory table and the recovered-function inventory.',
  'It does not execute recovered code. Module counts are not completion: only the function rows below say how much of the recovered', 'code is replaced.', '',
  `Recovered functions: **${total}** (${totalInstructions} original instructions).`, '',
  '## Recovered functions by what runs them', '',
  '| Implementation | Functions | Original instructions | Instruction share |', '| --- | ---: | ---: | ---: |');
row('TypeScript business logic (replaces the recovered function)', f => f.implementation === 'typescript' && f.category === 'business_logic');
row('TypeScript application services or runtime infrastructure that replace a function', f => f.implementation === 'typescript' && f.category !== 'business_logic');
row('TypeScript interceptors and helpers that wrap or serve a function which still runs as recovered code', f => f.implementation === 'typescript_interceptor_or_helper');
row('JavaScript native replacements (not TypeScript; excluded or not yet migrated)', f => f.implementation === 'javascript_native');
row('Recovered, reviewed support pinned for a native caller', f => f.implementation === 'recovered_pinned_support');
row('Recovered only (interpreted or compiled bundle)', f => f.implementation === 'recovered');
lines.push('', 'The interceptor row is not a replacement: the recovered function still executes and the TypeScript only observes or adjusts it.');
lines.push('', '## TypeScript modules by category', '', '| Category | Modules | Functions replaced |', '| --- | ---: | ---: |');
for (const category of ['business_logic', 'application_service', 'runtime_infrastructure', 'renderer_script']) {
  const picked = modules.filter(m => m.category === category);
  lines.push(`| ${category} | ${picked.length} | ${new Set(picked.flatMap(m => [...m.ids])).size} |`);
}
lines.push('', 'Wrappers and typed facades are not counted as reconstructed logic. `runtime_infrastructure` modules type the engine and the',
  'smoke harness; the engine still executes every function that has no replacement.', '');
if (missing.length) lines.push('## TypeScript sources missing from the module table', '', ...missing.map(file => '* ' + file), '');
fs.writeFileSync(out('TYPESCRIPT.md'), lines.join('\n'), {encoding: 'utf8'});
console.log(lines.slice(6, 16).join('\n'));
if (missing.length) { console.error('Sources missing from the module table: ' + missing.join(', ')); process.exitCode = 1; }
