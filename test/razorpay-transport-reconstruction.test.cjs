'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

function harness(native) {
  const trace=[];
  const globals={Promise,String,Number,Object,JSON,URL,RegExp};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true}):{},globals});
  const root=engine.context(1842,null);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined,'missing fixture '+n+'|'+key);return table[n+'|'+key];};
  root[137]=engine.makeFunction('f150',root);root[786]=engine.makeFunction('f1612',root);
  return{engine,root,context:engine.context(2,root),trace};
}
const outcome=async promise=>{try{return{value:await promise};}catch(error){return{error:error.message.startsWith('synthetic')?error.message:error.name,detail:process.env.DBG?error.message:undefined};}};
const plain=value=>JSON.parse(JSON.stringify(value===undefined?null:value));

const pages={
  json:'x/*JSON_DATA_START*/ var data = {"key":"synthetic-key","order_id":"synthetic-order","amount":"1250","url":{"callback":"https://callback.invalid/c"},"notes":{"a":1,"b":null,"c":"x"}}; /*JSON_DATA_END*/ y',
  alternate:'/**JSON_DATA_START**/window.options={"key_id":"k2","orderId":"o2","amount":5,"callback_url":"https://cb.invalid/"}/***JSON_DATA_END***/',
  bare:'{"key":"k3","order_id":"o3"}',
  bareNoMarkers:'no data here',
  invalidJson:'/*JSON_DATA_START*/{broken/*JSON_DATA_END*/',
  nullJson:'/*JSON_DATA_START*/null/*JSON_DATA_END*/',
  numberJson:'/*JSON_DATA_START*/7/*JSON_DATA_END*/',
  arrayNotes:'/*JSON_DATA_START*/{"notes":["p","q"]}/*JSON_DATA_END*/',
  stringNotes:'/*JSON_DATA_START*/{"notes":"ab"}/*JSON_DATA_END*/',
  nullNotes:'/*JSON_DATA_START*/{"notes":null,"url":null}/*JSON_DATA_END*/',
  numericNotes:'/*JSON_DATA_START*/{"notes":5,"amount":null}/*JSON_DATA_END*/',
  empty:'',
};
for(const[name,page]of Object.entries(pages))test('Razorpay checkout page parser matches recovered extraction: '+name,async()=>{
  const run=native=>{const{engine,root}=harness(native);return outcome(Promise.resolve().then(()=>engine.makeFunction('f1612',root)(page)));};
  assert.deepEqual(plain(await run(true)),plain(await run(false)));
});
test('Razorpay checkout page parser extracts the documented fields',()=>{
  const{engine,root}=harness(true);
  assert.deepEqual(plain(engine.makeFunction('f1612',root)(pages.json)),{keyId:'synthetic-key',orderId:'synthetic-order',amount:1250,callbackUrl:'https://callback.invalid/c',notes:{a:'1',c:'x'},hostedId:''});
});
const locations={razorpay:'https://checkout.razorpay.com/a?b=1',subdomain:'https://api.razorpay.com/x',internal:'http://svc.razorpay.svc.cluster.local/p?q=2',other:'https://evil.invalid/path?z=1',lookalike:'https://razorpay.com.invalid/a',mixedCase:'https://CHECKOUT.RAZORPAY.COM/Q',relative:'/relative/path',empty:'',nonString:undefined,port:'https://checkout.razorpay.com:8443/p'};
for(const[name,location]of Object.entries(locations))
  test('Razorpay location rewrite matches recovered host rule: '+name,()=>{
    const run=native=>{const{engine,root}=harness(native);return engine.makeFunction('f150',root)(location);};
    assert.equal(run(true),run(false));
  });

async function checkout(native,options={}) {
  const{engine,context,trace}=harness(native),logs=[];
  const response=(name,statusCode,location)=>({status(){trace.push(['status',name]);return statusCode;},headers(){trace.push(['headers',name]);if(options.fail==='headers')throw Error('synthetic headers');return location===undefined?{}:{location};},
    url(){trace.push(['url',name]);return options.responseUrl??'https://checkout.invalid/x';},
    text(){trace.push(['text',name]);if(options.fail===name+'Text')return Promise.reject(Error('synthetic text'));return Promise.resolve(name==='order'?(options.orderBody??pages.json):(options.postBody??pages.json));}});
  const actor={hosts:{razorpay:options.razorHost===undefined?'https://checkout.razorpay.com':options.razorHost,wps:'https://provider.invalid'},
    async reqRetry(label,operation){trace.push(['retry',label]);if(options.fail==='retry:'+label)throw Error('synthetic retry '+label);return operation();},
    async gwHeaders(host,settings){trace.push(['gw',host,settings]);if(options.fail==='gw')throw Error('synthetic gw');return{synthetic:'gw'};},
    req:{post(url,settings){trace.push(['post',url,settings]);assert.equal(this,actor.req);if(options.fail==='post')throw Error('synthetic post');
        return Promise.resolve(response('post',options.status??302,options.noLocation?undefined:(options.location??'https://api.razorpay.com/order?x_ranid=synthetic-hosted')));},
      get(url,settings){trace.push(['get',url,settings]);assert.equal(this,actor.req);if(options.fail==='get')throw Error('synthetic get');return Promise.resolve(response('order',200));}},
    log(value){trace.push(['log']);logs.push(value);},snip(text){trace.push(['snip',text.length]);}};
  const result=await outcome(engine.makeFunction('f1760',context).call(actor,options.action,options.encdata??'synthetic-encdata'));
  const normalize=line=>line.replace(/^razorpayCheckout 302 → order page on .*? \(/,'razorpayCheckout 302 → order page (').split(' :: ')[0].replace(/ order=.*/,'');
  return{...result,trace,logs:logs.map(normalize),rawLogs:logs};
}
const cases={
  redirect:{action:'/pay'},noAction:{},absoluteAction:{action:'https://checkout-hosted.razorpay.invalid/start'},hostedOrigin:{action:'https://checkout-hosted.example.invalid/p',razorHost:'https://checkout-hosted.example.invalid'},
  noRazorHost:{razorHost:null,action:'/p'},
  direct200:{status:200,postBody:pages.alternate,location:'https://other.invalid/?x_ranid=r2'},direct399:{status:399},direct400:{status:400,postBody:pages.bare},noLocationRedirect:{noLocation:true,postBody:pages.bare},status299:{status:299},
  hostedFromUrl:{status:200,noLocation:true,responseUrl:'https://x.invalid/?a=1&x_ranid=from-url'},hostedFromAction:{status:200,noLocation:true,action:'https://x.invalid/p?x_ranid=from-action',razorHost:'https://x.invalid'},hostedNone:{status:200,noLocation:true,responseUrl:'https://x.invalid/'},
  internalLocation:{location:'http://svc.invalid.svc.cluster.local/o?z=1'},relativeLocation:{location:'/relative'},
  orderInvalid:{orderBody:'nothing'},orderNullJson:{orderBody:'/*JSON_DATA_START*/null/*JSON_DATA_END*/'},orderNoNotes:{orderBody:'/*JSON_DATA_START*/{"key":"k"}/*JSON_DATA_END*/'},
  badAction:{action:'http://[bad'},
  retryPostFails:{fail:'retry:razorpayCheckout'},retryOrderFails:{fail:'retry:razorpayOrderPage'},gwFails:{fail:'gw'},postFails:{fail:'post'},getFails:{fail:'get'},headersFail:{fail:'headers'},postTextFails:{status:200,noLocation:true,fail:'postText'},orderTextFails:{fail:'orderText'},
};
for(const[name,options]of Object.entries(cases))test('Razorpay checkout matches recovered redirect/order-page flow: '+name,async()=>{
  const actual=await checkout(true,options),expected=await checkout(false,options);
  const normalize=value=>plain({...value,rawLogs:undefined});assert.deepEqual(normalize(actual),normalize(expected));
});
test('Razorpay checkout form, headers and private diagnostics',async()=>{
  const value=await checkout(true,{action:'/pay'});
  const post=value.trace.find(row=>row[0]==='post');
  assert.equal(post[1],'https://checkout.razorpay.com/pay');assert.deepEqual(post[2].form,{encdata:'synthetic-encdata'});assert.equal(post[2].maxRedirects,0);
  const gw=value.trace.find(row=>row[0]==='gw');
  assert.equal(gw[2].origin,'https://provider.invalid');assert.equal(gw[2].referer,'https://provider.invalid/');assert.equal(gw[2].secFetchSite,'cross-site');
  assert.equal(value.value.hostedId,'synthetic-hosted');
  assert.doesNotMatch(value.rawLogs.join(' '),/synthetic|invalid|razorpay\.com/);
  const hosted=await checkout(true,{action:'https://checkout-hosted.example.invalid/p',razorHost:'https://checkout-hosted.example.invalid'});
  assert.equal(hosted.trace.find(row=>row[0]==='gw')[2].origin,'https://checkout-hosted.example.invalid');
});
