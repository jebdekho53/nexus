'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

async function execute(native,options={}){
  const trace=[],engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals:{...globalThis,String,Array}}),root=engine.context(1842,null);
  const table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[396]=engine.makeFunction('f546',root);root[940]=engine.makeFunction('f2382',root);
  root[399]=value=>{trace.push(['normalize',value]);return options.normalized===undefined?value:options.normalized;};
  let time=0;
  const actor={opts:{gatewayHosts:options.hosts===undefined?{wps:{},qrGateway:{},paytm:{},phonepeApi:{},razorpay:{}}:options.hosts},
    stopped:!!options.stopped,securityQuarantined:!!options.quarantined,api:options.api===undefined?{currentCsrf:'fixture-csrf'}:options.api,
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    now(){trace.push(['now',time]);return time;},
    session:{page:{async waitForTimeout(ms){trace.push(['wait',ms]);time+=options.timeStep??5000;if(options.stopAfterWait)actor.stopped=true;if(options.waitError)throw Error('wait closed');}}},
    stopWith(message){trace.push(['stop',message]);return{success:false,message};},
    paymentSetupFailed(message){trace.push(['setup-failed',message]);return{success:false,message};},
    beginSettling(){trace.push(['begin-settling']);},beginFinalPnrRequest(){trace.push(['begin-pnr']);},
    tok(){trace.push(['tokens']);return{accessToken:'fixture-token',greq:'fixture-greq',bmiyek:'fixture-bmiyek',csrfToken:options.tokenCsrf??'fixture-token-csrf'};},
    finishBooking(value){trace.push(['finish',value]);return{syntheticBooking:value};},
    gateway:options.noGateway?null:{async walletVerify(value){trace.push(['verify',{...value,stopRetry:value.stopRetry()}]);if(options.verifyError)throw Error('verify failed');return options.response===undefined?{pnr:'synthetic-pnr'}:options.response;}},
  };
  for(const name of ['runProviderQr','runPaytmQr','runPhonePeQr','runRazorpay'])actor[name]=async(...args)=>{trace.push([name,...args]);if(options.runError)throw Error('gateway failed');return{syntheticGateway:name};};
  const journey={origin:'AAA',destination:'BBB'};let result,error;
  try{result=await engine.makeFunction('f2176',engine.context(2,root)).call(actor,journey,'fixture-txn',options.amount===undefined?99:options.amount,options.method??'wallet',{body:options.body===undefined?{transationId:'fixture-txn'}:options.body});}
  catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const[name,options]of Object.entries({
  wallet:{},zeroAmount:{amount:0},stopped:{stopped:true},cancelDuringCountdown:{stopAfterWait:true},waitError:{waitError:true},
  bankError:{body:{errorMessage:'synthetic failure',withoutOTP:true,paramList:[{key:'BALANCE',value:'100'}]}},
  errorNoBalance:{body:{error:'synthetic failure'}},zeroBalance:{body:{error:'synthetic failure',paramList:[null,{key:'BALANCE',value:0}]}},
  verifyError:{verifyError:true},nullVerification:{response:null},normalizedError:{normalized:{errorMessage:'synthetic rejected'}},
  returnedError:{response:{errorMessage:'synthetic error'},normalized:null},emptyNormalized:{response:{},normalized:null},
  fallbackCsrf:{api:null},emptyCsrf:{api:{currentCsrf:''},tokenCsrf:''},quarantined:{quarantined:true},
  paytm:{method:'paytm'},phonePe:{method:'phonepay'},providerQr:{method:'irctcqr'},razorpayQr:{method:'razorpayqr'},collect:{method:'paytmupi'},
  unknown:{method:'unknown'},missingHosts:{method:'paytm',hosts:null},noWps:{method:'paytm',hosts:{paytm:{}}},
  noPaytm:{method:'paytm',hosts:{wps:{}}},noGateway:{method:'paytm',noGateway:true},runError:{method:'paytm',runError:true},
}))test('gateway dispatch matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(true,options),await execute(false,options));
});
