'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {bookingRetryDelay}=require('../src/main/payment/retry-delay.cjs'),{bookingDataUrl}=require('../src/main/payment/request-url.cjs');
function fixture(){
  const engine=createEngine(definitions),root=engine.context(346,null),table=Object.assign({},...Object.values(strings));
  root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};root[345]='https://example.invalid/mapps1';
  return{engine,root};
}
test('provider-directed PNR retry parser matches recovered aliases, coercion and bounds',()=>{
  const f=fixture(),original=f.engine.makeFunction('f548',f.root);
  const values=[undefined,null,false,0,'',{},[],{nested:{retryAfterMilis:2500}},'{"RETRYAFTERMILI":"3000"}',
    ...[-1,0,1,999,1000,1234,20000,20001,1.5].flatMap(value=>[{retryAfterMili:value},{retryAfterMilis:String(value)}]),
    '{"retryAfterMili":"'+'9'.repeat(400)+'"}'];
  for(const value of values)assert.equal(bookingRetryDelay(value),original(value));
});
test('booking-data URL preserves the recovered literal contract',()=>{
  const f=fixture(),original=f.engine.makeFunction('f547',f.root);
  for(const id of ['fixture',0,null,undefined,'a/b?x=1'])assert.equal(bookingDataUrl(f.root[345],id),original(id));
});
