'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
const {hooks}=require('../src/main/runtime/legacy-services.cjs');
const vm=require('node:vm');
async function complete(native,id,{failFirst=false,pendingPoll=false,bankInterstitial=false,closeBrowserAtBank=false,configuredTls=false}={}){
  const trace=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const timers={setTimeout(fn,ms){trace.push(['timer',ms]);if(ms!==3000&&ms!==5000)queueMicrotask(()=>{clockMs+=ms;fn();});return 0;}};
  let clockMs=0,commandPolls=0,bankCalls=0,browserClosedOnce=false;const clock={now:()=>clockMs};
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{random,timers,clock}}):{},functionOverrides:hooks(event=>trace.push(['legacy',event])).overrides,globals:{...globalThis,Math:math,String,Number,JSON,Array,Object,Boolean,Promise,Error,URL,URLSearchParams,RegExp,Buffer,atob,Date:clock,setTimeout:timers.setTimeout}}),root=engine.context(1842,null);
  const table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[345]='https://example.invalid/mapps1';root[386]=()=>30;root[388]={irctcqr:[30]};root[389]=['irctcqr'];root[391]=()=>true;root[392]=()=>true;
  root[561]=value=>'http://'+value;
  root[139]=engine.makeFunction('f152',root);
  root[2132]=source=>new Function('return ('+source+')')();
  root[783]=engine.makeFunction('f1609',root);root[784]=engine.makeFunction('f1610',root);
  root[777]=engine.makeFunction('f1602',root);root[782]=engine.makeFunction('f1608',root);
  root[778]=engine.makeFunction('f1603',root);
  root[785]=engine.makeFunction('f1611',root);
  root[790]=host=>host==='example.invalid'||host==='gateway.invalid';
  root[764]=async(_context,url)=>{trace.push(['tls-cookie-header',url]);return '';};
  root[15]={request:{async newContext(options){trace.push(['new-context',options]);return{
    get(url,settings){trace.push(['survivor-request','get',url]);return rawRequest.get(url,settings);},post(url,settings){trace.push(['survivor-request','post',url]);return rawRequest.post(url,settings);},
    async dispose(){trace.push(['dispose-survivor']);},
  };}}};
  for(const[slot,name]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[397,'f547'],[398,'f548'],[399,'f549'],[400,'f554'],[940,'f2382']])root[slot]=engine.makeFunction(name,root);
  let settling=false,booked,failedOnce=false;
  const actor={bankDetail:[{bankId:30}],stopped:false,terminal:false,securityQuarantined:false,pnrSeen:false,lastAvail:null,
    opts:{gatewayHosts:{qrGateway:{},wps:'https://example.invalid'},hideBrowser:false,onQr(value){trace.push(['qr',id,value]);},onQrClose(){trace.push(['qr-close',id]);},onBooked(value){booked=value;trace.push(['booked',id]);}},
    api:{currentCsrf:'fixture-csrf'},session:{tokens:{accessToken:'fixture-token',greq:'fixture-greq',bmiyek:'fixture-bmiyek'},page:{isClosed(){return false;},url(){return 'https://example.invalid/nget/train-search';}}},
    spaCsrf(){trace.push(['csrf']);return'fixture-csrf';},isSettlingPayment(){return settling;},
    beginSettling(){settling=true;trace.push(['settling']);},endSettling(){settling=false;trace.push(['end-settling']);},beginFinalPnrRequest(){trace.push(['begin-pnr']);},endFinalPnrRequest(){trace.push(['end-pnr']);},
    log(...args){if(/^bookingData \(txn /.test(args[1]))args[1]='bookingData response received';trace.push(['log',...args]);},onProgress(...args){trace.push(['progress',...args]);},
    async safeCall(...args){trace.push(['init-request',...args]);return{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route']);},checkNowSleep(ms){trace.push(['check-now',ms]);clockMs+=ms;return Promise.resolve(true);},
    gateway:{
      directHosts:new Set(),failStreak:new Map(),browserGone:false,
      hosts:{wps:'https://example.invalid',providerOrigin:'https://example.invalid',qrGateway:'https://gateway.invalid'},
      page:{url(){return'https://example.invalid/nget/train-search';},context(){return{async cookies(){trace.push(['cookie-snapshot',id]);return[{name:'fixture-session',value:'fixture-'+id}];}};},async evaluate(fn){trace.push(['client-hints']);return vm.runInNewContext('('+fn.toString()+')()',{navigator:{userAgent:'fixture-ua',language:'en-IN',userAgentData:{brands:[],mobile:false,platform:'Windows'}}});}},
      req:{async get(url,options){trace.push(['transport-get',url,options]);if(failFirst&&!failedOnce&&url.includes('/bookingData/')){failedOnce=true;throw Error('synthetic network failure');}
          const body=url.includes('/bookingData/')?{bookingResponseDTO:[{pnrNumber:'synthetic-'+id,trainNumber:'00000',fromStn:'AAA',resvnUptoStn:'BBB',psgnDtlList:[{passengerName:'Synthetic',bookingStatusDetails:'CNF'}]}]}:{synthetic:'print-detail'};
          const auth='<textarea id="app-config-data">'+Buffer.from(JSON.stringify({responseParams:{rid:'fixture-rid',merchantId:'fixture-merchant',merchantTxnNo:'fixture-transaction'}})).toString('base64')+'</textarea>';
          return{status:()=>200,headers:()=>({}),json:async()=>body,text:async()=>url.includes('/bookingData/')||url.includes('/printTicket/')?JSON.stringify(body):auth};},
        async post(url,options){trace.push(['transport-post',url,options]);
          if(url.endsWith('/BankResponse')){if(closeBrowserAtBank&&!browserClosedOnce){browserClosedOnce=true;throw Error('Target closed');}bankCalls++;return{status:()=>200,headers:()=>({}),url:()=>bankInterstitial&&bankCalls===1?'https://example.invalid/intermediate':'https://example.invalid/booking-confirm',text:async()=>'<script>setTimeout(function(){ form.submit(); },45000)</script>'};}
          if(url.includes('/command?')){commandPolls++;const status=pendingPoll&&commandPolls===1?'PENDING':'SUC';return{status:()=>200,headers:()=>({}),ok:()=>true,text:async()=>JSON.stringify({txnStatus:status})};}
          if(url.endsWith('/statusCheckRedirect'))return{status:()=>200,headers:()=>({}),text:async()=>'<textarea id="app-config-data">'+Buffer.from(JSON.stringify({status:'SUC',responseParams:{encdata:'synthetic-bank-response'}})).toString('base64')+'</textarea>'};
          if(url.endsWith('/generateAndShowQR')){const body={upiQR:'upi://pay?am=99',errorcode:'fixture-code'};return{status:()=>200,headers:()=>({}),json:async()=>body,text:async()=>JSON.stringify(body)};}
          if(url==='https://gateway.invalid/start')return{status:()=>302,headers:()=>({location:'/auth?tranCtx=fixture-rid'}),text:async()=>''};
          if(url.endsWith('/PaymentRedirect'))return{status:()=>200,headers:()=>({}),text:async()=>'<form action="https://gateway.invalid/start"><input name="encdata" value="fixture-redirect"></form>'};
          throw Error('Unexpected synthetic POST URL');}},
      log(...args){trace.push(['transport-log',...args]);},
      logSetCookies(host,url){trace.push(['response-cookies',host,url]);},
      onHttpRecord(record){trace.push(['request-record',record.method,record.url,record.status]);},
      directCtx:{dispose(){trace.push(['dispose-direct']);return Promise.resolve();}},
    },
  };
  const rawRequest=actor.gateway.req;actor.gateway.page.request=rawRequest;
  if(configuredTls)actor.gateway.webTlsGateway=async(url,settings)=>{
    trace.push(['tls-effect',url,settings]);
    const response=await rawRequest[settings.method==='POST'?'post':'get'](url,{headers:settings.headers,data:settings.data});
    const headers=Object.fromEntries(Object.entries(response.headers?.()??{}).map(([key,value])=>[key,[value]]));
    const json=url.includes('/bookingData/')||url.includes('/printTicket/')||url.endsWith('/generateAndShowQR');
    return{status:response.status(),url:response.url?.()??url,headers,body:json?JSON.stringify(await response.json()):await response.text()};
  };
  const requestContext=engine.context(19,root);requestContext[18]={FALLBACK_AFTER:3};
  Object.defineProperty(actor.gateway,'req',{get:engine.makeFunction('f1652',requestContext),configurable:true});
  for(const[name,fid]of [['bookingData','f1719'],['printTicket','f1727'],['reqRetry','f1756'],['gwHeaders','f1666'],['clientHints','f1660'],['gatewayHints','f1662'],['liveProviderOrigin','f1659'],['originFor','f1665'],['disposeSurvivor','f1621'],['disposeDirectContext','f1630'],['paymentRedirect','f1667'],['noteGatewayPage','f1663'],['providerQr','f1668'],['pollProviderQr','f1673'],['irctcQrFetchEncdata','f1678'],['bankResponse','f1681'],['bankResponseOrigin','f1664'],['useSurvivorProxy','f1618'],['armSurvivor','f1619'],['sleep','f1628'],['sendViaWebTlsGateway','f1633'],['record','f1649']])actor.gateway[name]=engine.makeFunction(fid,engine.context(2,root));
  for(const[name,fid]of [['dispatchGateway','f2176'],['runProviderQr','f2186'],['settlePayment','f2181'],['pollBookingData','f2226'],['canRequestPnr','f2220'],['waitForPnrRetry','f2221'],['tok','f2230'],['paymentPageReferrer','f2231'],['finishBooking','f2243'],['finishBookingCore','f2233'],['attachPrintTicket','f2247'],['reportClientUpdate','f2009']])actor[name]=engine.makeFunction(fid,engine.context(2,root));
  const result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:'irctcqr',origin:'AAA',destination:'BBB',username:'synthetic'},'fixture-txn',99,new Set());
  return{result,trace,pnrSeen:actor.pnrSeen,booking:booked,browserGone:actor.gateway.browserGone,contextsDisposed:actor.gateway.survivorReq===undefined&&actor.gateway.directCtx===undefined};
}
test('complete payment-init → QR → synthetic settlement → normalized booking matches recovered chain',async()=>{
  const before=await complete(false,'one'),after=await complete(true,'one');assert.deepEqual(after,before);
  assert.equal(after.result.reference,'synthetic-one');assert.equal(after.booking.pnr,'synthetic-one');assert.equal(after.pnrSeen,true);
  assert.deepEqual(after.booking.printDetail,{synthetic:'print-detail'});
  assert.equal(after.contextsDisposed,true);
  assert.equal(after.trace.filter(row=>row[0]==='new-context').length,1);
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
test('complete payment chain polls pending then synthetic paid status with the original wait',async()=>{
  const before=await complete(false,'poll',{pendingPoll:true}),after=await complete(true,'poll',{pendingPoll:true});assert.deepEqual(after,before);
  assert.equal(after.result.success,true);assert.deepEqual(after.trace.filter(row=>row[0]==='check-now'),[['check-now',10000]]);
  assert.equal(after.trace.filter(row=>row[0]==='transport-post'&&row[1].includes('/command?')).length,2);
  assert.equal(after.trace.filter(row=>row[0]==='transport-post'&&row[1].endsWith('/statusCheckRedirect')).length,1);
});
test('complete synthetic settlement honors bank interstitial before bodiless continuation',async()=>{
  const before=await complete(false,'bank',{bankInterstitial:true}),after=await complete(true,'bank',{bankInterstitial:true});assert.deepEqual(after,before);
  const posts=after.trace.filter(row=>row[0]==='transport-post'&&row[1].endsWith('/BankResponse'));
  assert.equal(posts.length,2);assert.deepEqual(posts[0][2].form,{encdata:'synthetic-bank-response'});assert.equal('form'in posts[1][2],false);
  assert.deepEqual(after.trace.filter(row=>row[0]==='timer'&&row[1]===45000),[['timer',45000]]);assert.equal(after.result.success,true);
});
test('complete synthetic settlement survives a mid-call browser close using its own armed context',async()=>{
  const before=await complete(false,'closed',{closeBrowserAtBank:true}),after=await complete(true,'closed',{closeBrowserAtBank:true});assert.deepEqual(after,before);
  assert.equal(after.result.success,true);assert.equal(after.browserGone,true);assert.equal(after.contextsDisposed,true);
  assert.ok(after.trace.some(row=>row[0]==='survivor-request'&&row[2].includes('/BankResponse')));
  assert.ok(after.trace.some(row=>row[0]==='survivor-request'&&row[2].includes('/bookingData/')));
});
test('complete configured-TLS synthetic chain uses native transport facade through booking result',async()=>{
  const before=await complete(false,'tls',{configuredTls:true}),after=await complete(true,'tls',{configuredTls:true});assert.deepEqual(after,before);
  assert.equal(after.result.success,true);assert.ok(after.trace.some(row=>row[0]==='tls-effect'));
  assert.ok(after.trace.some(row=>row[0]==='request-record'&&row[1].includes('*+TLS')));
});
