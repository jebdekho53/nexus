'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');

async function chain(native,id){
  const trace=[],invocations=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const timers={setInterval(fn,ms){trace.push(['interval',ms]);return 123;},clearInterval(value){trace.push(['clear',value]);}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{random,timers}}):{},
    globals:{...globalThis,Math:math,String,Promise,...timers},onInvoke:name=>invocations.push(name)});
  const root=engine.context(1842,null),table=Object.assign({},...Object.values(strings));
  root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined);return value;};
  root[345]='https://example.invalid/mapps1';root[386]=()=>10;root[388]={paytm:[10]};root[389]=['paytm'];
  root[391]=(data,bankId)=>data.some(row=>row.bankId===bankId);root[392]=()=>true;
  for(const[slot,name]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[940,'f2382']])root[slot]=engine.makeFunction(name,root);
  const actor={bankDetail:[{bankId:10}],opts:{gatewayHosts:{wps:{},paytm:{}},hideBrowser:false,
    onQr(value){trace.push(['qr',id,value]);},onQrPrepare(){trace.push(['prepare',id]);}},stopped:false,terminal:false,lastAvail:null,
    api:{currentCsrf:'fixture-csrf'},tok(){trace.push(['tokens',id]);return{accessToken:'fixture-token'};},
    log(...args){trace.push(['log',...args]);},onProgress(...args){trace.push(['progress',...args]);},
    async safeCall(...args){trace.push(['request',...args]);return{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route',id]);return true;},
    gateway:{
      async paytmRedirect(value){trace.push(['redirect',value]);return{action:'synthetic-action',mid:'synthetic-mid'};},
      async paytmFetchQr(value){trace.push(['fetch-qr',value]);return{qrBase64:'synthetic-image',orderId:'synthetic-order'};},
      async waitForPaytmWs(mid,order,unused,stop){trace.push(['ws',mid,order,unused,stop()]);return null;},
      async pollPaytmStatus(mid,order,stop,onWait){trace.push(['poll',mid,order,stop()]);onWait();return null;},
    },
  };
  for(const[name,fid]of [['dispatchGateway','f2176'],['runPaytmQr','f2193']])actor[name]=engine.makeFunction(fid,engine.context(2,root));
  const result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:'paytm',origin:'AAA',destination:'BBB',username:'synthetic'},'fixture-txn',99,new Set());
  if(!native){const index=trace.findIndex(row=>row[0]==='proxy-route');if(index>=0){const [entry]=trace.splice(index,1);const ready=trace.findIndex(row=>row[0]==='progress'&&['booking:fare','booking:pay-ready'].includes(row[1]));trace.splice(ready>=0?ready:index,0,entry);}}
  return{trace,result,invocations};
}
test('complete native initialization → dispatch → PayTM QR chain matches recovered chain without a live service',async()=>{
  const before=await chain(false,'one'),after=await chain(true,'one');
  assert.deepEqual(after.trace,before.trace);assert.deepEqual(after.result,before.result);
  assert.equal(after.trace.filter(row=>row[0]==='qr').length,1);
  assert.equal(after.trace.filter(row=>row[0]==='request').length,1);
  assert.equal(after.trace.find(row=>row[0]==='qr')[2].imageBase64,'synthetic-image');
  assert.equal(after.invocations.some(id=>['f2173','f2174','f2175','f2194','f2195','f2196','f2200'].includes(id)),false);
  assert.match(after.result.message,/Payment timed out/); // Both mock watchers return no payment.
});
test('parallel native chains deliver each synthetic QR exclusively to its own actor',async()=>{
  const [first,second]=await Promise.all([chain(true,'first'),chain(true,'second')]);
  assert.deepEqual(first.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['first']);
  assert.deepEqual(second.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['second']);
});
