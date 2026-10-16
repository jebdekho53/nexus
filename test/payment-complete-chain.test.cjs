'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createEngine}=require('../src/main/runtime/engine.cjs'),definitions=require('../src/main/generated/index.cjs'),strings=require('./fixtures/payment-strings.json');
const {reconstructedPayment}=require('../src/main/runtime/reconstructed-payment.cjs');
async function complete(native,id){
  const trace=[],random=()=>0.25,math=Object.create(Math);math.random=random;
  const engine=createEngine(definitions,{functionFactories:native?reconstructedPayment({development:true,enabled:true,dependencies:{random}}):{},globals:{...globalThis,Math:math,String,Number,JSON,Array,Boolean,URL}}),root=engine.context(1842,null);
  const table=Object.assign({},...Object.values(strings));root[5]=root[1841]=(n,key)=>{const value=table[n+'|'+key];assert.notEqual(value,undefined,'Missing fixture '+n+'|'+key);return value;};
  root[345]='https://example.invalid/mapps1';root[386]=()=>30;root[388]={irctcqr:[30]};root[389]=['irctcqr'];root[391]=()=>true;root[392]=()=>true;
  root[561]=value=>'http://'+value;
  for(const[slot,name]of [[362,'f510'],[387,'f535'],[393,'f542'],[394,'f544'],[395,'f545'],[396,'f546'],[397,'f547'],[398,'f548'],[399,'f549'],[400,'f554'],[940,'f2382']])root[slot]=engine.makeFunction(name,root);
  let settling=false;
  const actor={bankDetail:[{bankId:30}],stopped:false,terminal:false,securityQuarantined:false,pnrSeen:false,lastAvail:null,
    opts:{gatewayHosts:{qrGateway:{}},hideBrowser:false,onQr(value){trace.push(['qr',id,value]);},onQrClose(){trace.push(['qr-close',id]);}},
    api:{currentCsrf:'fixture-csrf'},session:{tokens:{accessToken:'fixture-token',greq:'fixture-greq',bmiyek:'fixture-bmiyek'},page:{isClosed(){return false;},url(){return 'https://example.invalid/nget/train-search';}}},
    spaCsrf(){trace.push(['csrf']);return'fixture-csrf';},isSettlingPayment(){return settling;},
    beginSettling(){settling=true;trace.push(['settling']);},endSettling(){settling=false;trace.push(['end-settling']);},beginFinalPnrRequest(){trace.push(['begin-pnr']);},endFinalPnrRequest(){trace.push(['end-pnr']);},
    log(...args){if(/^bookingData \(txn /.test(args[1]))args[1]='bookingData response received';trace.push(['log',...args]);},onProgress(...args){trace.push(['progress',...args]);},
    async safeCall(...args){trace.push(['init-request',...args]);return{ok:true,status:200,body:{transationId:'fixture-txn'}};},
    async routeGatewayThroughFormProxy(){trace.push(['proxy-route']);},checkNowSleep(ms){trace.push(['check-now',ms]);return Promise.resolve(true);},
    finishBookingCore(booking){trace.push(['finish',booking]);return{success:true,booking};},
    gateway:{
      async paymentRedirect(value){trace.push(['redirect',value]);return{action:'fixture-action',encdata:'fixture-redirect'};},
      async providerQr(...args){trace.push(['provider-qr',...args]);return{payload:'synthetic-qr',qrAmount:99};},
      async pollProviderQr(qr,stop,onWait,max,interval,sleep){trace.push(['poll-provider',stop(),max,interval]);onWait();await sleep(1);return{kind:'paid',encdata:'synthetic-bank-response'};},
      useSurvivorProxy(value){trace.push(['survivor-proxy',value]);},async armSurvivor(){trace.push(['arm-survivor']);},
      async bankResponse(...args){trace.push(['bank-response',...args]);return true;},
      async bookingData(value){trace.push(['booking-data',{...value,stopRetry:value.stopRetry()}]);return{bookingResponseDTO:[{pnrNumber:'synthetic-'+id,trainNumber:'00000',fromStn:'AAA',resvnUptoStn:'BBB',psgnDtlList:[{passengerName:'Synthetic',bookingStatusDetails:'CNF'}]}]};},
    },
  };
  for(const[name,fid]of [['dispatchGateway','f2176'],['runProviderQr','f2186'],['settlePayment','f2181'],['pollBookingData','f2226'],['canRequestPnr','f2220'],['waitForPnrRetry','f2221'],['tok','f2230'],['paymentPageReferrer','f2231'],['finishBooking','f2243']])actor[name]=engine.makeFunction(fid,engine.context(2,root));
  const result=await engine.makeFunction('f2172',engine.context(2,root)).call(actor,{paymentMethod:'irctcqr',origin:'AAA',destination:'BBB',username:'synthetic'},'fixture-txn',99,new Set());
  return{result,trace,pnrSeen:actor.pnrSeen};
}
test('complete payment-init → QR → synthetic settlement → normalized booking matches recovered chain',async()=>{
  const before=await complete(false,'one'),after=await complete(true,'one');assert.deepEqual(after,before);
  assert.equal(after.result.booking.pnr,'synthetic-one');assert.equal(after.pnrSeen,true);
  assert.equal(after.trace.filter(row=>row[0]==='qr').length,1);assert.equal(after.trace.filter(row=>row[0]==='booking-data').length,1);
  assert.deepEqual(after.trace.slice(-2),[['end-pnr'],['end-settling']]);
});
test('complete native payment chains keep each actor booking and QR isolated',async()=>{
  const [a,b]=await Promise.all([complete(true,'first'),complete(true,'second')]);
  assert.equal(a.result.booking.pnr,'synthetic-first');assert.equal(b.result.booking.pnr,'synthetic-second');
  assert.deepEqual(a.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['first']);assert.deepEqual(b.trace.filter(row=>row[0]==='qr').map(row=>row[1]),['second']);
});
