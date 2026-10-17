'use strict';
// The only failure-text difference the engine parity tool treats as equal.
//
// Calling a value that is not a function throws a TypeError in every engine. The original engine reaches the call through
// a Reflect.apply that a recovered function may have overwritten ("Reflect.apply is not a function"); the migrated engine
// uses the intrinsic it captured at load, so V8 words the same failure as
// "Function.prototype.apply was called on <value>, which is a <type> and not a function".
// Both wordings are normalised to one marker and nothing else is: any other outcome (a different error type, a different
// message, a returned value) is compared exactly.
const REFLECT_APPLY = /^throw:TypeError:Reflect\.apply is not a function$/;
const V8_APPLY = /^throw:TypeError:Function\.prototype\.apply was called on [^\n]*, which is an? [a-z]+ and not a function$/;

function normalizeCallFailure(outcome) {
  return REFLECT_APPLY.test(outcome) || V8_APPLY.test(outcome) ? 'throw:TypeError:call' : outcome;
}

function sameFailureWording(result) {
  const outcome = normalizeCallFailure(result.outcome);
  return outcome === result.outcome ? result : {...result, outcome};
}

module.exports = {normalizeCallFailure, sameFailureWording};
