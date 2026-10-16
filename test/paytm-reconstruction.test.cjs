'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {runPaytm}=require('../src/main/payment/paytm.cjs');

async function execute(original,options={}){
  const trace=[],random=()=>0.25;
  const timers={setInterval(fn,ms){trace.push(['interval',ms]);return 123;},clearInterval(id){trace.push(['clear',id]);}};
  const journey={username:options.username??'synthetic',origin:'AAA',destination:'BBB'};
  const actor={stopped:!!options.stopped,pnrSeen:false,api:{currentCsrf:'fixture-csrf'},
    tok(){trace.push(['tok']);return{accessToken:'fixture-token'};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    opts:{onQr:options.noCallback?undefined:value=>{trace.push(['qr',value]);if(options.callbackThrows)throw Error('callback failed');},onQrClose:()=>trace.push(['qr-close'])},
    beginSettling(){trace.push(['settling']);},stoppedResult(){trace.push(['stopped']);return{stopped:true};},
    paymentSetupFailed(message){trace.push(['setup-failed',message]);return{success:false,setup:true};},
    async pollBookingData(...args){trace.push(['booking-data',...args]);if(options.bookingDataError)throw Error('booking data failed');return{syntheticPnr:true};},
    finishBooking(value){trace.push(['finish',value]);return{syntheticBookingResult:true};},
  };
  actor.gateway={
    async paytmRedirect(value){trace.push(['redirect',value]);if(options.redirectError)throw Error('redirect unavailable');return options.redirect===undefined?{action:'fixture-action',mid:'fixture-merchant'}:options.redirect;},
    async paytmFetchQr(value){trace.push(['fetch-qr',value]);if(options.qrError)throw Error('QR unavailable');return options.qr===undefined?{qrBase64:'synthetic-image',orderId:'fixture-order'}:options.qr;},
    async waitForPaytmWs(mid,order,unused,stop){trace.push(['ws',mid,order,unused,stop()]);if(options.wsError)throw Error('ws down');return options.ws===undefined?{syntheticPaid:'ws'}:options.ws;},
    async pollPaytmStatus(mid,order,stop,onWait){trace.push(['poll',mid,order,stop()]);onWait();if(options.pollError)throw Error('poll down');return options.poll===undefined?null:options.poll;},
    async getFinalPaytmStatus(value){trace.push(['final-status',value]);if(options.finalError)throw Error('final status unavailable');return options.final===undefined?{mid:'fixture-merchant',encData:'synthetic-data',checksum:'synthetic-checksum'}:options.final;},
    async disposePaytmPage(){trace.push(['dispose']);if(options.disposeError)throw Error('dispose failed');},
    async paytmBankResponse(value){trace.push(['bank-response',value]);if(options.bankError)throw Error('bank response failed');return options.bank===undefined?true:options.bank;},
  };
  let result,error;
  try{
    if(original){
      const table=Object.assign({},...Object.values(strings)),math=Object.create(Math);math.random=random;
      const engine=createEngine(definitions,{globals:{...globalThis,Math:math,String,Promise,...timers}}),root=engine.context(1842,null);
      root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
      result=await engine.makeFunction('f2193',engine.context(2,root)).call(actor,journey,'fixture-txn',99);
    }else result=await runPaytm(actor,journey,'fixture-txn',99,{random,timers});
  }catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const [name,options]of Object.entries({
  success:{},noCallback:{noCallback:true},emptyUsername:{username:''},
  redirectMissing:{redirect:null},redirectNoAction:{redirect:{}},redirectError:{redirectError:true},
  qrError:{qrError:true},emptyQr:{qr:{qrBase64:'',orderId:'fixture'}},qrNull:{qr:null},callbackError:{callbackThrows:true},
  stopped:{stopped:true},noPayment:{ws:null,poll:false},pollWins:{ws:null,poll:{syntheticPaid:'poll'}},wsError:{wsError:true,poll:{syntheticPaid:'poll'}},
  bothFail:{wsError:true,pollError:true},finalMissing:{final:null},finalPartial:{final:{mid:'fixture'}},finalError:{finalError:true},
  disposeError:{disposeError:true},bankFalse:{bank:false},bankError:{bankError:true},bookingError:{bookingDataError:true},
}))test('PayTM orchestration matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(false,options),await execute(true,options));
});
