'use strict';

// Recovered f2102 (runUiBooking) with its callbacks f2103-f2115. Drives one "UI Login" booking: relaunch if logged
// out, search trains, wait for the slot gate, hand over to the shared UI driver, then report the payment hand-off.
// Evaluation order follows the recovered instructions: where a method is read before its arguments are built,
// or `opts.ui` is read twice, the same happens here.
//
// Dependencies (bootstrap root helpers, supplied lazily by the factory adapter):
//   humanFor(page)       new Gt(page)          cursor/dwell helper; throws while its binding is uninitialised
//   stopped()            root 940               the generic "stopped" result
//   duplicateLogin()     root 602               message used when another login took the account
//   optimizeSpace(p, on) root 466               page-space optimiser (called with true before, false after the driver)
//   driver()             root 666               the shared UI booking driver, read just before it is called
//   reference()          root 941               booking reference generator
const RESUME_URL=/\/booking\/(train-list|psgninput|review)|\/payment\b|bkgPaymentOptions/i;

// f2103 / f2109: swallow a rejection
const ignore=()=>undefined;

// f2104: the passenger fields the UI driver needs
const passengerFields=passenger=>({
  name:passenger.name,age:passenger.age,gender:passenger.gender,
  berthPreference:passenger.berthPreference,foodChoice:passenger.foodChoice,childBerth:passenger.childBerth,
});

// f2111 / f2113: forward a QR/UPI prompt to the operator callback with a route caption
function forward(actor,job,name) {
  return payload=>{
    const opts=actor.opts;
    const handler=opts[name];
    if(handler==null)return undefined;
    const copy={...payload};
    copy.caption=payload.caption==null?job.origin+' → '+job.destination:payload.caption;
    return Reflect.apply(handler,opts,[copy]);
  };
}

// f2112 / f2114 / f2115: call an optional operator callback without arguments
function optional(actor,name) {
  return()=>{
    const opts=actor.opts;
    const handler=opts[name];
    return handler==null?undefined:Reflect.apply(handler,opts,[]);
  };
}

// f2108: optional Akamai pre-submit refresh that never rejects
function fastAkamai(actor) {
  return()=>{
    const akamai=actor.akamai;
    const refresh=akamai==null?undefined:akamai.fastRefresh().catch(ignore);
    return refresh==null?Promise.resolve():refresh;
  };
}

async function runUiBooking(actor,job,{humanFor,stopped,duplicateLogin,optimizeSpace,driver,reference}) {
  const page=actor.session.page;
  const human=humanFor(page);
  actor.captureLocationEarly();
  const trainNumber=(job.trainNumber==null?'':job.trainNumber).trim();
  const ui=actor.opts.ui;
  const recordMode=ui==null?undefined:ui.recordMode;
  if(recordMode) {
    actor.onProgress('ui:record','● Recording — do the booking by hand in the window; every click is captured to ui-capture.jsonl');
    return{success:true,message:'Recording session — drive the flow by hand (RECORD_UI)'};
  }
  if(!trainNumber) {
    actor.onProgress('booking:error','No train number on the form — pick a train first');
    return{success:false,message:'No train number selected'};
  }
  if(await actor.relaunchIfLoggedOut())return stopped();

  const resuming=RESUME_URL.test(page.url());
  if(!resuming) {
    await actor.searchTrains(job);
    if(actor.stopped)return stopped();
    if(actor.duplicateLogin)return actor.stopWith(duplicateLogin(),{noRelaunch:true});
    await page.waitForLoadState('domcontentloaded').catch(ignore);
    await human.dwell(700,1400);
    actor.log('time','syncing server time (ensureServerTimeSynced)');
    await actor.ensureServerTimeSynced();
    if(actor.opts.serverTimeSync)await actor.syncServerTime();
    const target=actor.resolveTarget(job);
    const gateAt=target?target.ms-1000:0;
    if(target&&actor.serverNow()<gateAt) {
      const probe=await actor.preTargetProbe(job,15000);
      if(actor.stopped)return stopped();
      if(probe!=='early'&&actor.serverNow()<gateAt) {
        actor.onProgress('booking:availability','Waiting for the '+target.label+' slot before refreshing…');
        await actor.waitUntilTarget({ms:gateAt,label:target.label});
      }
    }
    if(!target)actor.log('availability','UI Login: no slot gating (quota='+job.quota+' class='+job.classCode+') — refreshing now');
  } else {
    actor.onProgress('ui:resume','Resuming from the current page in the browser…');
  }
  if(actor.stopped)return stopped();

  const uiOptions=actor.opts.ui==null?{}:actor.opts.ui;
  if(actor.opts.optimizeSpace)optimizeSpace(page,true);
  const run=driver();
  const request={
    trainNumber,classCode:job.classCode,date:job.date,
    passengers:job.passengers.map(passengerFields),
    bookOnlyIfCnf:job.bookOnlyIfCnf,
    paymentMethod:job.paymentMethod?job.paymentMethod:undefined,
    upiId:job.upiId,
  };
  const hooks={
    onProgress:actor.onProgress,
    log:(a,b,c)=>actor.log(a,b,c),
    isStopped:()=>actor.stopped||actor.duplicateLogin,
    aiResolve:(goal,extra)=>actor.aiResolve(goal,extra),
    onProxyOutcome:actor.opts.onProxyOutcome,
  };
  const proxy=actor.session.proxy;
  const server=proxy==null?undefined:proxy.server;
  hooks.proxyActive=Boolean(server==null?undefined:server.trim());
  hooks.fastAkamai=actor.opts.fastAmz?undefined:actor.opts.fastAkamaiPreSubmit===true?fastAkamai(actor):undefined;
  hooks.fastAmz=actor.opts.fastAmz;
  hooks.pruneBmso=Boolean(actor.opts.fastAmz);
  const highLoad=actor.opts.ui;
  hooks.highLoadDelayMs=highLoad==null?undefined:highLoad.highLoadDelayMs;
  const hide=actor.opts.hideBrowser;
  hooks.surface=hide==null||hide?()=>actor.focusBrowser():undefined;
  hooks.onQr=forward(actor,job,'onQr');
  hooks.onQrPrepare=optional(actor,'onQrPrepare');
  hooks.onUpiCollect=forward(actor,job,'onUpiCollect');
  hooks.solveCaptcha=actor.captchaHook();
  hooks.licenseCheck=optional(actor,'licenseCheck');
  const beforeBooking=optional(actor,'beforeBooking');
  hooks.beforeBooking=()=>{const value=beforeBooking();return value==null?null:value;};
  const refresh={
    refreshMinMs:uiOptions.refreshMinMs==null?0:uiOptions.refreshMinMs,
    refreshMaxMs:uiOptions.refreshMaxMs==null?1500:uiOptions.refreshMaxMs,
    refreshBudgetMs:uiOptions.refreshBudgetMs==null?180000:uiOptions.refreshBudgetMs,
  };
  const selectors=uiOptions.selectors==null?{}:uiOptions.selectors;
  const result=await run(page,human,request,hooks,refresh,selectors,{recordStopAt:uiOptions.recordStopAt,resuming});
  if(actor.opts.optimizeSpace)optimizeSpace(page,false);

  if(actor.duplicateLogin)return actor.stopWith(duplicateLogin(),{noRelaunch:true});
  if(actor.stopped)return stopped();
  if(result.kill) {
    actor.log('captcha','solver blocked this fingerprint (401/403/500) → killing the pair','warn');
    const opts=actor.opts;
    const kill=opts.onKillPair;
    if(kill!=null)Reflect.apply(kill,opts,[]);
    return stopped();
  }
  if(!result.ok)return actor.stopWith(result.message);

  if(actor.opts.onClaimPayment) {
    const claim=await actor.opts.onClaimPayment();
    if(actor.stopped)return stopped();
    if(claim==='stop')return actor.stopWith('Another pair already booked — stopped (your Pair choice)');
    if(claim==='backup') {
      actor.log('payment','UI-Login: another pair booked first → booking a BACKUP ticket (your Pair choice)','warn');
      actor.onProgress('booking:confirm','Another pair booked first — booking a backup ticket');
    }
  }
  const progress=actor.onProgress;
  progress.call(actor,'booking:pay-ready',result.message?result.message:'Reached payment — complete it in the window');
  if(result.reachedContinue)await actor.awaitUiPayment(job.paymentMethod);
  return{success:true,reference:reference(),message:result.message};
}

module.exports={runUiBooking,passengerFields,RESUME_URL};
