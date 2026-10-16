'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
async function execute(native,options={}){
  const trace=[],env={SLOW_DOWN_PAYMENT_MS:options.delay},engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{env}}):{},globals:{...globalThis,Number,JSON,process:{env}}});
  const root=engine.context(1842,null),table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[397]=id=>{trace.push(['url',id]);return'https://example.invalid/bookingData/'+id;};
  root[398]=value=>value?.retryAfterMili??0;
  root[399]=value=>value?.pnr||value?.errorMessage?value:null;
  let calls=0,checks=0;
  const actor={opts:{slowDownPayment:!!options.slow},securityQuarantined:!!options.quarantined,terminal:false,pnrSeen:false,
    canRequestPnr(){trace.push(['can-request']);return ++checks!==(options.blockAt??-1);},
    tok(){trace.push(['tokens']);return{accessToken:'fixture-token',greq:'fixture-greq',bmiyek:'fixture-bmiyek'};},
    async waitForPnrRetry(ms){trace.push(['wait',ms]);return !options.cancelWait;},
    beginFinalPnrRequest(){trace.push(['begin']);},endFinalPnrRequest(){trace.push(['end']);},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    spaCsrf(){trace.push(['csrf']);return'fixture-csrf';},
  };
  const next=()=>options.responses&&calls in options.responses?options.responses[calls++]:options.repeating??(calls++,{pnr:'synthetic-pnr'});
  actor.gateway=options.api?null:{async bookingData(value){trace.push(['gateway',{...value,stopRetry:value.stopRetry()}]);if(options.throwGateway)throw Error('synthetic-secret-transport');return next();}};
  actor.safeCall=async(...args)=>{trace.push(['api',...args]);if(options.throwApi)throw Error('API failed');if(options.terminal)actor.terminal=true;return{body:next()};};
  let result,error;
  try{result=await engine.makeFunction('f2226',engine.context(2,root)).call(actor,'synthetic-transaction',{journey:'fixture'},options.maxAttempts);}
  catch(e){error={name:e.name,message:e.message};}
  // Deliberate privacy difference: native logs contain no raw response or
  // transaction identifier, and transport errors contain no supplier message.
  const comparable=trace.map(row=>{
    if(row[0]==='log'&&/^bookingData \(txn /.test(row[2]))return['log','gateway','bookingData response received','info'];
    if(row[0]==='log'&&/^bookingData threw: /.test(row[2]))return['log','gateway','bookingData request failed','warn'];
    return row;
  });
  return{trace:comparable,rawLogs:trace.filter(row=>row[0]==='log'),result,error,pnrSeen:actor.pnrSeen};
}
for(const[name,options]of Object.entries({gateway:{},api:{api:true},apiTerminal:{api:true,terminal:true},gatewayThrows:{throwGateway:true},apiThrows:{api:true,throwApi:true},
  blocked:{blockAt:1},blockedAtFetch:{blockAt:2},blockedAfterBegin:{blockAt:3},
  errorBooking:{responses:[{errorMessage:'synthetic booking rejection'}]},singleShot:{responses:[{}]},
  retryThenPnr:{responses:[{retryAfterMili:300}]},retryCap:{repeating:{retryAfterMili:300}},
  cancelledRetry:{responses:[{retryAfterMili:300}],cancelWait:true},
  slowDefault:{slow:true},slowZero:{slow:true,delay:'0'},slowCustom:{slow:true,delay:'123'},slowInvalid:{slow:true,delay:'invalid'},
  cancelledSlow:{slow:true,cancelWait:true},quarantinedSlow:{slow:true,quarantined:true},ignoredMax:{repeating:{retryAfterMili:300},maxAttempts:1},
}))test('booking-data poll matches recovered requests/results with safe diagnostics: '+name,async()=>{
  const before=await execute(false,options),after=await execute(true,options);
  assert.deepEqual({...after,rawLogs:undefined},{...before,rawLogs:undefined});
  assert.equal(JSON.stringify(after.rawLogs).includes('synthetic-transaction'),false);
  assert.equal(JSON.stringify(after.rawLogs).includes('synthetic-secret-transport'),false);
  assert.equal(JSON.stringify(after.rawLogs).includes('synthetic-pnr'),false);
});
