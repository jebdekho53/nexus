'use strict';
// tools/mutation_check.cjs must kill mutants that a test notices, report the ones it does not, always restore the module, and
// refuse to touch anything outside build/ts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools', 'mutation_check.cjs');

function withFixture(testSource, run) {
  const directory = path.join(root, 'build', 'ts', '_mutation-check-fixture-' + process.pid);
  fs.mkdirSync(directory, {recursive: true});
  const module_ = path.join(directory, 'sample.js');
  const source = `'use strict';
function classify(n) {
  if (n > 10) return 'big';
  if (n === 0) return 'zero';
  return 'small';
}
function untested(a, b) {
  return a + b;
}
module.exports = {classify, untested};
`;
  fs.writeFileSync(module_, source, 'utf8');
  const testFile = path.join(os.tmpdir(), 'mutation-check-fixture-' + process.pid + '.test.cjs');
  fs.writeFileSync(testFile, testSource.replaceAll('__MODULE__', JSON.stringify(module_)), 'utf8');
  try {
    return run({module_, testFile, source});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
    fs.rmSync(testFile, {force: true});
  }
}

const TEST = `
const test = require('node:test');
const assert = require('node:assert/strict');
const {classify} = require(__MODULE__);
test('classify', () => {
  assert.equal(classify(11), 'big');
  assert.equal(classify(10), 'small');
  assert.equal(classify(0), 'zero');
  assert.equal(classify(5), 'small');
});
`;

test('tested lines are killed, an untested function survives, and the module is restored', () => {
  withFixture(TEST, ({module_, testFile, source}) => {
    const relative = path.relative(root, module_);
    const result = spawnSync(process.execPath, [tool, relative, testFile, '--max', '40'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /survived/);
    assert.match(result.stdout, /return a \+ b|a - b/, 'the untested addition must be reported as a survivor');
    assert.doesNotMatch(result.stdout, /line 2 /, 'the tested comparison must not survive');
    assert.equal(fs.readFileSync(module_, 'utf8'), source, 'the module must be restored');
  });
});

test('a fully tested module reports no survivors and exits 0', () => {
  withFixture(TEST + `test('untested is now covered', () => { assert.equal(require(__MODULE__).untested(2, 3), 5); });`, ({module_, testFile, source}) => {
    const result = spawnSync(process.execPath, [tool, path.relative(root, module_), testFile, '--max', '40'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /0 survived/);
    assert.equal(fs.readFileSync(module_, 'utf8'), source);
  });
});

test('a failing unmutated module is refused', () => {
  withFixture(TEST.replace("'big'", "'huge'"), ({module_, testFile}) => {
    const result = spawnSync(process.execPath, [tool, path.relative(root, module_), testFile], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already fails/);
  });
});

test('files outside build/ts are refused', () => {
  const result = spawnSync(process.execPath, [tool, 'package.json', 'test/mutation-check.test.cjs'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 2);
  assert.match(result.stderr, /only existing files under build\/ts/);
  const outside = spawnSync(process.execPath, [tool, '../outside.js', 'test/mutation-check.test.cjs'], {cwd: root, encoding: 'utf8'});
  assert.equal(outside.status, 2);
});
