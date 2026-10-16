'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {createEngine}=require('../src/main/runtime/engine.cjs');
const {runRazorpay}=require('../src/main/payment/razorpay.cjs');

async function execute(original,options={}){
  const trace=[],random=()=>0.25,journey={username:'synthetic',origin:'AAA',destination:'BBB',upiId:options.upiId};
  const actor={stopped:!!options.stopped,pnrSeen:!!options.pnrSeen,api:{currentCsrf:'fixture-csrf'},
    tok(){trace.push(['tok']);return{accessToken:'fixture-token'};},
    onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    opts:{razorpayPollSec:options.interval,onUpiCollect:value=>trace.push(['collect',value]),onQr:options.noCallback?undefined:value=>{trace.push(['qr',value]);if(options.callbackError)throw Error('callback failed');}},
    paymentSetupFailed(message){trace.push(['setup-failed',message]);return{success:false,setup:true};},
    async settlePayment(...args){trace.push(['settle',...args]);if(options.settleError)throw Error('settle failed');return{syntheticResult:true};},
    gateway:{
      async razorpayRedirect(value){trace.push(['redirect',value]);if(options.redirectError)throw Error('redirect failed');return options.redirect===undefined?{action:'fixture-action',encdata:'fixture-data'}:options.redirect;},
      async razorpayCheckout(...args){trace.push(['checkout',...args]);if(options.checkoutError)throw Error('checkout failed');return options.order===undefined?{keyId:'fixture-key',orderId:'fixture-order',callbackUrl:'https://example.invalid/callback'}:options.order;},
      async razorpaySessionToken(...args){trace.push(['session',...args]);if(options.sessionError)throw Error('session failed');return 'fixture-session';},
      async razorpayCreate(value){trace.push(['create',value]);if(options.createError)throw Error('create failed');return options.created===undefined?{paymentId:'fixture-payment',intentUrl:'synthetic-intent',pollUrl:'https://example.invalid/poll'}:options.created;},
      async pollRazorpay(value,stop,onWait,interval){trace.push(['poll',value,stop(),interval]);onWait();if(options.pollError)throw Error('poll failed');return{syntheticPaid:true};},
    },
  };
  let result,error;
  try{
    if(original){
      const table=Object.assign({},...Object.values(strings)),math=Object.create(Math);math.random=random;
      const engine=createEngine(definitions,{globals:{...globalThis,Math:math,String}}),root=engine.context(6,null);
      root[5]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
      result=await engine.makeFunction('f2213',engine.context(2,root)).call(actor,journey,'fixture-txn',99,options.flow??'intent');
    }else result=await runRazorpay(actor,journey,'fixture-txn',99,options.flow??'intent',{random});
  }catch(e){error={name:e.name,message:e.message};}
  return{trace,result,error};
}
for(const [name,options]of Object.entries({success:{},noCallback:{noCallback:true},callbackError:{callbackError:true},
  redirectError:{redirectError:true},noEncdata:{redirect:{action:'fixture'}},nullRedirect:{redirect:null},
  checkoutError:{checkoutError:true},emptyOrder:{order:{}},nullOrder:{order:null},sessionError:{sessionError:true},
  createError:{createError:true},emptyPayment:{created:{paymentId:''}},noIntent:{created:{paymentId:'fixture'}},
  createNull:{created:null},collect:{flow:'collect',upiId:'synthetic@invalid'},collectNoVpa:{flow:'collect'},
  pollError:{pollError:true},settleError:{settleError:true},stopped:{stopped:true},pnrSeen:{pnrSeen:true},
  interval:{interval:20},invalidInterval:{interval:-1},
}))test('Razorpay orchestration matches recovered function: '+name,async()=>{
  assert.deepEqual(await execute(false,options),await execute(true,options));
});
