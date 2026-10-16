'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {bookingPaymentBody}=require('../src/main/payment/request-body.cjs');
const {isBankProcessingError,paymentResponseError}=require('../src/main/payment/payment-error.cjs');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
function fixture(native=false){
  const trace=[],engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(387,null);
  const table=Object.assign({},...Object.values(strings));root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[386]=method=>{trace.push(['default-bank',method]);return 999;};
  return{trace,engine,root};
}
test('payment request payload matches recovered wallet and nonwallet wire contracts',()=>{
  for(const method of ['wallet','paytm','phonepay','irctcqr','razorpayqr','',undefined])
    for(const amount of [123,'123.50',0,null,undefined])for(const override of [undefined,null,0,55,'55']){
      const old=fixture(),native=fixture(true);
      assert.deepEqual(native.engine.makeFunction('f535',native.root)(method,amount,override),old.engine.makeFunction('f535',old.root)(method,amount,override));
      assert.deepEqual(native.trace,old.trace);
    }
});
test('payload builder leaves default selection lazy and returns fresh parameter arrays',()=>{
  const fail=()=>{throw Error('default unavailable');};
  assert.equal(bookingPaymentBody('paytm',99,0,fail).bankId,0);
  assert.throws(()=>bookingPaymentBody('paytm',99,null,fail),/default unavailable/);
  const one=bookingPaymentBody('wallet',99,1),two=bookingPaymentBody('wallet',99,1);
  one.paramList[0].value='synthetic';assert.equal(two.paramList[0].value,'');
});
test('bank error classifier matches recovered message precedence and coercion',()=>{
  const f=fixture(),original=f.engine.makeFunction('f545',f.root);
  for(const value of [null,undefined,false,0,{},'OK','UNABLE TO PROCESS PAYMENT',
    {errorMessage:'Issue at bank end'},{error:'unable to process the request due to issue at bank'},
    {message:'Unable to process payment'},{errorMessage:'',error:'issue at bank end'},
    {errorMessage:0,message:'issue at bank end'},{errorMessage:null,error:'issue at bank end'},
    {error:[],message:'issue at bank end'},
  ])assert.equal(isBankProcessingError(value),original(value));
});
test('structured payment errors preserve recovered string filtering, precedence and whitespace',()=>{
  const f=fixture(),original=f.engine.makeFunction('f546',f.root);
  for(const value of [null,undefined,false,0,{},'raw error',
    {errorMessage:' first ',error:'last'},{errorMessage:'   ',errorMsg:' second '},
    {errorMessage:0,errorMsg:[],error_description:' description '},{error:' last '},
    {message:'generic message is not a provider error'},{error:{message:'nested'}},
  ])assert.equal(paymentResponseError(value),original(value));
});
