'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native,id,dependencies={}){
  const math=Object.create(Math);math.random=dependencies.random??Math.random;
  const engine=createEngine(definitions,{globals:{URL,Math:math,globalThis:dependencies.globals??globalThis},functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies}):{}});
  const root=engine.context(6,null),table=Object.assign({},...Object.values(strings));
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing '+n+'|'+key);return value;};
  return engine.makeFunction(id,engine.context(2,root));
}
for(const scenario of ['uuid','noCrypto','noUuid','falseUuid','invalidUuid','throwUuid','getter','randomZero','throwNow'])
  test('payment request ID preserves recovered selection, receiver and evaluation order: '+scenario,()=>{
    function run(native){
      const calls=[],crypto={};
      if(['uuid','throwUuid'].includes(scenario))crypto.randomUUID=function(){assert.equal(this,crypto);calls.push('uuid');if(scenario==='throwUuid')throw Error('synthetic uuid failure');return 'fixture-uuid';};
      if(scenario==='falseUuid')crypto.randomUUID=false;
      if(scenario==='invalidUuid')crypto.randomUUID=true;
      if(scenario==='getter')Object.defineProperty(crypto,'randomUUID',{get(){calls.push('get-uuid');return function(){assert.equal(this,crypto);calls.push('uuid');return 'fixture-uuid';};}});
      const actor={now(){calls.push('now');if(scenario==='throwNow')throw Error('synthetic clock failure');return 123;}};
      const fn=fixture(native,'f2232',{globals:{crypto:scenario==='noCrypto'?undefined:crypto},random(){calls.push('random');return scenario==='randomZero'?0:0.25;}});
      try{return{value:fn.call(actor),calls};}catch(error){return{error:error.name,calls};}
    }
    assert.deepEqual(run(true),run(false));
  });
test('session-token helper preserves reference and missing-session errors',()=>{
  const tokens={synthetic:true};
  for(const native of [false,true]){
    const fn=fixture(native,'f2230');assert.equal(fn.call({session:{tokens}}),tokens);
    assert.equal(fn.call({session:{}}),undefined);
    assert.throws(()=>fn.call({}),TypeError);
  }
});
for(const [name,make]of Object.entries({
  page:()=>({session:{page:{url:()=> 'https://example.invalid/route?q=fixture'}},opts:{providerUrl:'https://fallback.invalid'}}),
  fallback:()=>({session:{},opts:{providerUrl:'https://fallback.invalid/path'}}),
  emptyPage:()=>({session:{page:{url:()=>''}},opts:{providerUrl:'https://fallback.invalid'}}),
  invalidPage:()=>({session:{page:{url:()=> 'invalid'}},opts:{providerUrl:'https://fallback.invalid'}}),
  opaqueOrigin:()=>({session:{page:{url:()=> 'data:text/plain,fixture'}},opts:{}}),
  absent:()=>({}),nullPage:()=>({session:{page:null},opts:{}}),
  throwingPage:()=>({session:{page:{url(){throw Error('synthetic');}}},opts:{providerUrl:'https://fallback.invalid'}}),
  missingOptions:()=>({session:{}}),
}))test('payment referrer matches recovered selection and exception handling: '+name,()=>{
  assert.equal(fixture(true,'f2231').call(make()),fixture(false,'f2231').call(make()));
});
async function finalization(native,scenario){
  const calls=[],booking={synthetic:true},failure=Error('synthetic core failure');
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const actor={
    finishBookingCore(value){assert.equal(this,actor);assert.equal(value,booking);calls.push('core');
      if(scenario==='syncThrow')throw failure;
      if(scenario==='reject')return Promise.reject(failure);
      if(scenario==='pending')return pending;
      return booking;
    },
    endFinalPnrRequest(){assert.equal(this,actor);calls.push('endPnr');if(scenario==='firstCleanupThrow')throw Error('synthetic first cleanup');if(scenario==='cleanupPromise')return new Promise(()=>{});},
    endSettling(){assert.equal(this,actor);calls.push('endSettling');if(scenario==='secondCleanupThrow')throw Error('synthetic second cleanup');},
  };
  const result=fixture(native,'f2243').call(actor,booking);
  if(scenario==='pending'){await Promise.resolve();assert.deepEqual(calls,['core']);release(booking);}
  try{const value=await result;assert.equal(value,booking);return{calls,ok:true};}
  catch(error){return{calls,error:error.message};}
}
for(const scenario of ['success','syncThrow','reject','pending','firstCleanupThrow','secondCleanupThrow','cleanupPromise'])
  test('booking finalization preserves recovered cleanup ordering: '+scenario,async()=>{
    assert.deepEqual(await finalization(true,scenario),await finalization(false,scenario));
  });
