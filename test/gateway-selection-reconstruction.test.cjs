'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native,available,order=['phonepay','paytm','irctcqr','paytm']){
  const trace=[],engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(395,null);
  const table=Object.assign({},...Object.values(strings));root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[389]=order;root[392]=(data,key)=>{assert.equal(data,'synthetic-table');trace.push(['available',key]);return available.includes(key);};
  root[388]={paytm:[10,20],phonepay:[],irctcqr:[30]};
  root[386]=method=>{trace.push(['default-id',method]);return 999;};
  root[391]=(data,id)=>{assert.equal(data,'synthetic-table');trace.push(['bank',id]);return available.includes(id);};
  return{engine,root,trace};
}
test('gateway candidates preserve recovered preference, availability, duplicates and fallback',()=>{
  for(const selected of [undefined,'','paytm','phonepay','irctcqr','razorpayqr','paytmupi','wallet','unknown'])
    for(const available of [[],['paytm'],['phonepay','paytm'],['irctcqr','paytm'],['wallet']])
      for(const order of [[],['phonepay','paytm','irctcqr','paytm']]){
        const old=fixture(false,available,order),native=fixture(true,available,order);
        assert.deepEqual(native.engine.makeFunction('f544',native.root)(selected,'synthetic-table'),old.engine.makeFunction('f544',old.root)(selected,'synthetic-table'));
        assert.deepEqual(native.trace,old.trace);
      }
});
test('bank selection preserves configured order and uses default only when mapping is absent',()=>{
  for(const method of ['paytm','phonepay','irctcqr','unknown'])for(const available of [[],[10],[20],[30],[999]]){
    const old=fixture(false,available),native=fixture(true,available);
    assert.equal(native.engine.makeFunction('f542',native.root)('synthetic-table',method),old.engine.makeFunction('f542',old.root)('synthetic-table',method));
    assert.deepEqual(native.trace,old.trace);
  }
});
test('unsupported explicit gateway retains the original early return before default list initialization',()=>{
  const f=fixture(true,[]);f.root[389]=f.engine.HOLE;
  assert.deepEqual(f.engine.makeFunction('f544',f.root)('wallet','synthetic-table'),['wallet']);
  assert.throws(()=>f.engine.makeFunction('f544',f.root)('paytm','synthetic-table'),ReferenceError);
});
