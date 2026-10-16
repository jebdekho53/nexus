'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs');
const table=Object.assign({},...Object.values(require('./fixtures/payment-strings.json')));
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
async function run(native,options={}) {
  const trace=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const timers={setInterval(fn,ms){trace.push(['interval',ms]);return 77;},clearInterval(id){trace.push(['clear',id]);}};
  const globals={URL,Buffer,String,Promise,Math:math,JSON,RegExp,encodeURIComponent,...timers};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{globals,random,timers}}):{},globals}),root=engine.context(1842,null),context=engine.context(2,root);
  root[5]=root[1841]=(n,key)=>{assert.notEqual(table[n+'|'+key],undefined);return table[n+'|'+key];};
  for(const[slot,id]of [[775,'f1599'],[776,'f1601'],[779,'f1605'],[780,'f1606'],[781,'f1607'],[783,'f1609'],[784,'f1610']])root[slot]=engine.makeFunction(id,root);
  let redirects=0;
  const gateway={hosts:{wps:'https://provider.invalid',paytm:'https://gateway.invalid'},
    async reqRetry(label,fn){trace.push(['retry',label]);return fn();},
    async gwHeaders(host,settings){trace.push(['headers',host,settings]);return{synthetic:'header'};},
    log(){},snip(){return 'synthetic-redacted';},async sleep(ms){trace.push(['sleep',ms]);},
    req:{async post(url,settings){trace.push(['post',url,settings]);const redirect=url.includes('/PaymentRedirect');if(redirect)redirects++;
      const data=options.noQr?{}:{qr:{dataurl:'data:image/png;base64,synthetic-image'},orderId:'synthetic-order'};
      const html=redirect?(options.retry&&redirects===1?'':'<form action="/start"><input name="mid" value="synthetic-mid"><input name="encData" value="synthetic-enc"><input name="checksum" value="synthetic-checksum">'):'pushAppData="'+Buffer.from(JSON.stringify(data)).toString('base64')+'"';
      return{async text(){return html;},status(){return 200;},url(){return url;}};
    }},
    async waitForPaytmWs(mid,order){trace.push(['ws',mid,order]);return{syntheticPaid:true};},
    async pollPaytmStatus(){return null;},
    async getFinalPaytmStatus(value){trace.push(['final',value]);return{mid:'synthetic-mid',encData:'synthetic-final',checksum:'synthetic-checksum'};},
    async disposePaytmPage(){trace.push(['dispose']);},async paytmBankResponse(value){trace.push(['bank',value]);return true;},
  };
  gateway.paytmRedirect=engine.makeFunction('f1684',context).bind(gateway);gateway.paytmFetchQr=engine.makeFunction('f1687',context).bind(gateway);
  if(options.withPageStatus){
    root[2132]=source=>vm.runInNewContext('('+source+')');
    const document={body:{style:{}}};
    const paymentPage={
      async goto(url,settings){trace.push(['page-goto',url,settings]);},url(){return 'https://gateway.invalid/';},
      isClosed(){return false;},async close(){trace.push(['page-close']);},
      evaluate(fn,args){
        const callback=vm.runInNewContext('('+fn.toString()+')',{document,fetch:async(url,settings)=>{
          trace.push(['page-fetch',url,JSON.parse(JSON.stringify(settings))]);
          return{status:200,async text(){return 'SUCCESS<input name="acquirementId" value="synthetic-acq">';}};
        }});
        return Promise.resolve(callback(args));
      },
    };
    gateway.page={context(){return{async newPage(){trace.push(['new-payment-page']);return paymentPage;}};}};
    gateway.paytmOriginPage=engine.makeFunction('f1704',context).bind(gateway);
    gateway.paytmInPageFetch=engine.makeFunction('f1708',context).bind(gateway);
    gateway.disposePaytmPage=engine.makeFunction('f1710',context).bind(gateway);
    gateway.pollPaytmStatus=engine.makeFunction('f1689',context).bind(gateway);
    gateway.waitForPaytmWs=async()=>null;
  }
  const actor={gateway,api:{currentCsrf:'synthetic-csrf'},opts:{onQr(value){trace.push(['qr',value]);},onQrClose(){trace.push(['qr-close']);}},
    tok(){return{accessToken:'synthetic-access'};},onProgress(...args){trace.push(['progress',...args]);},log(...args){trace.push(['log',...args]);},
    paymentSetupFailed(value){trace.push(['failed',value]);return{success:false};},beginSettling(){trace.push(['settle']);},
    async pollBookingData(...args){trace.push(['pnr',...args]);return{syntheticPnr:true};},finishBooking(value){trace.push(['finish',value]);return{success:true};},
  };
  const result=await engine.makeFunction('f2193',context).call(actor,{username:'synthetic-user',origin:'AAA',destination:'BBB'},'synthetic-txn',99);
  return{result,trace};
}
for(const[name,options]of Object.entries({ordinary:{},redirectRetry:{retry:true},missingQr:{noQr:true},pageStatus:{withPageStatus:true}}))test('synthetic PayTM orchestration uses real reconstructed redirect/QR methods: '+name,async()=>{
  assert.deepEqual(await run(true,options),await run(false,options));
});
test('synthetic PayTM chain uses owned browser status page then disposes it',async()=>{
  const {result,trace}=await run(true,{withPageStatus:true});assert.deepEqual(result,{success:true});
  assert.equal(trace.filter(row=>row[0]==='new-payment-page').length,1);
  assert.equal(trace.filter(row=>row[0]==='page-close').length,1);
  const fetch=trace.find(row=>row[0]==='page-fetch');assert.match(fetch[1],/transactionStatus\?MID=synthetic-mid&ORDER_ID=synthetic-order/);
  assert.equal(fetch[2].credentials,'include');assert.deepEqual(trace.find(row=>row[0]==='final')[1],{merchantId:'synthetic-mid',orderId:'synthetic-order',paymentMode:'UPI',topicName:'DYNAMIC_QR',acquirementId:'synthetic-acq',cashierRequestId:'',_id:'synthetic-mid_synthetic-order',status:'SUCCESS'});
});
test('synthetic PayTM chain exposes QR before settlement and uses gateway-specific form',async()=>{
  const {result,trace}=await run(true);assert.deepEqual(result,{success:true});
  assert.ok(trace.findIndex(row=>row[0]==='qr')<trace.findIndex(row=>row[0]==='settle'));
  const posts=trace.filter(row=>row[0]==='post');assert.equal(posts.length,2);
  assert.deepEqual(posts[1][2].form,{MID:'synthetic-mid',ENC_DATA:'synthetic-enc',CHECKSUMHASH:'synthetic-checksum'});
  assert.deepEqual(trace.find(row=>row[0]==='qr')[1],{imageBase64:'synthetic-image',amount:99,caption:'AAA → BBB'});
});
