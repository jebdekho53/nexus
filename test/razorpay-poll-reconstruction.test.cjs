'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

const plain=value=>JSON.parse(JSON.stringify(value===undefined?null:value));
const outcome=async promise=>{try{return{value:await promise};}catch(error){return{error:error.message.startsWith('synthetic')?error.message:error.name};}};

async function run(native,options={}) {
  const trace=[],logs=[];
  const environment={RAZORPAY_POLL_MS:options.envPoll};
  const globals={Promise,String,Number,Object,JSON,RegExp,URL,Math,encodeURIComponent,process:{env:environment}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{environment}}):{},globals});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined,'missing fixture '+n+'|'+key);return table[n+'|'+key];};
  root[783]=engine.makeFunction('f1609',root);
  const queue=[...(options.responses??[{status:200,body:{status:'captured',razorpay_payment_id:'pay_x'}}])];
  const callback=options.callback??{status:200,url:'https://provider.invalid/booking-confirm',text:'<input name="encdata" value="synthetic-enc">'};
  let polls=0;
  const actor={hosts:{razorpay:options.host===undefined?'https://api.razorpay.com':options.host,wps:'https://provider.invalid'},
    async sleep(ms){trace.push(['sleep',ms]);if(options.fail==='sleep')throw Error('synthetic sleep');},
    async gwHeaders(host,settings){trace.push(['gw',host,settings]);if(options.fail==='gw')throw Error('synthetic gw');return{synthetic:'gw'};},
    req:{get(url,settings){trace.push(['get',url,settings]);assert.equal(this,actor.req);polls++;
        const next=queue.length>1?queue.shift():queue[0];
        if(next==='reject')return Promise.reject(Error('synthetic get rejection'));
        return Promise.resolve({status(){trace.push(['status']);return next.status;},ok(){trace.push(['ok']);return next.ok??(next.status>=200&&next.status<300);},
          json(){trace.push(['json']);return next.jsonFails?Promise.reject(Error('synthetic json')):Promise.resolve(next.body);}});},
      post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);
        if(callback==='reject')return Promise.reject(Error('synthetic post rejection'));
        if(callback===null)return Promise.resolve(null);
        return Promise.resolve({status(){trace.push(['cstatus']);return callback.status;},url(){trace.push(['curl']);return callback.url;},
          text(){trace.push(['ctext']);return callback.textFails?Promise.reject(Error('synthetic text')):Promise.resolve(callback.text);}});}},
    log(value){trace.push(['log']);logs.push(value);}};
  const payment={paymentId:'pay id',pollUrl:options.pollUrl,callbackUrl:options.callbackUrl??'/callback',order:{orderId:'order_synthetic',hostedId:options.hostedId}};
  let stops=0;
  const stopped=options.noStop?()=>false:()=>{stops++;trace.push(['stopped?']);return options.stopAt!==undefined&&stops>options.stopAt;};
  const onWait=options.noWait?undefined:()=>{trace.push(['wait']);};
  const args=[payment,stopped,onWait,options.interval,options.max];
  const result=await outcome(engine.makeFunction('f1771',engine.context(2,root)).apply(actor,args));
  const normalize=line=>line.replace(/^razorpay → declined \(400\).*/,'razorpay → declined (400)').replace(/^razorpay → failed.*/,'razorpay → failed').replace(/^razorpay → error\/cancelled.*/,'razorpay → error/cancelled').replace(/ encdata=.*/,'');
  return{...result,trace,logs:logs.map(normalize),rawLogs:logs};
}
const captured={status:200,body:{status:'captured'}};
const cases={
  captured:{},authorized:{responses:[{status:200,body:{status:'authorized'}}]},paymentIdOnly:{responses:[{status:200,body:{razorpay_payment_id:'p'}}]},
  returnContent:{responses:[{status:200,body:{type:'return',request:{content:{razorpay_order_id:'o',razorpay_payment_id:'p',razorpay_signature:'s'},url:'https://provider.invalid/cb2'}}}]},
  returnNoContent:{responses:[{status:200,body:{type:'return',request:{}}},captured],max:3},hosted:{hostedId:'hosted_1'},
  absoluteCallback:{callbackUrl:'https://other.invalid/cb'},badCallback:{callbackUrl:'http://[bad'},
  pending:{responses:[{status:200,body:{status:'created'}}],max:3},pendingThenPaid:{responses:[{status:200,body:{}},{status:200,body:{}},captured],max:5},
  notOkPending:{responses:[{status:500,body:{status:'captured'}},captured],max:3},
  failed:{responses:[{status:200,body:{status:'failed',error:null,error_description:'insufficient funds'}}]},failedNoText:{responses:[{status:200,body:{status:'failed'}}]},
  declined400:{responses:[{status:400,body:{error:{description:' Card declined '}}}]},declined400NoText:{responses:[{status:400,body:{error:{}}}]},
  errorType:{responses:[{status:200,body:{type:'error',error_description:'x'}}]},errorObject:{responses:[{status:200,body:{error:{description:'oops'}}}]},error400NoError:{responses:[{status:400,body:{status:'created'}}],max:2},
  rejectedGet:{responses:['reject',captured],max:3},badJson:{responses:[{status:200,jsonFails:true,body:{}},captured],max:3},nullBody:{responses:[{status:200,body:null}]},
  customPollUrl:{pollUrl:'https://poll.invalid/status'},noHost:{host:null},
  stopFirst:{stopAt:0},stopLater:{stopAt:2,responses:[{status:200,body:{}}],max:10},noWait:{noWait:true},
  intervalCustom:{interval:123,max:2,responses:[{status:200,body:{}}]},intervalZero:{interval:0,max:2,responses:[{status:200,body:{}}]},intervalNull:{interval:null,max:2,responses:[{status:200,body:{}}]},envInterval:{envPoll:'250',max:2,responses:[{status:200,body:{}}]},envBad:{envPoll:'abc',max:2,responses:[{status:200,body:{}}]},defaultBudget:{stopAt:2,envPoll:'600000',responses:[{status:200,body:{}}]},zeroAttempts:{max:0},
  callbackMissing:{callback:null},callbackRejects:{callback:'reject'},callbackTextFails:{callback:{status:200,url:'https://provider.invalid/x',text:'',textFails:true}},callbackNotConfirmed:{callback:{status:200,url:'https://provider.invalid/other',text:'plain'}},callbackConfirmedByBody:{callback:{status:302,url:'u',text:'BOOKING-CONFIRM'}},
  sleepFails:{fail:'sleep'},gwFails:{fail:'gw'},
};
for(const[name,options]of Object.entries(cases))test('Razorpay polling matches recovered waits, outcomes and callback flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);
  const normalize=value=>plain({...value,rawLogs:undefined});
  assert.deepEqual(normalize(actual),normalize(expected));
});
test('Razorpay polling posts signed data once and keeps diagnostics private',async()=>{
  const value=await run(true,{hostedId:'hosted_1'});
  const post=value.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://provider.invalid/callback');assert.deepEqual(post[2].form,{razorpay_order_id:'order_synthetic',razorpay_payment_id:'pay_x',razorpay_signature:'',razorpay_hosted_id:'hosted_1'});
  assert.equal(value.trace.filter(row=>row[0]==='post').length,1);
  assert.deepEqual(value.value,{kind:'paid',encdata:'synthetic-enc'});
  assert.deepEqual(value.trace.filter(row=>row[0]==='sleep').map(row=>row[1]),[5000]);
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic|pay_x|invalid/);
  const declined=await run(true,{responses:[{status:400,body:{error:{description:'Synthetic Reason'}}}]});
  assert.deepEqual(declined.value,{kind:'declined',reason:'Synthetic Reason'});assert.doesNotMatch(declined.rawLogs.join(' '),/Synthetic/);
});
