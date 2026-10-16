'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const strings=require('./fixtures/payment-strings.json');
const {runProviderQr}=require('../src/main/payment/provider-qr.cjs');
const {bookingPaymentUrl}=require('../src/main/payment/request-url.cjs');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

function originalProvider(random){
  const table=Object.assign({},...Object.values(strings));
  const math=Object.create(Math);math.random=random;
  const engine=createEngine(definitions,{globals:{...globalThis,Math:math,String}});
  const root=engine.context(6,null);root[5]=(n,key)=>{
    const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing decoded fixture '+n+'|'+key);return value;
  };
  return engine.makeFunction('f2186',engine.context(2,root));
}
function fixture(options={}){
  const trace=[],journey={username:'synthetic',origin:'AAA',destination:'BBB'};
  let redirect=0;
  const actor={stopped:!!options.stopped,pnrSeen:false,api:{currentCsrf:'fixture-csrf'},
    tok(){trace.push(['tok']);return{accessToken:'fixture-token'};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    opts:{irctcqrPollSec:options.interval,onQr:options.noCallback?undefined:value=>{trace.push(['qr',value]);if(options.callbackThrows)throw Error('callback failed');}},
    session:{page:{async waitForTimeout(ms){trace.push(['wait',ms]);if(options.stopAfterWait)actor.stopped=true;if(options.waitReject)throw Error('wait closed');}}},
    paymentSetupFailed(message){trace.push(['setup-failed',message]);return{success:false,setup:true};},
    checkNowSleep(ms){trace.push(['check-now',ms]);return 'slept';},
    async settlePayment(...args){trace.push(['settle',...args]);if(options.settleReject)throw Error('settle failed');return{fixtureResult:'settled'};},
    gateway:{
      async paymentRedirect(value){trace.push(['redirect',value]);const response=(options.redirects||[{action:'fixture-action',encdata:'fixture-data'}])[redirect++];if(response instanceof Error)throw response;return response;},
      async providerQr(...args){trace.push(['provider-qr',...args]);if(options.qrReject)throw Error('QR unavailable');return options.qr===undefined?{payload:'synthetic-payload',qrAmount:123}:options.qr;},
      async pollProviderQr(qr,stop,onWait,max,interval,sleep){trace.push(['poll',qr,max,interval]);trace.push(['stop',stop()]);onWait();trace.push(['sleep-result',await sleep(50)]);if(options.pollReject)throw Error('poll failed');return{kind:'fixture-paid'};},
    },
  };
  return{actor,trace,journey};
}
async function execute(original,options){
  const f=fixture(options),random=()=>0.25;let result,error;
  try{result=await(original?originalProvider(random).call(f.actor,f.journey,'fixture-txn',99):runProviderQr(f.actor,f.journey,'fixture-txn',99,{random}));}
  catch(e){error={name:e.name,message:e.message};}
  return{trace:f.trace,result,error,paidQrAmount:f.actor.paidQrAmount};
}
for(const [name,options]of Object.entries({
  success:{},noCallback:{noCallback:true},zeroAmount:{qr:{payload:'synthetic',qrAmount:0}},fallbackAmount:{qr:{payload:'synthetic'}},
  secondAttempt:{redirects:[null,{action:'next',encdata:'data'}]},thirdAttempt:{redirects:[Error('transient'),null,{action:'next',encdata:'data'}]},
  noRedirect:{redirects:[null,null,null]},blocked:{redirects:[{blocked:true}]},stopped:{stopped:true},stopDuringBackoff:{redirects:[null],stopAfterWait:true},
  rejectedBackoff:{redirects:[null,{action:'next',encdata:'data'}],waitReject:true},missingQr:{qr:null},emptyPayload:{qr:{payload:''}},
  qrError:{qrReject:true},callbackError:{callbackThrows:true},pollError:{pollReject:true},settleError:{settleReject:true},
  customInterval:{interval:25},negativeInterval:{interval:-5},stringInterval:{interval:'2'},longInterval:{interval:1000},
}))test('provider QR reconstruction matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(false,options),await execute(true,options));
});
test('payment URL builder matches actual recovered builder across insurance and identifier inputs',()=>{
  const engine=createEngine(definitions),context=engine.context(346,null);
  context[5]=(n,key)=>strings.f510[n+'|'+key];context[345]='https://example.invalid/mapps1';
  const original=engine.makeFunction('f510',context);
  for(const id of ['txn','a/b?x=1',0,null,undefined])for(const insured of [true,false,undefined,null,0,1,'yes'])
    assert.equal(bookingPaymentUrl(context[345],id,insured),original(id,insured));
});
test('development migration switch replaces the complete provider function without executing its instructions',async()=>{
  const logs=[],invocations=[];
  const factories=reconstructedPayment({development:true,enabled:true});
  const engine=createEngine(definitions,{functionFactories:factories,functionInterceptors:require('../src/main/runtime/payment-timing.cjs').paymentTiming((e,d)=>logs.push({e,...d})),onInvoke:id=>invocations.push(id)});
  // No decoder or captured actor is provided. The native implementation must
  // operate through its explicit actor, not run or wrap the recovered bytecode.
  const run=engine.makeFunction('f2186'),f=fixture({stopped:true});
  const result=await run.call(f.actor,f.journey,'fixture-txn',99);
  assert.equal(result.success,false);assert.deepEqual(invocations,['f2186']);
  assert.equal(logs[0].step,'provider-qr');assert.equal(logs.at(-1).failed,false);
  for(const policy of [{},{development:true},{development:true,enabled:true,managedRelease:true},{development:false,enabled:true}])
    assert.deepEqual(reconstructedPayment(policy),{});
});
test('reconstructed URL uses late lexical binding and stays isolated across captured scopes',()=>{
  const engine=createEngine(definitions,{functionFactories:reconstructedPayment({development:true,enabled:true})});
  const a=engine.context(346,null),b=engine.context(346,null);a[345]=engine.HOLE;b[345]='https://b.invalid';
  const first=engine.makeFunction('f510',a),second=engine.makeFunction('f510',b);
  assert.throws(()=>first('txn',false),ReferenceError);a[345]='https://a.invalid';
  assert.equal(first('txn',false),'https://a.invalid/bookingInitPayment/txn?insurenceApplicable=NA');
  assert.equal(second('txn',true),'https://b.invalid/bookingInitPayment/txn?insurenceApplicable=');
});
test('parallel reconstructed QR runs keep cancellation, callbacks and settlement on their own actor',async()=>{
  const first=fixture({stopped:true}),second=fixture({});
  const [a,b]=await Promise.all([runProviderQr(first.actor,first.journey,'first',99),runProviderQr(second.actor,second.journey,'second',99)]);
  assert.equal(a.success,false);assert.equal(b.fixtureResult,'settled');
  assert.equal(first.trace.some(r=>r[0]==='qr'),false);assert.equal(second.trace.filter(r=>r[0]==='qr').length,1);
  assert.equal(second.trace.find(r=>r[0]==='settle')[3],'second');
});
test('migration refuses changed recovered identities or instructions before installing replacements',()=>{
  const modified={...definitions,f510:{...definitions.f510,code:[]}};
  assert.throws(()=>reconstructedPayment({development:true,enabled:true,definitions:modified}),/contract changed for f510/);
  assert.deepEqual(reconstructedPayment({development:true,enabled:true,managedRelease:true,definitions:modified}),{});
});
test('migration pins exception handlers and execution metadata, including local callbacks',()=>{
  const changes={kind:'NormalFunction',language:'sloppy',parameterCount:99,length:99,incoming:42,registerCount:999,registerCounts:{999:1},handlers:[[0,1,2,3,4]],nativeId:'changed'};
  for(const id of ['f510','f1620'])for(const[field,value]of Object.entries(changes)){
    const changed=field==='kind'?(definitions[id].kind==='NormalFunction'?'ArrowFunction':'NormalFunction'):value;
    const modified={...definitions,[id]:{...definitions[id],[field]:changed}};
    assert.throws(()=>reconstructedPayment({development:true,enabled:true,definitions:modified}),new RegExp('contract changed for '+id));
  }
});
