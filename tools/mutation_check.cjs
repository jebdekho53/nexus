'use strict';
// Automatic mutation check of a compiled TypeScript module against its test file.
//
//   node tools/mutation_check.cjs build/ts/main/ipc/foo.js test/foo-reconstruction.test.cjs [--max N] [--lines A-B] [--timeout seconds] [--list]
//
// Applies one small mutation at a time to the compiled JavaScript (operators, boundaries, boolean literals, nullish/or, increments,
// early-return guards removed), runs the test file, restores the module, and reports mutants that survived: places where the tests
// would not notice a changed behaviour. A survivor is either a missing scenario or an equivalent mutant; look at each one.
// The original file is always restored, even on Ctrl-C or a crash. Only files under build/ts may be mutated.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = (flag, fallback) => { const index = args.indexOf(flag); if (index < 0) return fallback; return args.splice(index, 2)[1]; };
const max = Number(option('--max', 80));
const range = option('--lines', null);
const timeout = Number(option('--timeout', 120)) * 1000;
const listOnly = args.includes('--list') && (args.splice(args.indexOf('--list'), 1), true);
const [target, testFile] = args;
if (!target || (!testFile && !listOnly)) {
  console.error('Usage: node tools/mutation_check.cjs build/ts/<module>.js test/<file>.test.cjs [--max N] [--lines A-B] [--timeout s] [--list]');
  process.exit(2);
}
const file = path.resolve(root, target);
if (!file.startsWith(path.join(root, 'build', 'ts') + path.sep) || !fs.existsSync(file)) {
  console.error('Refusing to mutate ' + target + ': only existing files under build/ts are allowed.');
  process.exit(2);
}

const original = fs.readFileSync(file, 'utf8');
const lines = original.split('\n');
const [from, to] = range ? range.split('-').map(Number) : [1, lines.length];

// each rule: [name, regex (global), replacement]
const RULES = [
  ['=== -> !==', / === /g, ' !== '], ['!== -> ===', / !== /g, ' === '],
  ['> -> >=', / > (?!=)/g, ' >= '], ['>= -> >', / >= /g, ' > '], ['< -> <=', / < (?!=)/g, ' <= '], ['<= -> <', / <= /g, ' < '],
  ['&& -> ||', / && /g, ' || '], ['|| -> &&', / \|\| /g, ' && '], ['?? -> ||', / \?\? /g, ' || '],
  ['++ -> --', /\+\+/g, '--'], ['true -> false', /\btrue\b/g, 'false'], ['false -> true', /\bfalse\b/g, 'true'],
  ['+ -> -', / \+ (?![+=])/g, ' - '], ['0 -> 1', /(?<![\w.'"])0(?![\w.'"x])/g, '1'], ['1 -> 2', /(?<![\w.'"])1(?![\w.'"x\d])/g, '2'],
  ['negate if', /\bif \((?!!)/g, 'if (!'],
];
const SKIP = /^\s*(\/\/|\/\*|\*|"use strict"|Object\.defineProperty\(exports|exports\.\w+ = |const .* = require\()/;

const mutants = [];
lines.forEach((line, index) => {
  const number = index + 1;
  if (number < from || number > to || SKIP.test(line)) return;
  // strings and regex literals are masked so they are not mutated
  const masked = line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/(?![/*])(?:[^/\\\n]|\\.)+\/[gimsuy]*(?=[,;).\s])/g, m => ' '.repeat(m.length).replace(/ /g, '\u0001'));
  for (const [rule, regex, replacement] of RULES) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(masked)) !== null) {
      if (match[0].includes('\u0001')) continue;
      const mutated = line.slice(0, match.index) + replacement + line.slice(match.index + match[0].length);
      if (mutated !== line) mutants.push({number, rule, before: line.trim(), after: mutated.trim(), source: lines.map((text, i) => (i === index ? mutated : text)).join('\n')});
      if (match[0].length === 0) regex.lastIndex++;
    }
  }
});

if (listOnly) {
  for (const m of mutants) console.log(`${m.number}: ${m.rule}: ${m.before.slice(0, 90)}`);
  console.log(mutants.length + ' possible mutants');
  process.exit(0);
}

const restore = () => { try { fs.writeFileSync(file, original, 'utf8'); } catch { /* best effort */ } };
process.on('exit', restore);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { restore(); process.exit(130); });

// Spread the sample evenly when there are more mutants than --max.
const step = mutants.length > max ? mutants.length / max : 1;
const chosen = [];
for (let position = 0; position < mutants.length && chosen.length < max; position += step) chosen.push(mutants[Math.floor(position)]);

const runTests = () => {
  // Under `node --test` the child would inherit the runner's context and print no summary, so it is removed.
  const env = {...process.env};
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', testFile], {cwd: root, encoding: 'utf8', timeout, maxBuffer: 1 << 26, env});
  if (result.error || result.signal) return {killed: true, why: 'timeout'};
  const text = result.stdout + result.stderr;
  const failed = Number(/ℹ fail (\d+)/.exec(text)?.[1] ?? NaN);
  if (Number.isNaN(failed)) return {killed: true, why: 'no summary (crash)'};
  return {killed: failed > 0 || result.status !== 0, why: failed + ' failing'};
};

const baseline = runTests();
if (baseline.killed) {
  console.error('The unmutated module already fails its tests (' + baseline.why + '); fix that first.');
  process.exit(1);
}
const survivors = [];
let killed = 0;
for (const mutant of chosen) {
  fs.writeFileSync(file, mutant.source, 'utf8');
  const outcome = runTests();
  restore();
  if (outcome.killed) killed++;
  else survivors.push(mutant);
  process.stderr.write(outcome.killed ? '.' : 'S');
}
process.stderr.write('\n');
console.log(`${chosen.length} mutants tried of ${mutants.length} possible: ${killed} killed, ${survivors.length} survived`);
for (const s of survivors) console.log(`  line ${s.number} [${s.rule}]\n    - ${s.before.slice(0, 140)}\n    + ${s.after.slice(0, 140)}`);
process.exitCode = survivors.length ? 1 : 0;
