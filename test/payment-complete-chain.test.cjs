'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const {hooks}=require('../src/main/runtime/legacy-services.cjs');
const vm=require('node:vm');
async function complete(native,id,{failFirst=false}={}){
  const trace=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const timers={setTimeout(fn,ms){trace.push(['timer',ms]);if(ms<3000)queueMicrotask(fn);return 0;}};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{random,timers}}):{},functionOverrides:hooks(event=>trace.push(['legacy',event])).overrides,globals:{...globalThis,Math:math,String,Number,JSON,Array,Boolean,Promise,Error,URL,RegExp,Buffer,atob,setTimeout:timers.setTimeout}}),root=engine.context(1842,null);
  const table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[345]='https://example.invalid/mapps1';root[386]=()=>30;root[388]={irctcqr:[30]};root[389]=['irctcqr'];root[391]=()=>true;root[392]=()=>true;
  root[561]=value=>'http://'+value;
  root[139]=engine.makeFunction('f152',root);
  root[2132]=source=>new Function('return ('+source+')')();
  root[783]=engine.makeFunction('f1609',root);root[784]=engine.makeFunction('f1610',root);
  root[777]=engine.makeFunction('f1602',root);root[782]=engine.makeFunction('f1608',root);
  for(const[slot,name]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[397,'f547'],[398,'f548'],[399,'f549'],[400,'f554'],[940,'f2382']])root[slot]=engine.makeFunction(name,root);
  let settling=false,booked,failedOnce=false;
  const actor={bankDetail:[{bankId:30}],stopped:false,terminal:false,securityQuarantined:false,pnrSeen:false,lastAvail:null,
    opts:{gatewayHosts:{qrGateway:{},wps:'https://example.invalid'},hideBrowser:false,onQr(value){trace.push(['qr',id,value]);},onQrClose(){trace.push(['qr-close',id]);},onBooked(value){booked=value;trace.push(['booked',id]);}},
    api:{currentCsrf:'fixture-csrf'},session:{tokens:{accessToken:'fixture-token',greq:'fixture-greq',bmiyek:'fixture-bmiyek'},page:{isClosed(){return false;},url(){return 'https://example.invalid/nget/train-search';}}},
    spaCsrf(){trace.push(['csrf']);return'fixture-csrf';},isSettlingPayment(){return settling;},
    beginSettling(){settling=true;trace.push(['settling']);},endSettling(){settling=false;trace.push(['end-settling']);},beginFinalPnrRequest(){trace.push(['begin-pnr']);},endFinalPnrRequest(){trace.push(['end-pnr']);},
    log(...args){if(/^bookingData \(txn /.test(args[1]))args[1]='bookingData response received';trace.push(['log',...args]);},onProgress(...args){trace.push(['progress',...args]);},
    async safeCall(...args){trace.push(['init-request',...args]);return{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route']);},checkNowSleep(ms){trace.push(['check-now',ms]);return Promise.resolve(true);},
    gateway:{
      hosts:{wps:'https://example.invalid',providerOrigin:'https://example.invalid',qrGateway:'https://gateway.invalid'},
      page:{url(){return'https://example.invalid/nget/train-search';},async evaluate(fn){trace.push(['client-hints']);return vm.runInNewContext('('+fn.toString()+')()',{navigator:{userAgent:'fixture-ua',language:'en-IN',userAgentData:{brands:[],mobile:false,platform:'Windows'}}});}},
      req:{async get(url,options){trace.push(['transport-get',url,options]);if(failFirst&&!failedOnce&&url.includes('/bookingData/')){failedOnce=true;throw Error('synthetic network failure');}return{status:()=>200,json:async()=>url.includes('/bookingData/')?{bookingResponseDTO:[{pnrNumber:'synthetic-'+id,trainNumber:'00000',fromStn:'AAA',resvnUptoStn:'BBB',psgnDtlList:[{passengerName:'Synthetic',bookingStatusDetails:'CNF'}]}]}:{synthetic:'print-detail'},
          text:async()=>'<textarea id="app-config-data">'+Buffer.from(JSON.stringify({responseParams:{rid:'fixture-rid',merchantId:'fixture-merchant',merchantTxnNo:'fixture-transaction'}})).toString('base64')+'</textarea>'};},
        async post(url,options){trace.push(['transport-post',url,options]);return{status:()=>200,headers:()=>({location:'/auth?tranCtx=fixture-rid'}),json:async()=>({upiQR:'upi://pay?am=99',errorcode:'fixture-code'}),text:async()=>'<form action="https://gateway.invalid/start"><input name="encdata" value="fixture-redirect"></form>'};}},
      log(...args){trace.push(['transport-log',...args]);},
      survivorReq:{dispose(){trace.push(['dispose-survivor']);return Promise.resolve();}},directCtx:{dispose(){trace.push(['dispose-direct']);return Promise.resolve();}},
      async pollProviderQr(qr,stop,onWait,max,interval,sleep){trace.push(['poll-provider',stop(),max,interval]);onWait();await sleep(1);return{kind:'paid',encdata:'synthetic-bank-response'};},
      useSurvivorProxy(value){trace.push(['survivor-proxy',value]);},async armSurvivor(){trace.push(['arm-survivor']);},
      async bankResponse(...args){trace.push(['bank-response',...args]);return true;},
    },
  };
  for(const[name,fid]of [['bookingData','f1719'],['printTicket','f1727'],['reqRetry','f1756'],['gwHeaders','f1666'],['clientHints','f1660'],['gatewayHints','f1662'],['liveProviderOrigin','f1659'],['originFor','f1665'],['disposeSurvivor','f1621'],['disposeDirectContext','f1630'],['paymentRedirect','f1667'],['noteGatewayPage','f1663'],['providerQr','f1668']])actor.gateway[name]=engine.makeFunction(fid,engine.context(2,root));
  for(const[name,fid]of [['dispatchGateway','f2176'],['runProviderQr','f2186'],['settlePayment','f2181'],['pollBookingData','f2226'],['canRequestPnr','f2220'],['waitForPnrRetry','f2221'],['tok','f2230'],['paymentPageReferrer','f2231'],['finishBooking','f2243'],['finishBookingCore','f2233'],['attachPrintTicket','f2247'],['reportClientUpdate','f2009']])actor[name]=engine.makeFunction(fid,engine.context(2,root));
  const result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:'irctcqr',origin:'AAA',destination:'BBB',username:'synthetic'},'fixture-txn',99,new Set());
  return{result,trace,pnrSeen:actor.pnrSeen,booking:booked,contextsDisposed:actor.gateway.survivorReq===undefined&&actor.gateway.directCtx===undefined};
}
test('complete payment-init → QR → synthetic settlement → normalized booking matches recovered chain',async()=>{
  const before=await complete(false,'one'),after=await complete(true,'one');assert.deepEqual(after,before);
  assert.equal(after.result.reference,'synthetic-one');assert.equal(after.booking.pnr,'synthetic-one');assert.equal(after.pnrSeen,true);
  assert.deepEqual(after.booking.printDetail,{synthetic:'print-detail'});
  assert.equal(after.contextsDisposed,true);
  assert.ok(after.trace.some(row=>row[0]==='legacy'&&row[1]==='matrix-vendor-reporting-disabled'));
  assert.equal(after.trace.filter(row=>row[0]==='qr').length,1);
  assert.equal(after.trace.filter(row=>row[0]==='transport-get'&&row[1].includes('/bookingData/')).length,1);
  assert.equal(after.trace.filter(row=>row[0]==='transport-get'&&row[1].includes('/printTicket/')).length,1);
  assert.deepEqual(after.trace.slice(-2),[['end-pnr'],['end-settling']]);
});
test('complete native payment chains keep each actor booking and QR isolated',async()=>{
  const [a,b]=await Promise.all([complete(true,'first'),complete(true,'second')]);
  assert.equal(a.result.reference,'synthetic-first');assert.equal(b.result.reference,'synthetic-second');
  assert.deepEqual(a.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['first']);assert.deepEqual(b.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['second']);
});
test('complete payment chain retains original transport recovery after one synthetic network failure',async()=>{
  const before=await complete(false,'retry',{failFirst:true}),after=await complete(true,'retry',{failFirst:true});assert.deepEqual(after,before);
  assert.equal(after.result.success,true);assert.equal(after.trace.filter(row=>row[0]==='transport-get'&&row[1].includes('/bookingData/')).length,2);
  assert.equal(after.trace.filter(row=>row[0]==='timer'&&row[1]===800).length,1);
});
