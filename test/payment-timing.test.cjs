'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const {observePaymentTiming}=require('../src/main/runtime/payment-timing.cjs');
test('payment step observer invokes original immediately once and preserves result/errors',async()=>{
  const logs=[];let time=0,calls=0;const hooks=require('../src/main/runtime/payment-timing.cjs').paymentTiming((e,d)=>logs.push({e,...d}),()=>time);
  const result={ok:true};const args=[{private:'SECRET'}];
  assert.equal(await hooks.f2172(async arg=>{calls++;assert.equal(arg,args[0]);time=350;return result;},args),result);
  assert.equal(calls,1);assert.equal(logs[1].durationMs,350);assert.equal(JSON.stringify(logs).includes('SECRET'),false);
  const error=Error('failure');await assert.rejects(hooks.f2186(()=>{throw error;},[]),e=>e===error);
  assert.equal(logs.at(-1).failed,true);
});
test('payment timing records response latency without sensitive URL data',()=>{
  const context=new EventEmitter(),logs=[];let time=100;
  observePaymentTiming(context,(event,data)=>logs.push({event,...data}),()=>time);
  const req={url:()=> 'https://www.irctc.co.in/eticketing/protected/mapps1/bookingInitPayment?token=SECRET'};
  context.emit('request',req);time=4100;
  context.emit('response',{request:()=>req,status:()=>200});time=4150;context.emit('requestfinished',req);
  assert.equal(logs[1].responseMs,4000);assert.equal(logs[2].durationMs,4050);
  assert.equal(JSON.stringify(logs).includes('SECRET'),false);
  context.emit('request',{url:()=> 'https://other.example/bookingInitPayment'});
  assert.equal(logs.length,3);
});
test('failed requests finish once and diagnostic errors do not affect booking',()=>{
  const context=new EventEmitter(),logs=[];observePaymentTiming(context,(e,d)=>{logs.push(d);throw Error('log unavailable');},()=>100);
  const req={url:()=> 'https://www.irctc.co.in/x/addonServices'};
  assert.doesNotThrow(()=>{context.emit('request',req);context.emit('requestfailed',req);context.emit('requestfinished',req);});
  assert.equal(logs.length,2);assert.equal(logs[1].failed,true);
});
