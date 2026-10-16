'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {runPhonePe}=require('../src/main/payment/phonepe.cjs');

async function execute(original,options={}){
  const trace=[],random=()=>0.25,journey={username:'synthetic',origin:'AAA',destination:'BBB'};
  const actor={stopped:!!options.stopped,pnrSeen:!!options.pnrSeen,api:{currentCsrf:'fixture-csrf'},
    tok(){trace.push(['tok']);return{accessToken:'fixture-token'};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    opts:{onQr:options.noCallback?undefined:value=>{trace.push(['qr',value]);if(options.callbackError)throw Error('callback failed');}},
    paymentSetupFailed(message){trace.push(['setup-failed',message]);return{success:false,setup:true};},
    async settlePayment(...args){trace.push(['settle',...args]);if(options.settleError)throw Error('settle failed');return{syntheticResult:true};},
    gateway:{
      async phonePeRedirect(value){trace.push(['redirect',value]);if(options.redirectError)throw Error('redirect failed');return options.redirect===undefined?{action:'fixture-action',token:'fixture-token'}:options.redirect;},
      async phonePeQr(...args){trace.push(['fetch-qr',...args]);if(options.qrError)throw Error('QR failed');return options.qr===undefined?{qrBase64:'synthetic-image',phonePeToken:'fixture-qr-token'}:options.qr;},
      async pollPhonePe(token,stop,onWait){trace.push(['poll',token,stop()]);onWait();if(options.pollError)throw Error('poll failed');return{syntheticPaid:true};},
    },
  };
  let result,error;
  try{
    if(original){
      const table=Object.assign({},...Object.values(strings)),math=Object.create(Math);math.random=random;
      const engine=createEngine(definitions,{globals:{...globalThis,Math:math,String}}),root=engine.context(6,null);
      root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
      result=await engine.makeFunction('f2208',engine.context(2,root)).call(actor,journey,'fixture-txn',99);
    }else result=await runPhonePe(actor,journey,'fixture-txn',99,{random});
  }catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const [name,options]of Object.entries({success:{},noCallback:{noCallback:true},callbackError:{callbackError:true},
  redirectError:{redirectError:true},noToken:{redirect:{action:'fixture'}},nullRedirect:{redirect:null},tokenOnly:{redirect:{token:'fixture'}},
  qrError:{qrError:true},emptyQr:{qr:{qrBase64:'',phonePeToken:'fixture'}},qrNoToken:{qr:{qrBase64:'image'}},qrNull:{qr:null},
  pollError:{pollError:true},settleError:{settleError:true},stopped:{stopped:true},pnrSeen:{pnrSeen:true},
}))test('PhonePe orchestration matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(false,options),await execute(true,options));
});
