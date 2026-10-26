'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

async function execute(native,options={}){
  const trace=[],math=Object.create(Math);math.random=()=>options.random??0.25;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{random:math.random}}):{},globals:{...globalThis,Math:math,String}});
  const root=engine.context(1842,null),table=Object.assign({},...Object.values(strings));
  root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  const ids={paytm:10,phonepay:20,wallet:30};root[345]='https://example.invalid/mapps1';
  root[386]=method=>ids[method]??99;root[388]={paytm:[10],phonepay:[20],wallet:[30]};root[389]=['paytm','phonepay'];
  root[391]=(data,id)=>data.some(row=>row.bankId===id);
  root[392]=(data,method)=>data.some(row=>row.bankId===ids[method]);
  for(const[slot,id]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[940,'f2382']])root[slot]=engine.makeFunction(id,root);
  let calls=0;
  const actor={bankDetail:options.banks??[{bankId:10},{bankId:20}],opts:{hideBrowser:options.hideBrowser,onProxyOutcome:outcome=>trace.push(['proxy-outcome',outcome]),onQrPrepare(){trace.push(['qr-prepare']);if(options.prepareError)throw Error('prepare failed');}},stopped:!!options.stopped,terminal:options.terminal??false,lastAvail:options.lastAvail??null,
    async safeCall(...args){trace.push(['safe-call',...args]);if(++calls>12)throw Error('offline fixture request bound');if(options.requestError)throw Error('request failed');if(options.stopAt===calls)actor.stopped=true;if(options.terminalAt===calls)actor.terminal='synthetic terminal';return options.responses&&calls-1 in options.responses?options.responses[calls-1]:{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    stopWith(message){trace.push(['stop',message]);return{success:false,message};},
    paymentPageReferrer(){trace.push(['referrer']);return'https://example.invalid/payment';},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route']);if(options.routeError)throw Error('route failed');return options.routeResult??true;},
    minimizeBrowser(...args){trace.push(['minimize',...args]);if(options.minimizePending)return new Promise(()=>{});return options.minimizeError?Promise.reject(Error('minimize failed')):Promise.resolve();},
    async dispatchGateway(...args){trace.push(['dispatch',...args]);return options.gatewayDown?{success:false,gatewayDown:true,message:'synthetic down'}:{success:true};},
    session:{page:{async waitForTimeout(ms){trace.push(['wait',ms]);if(options.stopDuringWait)actor.stopped=true;if(options.waitReject)throw Error('wait closed');}}},
  };
  let result,error;
  try{result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:options.method??'paytm',travelInsurance:options.insurance},'fixture-txn',options.amount===undefined?99:options.amount,new Set(options.excluded));}
  catch(e){error={name:e.name,message:e.message};}
  if(!native){const index=trace.findIndex(row=>row[0]==='proxy-route');if(index>=0){const [entry]=trace.splice(index,1);const ready=trace.findIndex(row=>row[0]==='progress'&&['booking:fare','booking:pay-ready'].includes(row[1]));trace.splice(ready>=0?ready:index,0,entry);}}
  return{trace,result,error};
}
for(const[name,options]of Object.entries({success:{},insured:{insurance:true},phonePe:{method:'phonepay'},wallet:{method:'wallet',banks:[{bankId:30}]},
  excludedSelected:{excluded:['paytm']},allExcluded:{excluded:['paytm','phonepay']},noBanks:{banks:[]},stopped:{stopped:true},
  rejectedTransaction:{responses:[{ok:true,status:200,body:{errorMessage:'synthetic rejection',transationId:0}}]},
  transientThenSuccess:{responses:[{ok:false,status:503,body:{}}]},
  bankErrorThenSuccess:{responses:[{ok:true,status:200,body:{errorMessage:'unable to process payment'}}]},
  zeroAmount:{amount:0},nullAmount:{amount:null},fareOnly:{amount:0,lastAvail:'synthetic fare'},
  hiddenOff:{hideBrowser:false},minimizePending:{minimizePending:true},minimizeError:{minimizeError:true},
  requestError:{requestError:true},routeError:{routeError:true},prepareError:{prepareError:true},gatewayDown:{gatewayDown:true},
  nullResponse:{responses:[null]},clientError:{responses:[{ok:false,status:400,body:{}}]},
  retryExhausted:{responses:Array.from({length:4},()=>({ok:false,status:503,body:{}}))},
  retryClientErrors:{responses:[{ok:false,status:500,body:{}},...Array.from({length:3},()=>({ok:false,status:400,body:{}}))]},
  retryBankError:{responses:[{ok:false,status:500,body:{}},{ok:true,status:200,body:{errorMessage:'issue at bank end'}}]},
  stopAfterRequest:{stopAt:1},terminalAfterRequest:{terminalAt:1},stopDuringRetry:{stopAt:2,responses:[{ok:false,status:503,body:{}}]},
  terminalDuringRetry:{terminalAt:2,responses:[{ok:false,status:503,body:{}}]},stopDuringWait:{stopDuringWait:true,responses:[{ok:false,status:503,body:{}}]},
  rejectedWait:{waitReject:true,responses:[{ok:false,status:503,body:{}}]},highJitter:{random:0.999,responses:[{ok:false,status:503,body:{}}]},
  ipErrorString:{responses:[{ok:true,status:200,body:'Unable to process request'}]},
  accountErrorString:{responses:[{ok:true,status:200,body:'Unable to process this'}]},
  noTransactionNoError:{responses:[{ok:true,status:200,body:{}}]},
  zeroTransactionNoError:{responses:[{ok:true,status:200,body:{transationId:0}}]},
  zeroTransactionError:{responses:[{ok:true,status:200,body:{transationId:'0',errorMessage:'synthetic rejected'}}]},
  validTransactionWithMessage:{responses:[{ok:true,status:200,body:{transationId:'fixture-txn',errorMessage:'synthetic informational'}}]},
}))test('recovered payment initialization with native contracts matches baseline: '+name,async()=>{
  const before=await execute(false,options),after=await execute(true,options);
  if(!options.requestError&&!options.routeError&&!options.prepareError)assert.equal(before.error,undefined,'baseline fixture must complete: '+JSON.stringify(before.error));
  if(options.routeError){assert.equal(after.error?.message,'route failed');assert.equal(after.trace.some(row=>row[0]==='progress'&&row[1]==='booking:pay-ready'),false);}
  else if(options.prepareError){assert.equal(after.error?.message,'prepare failed');assert.equal(after.trace.filter(row=>row[0]==='proxy-route').length,1);}
  else assert.deepEqual(after,before);
});

test('payment proxy setup failure stops before fare, QR preparation or gateway dispatch',async()=>{
  const result=await execute(true,{routeResult:false});
  assert.equal(result.result.success,false);assert.match(result.result.message,/form proxy could not be set up/);
  assert.equal(result.trace.some(row=>row[0]==='dispatch'||row[0]==='qr-prepare'||row[0]==='progress'&&['booking:fare','booking:pay-ready'].includes(row[1])),false);
});
