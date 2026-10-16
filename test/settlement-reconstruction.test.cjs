'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json'),{reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

async function execute(native,options={}){
  const trace=[],engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{}}),root=engine.context(562,null);
  const table=Object.assign({},...Object.values(strings));root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[561]=value=>{trace.push(['normalize-proxy',value]);return 'http://'+value;};
  const actor={stopped:!!options.stopped,session:{proxy:options.proxy},
    stoppedResult(){trace.push(['stopped']);return{syntheticStopped:true};},beginSettling(){trace.push(['begin-settling']);},
    opts:{onQrClose(){trace.push(['qr-close']);},async onConfirm(value){trace.push(['confirm',value]);if(options.stopAfterConfirm)actor.stopped=true;if(options.confirmError)throw Error('confirm failed');return options.confirm===undefined?true:options.confirm;}},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    async pollBookingData(...args){trace.push(['poll-booking',...args]);if(options.pollError)throw Error('poll failed');return{syntheticPnr:true};},
    async finishBooking(value){trace.push(['finish',value]);if(options.finishError)throw Error('finish failed');return{success:!options.finishFalse};},
    gateway:options.noGateway?null:{
      useSurvivorProxy(value){trace.push(['proxy',value]);},async armSurvivor(){trace.push(['arm']);if(options.armError)throw Error('arm failed');},
      async bankResponse(...args){trace.push(['bank-response',...args]);if(options.bankError)throw Error('bank failed');return options.bank===undefined?true:options.bank;},
    },
  };
  if(options.noConfirm)delete actor.opts.onConfirm;
  const payment=options.payment===undefined?{kind:'paid',encdata:'synthetic-data'}:options.payment;let result,error;
  try{result=await engine.makeFunction('f2181',engine.context(2,root)).call(actor,payment,'encdata','fixture-txn',{paymentPause:!!options.pause},options.required);}
  catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const[name,options]of Object.entries({paid:{},paidStopped:{stopped:true},declined:{payment:{kind:'declined',reason:'synthetic'}},failed:{payment:{kind:'failed',reason:'synthetic'}},
  timeout:{payment:{kind:'timeout'}},stopped:{payment:{kind:'stopped'}},earlyStop:{stopped:true,payment:{kind:'timeout'}},unknown:{payment:{kind:'other'}},nullPayment:{payment:null},
  pause:{pause:true},pauseDeclined:{pause:true,confirm:false},pauseRejected:{pause:true,confirmError:true},pauseStopped:{pause:true,stopAfterConfirm:true},noConfirm:{pause:true,noConfirm:true},
  proxy:{proxy:{server:'localhost:8080',username:'synthetic',password:'fixture'}},blankProxy:{proxy:{server:'   '}},armRejected:{armError:true},
  bankFalse:{bank:false},bankRejected:{bankError:true},pollRejected:{pollError:true},finishRejected:{finishError:true},
  missingEncOptional:{payment:{kind:'paid'}},missingEncRequiredOk:{payment:{kind:'paid'},required:true},missingEncRequiredFailure:{payment:{kind:'paid'},required:true,finishFalse:true},
  missingGateway:{noGateway:true,payment:{kind:'paid'}},
}))test('common settlement matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(true,options),await execute(false,options));
});
