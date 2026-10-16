'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');

test('compiled runtime builds the bootstrap wrapper without loading instruction definitions', () => {
  // A fresh process keeps other tests' module cache out of the check.
  const script = `
    const {createCompiledRuntime} = require(${JSON.stringify(path.resolve(__dirname, '../src/main/runtime/compiled-runtime.cjs'))});
    const wrapper = createCompiledRuntime().makeFunction('f0');
    if (typeof wrapper() !== 'function') throw new Error('f0 did not return the bootstrap wrapper');
    const loaded = Object.keys(require.cache).filter(file => file.replaceAll('\\\\', '/').includes('/src/main/generated/'));
    process.stdout.write(String(loaded.length));
  `;
  const result = spawnSync(process.execPath, ['-e', script], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '0');
});

test('compiled metadata covers every compiled function', () => {
  const meta = require('../src/main/compiled/meta.cjs');
  const bodies = require('../src/main/compiled/index.cjs');
  assert.deepEqual(Object.keys(meta).sort(), Object.keys(bodies).sort());
});
