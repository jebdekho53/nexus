'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];

// Bank response, settlement and wallet verification (src/ts/main/payment) versus the previous JavaScript.
test('interstitialDelay',async()=>{
  const[legacy,migrated]=load('bank-response');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const htmls=['','<script>setTimeout(function(){document.f.submit();},4500)</script>','<script>setTimeout(function (  ) { document.forms[0].submit() ; }, 1200 );</script>','setTimeout(() => f.submit(), 3000)','setTimeout(go, 100); x.submit()','setTimeout(function(){a();},900)','<script>setTimeout(function(){ if(x){y} f.submit(); }, 0)</script>','SETTIMEOUT(FUNCTION(){F.SUBMIT()},77)','setTimeout(function(){f.submit()},abc)','no timers','setTimeout(f.submit(),10)','setTimeout(function(){f.submit();},2500);setTimeout(function(){f.submit();},9000)'];
  for(const html of htmls)await check('delay '+html,m=>m.interstitialDelay(html));
});

const resp=(o={})=>({url:()=>o.url??'https://wps.test/eticketing/other',status:()=>o.status??200,text:()=>o.textRejects?Promise.reject(new Error('t')):Promise.resolve(o.html??'')});
function bankActor(trace,script,o={}) {
  let call=0;
  return{
    hosts:{wps:'https://wps.test'},
    req:{post:(url,options)=>{trace.push(['post',url,options]);const step=script[Math.min(call++,script.length-1)];return step instanceof Error?Promise.reject(step):Promise.resolve(step);}},
    gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},bankResponseOrigin:()=>{trace.push('origin');return o.origin;},
    sleep:ms=>{trace.push(['sleep',ms]);return Promise.resolve();},log:(...a)=>trace.push(['log',...a]),
  };
}
test('bankResponse and paytmBankResponse follow the confirmation chain',async()=>{
  const[legacy,migrated]=load('bank-response');
  const check=differential(legacy,migrated);
  const confirmUrl=resp({url:'https://wps.test/booking-confirm?x=1'}),confirmBody=resp({html:'<h1>Booking-Confirm</h1>'});
  const interstitial=resp({html:'<script>setTimeout(function(){f.submit();},2000)</script>'}),non200=resp({status:302}),empty=resp(),textFails=resp({textRejects:true});
  const net=new Error('ECONNRESET'),closed=new Error('Target closed');
  const scripts={
    confirmUrl:[confirmUrl],confirmBody:[confirmBody],interstitialThen:[interstitial,confirmUrl],non200Then:[non200,confirmBody],emptyThree:[empty],emptyThenConfirm:[empty,empty,confirmUrl],
    netThen:[net,confirmUrl],netFour:[net],netRecoversThenNet:[net,net,net,confirmUrl],closed:[closed],textFails:[textFails],interstitialResets:[empty,interstitial,empty,empty,confirmUrl],mixed:[non200,interstitial,empty,net,confirmBody],
  };
  const origins=[undefined,null,{origin:'https://o.test',referer:'https://o.test/'}];
  for(const[name,script]of Object.entries(scripts))for(const origin of origins) {
    await check('bank '+name+JSON.stringify(origin),(m,trace)=>m.bankResponse(bankActor(trace,script,{origin}),'ENC123','encdata',{isBrowserClosed:e=>/closed/i.test(e.message),parseDelay:h=>m.interstitialDelay(h)}));
    await check('bank key '+name,(m,trace)=>m.bankResponse(bankActor(trace,script,{origin}),'ENC','custom'+name.length,{isBrowserClosed:()=>false,parseDelay:h=>m.interstitialDelay(h)}));
    await check('bank default key '+name,(m,trace)=>m.bankResponse(bankActor(trace,script,{origin}),'ENC',undefined,{isBrowserClosed:()=>false,parseDelay:h=>m.interstitialDelay(h)}));
    await check('paytm '+name+JSON.stringify(origin),(m,trace)=>m.paytmBankResponse(bankActor(trace,script,{origin}),{mid:'M',encData:'E',checksum:'C'},{parseDelay:h=>m.interstitialDelay(h)}));
  }
});

function settleActor(trace,o={}) {
  const gateway=o.noGateway?undefined:{
    useSurvivorProxy:p=>trace.push(['useProxy',p]),armSurvivor:()=>{trace.push('arm');return o.armRejects?Promise.reject(new Error('a')):Promise.resolve();},
    bankResponse:(payload,key)=>{trace.push(['bank',payload,key]);return o.bankRejects?Promise.reject(new Error('b')):Promise.resolve(o.reached??true);},
  };
  const actor={
    stopped:o.stopped,opts:{onQrClose:o.noClose?undefined:()=>trace.push('qrClose'),onConfirm:o.confirm===undefined?undefined:request=>{trace.push(['confirm',request]);if(o.confirm==='stopDuring')actor.stopped=true;return o.confirm==='rejects'?Promise.reject(new Error('c')):Promise.resolve(o.confirm==='stopDuring'?true:o.confirm);}},
    session:{proxy:o.proxy},gateway,stoppedResult:()=>{trace.push('stoppedResult');return'stopped';},beginSettling:()=>trace.push('settling'),
    onProgress:(...a)=>trace.push(['progress',...a]),log:(...a)=>trace.push(['log',...a]),
    finishBooking:b=>{trace.push(['finish',b]);return o.sync?{success:o.success??true,from:'sync'}:Promise.resolve({success:o.success??true});},pollBookingData:(...a)=>{trace.push(['poll',...a]);return Promise.resolve({pnr:'P'});},
  };
  return actor;
}
test('settlePayment',async()=>{
  const[legacy,migrated]=load('settlement');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const payments=[{kind:'paid',encdata:'ENC'},{kind:'paid'},{kind:'paid',encdata:''},{kind:'declined',reason:'R'},{kind:'failed',reason:'F'},{kind:'timeout'},{kind:'stopped'},{kind:'weird'}];
  const options=[{},{stopped:true},{noGateway:true},{armRejects:true},{bankRejects:true},{reached:false},{confirm:true},{confirm:false},{confirm:'rejects'},{confirm:'stopDuring'},{proxy:{server:'  proxy:80 ',username:'u',password:'p'}},{proxy:{server:'   '}},{proxy:{}},{noClose:true},{sync:true},{success:false}];
  for(const payment of payments)for(const o of options)for(const requireBank of[false,true])for(const pause of[false,true]) {
    if(payment.kind==='paid'&&!payment.encdata&&o.noGateway&&!requireBank&&false)continue;
    await check(JSON.stringify([payment,o,requireBank,pause]),(m,trace)=>m.settlePayment(settleActor(trace,o),payment,'encdata','TXN',{paymentPause:pause},requireBank,{normalizeProxy:server=>{trace.push(['normalize',server]);return'N:'+server.trim();}}));
  }
  await check('requireBankResponse default',(m,trace)=>m.settlePayment(settleActor(trace,{}),{kind:'paid'},'k','T',{}));
});

test('walletVerify',async()=>{
  const[legacy,migrated]=load('wallet-verify');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const fixedClock=class extends Date{constructor(...a){super(...(a.length?a:[Date.UTC(2024,4,1,10,0,0)]));}};
  const inits=[undefined,null,{},{transationId:5,bankId:0,txnType:7,txnStatus:1,txnDate:'D',amount:99,serverId:'S',timeStamp:'T',upiModeOpted:1,remainingBalance:'5.0',loyaltyNum:'L',withoutOTP:false},{transationId:null,bankId:null,amount:null,withoutOTP:null}];
  const input=(o={})=>({init:o.init,amount:250,clientTxnId:'TX1',accessToken:o.token??'tok',bmiyek:'b',greq:'g',spaCsrf:'c',stopRetry:o.stop});
  const http=(status,json)=>({status:()=>status,json:()=>json instanceof Error?Promise.reject(json):Promise.resolve(json)});
  for(const init of inits)
    await check('body '+JSON.stringify(init),async(m,trace)=>m.walletVerify({hosts:{wps:'https://wps.test'},gwHeaders:async(h,o)=>{trace.push(['headers',h,o]);return{H:1};},req:{post:(url,options)=>{trace.push(['post',url,options]);return Promise.resolve(http(200,{ok:1}));}},log:(...a)=>trace.push(['log',...a]),sleep:ms=>{trace.push(['sleep',ms]);return Promise.resolve();},snip:t=>trace.push(['snip',t])},input({init}),{clock:fixedClock}));
  const scripts={
    ok:[http(200,{pnr:'x'})],jsonFails:[http(200,new Error('j'))],transientThenOk:[http(502,{}),http(504,{}),http(200,{done:true})],throwsThenOk:[new Error('net'),http(200,{done:true})],alwaysThrows:[new Error('net')],always502:[http(502,{a:1})],
  };
  const stops={none:undefined,immediately:()=>true,afterFirst:(()=>{let n=0;return()=>n++>=1;}),afterSecond:(()=>{let n=0;return()=>n++>=2;})};
  for(const[name,script]of Object.entries(scripts))for(const[stopName,makeStop]of Object.entries(stops))for(const token of['tok','',null]) {
    const limited=name==='always502'||name==='alwaysThrows';
    await check(name+stopName+token,async(m,trace)=>{
      let call=0;
      const stop=makeStop&&(stopName==='immediately'?makeStop:makeStop());
      const attemptsCap=limited&&!stop?3:Infinity;
      return m.walletVerify({hosts:{wps:'https://wps.test'},gwHeaders:async(h,o)=>{trace.push(['headers',o.extra.Authorization]);return{H:1};},
        req:{post:()=>{const step=script[Math.min(call++,script.length-1)];trace.push(['post',call]);if(call>attemptsCap)throw new Error('synthetic cap');return step instanceof Error?Promise.reject(step):Promise.resolve(step);}},
        log:(...a)=>trace.push(['log',...a]),sleep:ms=>{trace.push(['sleep',ms]);return o_sleep(ms);},snip:t=>trace.push(['snip',t])},input({token,stop}),{clock:fixedClock});
    });
  }
});
const o_sleep=()=>Promise.resolve();
