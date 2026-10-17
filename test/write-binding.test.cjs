'use strict';
// Native implementations may store into the lexical slots of the recovered code they replace (writeBinding), in the
// interpreter and in the compiled runtime. Reads still go through readBinding, so a store is visible to recovered code.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createCompiledRuntime} = require('../src/main/runtime/compiled-runtime.cjs');
const {createEngine, HOLE} = require('../src/main/runtime/engine.cjs');
const definitions = require('../src/main/generated/index.cjs');

function scenarios(make) {
  test('writeBinding stores at depth 0 and depth 1', () => {
    const {runtime, id} = make(({readBinding, writeBinding}) => function () {
      writeBinding(2, 'near');
      writeBinding(3, 'far', 1);
      return [readBinding(2, 'a'), readBinding(3, 'b', 1)];
    });
    const parent = runtime.context(5, null);
    const child = runtime.context(4, parent);
    assert.deepEqual(runtime.makeFunction(id, child)(), ['near', 'far']);
    assert.equal(child[2], 'near');
    assert.equal(parent[3], 'far');
  });
  test('writeBinding replaces an uninitialised slot and does not check it', () => {
    const {runtime, id} = make(({readBinding, writeBinding}) => function () {
      writeBinding(2, 1);
      return readBinding(2, 'x');
    });
    const scope = runtime.context(3, null);
    scope[2] = HOLE;
    assert.equal(runtime.makeFunction(id, scope)(), 1);
  });
  test('readBinding still reports an uninitialised slot after other stores', () => {
    const {runtime, id} = make(({readBinding, writeBinding}) => function () {
      writeBinding(3, 'other');
      return readBinding(2, 'x');
    });
    const scope = runtime.context(4, null);
    scope[2] = HOLE;
    assert.throws(() => runtime.makeFunction(id, scope)(), ReferenceError);
  });
  test('a store is seen by the next call', () => {
    let calls = 0;
    const {runtime, id} = make(({readBinding, writeBinding}) => function () {
      calls++;
      const before = readBinding(2, 'n');
      writeBinding(2, before + 1);
      return before;
    });
    const scope = runtime.context(3, null);
    scope[2] = 10;
    const fn = runtime.makeFunction(id, scope);
    assert.deepEqual([fn(), fn(), fn()], [10, 11, 12]);
    assert.equal(calls, 3);
  });
}

test('compiled runtime', () => {
  scenarios(factory => ({
    id: 'f0',
    runtime: createCompiledRuntime({meta: {f0: {kind: 'NormalFunction', language: 'strict', name: '', length: 0, constants: []}}, compiledBodies: {f0() {}}, functionFactories: {f0: factory}}),
  }));
});

test('interpreter', () => {
  scenarios(factory => ({id: 'f0', runtime: createEngine(definitions, {functionFactories: {f0: factory}})}));
});
