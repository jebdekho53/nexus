'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];

// PhonePe, Razorpay and provider-QR orchestration (src/ts/main/payment) versus the previous JavaScript.
const settle=(value,fallback)=>value===undefined?Promise.resolve(fallback):value instanceof Error?Promise.reject(value):Promise.resolve(value);
const baseActor=(trace,o={})=>({
  stopped:o.stopped,pnrSeen:o.pnrSeen,api:{currentCsrf:'CSRF'},tok:()=>({accessToken:'TOK'}),
  opts:o.noCallbacks?{}:{onQr:q=>trace.push(['onQr',q]),onUpiCollect:q=>trace.push(['onUpiCollect',q]),razorpayPollSec:o.pollSec,irctcqrPollSec:o.pollSec},
  onProgress:(...a)=>trace.push(['progress',...a]),log:(...a)=>trace.push(['log',...a]),paymentSetupFailed:m=>{trace.push(['setupFailed',m]);return'setup-failed';},
  settlePayment:(...a)=>{trace.push(['settle',...a]);return Promise.resolve('settled');},
  session:{page:{waitForTimeout:ms=>{trace.push(['wait',ms]);return o.waitRejects?Promise.reject(new Error('w')):Promise.resolve();}}},
  checkNowSleep:ms=>{trace.push(['checkNowSleep',ms]);return Promise.resolve();},
});
const journey={username:'user',origin:'A',destination:'B',upiId:'me@bank'};

test('phonepe',async()=>{
  const[legacy,migrated]=load('phonepe');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const scenarios={happy:{},redirectRejects:{redirect:new Error('r')},noToken:{redirect:{action:'a',token:''}},qrRejects:{qr:new Error('q')},noImage:{qr:{qrBase64:'',phonePeToken:'t'}},noPhonePeToken:{qr:{qrBase64:'img',phonePeToken:''},},noCallbacks:{noCallbacks:true},stopped:{stopped:true},pnrSeen:{pnrSeen:true},noJourneyUser:{journey:{origin:'A'}}};
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>{
      const actor=baseActor(trace,o);
      actor.gateway={phonePeRedirect:r=>{trace.push(['redirect',r]);return settle(o.redirect,{action:'ACT',token:'TOK2'});},phonePeQr:(a,t)=>{trace.push(['qr',a,t]);return settle(o.qr,{qrBase64:'IMG',phonePeToken:'PT'});},
        pollPhonePe:(token,stopped,onWait)=>{trace.push(['poll',token,stopped()]);onWait();return Promise.resolve({kind:'paid'});}};
      return m.runPhonePe(actor,o.journey||journey,'TXN',300,{random:()=>0.25});
    });
});

test('razorpay',async()=>{
  const[legacy,migrated]=load('razorpay');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const order={keyId:'K',orderId:'O',callbackUrl:'cb'};
  const scenarios={happy:{},redirectRejects:{redirect:new Error('r')},noAction:{redirect:{action:'',encdata:'e'}},noEnc:{redirect:{action:'a',encdata:''}},checkoutRejects:{checkout:new Error('c')},noOrder:{checkout:null},noKey:{checkout:{orderId:'O'}},noOrderId:{checkout:{keyId:'K'}},
    tokenRejects:{token:new Error('t')},createRejects:{create:new Error('c')},noPayment:{create:{paymentId:'',intentUrl:'u',pollUrl:'p'}},noIntentUrl:{create:{paymentId:'P',intentUrl:'',pollUrl:'p'}},collectNoUpi:{flow:'collect',journey:{origin:'A',destination:'B'}},
    pollSec:{pollSec:2},pollSecZero:{pollSec:0},pollSecNeg:{pollSec:-1},noCallbacks:{noCallbacks:true},collectNoCallbacks:{flow:'collect',noCallbacks:true}};
  for(const[name,o]of Object.entries(scenarios))for(const flow of o.flow?[o.flow]:['intent','collect'])
    await check(name+flow,(m,trace)=>{
      const actor=baseActor(trace,o);
      actor.gateway={razorpayRedirect:r=>{trace.push(['redirect',r]);return settle(o.redirect,{action:'ACT',encdata:'ENC'});},razorpayCheckout:(a,e)=>{trace.push(['checkout',a,e]);return settle(o.checkout,order);},
        razorpaySessionToken:(k,intent)=>{trace.push(['token',k,intent]);return settle(o.token,'SESSION');},razorpayCreate:r=>{trace.push(['create',r]);return settle(o.create,{paymentId:'P',intentUrl:'upi://x',pollUrl:'poll'});},
        pollRazorpay:(request,stopped,onWait,interval)=>{trace.push(['poll',request,stopped(),interval]);onWait();return Promise.resolve({kind:'paid'});}};
      return m.runRazorpay(actor,o.journey||journey,'TXN',300,flow,{random:()=>0.75});
    });
});

test('provider-qr',async()=>{
  const[legacy,migrated]=load('provider-qr');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const scenarios={
    happy:{},blocked:{redirects:[{action:'',encdata:'',blocked:true}]},noEncThree:{redirects:[{action:'a',encdata:'',blocked:false}]},redirectRejectsThenOk:{redirects:[new Error('r'),{action:'a',encdata:'E',blocked:false}]},
    allReject:{redirects:[new Error('r')]},emptyThenOk:{redirects:[{action:'a',encdata:'',blocked:false},{action:'a',encdata:'E',blocked:false}]},stoppedBefore:{stopped:true},waitRejects:{redirects:[{action:'',encdata:'',blocked:false}],waitRejects:true},
    qrRejects:{qr:new Error('q')},noPayload:{qr:{payload:''}},nullQr:{qr:null},qrAmount:{qr:{payload:'upi://x',qrAmount:123.5}},noQrAmount:{qr:{payload:'upi://x'}},zeroQrAmount:{qr:{payload:'upi://x',qrAmount:0}},
    pollSec:{pollSec:3},pollSecBig:{pollSec:1000},noCallbacks:{noCallbacks:true},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      let call=0;
      const actor=baseActor(trace,o);
      actor.gateway={paymentRedirect:r=>{trace.push(['redirect',r]);const list=o.redirects||[{action:'ACT',encdata:'ENC',blocked:false}];return settle(list[Math.min(call++,list.length-1)]);},providerQr:(a,e)=>{trace.push(['providerQr',a,e]);return settle(o.qr,{payload:'upi://pay?am=10',qrAmount:10});},
        pollProviderQr:(qr,stopped,onWait,max,interval,sleep)=>{trace.push(['poll',qr,stopped(),max,interval]);onWait();sleep(5);return Promise.resolve({kind:'paid'});}};
      const result=await m.runProviderQr(actor,journey,'TXN',300,{random:()=>0.5});
      return{result,paidQrAmount:actor.paidQrAmount};
    });
});

const html=cfg=>cfg;
test('provider-qr-request',async()=>{
  const[legacy,migrated]=load('provider-qr-request');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const parseConfig=text=>{try{return JSON.parse(text);}catch{return null;}};
  const parseAmount=payload=>{const m=/am=([\d.]+)/.exec(payload);return m?Number(m[1]):undefined;};
  const ids={responseParams:{rid:'R1',merchantId:'MID',merchantTxnNo:'MTX'}};
  const scenarios={
    happy:{auth:JSON.stringify(ids)},noLocation:{location:undefined},badLocation:{location:'http://[::bad'},relativeLocation:{location:'/auth?tranCtx=TC',auth:JSON.stringify({responseParams:{merchantId:'M',merchantTxnNo:'T'}})},
    missingIds:{auth:JSON.stringify({responseParams:{rid:'R'}})},noParams:{auth:'{}'},badConfig:{auth:'not json'},orderIdFallback:{auth:JSON.stringify({responseParams:{rid:'R',merchantId:'M',orderId:'ORD'}})},invoiceFallback:{auth:JSON.stringify({responseParams:{rid:'R',merchantId:'M',invoiceNo:'INV'}})},
    tokenParam:{auth:JSON.stringify({responseParams:{rid:'R',merchantId:'M',merchantTxnNo:'T',isCallFromPaymentOptionsPage:'tok'}})},customGenerate:{auth:JSON.stringify({responseParams:{...ids.responseParams,internalGenerateQRApiUrl:'https://other.test/gen'}})},badGenerate:{auth:JSON.stringify({responseParams:{...ids.responseParams,internalGenerateQRApiUrl:'/relative'}})},
    jsonFails:{auth:JSON.stringify(ids),genJsonFails:true},noQr:{auth:JSON.stringify(ids),gen:{errorcode:'E1'}},intent:{auth:JSON.stringify(ids),gen:{intent:'upi://pay?am=7.5'}},badAction:{action:'not a url',hosts:{qrGateway:'https://qr.test///'}},noOrigin:{action:'not a url',hosts:{}},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>{
      const actor={hosts:o.hosts||{qrGateway:'https://qr.test',wps:'https://wps.test//'},reqRetry:(label,op)=>{trace.push(['retry',label]);return op();},
        req:{post:(url,options)=>{trace.push(['post',url,options]);if(url.endsWith('/gen')||url.includes('generateAndShowQR')||url.includes('/relative'))return Promise.resolve({json:()=>o.genJsonFails?Promise.reject(new Error('j')):Promise.resolve(o.gen||{upiQR:'upi://pay?am=12.5'}),status:()=>200});
          return Promise.resolve({headers:()=>'location' in o?{location:o.location}:{location:'https://pg.test/auth?tranCtx=TC1'},status:()=>302});},
          get:(url,options)=>{trace.push(['get',url,options]);return Promise.resolve({text:()=>Promise.resolve(o.auth??'{}'),status:()=>200});}},
        gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},log:(...a)=>trace.push(['log',...a])};
      return m.createProviderQr(actor,o.action??'https://pg.test/sale',ENC,{parseConfig,parseAmount});
    });
});
const ENC='ENCDATA';

test('provider-qr-poll',async()=>{
  const[legacy,migrated]=load('provider-qr-poll');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const parseConfig=text=>{try{return JSON.parse(text);}catch{return null;}};
  const classify=body=>body.txnStatus==='SUC'?'paid':body.txnStatus==='FAIL'?'declined':body.txnStatus?'pending':'unknown';
  const qr={pgOrigin:'https://pg.test',merchantId:'M',merchantTxnNo:'T',authReferer:'https://pg.test/auth',pageToken:'tok'};
  const r=(o={})=>({text:()=>o.textRejects?Promise.reject(new Error('t')):Promise.resolve(o.text??''),status:()=>o.status??200,ok:()=>o.ok??((o.status??200)<400)});
  const cmd=(body,o={})=>r({text:JSON.stringify(body),...o});
  const scenarios={
    paid:{posts:[cmd({txnStatus:'SUC'})],encdata:'ENC'},paidNoEnc:{posts:[cmd({txnStatus:'SUC'})],encdata:''},declined:{posts:[cmd({txnStatus:'FAIL',respDescription:'No funds'})]},declinedNoDesc:{posts:[cmd({txnStatus:'FAIL'})]},
    pendingThenPaid:{posts:[cmd({txnStatus:'PEND'}),cmd({txnStatus:'PEND'}),cmd({txnStatus:'SUC'})]},timeout:{posts:[cmd({txnStatus:'PEND',responseCode:'1',respDescription:'wait'})],max:3},
    networkErrorsFallbackPaid:{posts:[null],fallbackPosts:[r({text:JSON.stringify({status:'SUCCESS',responseParams:{encData:'FB'}})})]},fallbackDeclined:{posts:[null],fallbackPosts:[r({text:JSON.stringify({status:'cancelled'})})]},fallbackPending:{posts:[null],fallbackPosts:[r({text:JSON.stringify({status:'PENDING'})})],max:7},fallbackNoStatus:{posts:[null],fallbackPosts:[r({text:'{}'})],max:7},fallbackRejects:{posts:[null],fallbackPosts:[null],max:7},
    unusableThenFallback:{posts:[cmd({},{status:500,ok:false})],fallbackPosts:[r({text:JSON.stringify({status:'SUC'})})]},unusableThenRecover:{posts:[cmd({},{status:500,ok:false}),cmd({txnStatus:'PEND'}),cmd({txnStatus:'SUC'})]},textRejects:{posts:[r({textRejects:true})],max:7,fallbackPosts:[null]},
    stopped:{posts:[cmd({txnStatus:'PEND'})],stopAfter:1},stoppedImmediately:{posts:[cmd({txnStatus:'PEND'})],stopAfter:0},noIds:{qr:{pgOrigin:'https://pg.test',merchantId:'',merchantTxnNo:'T'}},noOrigin:{qr:{merchantId:'M',merchantTxnNo:'T'}},noPageToken:{qr:{...qr,pageToken:'',authReferer:''},posts:[cmd({txnStatus:'SUC'})]},
    customSleep:{posts:[cmd({txnStatus:'PEND'})],max:2,sleep:true},fastPolls:{posts:[cmd({txnStatus:'PEND'})],max:2,fastClock:true},noOnWait:{posts:[cmd({txnStatus:'PEND'})],max:2,noOnWait:true},sameLogDeduped:{posts:[cmd({txnStatus:'PEND'})],max:3},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      let postCalls=0,fallbackCalls=0,stopCalls=0,tick=0;
      const actor={
        gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},
        req:{post:(url,options)=>{trace.push(['post',url,options]);if(url.includes('statusCheckRedirect')){const list=o.fallbackPosts||[null];const item=list[Math.min(fallbackCalls++,list.length-1)];return item?Promise.resolve(item):Promise.reject(new Error('fb'));}const list=o.posts||[null];const item=list[Math.min(postCalls++,list.length-1)];return item?Promise.resolve(item):Promise.reject(new Error('net'));}},
        log:(...a)=>trace.push(['log',...a]),sleep:ms=>{trace.push(['actorSleep',ms]);return Promise.resolve();},irctcQrFetchEncdata:q=>{trace.push(['fetchEncdata']);return Promise.resolve(o.encdata??'E');},
      };
      const clock=o.fastClock?{now:()=>tick++*10}:{now:()=>tick++*100000};
      return m.pollProviderQr(actor,o.qr||qr,()=>{const v=o.stopAfter!==undefined&&stopCalls++>=o.stopAfter;return v;},o.noOnWait?undefined:()=>trace.push('onWait'),o.max,o.interval??10000,o.sleep?ms=>{trace.push(['customSleep',ms]);return Promise.resolve();}:undefined,{parseConfig,classify,clock});
    });
  for(const o of[{text:JSON.stringify({responseParams:{encdata:'a'}})},{text:JSON.stringify({responseParams:{encData:'b'}})},{text:JSON.stringify({responseParams:{ENC_DATA:'c'}})},{text:JSON.stringify({responseParams:{enc_data:'d'}})},{text:'{}'},{text:'bad'},{textRejects:true},null])
    await check('fetchEncdata '+JSON.stringify(o),(m,trace)=>m.fetchProviderEncdata({req:{post:(u,x)=>{trace.push(['post',u,x]);return o?Promise.resolve(r(o)):Promise.reject(new Error('n'));}},gwHeaders:async(h,x)=>{trace.push(['headers',h,x]);return{H:1};}},qr,{parseConfig}));
});
