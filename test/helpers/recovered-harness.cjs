'use strict';
// Shared harness for comparing a native implementation with the recovered function it replaces.
// Both sides run the same synthetic scenario; nothing here contacts a service or reads a profile.
const assert=require('node:assert/strict');
const {createEngine}=require('../../src/main/runtime/engine.cjs');
const definitions=require('../../src/main/generated/index.cjs');
const strings=Object.assign({},...Object.values(require('../fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../../src/main/runtime/reconstructed-payment.cjs');

const BUILTINS={NaN,Infinity,Promise,String,Number,Object,Array,JSON,RegExp,URL,Math,Date,Error,Set,Map,encodeURIComponent,decodeURIComponent,parseInt,parseFloat,isNaN,Boolean,Symbol};

// slots: root-scope values. A string like 'f150' becomes that recovered function created in the root scope;
// a function receives the engine and root and returns the value.
function harness({native=false,slots={},scope={},globals={},dependencies={}}={}) {
  const engine=createEngine(definitions,{
    functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies}):{},
    globals:{...BUILTINS,...globals},
  });
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(strings[n+'|'+key],undefined,'missing string fixture '+n+'|'+key);return strings[n+'|'+key];};
  for(const[slot,value]of Object.entries(slots))
    root[slot]=typeof value==='string'&&/^f\d+$/.test(value)?engine.makeFunction(value,root):typeof value==='function'&&value.length===2&&value.needsEngine?value(engine,root):value;
  const context=engine.context(Math.max(2,...Object.keys(scope).map(Number))+1,root);
  for(const[slot,value]of Object.entries(scope))context[slot]=value;
  // Closure whose enclosing function context holds the string decoder in slot 2 (nested helper functions).
  const nested=engine.context(3,root);nested[2]=root[5];
  return{engine,root,context,method:id=>engine.makeFunction(id,context),rootFunction:id=>engine.makeFunction(id,root),nestedFunction:id=>engine.makeFunction(id,nested)};
}

const plain=value=>JSON.parse(JSON.stringify(value===undefined?null:value));
async function outcome(run) {
  try{return{value:await run()};}
  catch(error){return{error:String(error&&error.message).startsWith('synthetic')?error.message:(error&&error.name)||'Error'};}
}

// Runs scenario(native) for both implementations and requires identical, JSON-comparable results.
async function compare(scenario,normalize=value=>value) {
  const actual=await scenario(true),expected=await scenario(false);
  assert.deepEqual(plain(normalize(actual)),plain(normalize(expected)));
  return actual;
}

module.exports={harness,plain,outcome,compare,definitions};
