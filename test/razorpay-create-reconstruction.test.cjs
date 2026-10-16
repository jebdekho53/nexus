'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

const plain=value=>JSON.parse(JSON.stringify(value===undefined?null:value));
const outcome=async promise=>{try{return{value:await promise};}catch(error){return{error:error.message.startsWith('synthetic')?error.message:error.name};}};

// Deterministic Date/Math/timer effects shared by the recovered oracle and the native module.
async function run(native,options={}) {
  const trace=[],logs=[];
  const clock={now(){trace.push(['now']);return 1700000000000;}};
  const random=()=>{trace.push(['random']);return 0.5;};
  const math=Object.create(Math);math.random=random;
  const timers={setTimeout(fn,ms){trace.push(['timeout',ms]);queueMicrotask(fn);return 1;}};
  const globals={Promise,String,Object,JSON,RegExp,URL,Math:math,Date:clock,encodeURIComponent,setTimeout:timers.setTimeout};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{clock,random,timers}}):{},globals});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined,'missing fixture '+n+'|'+key);return table[n+'|'+key];};
  root[138]=engine.makeFunction('f151',root);
  root[787]=options.attempts??4;root[788]=options.errorAttempts??2;root[789]=options.delay??50;
  const queue=[...(options.responses??[{status:200,body:{payment_id:'pay_synthetic'}}])];
  const actor={hosts:{razorpay:options.host===undefined?'https://checkout.razorpay.com':options.host,wps:'https://provider.invalid'},
    async clientHints(){trace.push(['hints']);return{ua:options.ua??'Mozilla/5.0 (Windows NT 10.0) Chrome/131'};},
    fingerprint(){trace.push(['fingerprint']);return 'synthetichash';},
    async gwHeaders(host,settings){trace.push(['gw',host,settings]);if(options.fail==='gw')throw Error('synthetic gw');return{synthetic:'gw'};},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);
      const next=queue.length>1?queue.shift():queue[0];
      if(next==='reject')return Promise.reject(Error('synthetic post rejection'));
      if(next==='throw')throw Error('synthetic post');
      return Promise.resolve({status(){trace.push(['status']);return next.status;},
        json(){trace.push(['json']);return next.jsonFails?Promise.reject(Error('synthetic json')):Promise.resolve(next.body);}});}},
    log(...args){trace.push(['log',args.length>1?args[1]:undefined]);logs.push(args[0]);},
    snip(text){trace.push(['snip',typeof text]);return text;}};
  const order={flow:options.flow??'collect',keyId:'key/id',sessionToken:'session token',vpa:options.vpa,
    order:{amount:options.amount??1250,orderId:'order_synthetic',callbackUrl:'https://callback.invalid/c',notes:options.notes}};
  const result=await outcome(engine.makeFunction('f1766',engine.context(2,root)).call(actor,options.noOrder?undefined:order));
  // Native diagnostics report presence flags where the recovered ones print identifiers; compare the common prefix.
  const logLines=logs.map(line=>line.replace(/ payId=.*/,'').replace(/ next=.*/,''));
  return{...result,trace,logs:logLines,rawLogs:logs};
}
const ok=body=>({status:200,body});
const cases={
  collectPaid:{},collectVpa:{vpa:'synthetic@upi'},notes:{notes:{a:'1',b:2}},nullNotes:{notes:null},zeroAmount:{amount:0},stringAmount:{amount:'99.5'},
  intentFromData:{flow:'intent',responses:[ok({data:{intent_url:'upi://pay?x=1'}})]},intentUpi:{flow:'intent',responses:[ok({data:{upi_intent_url:'upi://a'}})]},intentNested:{flow:'intent',responses:[ok({data:{upi:{intent_url:'upi://n'}}})]},
  intentLink:{flow:'intent',responses:[ok({data:{link:'upi://l'}})]},intentQrUrl:{flow:'intent',responses:[ok({data:{qr_code_url:'q'}})]},intentQrCode:{flow:'intent',responses:[ok({data:{qr_code:'c'}})]},
  intentTopLink:{flow:'intent',responses:[ok({link:'t'})]},intentTopQr:{flow:'intent',responses:[ok({qr_code_url:'u'})]},
  intentNoUrl:{flow:'intent',responses:[ok({payment_id:'p',next:[{action:'x'}],data:{k:1}})]},intentNoUrl4xx:{flow:'intent',responses:[{status:400,body:{error:{description:'bad'}}}]},
  pollRazorpay:{responses:[ok({payment_id:'p',request:{url:'https://api.razorpay.com/v1/poll?x=1'}})]},pollRewrite:{responses:[ok({payment_id:'p',request:{url:'https://internal.invalid/v1/poll?x=1'}})]},pollBad:{responses:[ok({payment_id:'p',request:{url:'not a url'}})]},
  errorBody:{responses:[{status:200,body:{error:{description:'declined'}}}]},
  rateLimitedThenPaid:{responses:[{status:429,body:{}},{status:429,body:{}},ok({payment_id:'p'})]},rateLimitExhausted:{responses:[{status:429,body:{}}],attempts:3},rateLimitOne:{responses:[{status:429,body:{}}],attempts:1},
  clientError:{responses:[{status:422,body:{error:{description:'x'}}}]},serverErrorThenPaid:{responses:[{status:502,body:{}},ok({payment_id:'p'})]},serverErrors:{responses:[{status:500,body:{}}],errorAttempts:3},serverErrorsOne:{responses:[{status:503,body:{}}],errorAttempts:1},
  redirectStatus:{responses:[{status:302,body:{}}],errorAttempts:2},postRejects:{responses:['reject'],errorAttempts:2},postThrows:{responses:['throw']},jsonFails:{responses:[{status:200,jsonFails:true,body:{}},ok({payment_id:'p'})]},nullBody:{responses:[ok(null)]},
  macUserAgent:{ua:'Mozilla/5.0 (Macintosh)'},noHost:{host:null},gwFails:{fail:'gw'},noOrder:{noOrder:true},
};
for(const[name,options]of Object.entries(cases))test('Razorpay create matches recovered form, retry and result flow: '+name,async()=>{
  const actual=await run(true,options),expected=await run(false,options);
  const normalize=value=>plain({...value,rawLogs:undefined});
  assert.deepEqual(normalize(actual),normalize(expected));
});
test('Razorpay create form fields and field order',async()=>{
  const collect=await run(true,{vpa:'v@upi',notes:{n:'1'}});
  const form=collect.trace.find(row=>row[0]==='post')[2].form;
  assert.deepEqual(Object.keys(form),['notes[n]','key_id','callback_url','currency','amount','order_id','method','vpa','upi[flow]','fee','_[checkout_id]','_[device.id]','_[library]','_[platform]','_[os]','_[referer]','_[shield][fhash]','_[shield][tz]']);
  assert.equal(form['_[device.id]'],'1.synthetichash.1700000000000.5500');assert.equal(form.amount,'1250');assert.equal(form['_[os]'],'windows');
  const intent=await run(true,{flow:'intent',responses:[ok({data:{intent_url:'u'}})]});
  const intentForm=intent.trace.find(row=>row[0]==='post')[2].form;
  assert.equal(intentForm['_[flow]'],'intent');assert.equal(intentForm['upi[flow]'],'intent');assert.equal(intentForm['_[request_index]'],'0');assert.equal('vpa' in intentForm,false);
  const post=intent.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://checkout.razorpay.com/v1/standard_checkout/payments/create/ajax?key_id=key%2Fid&session_token=session%20token');
});
test('Razorpay create keeps provider waits and bounded retries',async()=>{
  const limited=await run(true,{responses:[{status:429,body:{}},{status:429,body:{}},ok({payment_id:'p'})],delay:3000});
  assert.deepEqual(limited.trace.filter(row=>row[0]==='timeout').map(row=>row[1]),[3000,3000]);
  const failing=await run(true,{responses:[{status:500,body:{}}],errorAttempts:3,attempts:100});
  assert.deepEqual(failing.trace.filter(row=>row[0]==='timeout').map(row=>row[1]),[1500,1500]);assert.equal(failing.trace.filter(row=>row[0]==='post').length,3);
  assert.deepEqual(failing.value,{paymentId:'',intentUrl:'',pollUrl:''});
});
test('Razorpay create diagnostics omit identifiers, addresses and provider error text',async()=>{
  const value=await run(true,{flow:'intent',responses:[ok({payment_id:'pay_synthetic_secret',data:{intent_url:'upi://synthetic-secret'},request:{url:'https://internal.invalid/p?secret=1'},error:{description:'synthetic-secret'}})]});
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic|invalid|upi:\/\//);
  assert.match(value.rawLogs[0],/^razorpayCreate\(intent\) → 200 \(try 1\/4\) payId=y intent=y poll=y \(rewritten\) err=y$/);
});
