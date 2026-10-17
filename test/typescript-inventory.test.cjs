'use strict';
// The generated TypeScript migration inventory must match the module table, the factory table and the function inventory.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = ['typescript-modules.csv', 'typescript-functions.csv', 'TYPESCRIPT.md'].map(name => path.join(root, 'docs', 'reconstruction-inventory', name));

test('the committed TypeScript inventory is current', () => {
  const before = files.map(file => fs.readFileSync(file, 'utf8'));
  const result = spawnSync(process.execPath, [path.join(root, 'tools', 'typescript_inventory.cjs')], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const after = files.map(file => fs.readFileSync(file, 'utf8'));
  files.forEach((file, index) => assert.equal(after[index], before[index], path.basename(file) + ' is stale; run node tools/typescript_inventory.cjs'));
});

test('every TypeScript source appears in the module table and no function has two implementations', () => {
  const functions = fs.readFileSync(files[1], 'utf8').trim().split('\n').slice(1).map(line => line.split(',')[0]);
  assert.equal(new Set(functions).size, functions.length);
  const text = fs.readFileSync(files[2], 'utf8');
  assert.doesNotMatch(text, /missing from the module table/);
});

test('business logic is counted apart from infrastructure and interceptors', () => {
  const text = fs.readFileSync(files[2], 'utf8');
  assert.match(text, /TypeScript business logic/);
  assert.match(text, /interceptors and helpers that wrap or serve a function which still runs as recovered code/);
  assert.match(text, /runtime_infrastructure/);
});
