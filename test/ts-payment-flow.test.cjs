'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {differential,sameExports}=require('./helpers/legacy-diff.cjs');
const load=name=>[require('./fixtures/legacy/'+name+'.legacy.cjs'),require('../src/main/payment/'+name+'.cjs')];

// TypeScript migrations of the post-payment flow versus their previous JavaScript (kept as fixtures).
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('booking-result: normalizeBooking / passengerResult / emptyBooking',async()=>{
  const[legacy,migrated]=load('booking-result');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const passenger=(o={})=>({passengerName:'A',passengerAge:30,passengerGender:'M',bookingCoachId:'B1',bookingBerthNo:7,bookingBerthCode:'LB',bookingStatusDetails:'CNF',currentStatusDetails:'CNF',passengerNetFare:100,...o});
  const passengers=[passenger(),passenger({bookingStatusDetails:'WL/3',currentStatusDetails:'CNF'}),passenger({bookingStatusDetails:undefined,currentStatusDetails:'cnf'}),passenger({bookingStatusDetails:'',currentStatusDetails:''}),passenger({passengerAge:null,passengerNetFare:null,passengerGender:null,bookingCoachId:'',bookingBerthNo:0}),passenger({passengerAge:'abc',passengerNetFare:'12.5',passengerName:undefined}),{}, passenger({passengerAge:0,passengerNetFare:0,bookingBerthNo:0,bookingBerthCode:''})];
  for(const p of passengers)await check('passenger '+JSON.stringify(p),m=>m.passengerResult(p));
  await check('empty',m=>m.emptyBooking());
  const row=(o={})=>({pnrNumber:'1234567890',errorMessage:'',trainNumber:'12951',trainName:'Express',fromStnName:'Delhi',fromStn:'NDLS',resvnUptoStnName:'Mumbai',resvnUptoStn:'BCT',destStn:'BCT',destStnName:'Mumbai Central',boardingStnName:'Delhi Jn',boardingStn:'NDLS',boardingDate:'2024-05-01T00:00:00',journeyDate:'2024-05-02',departureTime:'1630',arrivalTime:'0830',journeyClass:'3A',bookedQuota:'GN',journeyQuota:'TQ',totalCollectibleAmount:1500,reservationId:'R1',ticketType:'E',qrCodeText:'qr-row',ersDisplayMessage:['m1','',2],bankNameDis:'RowBank',bookingDate:'row-date',psgnDtlList:[passenger(),passenger({passengerName:'B'})],...o});
  const bodies=[undefined,null,{},{bankErrorFlag:true},{bankErrorFlag:'true'},{bankErrorFlag:'TRUE'},{bankErrorFlag:true,bookingResponseDTO:[row()]},
    {bookingResponseDTO:[]},{bookingResponseDTO:[null]},{bookingResponseDTO:[row()]},{bookingResponseDTO:[row({pnrNumber:''})]},{bookingResponseDTO:[row({pnrNumber:'',errorMessage:'Seat gone'})]},
    {bookingResponseDTO:[row({errorMessage:'warn'})]},{bookingResponseDTO:[row({psgnDtlList:undefined})]},{bookingResponseDTO:[row({psgnDtlList:[]})]},{bookingResponseDTO:[row({psgnDtlList:[passenger(),passenger({bookingStatusDetails:'WL/2'})]})]},
    {bookingResponseDTO:[row({ersDisplayMessage:'not an array'})]},{bookingResponseDTO:[row({ersDisplayMessage:[]})]},{bookingResponseDTO:[row({fromStnName:'',toStnName:'x',resvnUptoStnName:'',destStnName:''})]},
    {bookingResponseDTO:[row({boardingDate:'',journeyDate:undefined})]},{bookingResponseDTO:[row({boardingDate:20240501})]},{bookingResponseDTO:[row({totalCollectibleAmount:undefined})],totalCollectibleAmount:900},{bookingResponseDTO:[row({totalCollectibleAmount:undefined})]},{bookingResponseDTO:[row({totalCollectibleAmount:null})],totalCollectibleAmount:'77.5'},
    {bookingResponseDTO:[row({totalCollectibleAmount:'bad'})]},{bookingResponseDTO:[row({qrCodeText:undefined,bankNameDis:undefined,bookingDate:undefined,reservationId:undefined})],qrCodeText:'qr-body',bankNameDis:'BodyBank',bankPaymentMode:'mode',bookingDate:'body-date',transactionId:'T9',userDetail:{firstName:'Ann'}},
    {bookingResponseDTO:[row({bankNameDis:undefined})],bankPaymentMode:'UPI'},{bookingResponseDTO:[row({fromStn:undefined,resvnUptoStn:undefined,destStn:undefined,boardingStnName:undefined,boardingStn:undefined,journeyClass:undefined,bookedQuota:undefined})]},{bookingResponseDTO:[row({departureTime:0,arrivalTime:null})]},{userDetail:null,bookingResponseDTO:[row()]}];
  for(const body of bodies)for(const extracted of[undefined,null,'',  'extracted error']) {
    await check('normalize '+JSON.stringify(body)+extracted,(m,trace)=>m.normalizeBooking(body,{extractError:value=>{trace.push(['extract',value]);return extracted;}}));
  }
  await check('custom empty',(m,trace)=>m.normalizeBooking({bankErrorFlag:true},{extractError(){},empty:()=>{trace.push('empty');return{custom:true};}}));
});

const makeFetchActor=(trace,o={})=>{
  let can=o.can??[true,true,true,true,true,true,true,true,true,true,true,true];
  let calls=0;
  const actor={
    terminal:o.terminal,securityQuarantined:o.quarantined,opts:{slowDownPayment:o.slow},pnrSeen:undefined,
    gateway:o.gateway===false?undefined:{bookingData:request=>{trace.push(['gwBookingData',{...request,stopRetry:request.stopRetry()}]);return o.gwFail?Promise.reject(new Error('x')):Promise.resolve(o.bodies?o.bodies[Math.min(calls++,o.bodies.length-1)]:{n:calls++});}},
    canRequestPnr:()=>{const value=can[Math.min(calls_.can++,can.length-1)];trace.push(['can',value]);return value;},
    beginFinalPnrRequest:()=>trace.push('begin'),endFinalPnrRequest:()=>trace.push('end'),onProgress:(...a)=>trace.push(['progress',...a]),
    spaCsrf:()=>{trace.push('csrf');return'CSRF';},safeCall:(...a)=>{trace.push(['safeCall',...a]);return Promise.resolve(o.response);},
    tok:()=>{trace.push('tok');return{accessToken:'A',greq:'G',bmiyek:'B'};},log:(...a)=>trace.push(['log',...a]),
    waitForPnrRetry:ms=>{trace.push(['wait',ms]);return Promise.resolve(o.waits?o.waits[Math.min(calls_.wait++,o.waits.length-1)]:true);},
  };
  const calls_={can:0,wait:0};
  return actor;
};
test('booking-data: fetchBookingData',async()=>{
  const[legacy,migrated]=load('booking-data');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const scenarios={
    blockedAtStart:{can:[false]},blockedAfterBegin:{can:[true,false]},gateway:{},gatewayFails:{gwFail:true},
    api:{gateway:false,response:{body:{x:1}}},apiNull:{gateway:false,response:null},apiNoBody:{gateway:false,response:{}},apiTerminal:{gateway:false,terminal:'done',response:{body:{x:1}}},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,(m,trace)=>m.fetchBookingData(makeFetchActor(trace,o),'TXN1',{accessToken:'A',greq:'G',bmiyek:'B'},{bookingDataUrl:id=>{trace.push(['url',id]);return'/data/'+id;}}));
});
test('booking-data: pollBookingData',async()=>{
  const[legacy,migrated]=load('booking-data');
  const check=differential(legacy,migrated);
  const bookingOf=body=>body&&(body.pnr||body.errorMessage)?body:null;
  const scenarios={
    blockedAtStart:{can:[false]},immediate:{bodies:[{pnr:'P1'}]},errorImmediate:{bodies:[{errorMessage:'bad'}]},noRetry:{bodies:[{n:1}]},
    retryThenPnr:{bodies:[{retry:500},{retry:700},{pnr:'P2'}]},retryExhausted:{bodies:[{retry:500}]},retryWaitDeclined:{bodies:[{retry:500},{pnr:'P'}],waits:[false]},
    blockedDuringRetry:{bodies:[{retry:500}],can:[true,true,true,false]},slow:{slow:true,bodies:[{pnr:'P'}]},slowQuarantined:{slow:true,quarantined:true,bodies:[{pnr:'P'}]},
    slowDeclined:{slow:true,waits:[false],bodies:[{pnr:'P'}]},slowEnv:{slow:true,env:{SLOW_DOWN_PAYMENT_MS:'1234'},bodies:[{pnr:'P'}]},slowEnvBad:{slow:true,env:{SLOW_DOWN_PAYMENT_MS:'abc'},bodies:[{pnr:'P'}]},
  };
  for(const[name,o]of Object.entries(scenarios))
    await check(name,async(m,trace)=>{
      const actor=makeFetchActor(trace,o);
      const result=await m.pollBookingData(actor,'TXN1',{j:1},20,{bookingDataUrl:id=>'/d/'+id,normalizeBooking:body=>{trace.push(['normalize',body]);return bookingOf(body);},retryAfter:body=>{trace.push(['retryAfter',body]);return body&&body.retry||null;}},o.env?{env:o.env}:{});
      return{result,pnrSeen:actor.pnrSeen};
    });
});

const makeFinishActor=(trace,o={})=>({
  gateway:o.noGateway?undefined:{disposeSurvivor:()=>{trace.push('survivor');return o.disposeRejects?Promise.reject(new Error('d')):Promise.resolve();},disposeDirectContext:()=>{trace.push('direct');return Promise.resolve();}},
  gatewayReqCtx:o.reqCtx?{dispose:()=>{trace.push('reqCtx');return Promise.reject(new Error('r'));}}:undefined,
  paymentCancelled:o.cancelled,paidQrAmount:o.paidQr,opts:{onBooked:o.noOnBooked?undefined:b=>trace.push(['booked',b.pnr,b.amount])},
  stoppedResult:()=>{trace.push('stoppedResult');return{stopped:true};},log:(...a)=>trace.push(['log',...a]),
  attachPrintTicket:b=>{trace.push('print');return o.printHang?new Promise(()=>{}):o.printRejects?Promise.reject(new Error('p')):Promise.resolve();},
  onProgress:(...a)=>trace.push(['progress',...a]),
  reportClientUpdate:b=>{trace.push('report');return o.reportHang?new Promise(resolve=>{o.release=resolve;}):o.reportRejects?Promise.reject(new Error('rep')):Promise.resolve('reported');},
  finishBookingCore(b){return module_.finishBookingCore(this,b,{timers:o.timers});},endFinalPnrRequest:()=>trace.push('endFinal'),endSettling:()=>trace.push('endSettling'),
});
let module_;
test('finish-booking',async()=>{
  const[legacy,migrated]=load('finish-booking');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const booking=(o={})=>({pnr:'PNR1',amount:500,allConfirmed:true,passengers:[{confirmed:true}],...o});
  const instantTimers={setTimeout:(callback,ms)=>{callback();return 0;}};
  const never={setTimeout:()=>0};
  const scenarios=[
    ['confirmed',booking(),{timers:never}],['confirmed with instant timers',booking(),{timers:instantTimers}],['booked not confirmed',booking({allConfirmed:false}),{timers:never}],
    ['waitlist only',booking({passengers:[{confirmed:false}]}),{timers:never}],['no passengers',booking({passengers:[]}),{timers:never}],
    ['qr amount differs',booking(),{paidQr:700,timers:never}],['qr amount same',booking({amount:700}),{paidQr:700,timers:never}],['qr amount invalid',booking(),{paidQr:-1,timers:never}],['qr amount NaN',booking(),{paidQr:NaN,timers:never}],
    ['no onBooked',booking(),{noOnBooked:true,timers:never}],['print rejects',booking(),{printRejects:true,timers:never}],['print hangs, 3s timer',booking(),{printHang:true,timers:instantTimers}],
    ['report rejects',booking(),{reportRejects:true,timers:never}],['report hangs, 5s timer fires',booking(),{reportHang:true,timers:instantTimers,releaseAfter:true}],
    ['cancelled',booking(),{cancelled:true,timers:never}],['disposals reject',booking(),{disposeRejects:true,reqCtx:true,timers:never}],['no gateway',booking(),{noGateway:true,timers:never}],
    ['error booking',{errorMessage:'Seat gone',passengers:[]},{timers:never}],['no booking',null,{timers:never}],['undefined booking',undefined,{timers:never}],['empty booking',{passengers:[]},{timers:never}],
  ];
  for(const[name,bookingValue,o]of scenarios)
    await check(name,async(m,trace)=>{
      module_=m;
      const options={...o};
      const actor=makeFinishActor(trace,options);
      const pending=m.finishBooking(actor,bookingValue&&{...bookingValue,passengers:bookingValue.passengers&&bookingValue.passengers.map(p=>({...p}))});
      if(options.releaseAfter){await tick();options.release?.();}
      const result=await pending;
      return{result,reqCtxCleared:actor.gatewayReqCtx===undefined,amount:bookingValue&&bookingValue.amount};
    });
  await check('finishBooking cleans up when the core rejects',async(m,trace)=>{
    const actor={finishBookingCore:()=>{trace.push('core');return Promise.reject(new Error('core'));},endFinalPnrRequest:()=>trace.push('endFinal'),endSettling:()=>trace.push('endSettling')};
    return m.finishBooking(actor,{});
  });
  await check('finishBookingCore real timers path (cancelled)',async(m,trace)=>{module_=m;return m.finishBookingCore(makeFinishActor(trace,{cancelled:true}),booking());});
});

test('gateway-dispatch',async()=>{
  const[legacy,migrated]=load('gateway-dispatch');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const allHosts={qrGateway:'q',wps:'w',paytm:'p',phonepeApi:'ph',razorpay:'r'};
  const hostSets=[allHosts,{wps:'w'},{},undefined,{...allHosts,qrGateway:undefined},{...allHosts,wps:undefined}];
  const methods=['irctcqr','wallet','paytm','phonepay','razorpayqr','paytmupi','unknown',''];
  for(const hosts of hostSets)for(const gateway of[true,false])for(const method of methods)
    await check(JSON.stringify([hosts,gateway,method]),async(m,trace)=>{
      const run=name=>(...args)=>{trace.push([name,...args]);return Promise.resolve(name);};
      const actor={opts:{gatewayHosts:hosts},gateway:gateway?{walletVerify:()=>Promise.resolve(null)}:undefined,paymentSetupFailed:message=>{trace.push(['setupFailed',message]);return'setup-failed';},runProviderQr:run('qr'),runPaytmQr:run('paytm'),runPhonePeQr:run('phonepe'),runRazorpay:run('razorpay'),
        stopWith:msg=>{trace.push(['stopWith',msg]);return'stopped:'+msg;},now:()=>0,stopped:true,tok:()=>({}),log(){},onProgress(){},beginSettling(){},beginFinalPnrRequest(){}};
      return m.dispatchPayment(actor,{j:1},'TXN',250,method,{body:{}},{extractError:()=>null,normalizeBooking:()=>null,stoppedResult:()=>'stoppedResult'});
    });
  const wallet=(o={})=>async(m,trace)=>{
    let clock=0;const stopAt=o.stopAt;
    const actor={
      opts:{gatewayHosts:{wps:'w'}},api:o.noApi?null:{currentCsrf:o.apiCsrf},stopped:false,securityQuarantined:o.quarantined,
      gateway:{walletVerify:request=>{trace.push(['walletVerify',{...request,stopRetry:request.stopRetry()}]);return o.verifyRejects?Promise.reject(new Error('wv')):Promise.resolve(o.response);}},
      now:()=>{const value=clock;clock+=2500;if(stopAt!==undefined&&value>=stopAt)actor.stopped=true;return value;},
      session:{page:{waitForTimeout:ms=>{trace.push(['wait',ms]);return o.waitRejects?Promise.reject(new Error('w')):Promise.resolve();}}},
      tok:()=>{trace.push('tok');return{accessToken:'A',greq:'G',bmiyek:'B',csrfToken:o.tokCsrf};},log:(...a)=>trace.push(['log',...a]),onProgress:(...a)=>trace.push(['progress',...a]),
      beginSettling:()=>trace.push('settling'),beginFinalPnrRequest:()=>trace.push('final'),stopWith:msg=>{trace.push(['stopWith',msg]);return'stopped:'+msg;},finishBooking:b=>{trace.push(['finish',b]);return'finished';},
      paymentSetupFailed:()=>'x',runProviderQr:()=>0,runPaytmQr:()=>0,runPhonePeQr:()=>0,runRazorpay:()=>0,
    };
    return m.dispatchPayment(actor,{j:1},'TXN',o.amount??250,'wallet',o.init??{body:{}},{
      extractError:value=>{trace.push(['extract',value]);return value&&value.err||null;},
      normalizeBooking:value=>{trace.push(['normalize',value]);return value&&value.booking||null;},stoppedResult:()=>'stoppedResult'});
  };
  const cases={
    ok:{response:{booking:{pnr:'P'}}},bookingError:{response:{booking:{errorMessage:'bank'}}},noBookingNoError:{response:{}},noBookingWithError:{response:{err:'declined'}},verifyRejects:{verifyRejects:true},
    initError:{init:{body:{err:'bad init',paramList:[{key:'BALANCE',value:'12.5'}],withoutOTP:true}}},initErrorNoBalance:{init:{body:{err:'bad init'}}},initErrorBadParams:{init:{body:{err:'x',paramList:'nope'}}},
    initErrorNullRow:{init:{body:{err:'x',paramList:[null,{key:'OTHER'}]}}},noBody:{init:{}},stoppedDuringWait:{stopAt:5000},waitRejects:{waitRejects:true,response:{booking:{pnr:'P'}}},
    csrfFromApi:{apiCsrf:'api',response:{booking:{pnr:'P'}}},csrfFromTok:{tokCsrf:'tok',response:{booking:{pnr:'P'}}},csrfNone:{noApi:true,response:{booking:{pnr:'P'}}},quarantined:{quarantined:true,response:{booking:{pnr:'P'}}},noAmount:{amount:0,response:{}},
  };
  for(const[name,o]of Object.entries(cases))await check('wallet '+name,wallet(o));
});

test('gateway-requests',async()=>{
  const[legacy,migrated]=load('gateway-requests');sameExports(legacy,migrated);
  const check=differential(legacy,migrated);
  const makeActor=(trace,o={})=>({
    hosts:{wps:'https://wps.test'},
    req:{get:(url,options)=>{trace.push(['get',url,options]);return Promise.resolve({json:()=>o.jsonRejects?Promise.reject(new Error('j')):Promise.resolve(o.json),status:()=>o.status??200});}},
    reqRetry:async(label,operation,...rest)=>{trace.push(['retry',label,rest.length,typeof rest[1]]);return operation();},
    gwHeaders:async(host,options)=>{trace.push(['headers',host,options]);return{H:1};},log:(...a)=>trace.push(['log',...a]),
  });
  for(const input of[{clientTxnId:'T1',accessToken:'tok',greq:'g',bmiyek:'b',spaCsrf:'c',stopRetry:()=>true},{clientTxnId:'T2',accessToken:'',greq:undefined,bmiyek:null,spaCsrf:'',pnr:'P',lang:'hi'},{pnr:'P2',accessToken:null},{}])
    for(const o of[{json:{a:1}},{jsonRejects:true},{json:null,status:500}]) {
      await check('bookingData '+JSON.stringify([input,o]),(m,trace)=>m.requestBookingData(makeActor(trace,o),input));
      await check('printTicket '+JSON.stringify([input,o]),(m,trace)=>m.requestPrintTicket(makeActor(trace,o),input));
    }
});
