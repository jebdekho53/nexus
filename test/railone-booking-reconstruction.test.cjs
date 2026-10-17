'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

// f3149 runInner (RailOne): every scenario runs the actual recovered function and the native modules against a fresh
// scripted actor, scripted bootstrap helpers and a scripted hosted-order client, then compares the result and the full
// effect trace (order included). Helper behaviour is derived from plain fields on synthetic bodies.

const R=(body={},extra={})=>({ok:true,status:200,body,...extra});
const happy={
  validate:[R({session:true,vWait:1200,pWait:1500})],
  search:[R({})],
  board:[R({stations:['NDLS','BCT'],times:[1.5],catering:null,parsed:{noSeats:false}})],
  callY:[R({parsed:{status:'CNF/B1/1',bookable:true,totalCollectibleAmount:2000},captcha:null,banks:'501:1',offers501:true,upiAmount:1990,order:{transationId:7,orOrderid:'BD1',mercid:'M1',otoken:'tok',billdeskBaseUrl:'https://bd.invalid'},init:{encData:'ENC',transationId:'T1',minPaymentMs:900}})],
  verifyCaptcha:[R({verdict:{verdict:'success',amount:2100},captcha:null})],
  pay:[R({init:{encData:'ENC',transationId:'T1',minPaymentMs:900},order:{transationId:7,orOrderid:'BD1',mercid:'M1',otoken:'tok',billdeskBaseUrl:'https://bd.invalid'}})],
  verify:[R({booking:{pnr:'1234567890'}})],
  captchaGen:[R({captcha:null})],
};

function scenario(options={}) {
  return async native=>{
    const trace=[];
    const cfg={...happy,...options};
    const queue=name=>{const list=cfg[name];if(!list)throw Error('synthetic missing queue '+name);const item=list.length>1?list.shift():list[0];return typeof item==='function'?item():item;};
    for(const key of['validate','search','board','callY','verifyCaptcha','pay','verify','poll','captchaGen','status'])if(cfg[key])cfg[key]=[...cfg[key]];
    const env={...options.env};
    let stopCalls=0,nowCalls=0;
    const hooksProgress=function(...args){trace.push(['progress',this===undefined?'plain':this===d.hooks?'hooks':'other',...args]);};
    const d={
      hooks:options.noHooks?undefined:options.hooks??{onProgress:options.noProgress?undefined:hooksProgress},
      stopAfter:options.stopAfter,beforeAvailability:options.beforeAvailability?async function(){trace.push(['beforeAvailability',this===d]);}:undefined,
      waitBeforeYMs:options.waitBeforeYMs,trace:options.trace,wsUserLogin:options.wsUserLogin,mobile:'9990001111',
      tokenPrime:options.tokenPrime?async function(){trace.push(['tokenPrime',this===d]);if(options.primeFails)throw Error('synthetic prime');}:undefined,
      onConfirm:options.confirm===undefined?undefined:function(question){trace.push(['onConfirm',this===d,question]);return options.confirmThrows?Promise.reject(Error('synthetic confirm')):Promise.resolve(options.confirm);},
      captchaSolve:options.solve===undefined?undefined:function(challenge){trace.push(['captchaSolve',this===d,challenge]);const answer=options.solve[Math.min(solveCalls++,options.solve.length-1)];return answer instanceof Error?Promise.reject(answer):Promise.resolve(answer);},
      captchaManual:options.manual===undefined?undefined:function(challenge){trace.push(['captchaManual',this===d,challenge]);const answer=options.manual[Math.min(manualCalls++,options.manual.length-1)];return answer instanceof Error?Promise.reject(answer):Promise.resolve(answer);},
      licenseCheck:options.noLicense?undefined:function(){trace.push(['licenseCheck',this===d]);return'lic';},
      beforeBooking:options.before===undefined?undefined:function(){trace.push(['beforeBooking',this===d]);return options.before;},
      paymentMethod:options.method,upiId:options.upiId,mpsBaseUrl:options.mps,pollSpeedSec:options.speed,
      onProxyOutcome:options.noProxyOutcome?undefined:function(...args){trace.push(['proxyOutcome',this===d,...args]);},
      onUpiCollect:options.noUpiCollect?undefined:function(...args){trace.push(['upiCollect',this===d,...args]);},
      onQr:options.noQr?undefined:function(...args){trace.push(['onQr',this===d,...args]);},
      onQrClose:options.noQrClose?undefined:function(...args){trace.push(['qrClose',this===d,args.length]);},
      onBooked:options.noBooked?undefined:function(...args){trace.push(['booked',this===d,...args]);return options.bookedPromise?new Promise(resolve=>resolve('done')):undefined;},
    };
    let solveCalls=0,manualCalls=0;
    const log=function(...args){trace.push(['log',this===actor,...args]);};
    const actor={
      d,bmiyek:options.bmiyek===undefined?'bm':options.bmiyek,greq:'greq-1',lastRolledEtMapp:'et-1',pinEtMapp:undefined,rateLimitStop:options.rateLimitStop,fareAvail:undefined,
      sleep:async function(ms){trace.push(['sleep',this===actor,ms]);options.afterSleep?.(actor,ms);},
      call:function(method,url,callOptions){
        const serial=JSON.stringify(callOptions,(key,value)=>typeof value==='function'?'fn:'+String(value('probe')):value);
        trace.push(['call',this===actor,method,url,serial,actor.pinEtMapp]);
        if(url==='TOKEN-URL')return options.tokenFails?Promise.reject(Error('synthetic token')):Promise.resolve('token');
        const key=url==='VALIDATE-URL'?'validate':url==='SEARCH-URL'?'search':url==='BOARD-URL'?'board':url.startsWith('CAPTCHA-URL')?'captchaGen':'pay';
        return Promise.resolve(queue(key));
      },
      callY:async function(...args){trace.push(['callY',this===actor,args.length,JSON.stringify(args)]);return queue('callY');},
      pollAvailability:async function(job,progress){
        trace.push(['poll',this===actor,job.boardingStation,typeof progress]);
        return queue('poll');
      },
      isStopped:function(){const call=stopCalls++;trace.push(['isStopped',call]);return(options.stopOn??[]).includes(call);},
      tryRelogin:async function(reason){trace.push(['relogin',this===actor,reason]);return options.relogin;},
      log,
      verifyCaptcha:async function(...args){trace.push(['verifyCaptcha',this===actor,...args]);return queue('verifyCaptcha');},
      solveAadhaarOtp:async function(...args){trace.push(['aadhaarOtp',this===actor,...args]);return options.otp??{ok:true};},
      beginSettlingPayment:function(){trace.push(['beginSettling',this===actor]);},
      beginFinalPnrRequest:function(){trace.push(['beginFinal',this===actor]);},
      awaitPaymentGate:async function(){trace.push(['paymentGate',this===actor]);},
      settleBeforeVerify:async function(){trace.push(['settleBeforeVerify',this===actor]);},
      verifyPaymentWithRetryAfter:async function(...args){trace.push(['verifyPayment',this===actor,JSON.stringify(args)]);return queue('verify');},
      now:function(){const value=nowCalls++*(options.nowStep??1000);trace.push(['now',value]);return value;},
      activeFetch:function(){trace.push(['activeFetch',this===actor]);return function(...args){trace.push(['fetch',this===undefined,...args]);return'fetched';};},
    };
    options.prepare?.(actor);
    const slots={
      1337:'VALIDATE-URL',1338:'SEARCH-URL',1340:'BOARD-URL',1341:'TOKEN-URL',1409:options.primeWindow??4000,1413:7,1369:['rawKey'],
      1404:new Set(options.statuses??[429,503]),1389:'UA',600:'GENERIC-FAILURE',
      1347:body=>{trace.push(['hasSession']);return body.session;},
      1345:body=>{trace.push(['validateWait']);return body.vWait;},1346:body=>{trace.push(['paymentWait']);return body.pWait;},
      1353:job=>({search:job.trainNo}),1358:job=>({boarding:job.boardingStation}),
      1354:(body,cls)=>({source:body,cls}),405:filtered=>filtered.source.parsed,
      417:body=>body.stations??[],1379:body=>body.hard,596:message=>typeof message==='string'&&message.startsWith('FATAL'),
      419:body=>body.times??[],1419:(times,count)=>{trace.push(['passengerWait',times,count]);return times[0]*count;},
      1328:(device,login)=>'txn:'+device+':'+login,1327:greq=>'dev:'+greq,
      373:body=>body.catering,374:(choice,catering)=>{trace.push(['foodChoice',choice,catering&&[...catering]]);return choice==='drop'?null:choice===undefined?undefined:'F-'+choice;},
      1359:(job,sent,fields)=>{trace.push(['bookingBody',job.boardingStation,sent,fields]);return{job:job.boardingStation,sent,fields};},
      1368:(text,keys)=>'raw:'+text+':'+keys.join(','),
      1426:body=>body.amount,1427:body=>'shape:'+Object.keys(body).length,1429:body=>'preview:'+JSON.stringify(body).length,
      1430:body=>body.captcha,415:parsed=>parsed.pref,416:parsed=>parsed.notConf,1380:body=>body.rejectBoarding,
      409:body=>body.akamai,414:body=>body.verdict,1425:(status,body)=>'FAILTEXT '+status,
      1348:txn=>'CAPTCHA-URL-'+txn,1349:txn=>'PAY-URL-'+txn,
      1365:(amount,mobile)=>({wallet:amount,mobile}),1375:body=>body.init,1376:enc=>options.walletDeclined?{message:'declined by wallet',low:options.walletLow}:undefined,
      1366:(amount,txn,enc)=>({walletVerify:amount,txn,enc}),399:body=>body.booking,1411:body=>body.busy,
      1417:vpa=>/@/.test(vpa),1386:body=>body.banks,1385:(body,id)=>body.offers501&&id==='501',1382:body=>body.upiAmount,1418:vpa=>'masked:'+vpa,
      1367:amount=>({upi:amount}),1370:amount=>'rawupi:'+amount,1373:body=>body.order,1371:(...args)=>({verify:args}),
      1398:value=>value,1399:value=>value,1400:value=>value,1401:value=>value,1383:body=>body.rejection,1384:body=>'tb:'+body,
      1402:class Client{
        constructor(clientOptions){
          trace.push(['client',Object.keys(clientOptions),clientOptions.baseUrl,clientOptions.otoken,clientOptions.ua]);
          trace.push(['clientHooks',clientOptions.fetchImpl('u',1),clientOptions.isStopped(),clientOptions.log('level','message')]);
        }
        ordersGet(...args){trace.push(['ordersGet',...args]);return options.ordersFail?Promise.reject(Error('synthetic orders')):Promise.resolve({itemcode:'IC1'});}
        mercpref(...args){trace.push(['mercpref',...args]);return options.prefFail?Promise.reject(Error('synthetic pref')):Promise.resolve({upiTimerSec:options.timer??5});}
        transactionsOrderCollect(...args){trace.push(['collect',...args]);return options.collectFail?Promise.reject(Error('synthetic collect')):Promise.resolve(options.collect??{transactionid:'TX1'});}
        transactionsOrder(...args){trace.push(['intent',...args]);return options.intentFail?Promise.reject(Error('synthetic intent')):Promise.resolve(options.intent??{transactionid:'TX2',intentUpi:'upi://pay?x=1'});}
        queryweb(...args){trace.push(['queryweb',...args]);const list=options.status??[{paid:true,encdata:'ENCDATA',orderid:'999'}];const item=list[Math.min(queryCalls++,list.length-1)];return item instanceof Error?Promise.reject(item):Promise.resolve(item);}
      },
    };
    let queryCalls=0;
    const sensor={isSensorExhausted:response=>{trace.push(['exhausted?',response&&response.tag]);return Boolean(response&&response.exhausted);}};
    const math=Object.create(Math);math.random=()=>options.random??0.5;
    const{method}=harness({native,slots,scope:{25:sensor},globals:{Math:math,process:{env}},dependencies:{environment:env,random:math.random}});
    const job={trainNo:'12951',boardingStation:options.boardingStation===undefined?'ndls':options.boardingStation,srcStn:options.srcStn??'NDLS',jrnyClass:'3A',origQuota:options.quota??'GN',fareLimit:options.fareLimit};
    const passengers=options.passengers??[{name:'A',foodChoice:'V'},{name:'B'}];
    const value=await outcome(async()=>method('f3149').call(actor,job,passengers));
    return{value,trace,state:{pinEtMapp:actor.pinEtMapp,rateLimitStop:actor.rateLimitStop,fareAvail:actor.fareAvail}};
  };
}
const run=(name,options)=>test('RailOne runInner matches the recovered controller: '+name,async()=>{const result=await compare(scenario(options));assert.equal(result.value.error,undefined);});
const poll=(overrides={})=>({ok:true,parsed:{totalCollectibleAmount:1000},body:{amount:1111},...overrides});
const ready={poll:[poll()]};
const withBoard=(...bodies)=>({...ready,board:bodies.map(body=>R(body))});
const board=(overrides={})=>({stations:['NDLS','BCT'],times:[1.5],catering:null,parsed:{noSeats:false},...overrides});
const callYWith=(overrides={})=>[R({parsed:{status:'CNF/B1/1',bookable:true,totalCollectibleAmount:2000,...overrides.parsed},captcha:null,...overrides.body})];

// ---- validate ---------------------------------------------------------------------------------------------------------------
run('happy path (wallet)',{...ready,mps:'https://mps.invalid'});
run('missing bmiyek',{bmiyek:''});
run('hooks missing: default progress',{...ready,noHooks:true,stopAfter:'validate'});
run('hooks without onProgress',{...ready,noProgress:true,stopAfter:'validate'});
run('stop after validate',{stopAfter:'validate'});
run('session empty, relogin succeeds',{validate:[R({session:false,vWait:1}),R({session:true,vWait:5,pWait:6})],relogin:true,stopAfter:'validate'});
run('session empty, relogin fails',{validate:[R({session:false})],relogin:false});
run('session empty, relogin result falsy zero',{validate:[R({session:false})],relogin:0});
run('validate response exhausted',{validate:[R({session:true},{exhausted:true,tag:'validate'})]});
run('validate not ok, status in the stop set',{validate:[{ok:false,status:429,body:{session:false}}]});
run('validate not ok with hard error',{validate:[{ok:false,status:500,body:{session:false,hard:'bad token'}}]});
run('validate not ok without hard error',{validate:[{ok:false,status:500,body:{session:false}}]});
run('validate ok with hard error',{validate:[R({session:true,hard:'account locked'})]});
run('rate limit stop pending',{rateLimitStop:'Too many attempts'});
run('rate limit stop wins over a healthy response',{rateLimitStop:'Slow down',validate:[R({session:true})]});

// ---- search and availability ----------------------------------------------------------------------------------------------
run('beforeAvailability hook',{...ready,beforeAvailability:true,stopAfter:'availability'});
run('stopped right after availability',{...ready,stopOn:[0]});
run('availability exhausted',{poll:[poll({ok:false,exhausted:true})]});
run('availability: no seats with reason',{poll:[poll({ok:false,stop:'Train cancelled'})]});
run('availability: no seats without reason',{poll:[poll({ok:false})]});
run('availability amount from the body when the parse has none',{poll:[poll({parsed:{totalCollectibleAmount:0}})],stopAfter:'availability'});
run('availability amount from the parse',{...ready,stopAfter:'availability'});

// ---- boarding station ------------------------------------------------------------------------------------------------------
run('stop after boarding',{...ready,stopAfter:'boarding'});
run('stopped at the start of boarding',{...ready,stopOn:[1]});
run('boarding exhausted',{...ready,board:[R(board(),{exhausted:true,tag:'board'})]});
run('boarding status in the stop set',{...ready,board:[{ok:false,status:503,body:board()}]});
run('boarding no seats with reason',{...ready,board:[R(board({parsed:{noSeats:true,stopReason:'Sold out'}}))]});
run('boarding no seats without reason',{...ready,board:[R(board({parsed:{noSeats:true}}))]});
run('boarding fatal parse error',{...ready,board:[R(board({parsed:{noSeats:false,errorMessage:'FATAL parse'}}))]});
run('boarding fatal hard error, parse error present',{...ready,board:[R(board({hard:'FATAL hard',parsed:{noSeats:false,errorMessage:'soft'}}))]});
run('boarding fatal hard error only',{...ready,board:[R(board({hard:'FATAL hard'}))]});
run('boarding fatal parse error beats hard error text',{...ready,board:[R(board({hard:'FATAL hard',parsed:{noSeats:false,errorMessage:'FATAL parse'}}))]});
run('boarding fatal with generic fallback',{...ready,board:[R(board({hard:'FATAL x',parsed:{noSeats:false,errorMessage:''}}))]});
run('boarding hard error with stations',{...ready,board:[R(board({hard:'soft hard'}))]});
run('boarding hard error without stations proceeds',{...ready,board:[R(board({hard:'soft hard',stations:[]}))]});
run('boarding without stations and without message proceeds',{...ready,board:[R(board({stations:[]}))]});
const notYet={stations:[],parsed:{noSeats:false,errorMessage:'not allowed yet'}};
run('boarding re-drive then success',{...ready,board:[R(board(notYet)),R(board())],poll:[poll(),poll({parsed:{totalCollectibleAmount:1500}})]});
run('boarding re-drive keeps amount when the re-poll has none',{...ready,board:[R(board(notYet)),R(board())],poll:[poll(),poll({parsed:{totalCollectibleAmount:0}})]});
run('boarding re-drive with env limits',{...ready,env:{RAILONE_BOARDING_REDRIVE_MAX:'2',RAILONE_BOARDING_REDRIVE_WAIT_MS:'50'},board:[R(board(notYet))]});
run('boarding re-drive limit one',{...ready,env:{RAILONE_BOARDING_REDRIVE_MAX:'1'},board:[R(board(notYet))]});
run('boarding re-drive limit not a number',{...ready,env:{RAILONE_BOARDING_REDRIVE_MAX:'abc',RAILONE_BOARDING_REDRIVE_WAIT_MS:'xyz'},board:[R(board(notYet)),R(board())]});
run('boarding re-drive stopped while waiting',{...ready,board:[R(board(notYet))],stopOn:[2]});
run('boarding re-drive stopped after the re-poll',{...ready,board:[R(board(notYet))],stopOn:[3]});
run('boarding re-drive re-poll exhausted',{...ready,board:[R(board(notYet))],poll:[poll(),poll({ok:false,exhausted:true})]});
run('boarding re-drive re-poll without seats',{...ready,board:[R(board(notYet))],poll:[poll(),poll({ok:false,stop:'gone'})]});
run('boarding re-drive re-poll without seats or reason',{...ready,board:[R(board(notYet))],poll:[poll(),poll({ok:false})]});

// ---- station correction, pre-/Y wait and the request body -------------------------------------------------------------------------
run('station on the route',{...ready,stopAfter:undefined,mps:'https://mps.invalid'});
run('station not on the route: corrected to source',{...ready,boardingStation:'zzz',mps:'https://mps.invalid'});
run('station equal to source (case-insensitive)',{...ready,boardingStation:'ndls',srcStn:'NDLS'});
run('empty boarding station',{...ready,boardingStation:''});
run('boarding station not on route but no station list',{...ready,boardingStation:'zzz',board:[R(board({stations:[]}))]});
run('no minimum input times: validateUser fallback',{...ready,board:[R(board({times:[]}))]});
run('fallback zero: no safety margin',{...ready,validate:[R({session:true,vWait:0,pWait:1500})],board:[R(board({times:[]}))]});
run('margin from env',{...ready,env:{RAILONE_Y_MARGIN_MS:'333'}});
run('margin from random',{...ready,random:0.99});
run('explicit wait before /Y',{...ready,waitBeforeYMs:777});
run('explicit zero wait before /Y',{...ready,waitBeforeYMs:0});
run('catering train with food choices',{...ready,board:[R(board({catering:['V','N']}))],passengers:[{name:'A',foodChoice:'V'},{name:'B',foodChoice:'drop'},{name:'C'}]});
run('catering as a Set',{...ready,board:[R(board({catering:new Set(['V'])}))]});
run('wsUserLogin present',{...ready,wsUserLogin:'login-1'});
run('trace logging enabled',{...ready,trace:true});
run('token prime window shorter than the wait',{...ready,tokenPrime:true,waitBeforeYMs:9000});
run('token prime window longer than the wait',{...ready,tokenPrime:true,waitBeforeYMs:3000});
run('token prime window equal to the wait',{...ready,tokenPrime:true,waitBeforeYMs:4000});
run('token prime fails',{...ready,tokenPrime:true,primeFails:true,waitBeforeYMs:9000});
run('token request fails silently',{...ready,tokenFails:true});
run('no licence check',{...ready,noLicense:true});
run('stopped before the passenger submit',{...ready,stopOn:[3]});
run('beforeBooking blocks',{...ready,before:'Usage ledger says no'});
run('beforeBooking returns zero',{...ready,before:0});

// ---- /Y submit and response handling ------------------------------------------------------------------------------------------
run('/Y boarding rejected: retry from source',{...ready,boardingStation:'cstm',board:[R(board({stations:['CSTM','NDLS']}))],callY:[R({rejectBoarding:true,parsed:{status:'CNF',bookable:true,totalCollectibleAmount:1}}),R({parsed:{status:'CNF',bookable:true,totalCollectibleAmount:2200}})]});
run('/Y boarding rejected but already the source',{...ready,boardingStation:'ndls',callY:[R({rejectBoarding:true,parsed:{status:'CNF',bookable:true,totalCollectibleAmount:1}})]});
run('/Y exhausted',{...ready,callY:[R({},{exhausted:true,tag:'y'})]});
run('/Y check failure (hard error)',{...ready,callY:[R({hard:'rate limited'})]});
run('/Y not ok',{...ready,callY:[{ok:false,status:500,body:{hard:'server'}}]});
run('/Y amount from the response',{...ready,callY:callYWith({parsed:{totalCollectibleAmount:3300}})});
run('/Y amount from the body helper',{...ready,callY:callYWith({parsed:{totalCollectibleAmount:0},body:{amount:4400}})});
run('/Y amount kept when nothing reports one',{...ready,callY:callYWith({parsed:{totalCollectibleAmount:0}})});
run('/Y status missing',{...ready,callY:callYWith({parsed:{status:undefined,totalCollectibleAmount:0}})});
run('/Y no amount and no status hides the fare progress',{...ready,poll:[poll({parsed:{totalCollectibleAmount:0},body:{amount:0}})],callY:callYWith({parsed:{status:'',totalCollectibleAmount:0}})});
run('/Y no hooks for the fare progress',{...ready,noHooks:true});
run('/Y hooks without onProgress for the fare progress',{...ready,noProgress:true});
run('/Y trace logging',{...ready,trace:true});
run('/Y no seats with reason',{...ready,callY:callYWith({parsed:{noSeats:true,stopReason:'Chart prepared'}})});
run('/Y no seats without reason',{...ready,callY:callYWith({parsed:{noSeats:true}})});
for(const status of['REGRET','DEPARTED','CANCELLED','regret'])
  run('/Y not bookable status '+status,{...ready,callY:callYWith({parsed:{status,notConf:false}})});
run('/Y empty status shows NOT AVAILABLE',{...ready,callY:callYWith({parsed:{status:'',notConf:true,bookable:true}})});
run('waitlist without callback',{...ready,callY:callYWith({parsed:{status:'WL/10',notConf:true}})});
run('waitlist accepted',{...ready,confirm:true,callY:callYWith({parsed:{status:'WL/10',notConf:true,bookable:false}})});
run('waitlist declined',{...ready,confirm:false,callY:callYWith({parsed:{status:'WL/10',notConf:true}})});
run('waitlist confirm rejects',{...ready,confirm:true,confirmThrows:true,callY:callYWith({parsed:{status:'WL/10',notConf:true}})});
run('waitlist with berth preference warning',{...ready,confirm:true,callY:callYWith({parsed:{status:'WL/10',notConf:true,pref:true}})});
run('waitlist, stopped while asking',{...ready,confirm:true,stopOn:[7],callY:callYWith({parsed:{status:'WL/10',notConf:true}})});

// ---- Aadhaar and captcha ---------------------------------------------------------------------------------------------------------
const aadhaar=callYWith({parsed:{aadhaar:true,captchaType:'otp'}});
run('Aadhaar OTP ok with amount',{...ready,callY:aadhaar,otp:{ok:true,amount:2500}});
run('Aadhaar OTP ok without amount',{...ready,callY:aadhaar,otp:{ok:true}});
run('Aadhaar OTP failed',{...ready,callY:aadhaar,otp:{ok:false,message:'wrong otp'}});
run('Aadhaar booking with an error message',{...ready,callY:callYWith({parsed:{aadhaar:true,errorMessage:'IRCTC says no'}})});
run('Aadhaar booking that cannot be booked',{...ready,callY:callYWith({parsed:{aadhaar:true,bookable:false,status:'WL/3'}})});
run('Aadhaar booking waitlist accepted',{...ready,confirm:true,callY:callYWith({parsed:{aadhaar:true,bookable:false,status:'WL/3',notConf:true}})});
run('captcha fallback generation finds nothing',{...ready,captchaGen:[R({captcha:null})]});
run('captcha fallback generation exhausted',{...ready,captchaGen:[R({captcha:'c'},{exhausted:true,tag:'gen'})]});
run('captcha fallback finds a challenge, solver solves',{...ready,captchaGen:[R({captcha:{img:'g'}})],solve:['abc'],verifyCaptcha:[R({verdict:{verdict:'success',amount:2400}})]});
run('error message in the /Y response',{...ready,callY:callYWith({parsed:{errorMessage:'seat gone'}})});
run('cannot book: waitlist status',{...ready,callY:callYWith({parsed:{status:'WL/9',bookable:false,notConf:false}})});
run('cannot book: not available',{...ready,callY:callYWith({parsed:{status:'NOT AVAILABLE',bookable:false,notConf:false}})});
run('cannot book check skipped when bookable',{...ready,callY:callYWith({parsed:{status:'WL/9',bookable:true,notConf:false}})});
run('addon without captcha: success with amount',{...ready,verifyCaptcha:[R({verdict:{verdict:'success',amount:2600}})]});
run('addon without captcha: success without amount',{...ready,verifyCaptcha:[R({verdict:{verdict:'success'}})]});
run('addon without captcha: other verdict advances',{...ready,verifyCaptcha:[R({verdict:{verdict:'pending'}})]});
for(const verdict of['noseats','fail','unbookable'])
  run('addon without captcha: verdict '+verdict,{...ready,verifyCaptcha:[R({verdict:{verdict,message:'addon '+verdict}})]});
run('addon exhausted',{...ready,verifyCaptcha:[R({},{exhausted:true,tag:'addon'})]});
run('addon status in the stop set',{...ready,verifyCaptcha:[{ok:false,status:429,body:{}}]});
run('addon akamai block',{...ready,verifyCaptcha:[R({akamai:true})]});
run('addon akamai flag on a failed response is ignored',{...ready,verifyCaptcha:[{ok:false,status:500,body:{akamai:true,verdict:{verdict:'success'}}}]});
run('addon returns a captcha challenge',{...ready,verifyCaptcha:[R({captcha:{img:'x'}}),R({verdict:{verdict:'success',amount:2700}})],solve:['ans']});
const withCaptcha=callYWith({body:{captcha:{img:'y'}}});
run('captcha from /Y, solver answers',{...ready,callY:withCaptcha,solve:['ans'],verifyCaptcha:[R({verdict:{verdict:'success',amount:2800}})]});
run('captcha from /Y, success without amount',{...ready,callY:withCaptcha,solve:['ans'],verifyCaptcha:[R({verdict:{verdict:'success'}})]});
run('captcha from /Y, solver fails then manual answers',{...ready,callY:withCaptcha,solve:[new Error('solver down')],manual:['typed'],verifyCaptcha:[R({verdict:{verdict:'success'}})]});
run('captcha from /Y, manual only',{...ready,callY:withCaptcha,manual:['typed'],verifyCaptcha:[R({verdict:{verdict:'success'}})]});
run('captcha from /Y, nobody answers',{...ready,callY:withCaptcha,solve:[null],manual:[null]});
run('captcha from /Y, no solver or manual hook',{...ready,callY:withCaptcha});
run('captcha from /Y, manual fails',{...ready,callY:withCaptcha,manual:[new Error('closed')]});
run('captcha from /Y, invalid then fresh then success',{...ready,callY:withCaptcha,solve:['one','two'],verifyCaptcha:[R({verdict:{verdict:'bad'},captcha:{img:'fresh'}}),R({verdict:{verdict:'success'}})]});
run('captcha from /Y, solver only for the first two attempts',{...ready,callY:withCaptcha,solve:['a','b','c'],manual:['m'],verifyCaptcha:[R({verdict:{verdict:'bad'},captcha:{img:'f1'}}),R({verdict:{verdict:'bad'},captcha:{img:'f2'}}),R({verdict:{verdict:'bad'},captcha:{img:'f3'}}),R({verdict:{verdict:'success'}})]});
run('captcha from /Y, five invalid answers',{...ready,callY:withCaptcha,solve:['a'],manual:['m'],verifyCaptcha:[R({verdict:{verdict:'bad'},captcha:{img:'again'}})]});
run('captcha from /Y, invalid without a fresh challenge',{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[R({verdict:{verdict:'bad'},captcha:null})]});
for(const verdict of['noseats','fail','unbookable'])
  run('captcha from /Y, verdict '+verdict,{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[R({verdict:{verdict,message:'cap '+verdict}})]});
run('captcha from /Y, exhausted',{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[R({},{exhausted:true,tag:'cap'})]});
run('captcha from /Y, status in the stop set',{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[{ok:false,status:503,body:{}}]});
run('captcha from /Y, akamai block',{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[R({akamai:true})]});
run('captcha from /Y, stopped before the first attempt',{...ready,callY:withCaptcha,solve:['a'],stopOn:[8]});
run('captcha from /Y, stopped between attempts',{...ready,callY:withCaptcha,solve:['a'],verifyCaptcha:[R({verdict:{verdict:'bad'},captcha:{img:'again'}})],stopOn:[9]});

// ---- fare limit ---------------------------------------------------------------------------------------------------------------------
run('premium tatkal under the limit',{...ready,quota:'TQ',fareLimit:5000});
run('premium tatkal over the limit, no callback',{...ready,quota:'TQ',fareLimit:1500});
run('premium tatkal over the limit, accepted',{...ready,quota:'PT',fareLimit:1500,confirm:true});
run('premium tatkal over the limit, declined',{...ready,quota:'PT',fareLimit:1500,confirm:false});
run('premium tatkal over the limit, confirm rejects',{...ready,quota:'TQ',fareLimit:1500,confirm:true,confirmThrows:true});
run('premium tatkal over the limit, stopped while asking',{...ready,quota:'TQ',fareLimit:1500,confirm:true,stopOn:[8]});
run('premium tatkal without a limit',{...ready,quota:'TQ',fareLimit:0});
run('general quota ignores the limit',{...ready,quota:'GN',fareLimit:1});
run('fare with decimals over the limit',{...ready,quota:'TQ',fareLimit:1999.5,confirm:true,callY:callYWith({parsed:{totalCollectibleAmount:2000.456}})});
run('stopped before payment',{...ready,stopOn:[8]});

// ---- RailOne Wallet -----------------------------------------------------------------------------------------------------------------
const wallet={method:'wallet'};
run('wallet: default method with verify host',{...ready,...wallet,mps:'https://mps.invalid'});
run('wallet: unknown method falls back to wallet',{...ready,method:'something-else',mps:'https://mps.invalid'});
run('wallet: no verify host',{...ready,...wallet});
run('wallet: init check fails',{...ready,...wallet,pay:[R({hard:'init failed'})]});
run('wallet: init exhausted',{...ready,...wallet,pay:[R({},{exhausted:true,tag:'pay'})]});
run('wallet: declined',{...ready,...wallet,walletDeclined:true});
run('wallet: declined, low balance',{...ready,...wallet,walletDeclined:true,walletLow:true});
run('wallet: missing encData',{...ready,...wallet,pay:[R({init:{transationId:'T1'}})]});
run('wallet: missing transaction id',{...ready,...wallet,pay:[R({init:{encData:'E'}})]});
run('wallet: minimum payment wait from the helper',{...ready,...wallet,mps:'https://mps.invalid',pay:[R({init:{encData:'E',transationId:'T1',minPaymentMs:0}})]});
run('wallet: stopped during the payment wait',{...ready,...wallet,mps:'https://mps.invalid',stopOn:[9]});
run('wallet: sensor exhausted before verify',{...ready,...wallet,mps:'https://mps.invalid',verify:[R({},{exhausted:true,tag:'verify'})]});
run('wallet: verify status in the stop set',{...ready,...wallet,mps:'https://mps.invalid',verify:[{ok:false,status:503,body:{}}]});
run('wallet: verify not ok',{...ready,...wallet,mps:'https://mps.invalid',verify:[{ok:false,status:500,body:{booking:{pnr:'x'}}}]});
run('wallet: verify with an error message',{...ready,...wallet,mps:'https://mps.invalid',verify:[R({booking:{errorMessage:'bank said no'}})]});
run('wallet: verify without a booking',{...ready,...wallet,mps:'https://mps.invalid',verify:[R({booking:null})]});
run('wallet: booked, onBooked missing',{...ready,...wallet,mps:'https://mps.invalid',noBooked:true});
run('wallet: booked, onBooked returns a promise',{...ready,...wallet,mps:'https://mps.invalid',bookedPromise:true});
run('wallet: no proxy outcome callback',{...ready,...wallet,mps:'https://mps.invalid',noProxyOutcome:true});

// ---- RailOne UPI collect ------------------------------------------------------------------------------------------------------------
const upi={method:'railoneupi',upiId:' user@bank ',mps:'https://mps.invalid'};
run('upi: happy path',{...ready,...upi});
run('upi: invalid VPA',{...ready,...upi,upiId:'nobody'});
run('upi: missing VPA',{...ready,...upi,upiId:undefined});
run('upi: bank not offered',{...ready,...upi,callY:callYWith({body:{offers501:false,banks:'1:1'}})});
run('upi: amount falls back to the fare',{...ready,...upi,callY:callYWith({body:{upiAmount:0,offers501:true,banks:'501:1',order:happy.pay[0].body.order}})});
run('upi: init check fails',{...ready,...upi,pay:[R({hard:'nope'})]});
run('upi: no order, rejection text',{...ready,...upi,pay:[R({rejection:'no authToken'})]});
run('upi: no order, no rejection text',{...ready,...upi,pay:[R({})]});
run('upi: client lookups fail and are ignored',{...ready,...upi,ordersFail:true,prefFail:true,collectFail:true});
run('upi: stopped after the collect request',{...ready,...upi,stopOn:[9]});
run('upi: collect order not created',{...ready,...upi,collect:{}});
run('upi: no collect callback',{...ready,...upi,noUpiCollect:true});
run('upi: poll speed configured',{...ready,...upi,speed:3});
run('upi: poll speed tiny is clamped',{...ready,...upi,speed:0.1,status:[{paid:false},{paid:true,encdata:'E',orderid:'5'}]});
run('upi: poll speed zero',{...ready,...upi,speed:0,status:[{paid:false},{paid:true,encdata:'E'}]});
run('upi: paid after a few polls',{...ready,...upi,status:[{paid:false},{paid:false},{paid:true,encdata:'E',orderid:'42'}]});
run('upi: payment failed with reason',{...ready,...upi,status:[{paid:false,failed:true,reason:'declined'}]});
run('upi: payment failed without reason',{...ready,...upi,status:[{paid:false,failed:true}]});
run('upi: payment failed, no close callback',{...ready,...upi,noQrClose:true,status:[{failed:true}]});
run('upi: query rejects and is ignored',{...ready,...upi,status:[new Error('synthetic query'),{paid:true,encdata:'E'}]});
run('upi: timer expires',{...ready,...upi,timer:2,status:[{paid:false}]});
run('upi: zero timer',{...ready,...upi,timer:0});
run('upi: stopped while polling',{...ready,...upi,status:[{paid:false}],stopOn:[11]});
run('upi: stopped after polling',{...ready,...upi,stopOn:[14]});
run('upi: paid without encdata',{...ready,...upi,status:[{paid:true}]});
run('upi: paid without verify host',{...ready,...upi,mps:undefined});
run('upi: order id missing from the status',{...ready,...upi,status:[{paid:true,encdata:'E'}]});
run('upi: numeric order id missing and transaction id string',{...ready,...upi,status:[{paid:true,encdata:'E',orderid:'abc'}]});
run('upi: verify sensor exhausted',{...ready,...upi,verify:[R({},{exhausted:true,tag:'v'})]});
run('upi: verify status in the stop set',{...ready,...upi,verify:[{ok:false,status:429,body:{}}]});
run('upi: verify not ok',{...ready,...upi,verify:[{ok:false,status:500,body:{booking:{pnr:'1'}}}]});
run('upi: verify error message',{...ready,...upi,verify:[R({booking:{errorMessage:'bank'}})]});
run('upi: verify no booking',{...ready,...upi,verify:[R({booking:null})]});
run('upi: verify no booking but server busy',{...ready,...upi,verify:[R({booking:null,busy:true})]});
run('upi: verify error message and server busy',{...ready,...upi,verify:[R({booking:{errorMessage:'bank'},busy:true})]});
run('upi: booked',{...ready,...upi,verify:[R({booking:{pnr:'PNR1'},busy:true})]});
run('upi: booked, no onBooked',{...ready,...upi,noBooked:true});
run('upi: no proxy outcome callback',{...ready,...upi,noProxyOutcome:true});

// ---- RailOne QR ---------------------------------------------------------------------------------------------------------------------
const qr={method:'railoneqr',mps:'https://mps.invalid'};
run('qr: happy path',{...ready,...qr});
run('qr: bank not offered',{...ready,...qr,callY:callYWith({body:{offers501:false,banks:'1:1'}})});
run('qr: amount falls back to the fare',{...ready,...qr,callY:callYWith({body:{upiAmount:0,offers501:true,banks:'501:1',order:happy.pay[0].body.order}})});
run('qr: init check fails',{...ready,...qr,pay:[R({hard:'nope'})]});
run('qr: no order, rejection text',{...ready,...qr,pay:[R({rejection:'no authToken'})]});
run('qr: no order, no rejection text',{...ready,...qr,pay:[R({})]});
run('qr: client lookups fail and are ignored',{...ready,...qr,ordersFail:true,prefFail:true,intentFail:true});
run('qr: stopped after the QR request',{...ready,...qr,stopOn:[9]});
run('qr: no transaction id',{...ready,...qr,intent:{intentUpi:'upi://x'}});
run('qr: no intent link',{...ready,...qr,intent:{transactionid:'TX9'}});
run('qr: neither',{...ready,...qr,intent:{}});
run('qr: no QR callback',{...ready,...qr,noQr:true});
run('qr: paid after polls',{...ready,...qr,status:[{paid:false},{paid:true,encdata:'E',orderid:'8'}]});
run('qr: payment failed with reason',{...ready,...qr,status:[{failed:true,reason:'expired'}]});
run('qr: payment failed without reason',{...ready,...qr,status:[{failed:true}]});
run('qr: timer expires',{...ready,...qr,timer:1,status:[{paid:false}]});
run('qr: stopped while polling',{...ready,...qr,status:[{paid:false}],stopOn:[11]});
run('qr: stopped after polling',{...ready,...qr,stopOn:[14]});
run('qr: paid without encdata',{...ready,...qr,status:[{paid:true}]});
run('qr: paid without verify host',{...ready,...qr,mps:undefined});
run('qr: verify error message',{...ready,...qr,verify:[R({booking:{errorMessage:'bank'}})]});
run('qr: verify no booking',{...ready,...qr,verify:[R({booking:null})]});
run('qr: verify server busy',{...ready,...qr,verify:[R({booking:null,busy:true})]});
run('qr: verify exhausted',{...ready,...qr,verify:[R({},{exhausted:true,tag:'v'})]});
run('qr: verify status in the stop set',{...ready,...qr,verify:[{ok:false,status:503,body:{}}]});
run('qr: booked',{...ready,...qr,verify:[R({booking:{pnr:'PNR2'}})]});
run('qr: no close callback',{...ready,...qr,noQrClose:true});
