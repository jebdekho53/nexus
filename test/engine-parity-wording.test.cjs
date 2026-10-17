'use strict';
// The engine parity tool may treat exactly two TypeError wordings as equal. Everything else must still be a mismatch.
const test = require('node:test');
const assert = require('node:assert/strict');
const {normalizeCallFailure, sameFailureWording} = require('../tools/compiler/failure-wording.cjs');

const same = (a, b) => JSON.stringify(sameFailureWording({outcome: a, log: 'x'})) === JSON.stringify(sameFailureWording({outcome: b, log: 'x'}));

const LEGACY = 'throw:TypeError:Reflect.apply is not a function';
const MIGRATED = 'throw:TypeError:Function.prototype.apply was called on manual, which is a string and not a function';

test('the two documented wordings compare equal, in either order', () => {
  assert.ok(same(LEGACY, MIGRATED));
  assert.ok(same(MIGRATED, LEGACY));
  assert.ok(same(MIGRATED, 'throw:TypeError:Function.prototype.apply was called on undefined, which is a undefined and not a function'));
  assert.ok(same(MIGRATED, 'throw:TypeError:Function.prototype.apply was called on 12, which is a number and not a function'));
  assert.ok(same(MIGRATED, 'throw:TypeError:Function.prototype.apply was called on [object Object], which is an object and not a function'));
});

test('genuinely different failures are still different', () => {
  const different = [
    'throw:TypeError:x is not a function',
    'throw:TypeError:Cannot read properties of undefined (reading \'a\')',
    'throw:RangeError:Reflect.apply is not a function',
    'throw:Error:Function.prototype.apply was called on manual, which is a string and not a function',
    'throw:TypeError:Reflect.apply is not a function (extra)',
    'throw:TypeError:Function.prototype.apply was called on manual, which is a string and not a function and more',
    'throw:TypeError:Function.prototype.apply was called on manual',
    'throw:TypeError:reflect.apply is not a function',
    'throw:ReferenceError:Reflect.apply is not a function',
    'ok:Reflect.apply is not a function',
    'ok:undefined',
    'loop',
  ];
  for (const outcome of different) {
    assert.ok(!same(LEGACY, outcome), 'legacy wording must not match ' + outcome);
    assert.ok(!same(MIGRATED, outcome), 'migrated wording must not match ' + outcome);
  }
});

test('only the outcome is normalised: a differing log or name still fails the comparison', () => {
  const left = sameFailureWording({outcome: LEGACY, log: 'a', name: 'f', length: 1});
  assert.notDeepEqual(left, sameFailureWording({outcome: MIGRATED, log: 'b', name: 'f', length: 1}));
  assert.notDeepEqual(left, sameFailureWording({outcome: MIGRATED, log: 'a', name: 'g', length: 1}));
  assert.deepEqual(left, sameFailureWording({outcome: MIGRATED, log: 'a', name: 'f', length: 1}));
});

test('normalizeCallFailure leaves every other string untouched', () => {
  for (const text of ['ok:1', 'throw:TypeError:other', '', 'throw:TypeError:Reflect.apply is not a function\nmore']) {
    assert.equal(normalizeCallFailure(text), text);
  }
});

test('the parity tool uses this module', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'tools', 'compiler', 'engine-parity.cjs'), 'utf8');
  assert.match(source, /require\('\.\/failure-wording\.cjs'\)/);
  assert.doesNotMatch(source, /CALL_WORDING/);
});
