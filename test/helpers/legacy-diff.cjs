'use strict';
// Differential helper for TypeScript migrations: the previous JavaScript (test/fixtures/legacy/*.legacy.cjs) and the
// migrated module run the same scenario; the outcome (value or thrown error), the recorded side-effect trace and the
// final state of the scenario's objects must be identical.
const assert=require('node:assert/strict');
const {inspect}=require('node:util');

const show=value=>inspect(value,{depth:8,breakLength:Infinity,maxArrayLength:200,maxStringLength:300,sorted:false});
async function settle(run) {
  try{return{value:show(await run())};}
  catch(error){return{error:(error&&error.constructor&&error.constructor.name)+': '+(error&&error.message)};}
}

// differential(legacy, migrated) -> async check(label, scenario). `scenario(module, trace)` performs the call(s) and
// returns the value to compare; it should record side effects through `trace.push(...)`. Whatever the scenario
// returns as `state` (via {state}) is compared after the call, to catch mutations.
function differential(legacy,migrated) {
  return async function check(label,scenario) {
    const run=async module=>{
      const trace=[];
      const outcome=await settle(()=>scenario(module,trace));
      return{outcome,trace:show(trace)};
    };
    const expected=await run(legacy);
    const actual=await run(migrated);
    assert.deepEqual(actual,expected,label);
    stats.scenarios++;
    if(actual.outcome.error)stats.errors.set(actual.outcome.error,(stats.errors.get(actual.outcome.error)||0)+1);
    return actual;
  };
}
const exportsOf=module=>Object.keys(module).filter(key=>key!=='__esModule').sort();
function sameExports(legacy,migrated) {
  assert.deepEqual(exportsOf(migrated),exportsOf(legacy));
}
// DIFF_STATS=1 prints how many scenarios ended in an error, to spot tests that pass only because both sides fail early.
const stats={scenarios:0,errors:new Map()};
if(process.env.DIFF_STATS)process.on('exit',()=>console.error('differential scenarios:',stats.scenarios,'errors:',JSON.stringify([...stats.errors])));
module.exports={differential,sameExports,show,settle};
