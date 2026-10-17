'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {harness,outcome,compare}=require('./helpers/recovered-harness.cjs');

// f2161 runBrowserBooking: every scenario runs the actual recovered function and the native module against a fresh
// scripted actor / page / API / root helpers and compares the result and the complete effect trace (order included).

class Cursor {constructor(page){this.page=page;Cursor.trace.push(['cursor',page&&page.name]);}async dwell(a,b){Cursor.trace.push(['dwell',a,b]);}}

// Default outcome / response shapes; scenarios override pieces.
const okOutcome={status:'CNF/B1/12',bookable:true,totalCollectibleAmount:2000};
const response=(overrides={})=>({ok:true,status:200,body:{outcome:okOutcome,challenge:null,akamai:false,error:null,...overrides.body},...overrides.top});

function scenario(options={}) {
  return async native=>{
    const trace=[];
    Cursor.trace=trace;
    const queues={chance:[...(options.chance??[{status:200,body:{raw:'chance-text'}}])],board:[...(options.board??[response({body:{stations:['NDLS','BCT'],times:[10,20],catering:null,outcome:{noSeats:false}}})])],
      submit:[...(options.submit??[response()])]};
    const take=name=>{const queue=queues[name];const item=queue.length>1?queue.shift():queue[0];return typeof item==='function'?item():item;};
    const page={
      name:'page-a',
      waitForLoadState(state){trace.push(['load',state]);return options.loadFails?Promise.reject(Error('synthetic load')):Promise.resolve();},
      async waitForTimeout(ms){trace.push(['waitForTimeout',ms]);},
    };
    const opts={
      skipTrainSearch:options.skipTrainSearch,hideBrowser:options.hideBrowser,manual:options.manual,serverTimeSync:options.serverTimeSync,
      chancesRaceCount:options.race,skipAddonNoCaptcha:options.skipAddon,fastAkamaiPreSubmit:options.fastAkamai,
      onConfirm:options.confirm===undefined?undefined:async function(question){trace.push(['onConfirm',this===opts,question]);if(options.stopInConfirm)actor.stopped=true;return options.confirm;},
      onKillPair:options.noKill?undefined:function(){trace.push(['onKillPair',this===opts]);},
      licenseCheck:options.noLicense?undefined:function(){trace.push(['licenseCheck',this===opts]);return 'licence-ok';},
      beforeBooking:options.before===undefined?undefined:function(){trace.push(['beforeBooking',this===opts]);return options.before;},
    };
    const tokens=options.csrf??['tok-123456789'];
    let csrfCalls=0;
    const api={
      resyncCsrf:function(token){trace.push(['resync',this===api,token]);},
      csrfToken:function(){const value=tokens[Math.min(csrfCalls++,tokens.length-1)];trace.push(['csrfToken',value]);return value;},
      raceCall:async function(...args){trace.push(['raceCall',this===api,...args]);return options.raceResponse??{status:200,body:{raw:'race-text'}};},
    };
    const record=(name,result)=>function(...args){trace.push([name,this===actor,...args]);return typeof result==='function'?result.call(this,...args):result;};
    const actor={
      session:{page,tokens:{csrfToken:'session-csrf'}},opts,api:options.noApi?undefined:api,
      stopped:false,terminal:options.terminal,duplicateLogin:false,relaunch:false,spaFiredTc:options.spaFiredTc,lastAvail:options.lastAvail,bankDetail:options.bankDetail,
      captureLocationEarly:record('captureLocationEarly'),
      now:record('now',()=>12345),
      onProgress:function(...args){trace.push(['progress',this===actor,...args]);},
      log:function(...args){trace.push(['log',this===actor,...args]);options.onLog?.(actor,args);},
      relaunchIfLoggedOut:async function(){trace.push(['relaunch',this===actor]);return options.relaunch;},
      ensureAuthToken:async function(){trace.push(['ensureAuth',this===actor]);return options.auth??true;},
      resolveTarget:function(job){trace.push(['resolveTarget',this===actor,job.classCode]);return options.target;},
      serverNow:function(){trace.push(['serverNow']);const list=options.serverNow??[0];return list[Math.min(actor.nowCalls++,list.length-1)];},nowCalls:0,
      searchTrains:async function(job){trace.push(['search',this===actor,job.trainNumber]);options.afterSearch?.(actor);},
      hideBrowser:function(){trace.push(['hideBrowser',this===actor]);return options.hideFails?Promise.reject(Error('synthetic hide')):Promise.resolve();},
      ensureCsrfEstablished:function(...args){trace.push(['ensureCsrf',this===actor,args[0]===page,args[1]instanceof Cursor,args[2].trainNumber,args[3]]);return options.csrfFails?Promise.reject(Error('synthetic csrf')):Promise.resolve();},
      ensureServerTimeSynced:async function(){trace.push(['ensureSynced']);options.afterSync?.(actor);},
      syncServerTime:async function(){trace.push(['syncServerTime']);},
      waitForSpaTc:async function(...args){trace.push(['waitForSpaTc',this===actor,...args]);return options.spaFired;},
      primeJourneyContext:async function(job){trace.push(['prime',this===actor]);options.afterPrime?.(actor);},
      preTargetProbe:async function(job,ms){trace.push(['probe',this===actor,ms]);options.afterProbe?.(actor);return options.probe??'early';},
      setTokenOwnership:record('setTokenOwnership'),
      waitUntilTarget:async function(target,cover,activity){
        trace.push(['waitUntilTarget',this===actor,target]);
        for(let index=0;index<(options.covers??3);index++)trace.push(['cover',await cover()]);
        trace.push(['activity',await activity('x')]);
        options.afterWait?.(actor);
      },
      pollWindowCover:function(human,index){trace.push(['pollWindowCover',this===actor,human instanceof Cursor,index]);return 'cover-'+index;},
      safeBrowseActivity:function(human,activity){trace.push(['safeBrowseActivity',this===actor,human instanceof Cursor,activity]);return 'activity';},
      isChancesFlow:function(){trace.push(['isChancesFlow']);return Boolean(options.chances);},
      pollAvailability:async function(...args){trace.push(['pollAvailability',this===actor,args[0].trainNumber,args[1],args[2]instanceof Cursor,args[3]]);options.afterPoll?.(actor);return options.availability===undefined?{totalCollectibleAmount:1500}:options.availability;},
      safeCall:async function(label,method,url,body,callOptions){
        trace.push(['safeCall',this===actor,label,method,url,body,Object.keys(callOptions),{...callOptions,retryCover:undefined,onHighLoad:undefined}]);
        const name=url==='AVAIL-URL'?'chance':url==='BOARD-URL'?'board':'submit';
        if(callOptions.retryCover)for(let index=0;index<(options.retryCovers??5);index++)trace.push(['retryCover',await callOptions.retryCover()]);
        if(callOptions.onHighLoad)for(let index=0;index<(options.highLoads??3);index++)trace.push(['onHighLoad',callOptions.onHighLoad()]);
        const result=take(name);
        if(name==='board')options.afterBoard?.(actor);
        if(name==='submit')options.afterSubmit?.(actor);
        return result;
      },
      boardingHold:async function(...args){trace.push(['boardingHold',this===actor,args[0]instanceof Cursor,args[1].trainNumber,args[2]]);options.afterHold?.(actor);},
      sensorCheckpoint:record('sensorCheckpoint'),
      sensorJitter:async function(human){trace.push(['sensorJitter',this===actor,human instanceof Cursor]);},
      verifyCaptchaCall:async function(...args){trace.push(['verifyCaptchaCall',this===actor,...args]);options.afterVerify?.(actor);return options.verify===undefined?response({body:{challenge:null,akamai:false,error:null}}):options.verify;},
      solveCaptchaAndVerify:async function(...args){trace.push(['solveCaptcha',this===actor,...args]);options.afterSolve?.(actor);return options.solve??{ok:true};},
      solveAadhaarOtp:async function(...args){trace.push(['solveAadhaarOtp',this===actor,...args]);options.afterOtp?.(actor);return options.otp??{ok:true,amount:777};},
      runPayment:async function(...args){trace.push(['runPayment',this===actor,...args]);return{success:true,payment:'done'};},
      stopWith:function(...args){trace.push(['stopWith',this===actor,...args]);return{stopWith:args};},
    };
    options.prepare?.(actor);
    const searchSequence=[...(options.spa??['skip'])];
    const slots={
      230:Cursor,
      940:()=>{trace.push(['stopped940']);return{stopped:true};},
      602:'DUPLICATE-LOGIN',
      347:now=>{trace.push(['txnId',now]);return 'tx-'+now;},
      632:ms=>{trace.push(['slotImminent',ms]);return options.imminent??false;},
      631:15000,
      633:info=>{trace.push(['shouldSearch',info]);return options.search??true;},
      474:page=>{trace.push(['clearOverlays',page===undefined?'none':'page']);return options.clearFails?Promise.reject(Error('synthetic clear')):Promise.resolve();},
      634:info=>{trace.push(['spaDecision',info]);return searchSequence.length>1?searchSequence.shift():searchSequence[0];},
      920:4000,
      355:'AVAIL-URL',357:(job,train)=>({kind:'chance',train}),354:'BOARD-URL',372:(job,train)=>({kind:'board',train}),
      358:'SUBMIT-URL',378:(job,fields)=>{trace.push(['bookingRequest',fields]);return{kind:'submit'};},598:'RETRY-NOTICE',
      405:body=>{trace.push(['parse']);return body.outcome;},
      409:body=>{trace.push(['akamai']);return typeof body.akamai==='function'?body.akamai():body.akamai;},
      411:body=>{trace.push(['challenge']);return body.challenge;},
      415:o=>{trace.push(['prefUnmet']);return o.pref;},
      416:o=>{trace.push(['notConfirmed']);return o.notConfirmed;},
      417:body=>{trace.push(['stations']);return body.stations??[];},
      419:body=>{trace.push(['inputTimes']);return body.times;},
      373:body=>{trace.push(['catering']);return body.catering;},
      390:body=>{trace.push(['bank']);return body.bank;},
      396:body=>{trace.push(['extractError']);return body.error;},
      927:(times,count)=>{trace.push(['passengerWait',times,count]);return 'wait-'+count;},
    };
    if(options.noCursor)delete slots[230];
    const{method}=harness({native,slots,globals:{Math}});
    const job={
      trainNumber:options.trainNumber===undefined?' 12951 ':options.trainNumber,classCode:'3A',origin:'ndls',destination:'BCT',
      boardingStation:options.boardingStation,username:'user',mobile:'999',bookOnlyIfCnf:true,travelInsurance:options.insurance,
      passengers:options.passengers??[{name:'A'},{name:'B'}],
    };
    const callArgs=options.noOptions?[job]:[job,options.options];
    const value=await outcome(async()=>method('f2161').call(actor,...callArgs));
    return{value,trace,state:{stopped:actor.stopped,lastAvail:actor.lastAvail,bankDetail:actor.bankDetail}};
  };
}
const run=(name,options)=>test('runBrowserBooking matches the recovered controller: '+name,async()=>compare(scenario(options)));

// ---- gates before the search -------------------------------------------------------------------------------------
run('happy path',{});
run('options default to an empty object',{noOptions:true});
run('relaunch stops the run',{relaunch:true});
run('no auth token stops the run',{auth:false});
run('cursor binding still uninitialised',{noCursor:true});
run('missing train number',{trainNumber:''});
run('null train number',{trainNumber:null});
run('blank train number',{trainNumber:'   '});
run('duplicate login after the gates',{prepare:actor=>{actor.duplicateLogin=true;}});
run('duplicate login without a train number',{prepare:actor=>{actor.duplicateLogin=true;},trainNumber:''});
run('boarding station defaults to the origin',{});
run('explicit boarding station',{boardingStation:'cstm',board:[response({body:{stations:['CSTM','NDLS'],times:[],catering:null,outcome:{noSeats:false}}})]});

// ---- slot window and search decision --------------------------------------------------------------------------------
run('target in the future',{target:{ms:50000},serverNow:[1000]});
run('target already due',{target:{ms:500},serverNow:[1000]});
run('slot imminent logs the polling note',{imminent:true,search:false,target:{ms:5000},serverNow:[1000]});
run('slot imminent with skipSearch option',{imminent:true,search:false,options:{skipSearch:true}});
run('skipTrainSearch setting',{skipTrainSearch:true,search:false});
run('skipTrainSearch setting with skipSearch option',{skipTrainSearch:true,search:false,options:{skipSearch:1}});
run('skipTrainSearch setting but slot imminent',{skipTrainSearch:1,imminent:true,search:false});
run('search requested and stopped by it',{afterSearch:actor=>{actor.stopped=true;}});
run('search requested and duplicate login follows',{afterSearch:actor=>{actor.duplicateLogin=true;}});
run('no UI search, overlays cleared',{search:false});
run('overlay clearing failure is ignored',{search:false,clearFails:true});
run('page load failure is ignored',{loadFails:true});

// ---- browser housekeeping ----------------------------------------------------------------------------------------
for(const hide of[undefined,null,true,false,0])run('hideBrowser '+String(hide),{hideBrowser:hide});
run('hideBrowser rejection is ignored',{hideFails:true});
run('manual mode flag reaches the csrf step',{manual:true});
run('csrf establishment failure at the first step is not caught',{csrfFails:true});
run('stopped during csrf/time sync',{afterSync:actor=>{actor.stopped=true;}});
for(const sync of[true,false])run('server time sync '+sync,{serverTimeSync:sync});

// ---- SPA availability priming ----------------------------------------------------------------------------------------
run('spa decision skip',{spa:['skip']});
run('spa decision prime after a search',{spa:['prime']});
run('spa decision prime without a search',{spa:['prime'],search:false});
run('spa await then skip',{spa:['await-then-decide','skip'],spaFired:true,spaFiredTc:undefined});
run('spa await then prime',{spa:['await-then-decide','prime'],spaFired:false});
run('spa await twice becomes prime',{spa:['await-then-decide','await-then-decide'],spaFired:false});
run('prime stopped by relaunch',{spa:['prime'],afterPrime:actor=>{actor.relaunch=true;}});
run('prime stopped by terminal',{spa:['prime'],afterPrime:actor=>{actor.terminal='terminal reason';}});
run('prime stopped by duplicate login',{spa:['prime'],afterPrime:actor=>{actor.duplicateLogin=true;}});
run('prime stopped by stop flag',{spa:['prime'],afterPrime:actor=>{actor.stopped=true;}});
run('prime relaunch has priority over terminal',{spa:['prime'],afterPrime:actor=>{actor.relaunch=true;actor.terminal='t';}});

// ---- target wait ---------------------------------------------------------------------------------------------------
run('probe early skips the target wait',{probe:'early',target:{ms:90000},serverNow:[1000,1000]});
run('probe late with no target',{probe:'late',target:undefined});
run('probe late, target in the past',{probe:'late',target:{ms:500},serverNow:[1000]});
run('probe late, target ahead: wait with cover callbacks',{probe:'late',target:{ms:90000},serverNow:[1000,1000]});
run('probe late, target ahead, zero cover polls',{probe:'late',target:{ms:90000},serverNow:[1000,1000],covers:0});
run('stopped while waiting for the target',{probe:'late',target:{ms:90000},serverNow:[1000,1000],afterWait:actor=>{actor.stopped=true;}});
run('stopped during the probe',{probe:'late',afterProbe:actor=>{actor.stopped=true;}});

// ---- csrf and availability ----------------------------------------------------------------------------------------------
run('csrf present from the start',{csrf:['tok-abcdefghijkl']});
run('csrf missing then established',{csrf:[undefined,'tok-after-establish']});
run('csrf missing then established but fails',{csrf:[undefined,'tok-after'],csrfFails:true});
run('csrf missing and never established',{csrf:[undefined]});
run('csrf missing before, found for the log, then vanishing',{csrf:['tok-first',undefined]});
run('plain availability poll returns nothing',{availability:null});
run('plain availability poll returns zero amount',{availability:{totalCollectibleAmount:0}});
run('plain availability stopped',{afterPoll:actor=>{actor.stopped=true;}});
run('plain availability terminal',{afterPoll:actor=>{actor.terminal='no more tries';}});
run('plain availability terminal wins over stopped',{afterPoll:actor=>{actor.terminal='t';actor.stopped=true;}});
run('chances flow, single call, string body',{chances:true,chance:[{status:200,body:'text body'}]});
run('chances flow, object body',{chances:true,chance:[{status:201,body:{a:1}}]});
run('chances flow, null body',{chances:true,chance:[{status:204,body:null}]});
run('chances flow, no response',{chances:true,chance:[null]});
run('chances flow, response without status',{chances:true,chance:[{body:undefined}]});
run('chances flow, long body is cut at 800',{chances:true,chance:[{status:200,body:'x'.repeat(1000)}]});
run('chances flow race of 2 with api',{chances:true,race:2});
run('chances flow race of 3 with api',{chances:true,race:3});
run('chances flow race of 2 without api',{chances:true,race:2,noApi:true,csrf:['tok'],prepare:actor=>{}});
run('chances flow race count zero',{chances:true,race:0});
run('chances flow stopped after the call',{chances:true,afterBoard:undefined,prepare:actor=>{actor.terminal=undefined;},afterPoll:undefined,chance:[()=>{return{status:200,body:'x'};}]});

// ---- boarding enquiry ------------------------------------------------------------------------------------------------
run('boarding without response',{board:[null]});
run('boarding no seats with reason',{board:[response({body:{outcome:{noSeats:true,stopReason:'Chart prepared'}}})]});
run('boarding no seats without reason',{board:[response({body:{outcome:{noSeats:true}}})]});
run('boarding terminal',{afterBoard:actor=>{actor.terminal='ip blocked';}});
run('boarding stopped',{afterBoard:actor=>{actor.stopped=true;}});
run('boarding with stations proceeds despite an error message',{board:[response({body:{stations:['NDLS'],times:[],catering:null,outcome:{noSeats:false,errorMessage:'ignored'}}})]});
run('boarding without stations and no error message proceeds',{board:[response({body:{stations:[],times:[],catering:null,outcome:{noSeats:false}}})]});
run('boarding error retries once then succeeds',{board:[response({body:{stations:[],outcome:{noSeats:false,errorMessage:'not open'}}}),response({body:{stations:['NDLS'],times:[],catering:null,outcome:{noSeats:false}}})]});
{
  const failing=response({body:{stations:[],outcome:{noSeats:false,errorMessage:'not open'}}});
  const results=[failing,failing,failing,failing,failing,failing,failing];
  run('boarding error keeps repeating until the window gives up',{board:results});
  run('boarding error retries and ends in terminal',{board:results,afterBoard:undefined,retryCovers:2});
}
run('boarding station not on the route but origin is: corrected',{boardingStation:'zzz',board:[response({body:{stations:['NDLS'],times:[],catering:null,outcome:{noSeats:false}}})]});
run('boarding station not on the route and origin neither',{boardingStation:'zzz',board:[response({body:{stations:['AAA','BBB'],times:[],catering:null,outcome:{noSeats:false}}})]});
run('boarding station on the route (case-insensitive)',{boardingStation:'bct'});
run('boarding with an empty station list keeps the station',{board:[response({body:{stations:[],times:[],catering:null,outcome:{noSeats:false}}})]});
run('catering train codes',{board:[response({body:{stations:['NDLS'],times:[1],catering:['V','N'],outcome:{noSeats:false}}})]});
run('catering set is a Set',{board:[response({body:{stations:['NDLS'],times:[1],catering:new Set(['V']),outcome:{noSeats:false}}})]});
run('stopped after the boarding checks',{afterBoard:undefined,prepare:actor=>{},afterSearch:undefined,board:[()=>{return response({body:{stations:['NDLS'],times:[1],catering:null,outcome:{noSeats:false}}});}]});

// ---- licence, hold and the final ledger check -------------------------------------------------------------------------------
run('no licence check callback',{noLicense:true});
run('stopped during the boarding hold',{afterHold:actor=>{actor.stopped=true;}});
run('beforeBooking blocks the booking',{before:'Quota used up'});
run('beforeBooking allows the booking',{before:null});
run('beforeBooking returns zero',{before:0});
run('passenger count reaches the wait helper',{passengers:[{},{},{}]});
run('insurance opted in',{insurance:true});
run('insurance null',{insurance:null});

// ---- submit ---------------------------------------------------------------------------------------------------------------
run('submit without response',{submit:[null]});
run('submit terminal',{afterSubmit:actor=>{actor.terminal='akamai rate limit';}});
run('submit stopped',{afterSubmit:actor=>{actor.stopped=true;}});
run('submit with fastAkamai',{fastAkamai:true});
run('submit with fastAkamai truthy but not true',{fastAkamai:1});
{
  const blocked=response({body:{akamai:true}});
  run('akamai block once then success',{submit:[blocked,response()]});
  run('akamai block four times then success',{submit:[blocked,blocked,blocked,blocked,response()]});
  run('akamai block six times gives up',{submit:[blocked]});
}
run('akamai check consulted per attempt',{submit:[response({body:{akamai:()=>false}})]});

// ---- response handling ----------------------------------------------------------------------------------------------------
const submitWith=(outcomeOverrides,top={},body={})=>[response({body:{outcome:{...okOutcome,...outcomeOverrides},...body},top})];
run('no seats at submit with reason',{submit:submitWith({noSeats:true,stopReason:'Sold out'})});
run('no seats at submit without reason',{submit:submitWith({noSeats:true})});
run('fare progress uses the response amount',{submit:submitWith({totalCollectibleAmount:2500})});
run('fare progress falls back to last availability',{submit:submitWith({totalCollectibleAmount:0}),availability:{totalCollectibleAmount:0},lastAvail:'previous'});
run('no fare and no last availability',{submit:submitWith({totalCollectibleAmount:0,status:''}),availability:{totalCollectibleAmount:0}});
run('bank detail is stored',{submit:[response({body:{outcome:okOutcome,bank:{name:'B'}}})],bankDetail:'old'});
run('bank detail keeps the old value when absent',{bankDetail:'old'});
run('status empty gives NOT AVAILABLE',{submit:submitWith({status:'',notConfirmed:false})});
run('regret status without confirmation flag',{submit:submitWith({status:'REGRET',notConfirmed:false})});
run('departed status without confirmation flag',{submit:submitWith({status:'DEPARTED',notConfirmed:false})});
run('cancelled status without confirmation flag',{submit:submitWith({status:'CANCELLED',notConfirmed:false})});
run('waitlist, no callback: cancelled',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:false})});
run('waitlist, callback proceeds',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:false}),confirm:true});
run('waitlist, callback declines',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:false}),confirm:false});
run('waitlist with berth preference warning',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:true}),confirm:true});
run('waitlist, stopped while asking',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:false}),confirm:true,stopInConfirm:true});
run('waitlist accepted bypasses the cannot-book check',{submit:submitWith({status:'WL/12',notConfirmed:true,pref:false,bookable:false}),confirm:true});

// ---- verification paths -------------------------------------------------------------------------------------------------------
run('aadhaar otp ok with amount',{submit:submitWith({aadhaar:true,captchaType:'otp'})});
run('aadhaar otp ok without amount',{submit:submitWith({aadhaar:true}),otp:{ok:true}});
run('aadhaar otp failed',{submit:submitWith({aadhaar:true}),otp:{ok:false,message:'wrong otp'}});
run('aadhaar otp kill',{submit:submitWith({aadhaar:true}),otp:{kill:true}});
run('aadhaar otp kill without callback',{submit:submitWith({aadhaar:true}),otp:{kill:true},noKill:true});
run('aadhaar otp stopped',{submit:submitWith({aadhaar:true}),afterOtp:actor=>{actor.stopped=true;}});
run('captcha in the submit response, solved with amount',{submit:[response({body:{outcome:okOutcome,challenge:{captchaType:'text',image:'img'}}})],solve:{ok:true,amount:3100}});
run('captcha in the submit response, default type',{submit:[response({body:{outcome:{...okOutcome,captchaType:undefined},challenge:{image:'img'}}})]});
run('captcha required flag without challenge',{submit:submitWith({captchaRequired:true,captchaType:'image'}),solve:{ok:true}});
run('captcha failed',{submit:[response({body:{outcome:okOutcome,challenge:{image:'img'}}})],solve:{ok:false,message:'captcha failed'}});
run('captcha kill',{submit:[response({body:{outcome:okOutcome,challenge:{image:'img'}}})],solve:{kill:true}});
run('captcha kill without callback',{submit:[response({body:{outcome:okOutcome,challenge:{image:'img'}}})],solve:{kill:true},noKill:true});
run('captcha stopped',{submit:[response({body:{outcome:okOutcome,challenge:{image:'img'}}})],afterSolve:actor=>{actor.stopped=true;}});
run('response with error message',{submit:submitWith({errorMessage:'Seat quota exhausted'})});
run('response cannot be booked (waitlist status)',{submit:submitWith({status:'WL/5',bookable:false,notConfirmed:false})});
run('response cannot be booked (not avail)',{submit:submitWith({status:'NOT AVAILABLE',bookable:false,notConfirmed:false})});
run('response bookable despite a waitlist status',{submit:submitWith({status:'WL/5',bookable:true,notConfirmed:false})});
run('submit response not ok',{submit:submitWith({},{ok:false,status:403})});
run('skipAddonNoCaptcha goes straight to payment',{skipAddon:true});
run('verify returns nothing',{verify:null});
run('verify blocked by akamai',{verify:response({body:{akamai:true,challenge:{image:'i'},error:'e'}})});
run('verify with a rejection message',{verify:response({body:{akamai:false,challenge:null,error:'Rejected by IRCTC'}})});
run('verify with empty rejection',{verify:response({body:{akamai:false,challenge:null,error:''}})});
run('verify demands a captcha, solved',{verify:response({body:{akamai:false,challenge:{captchaType:'text'},error:null}}),solve:{ok:true,amount:500}});
run('verify captcha without type',{verify:response({body:{akamai:false,challenge:{},error:null}})});
run('verify captcha failed',{verify:response({body:{akamai:false,challenge:{captchaType:'x'},error:null}}),solve:{ok:false,message:'nope'}});
run('verify captcha kill',{verify:response({body:{akamai:false,challenge:{captchaType:'x'},error:null}}),solve:{kill:true}});
run('verify captcha kill without callback',{verify:response({body:{akamai:false,challenge:{captchaType:'x'},error:null}}),solve:{kill:true},noKill:true});
run('verify captcha stopped',{verify:response({body:{akamai:false,challenge:{captchaType:'x'},error:null}}),afterSolve:actor=>{actor.stopped=true;}});
run('verify terminal',{afterVerify:actor=>{actor.terminal='verify blocked';}});
run('verify stopped',{afterVerify:actor=>{actor.stopped=true;}});
run('insurance flag reaches verification',{insurance:true});

// ---- values that are absent rather than zero ----------------------------------------------------------------------
run('fare stays undefined when neither availability nor submit report an amount',{availability:{},submit:submitWith({totalCollectibleAmount:undefined})});
run('fare stays undefined, null availability amount',{availability:{totalCollectibleAmount:null},submit:submitWith({totalCollectibleAmount:null})});
run('status missing entirely',{submit:submitWith({status:undefined,notConfirmed:false})});
run('status null',{submit:submitWith({status:null,notConfirmed:false})});
run('solved captcha without amount keeps the earlier fare',{submit:[response({body:{outcome:okOutcome,challenge:{image:'i'}}})],solve:{ok:true}});
run('verify captcha solved without amount keeps the earlier fare',{verify:response({body:{akamai:false,challenge:{captchaType:'text'},error:null}}),solve:{ok:true}});
run('aadhaar otp without amount keeps the earlier fare',{submit:submitWith({aadhaar:true}),otp:{ok:true,amount:0}});

// ---- flag priority and mid-step stops --------------------------------------------------------------------------------
run('submit: terminal and stopped together',{afterSubmit:actor=>{actor.terminal='t';actor.stopped=true;}});
run('verify: terminal and stopped together',{afterVerify:actor=>{actor.terminal='t';actor.stopped=true;}});
run('boarding: terminal and stopped together',{afterBoard:actor=>{actor.terminal='t';actor.stopped=true;}});
run('stopped raised while the catering note is logged',{board:[response({body:{stations:['NDLS'],times:[1],catering:['V'],outcome:{noSeats:false}}})],onLog:(actor,args)=>{if(String(args[1]).startsWith('catering train'))actor.stopped=true;}});
run('stopped raised while the boarding correction is logged',{boardingStation:'zzz',board:[response({body:{stations:['NDLS'],times:[],catering:null,outcome:{noSeats:false}}})],onLog:(actor,args)=>{if(String(args[1]).startsWith('boarding zzz'.toUpperCase().slice(0,0)+'boarding'))actor.stopped=true;}});
