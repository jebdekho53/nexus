'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native,id){
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(6,null),table=Object.assign({},...Object.values(strings));
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};return engine.makeFunction(id,engine.context(2,root));
}
async function run(native,id,scenario){
  const field=id==='f1621'?'survivorReq':'directCtx',trace=[];let release;
  const actor={[field]:{dispose(){assert.equal(this,context);trace.push(['dispose',actor[field]===undefined]);
    if(scenario==='throw')throw Error('synthetic dispose');
    if(scenario==='reject')return Promise.reject(Error('synthetic dispose'));
    if(scenario==='nonPromise')return undefined;
    if(scenario==='pending')return new Promise(resolve=>{release=resolve;});
    return Promise.resolve();
  }}};
  const context=actor[field];if(scenario==='missing')delete actor[field];if(scenario==='null')actor[field]=null;if(scenario==='false')actor[field]=false;
  const pending=fixture(native,id).call(actor);assert.equal(actor[field],undefined,'Ownership cleared before caller regains control');
  let replacement;
  if(release){replacement={synthetic:'replacement'};actor[field]=replacement;release();}
  try{const value=await pending;if(replacement)assert.equal(actor[field],replacement);return{value,trace,replacementPreserved:!!replacement&&actor[field]===replacement};}
  catch(error){return{error:error.name,trace};}
}
for(const id of ['f1621','f1630'])for(const scenario of ['success','missing','null','false','throw','reject','nonPromise','pending'])
  test('gateway disposal matches recovered '+id+': '+scenario,async()=>assert.deepEqual(await run(true,id,scenario),await run(false,id,scenario)));
test('disposal stays scoped to the requesting actor across independent pairs',async()=>{
  const calls=[],fn=fixture(true,'f1621');
  const first={survivorReq:{dispose(){calls.push('first');return Promise.resolve();}}},second={survivorReq:{dispose(){calls.push('second');return Promise.resolve();}}};
  await fn.call(first);assert.deepEqual(calls,['first']);assert.ok(second.survivorReq);
  await fn.call(second);assert.deepEqual(calls,['first','second']);
});
