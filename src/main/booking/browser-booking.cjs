'use strict';

// Recovered f2161 (runBrowserBooking) with its callbacks f2162-f2169. Books one journey from a logged-in browser
// session: gate on the slot window, optionally run (or skip) the UI train search, prime the journey, wait for the
// target, poll availability, validate the boarding station, submit the passengers (with Akamai retries), then verify
// the booking (captcha / Aadhaar OTP) and hand over to the payment runner.
//
// The recovered code is one long async method. Evaluation order is kept where it is observable: methods are read
// before their arguments are built, `actor.terminal` is checked before `actor.stopped`, getters such as
// `opts.hideBrowser` or `options.skipSearch` are read the same number of times, and every `await` sits where the
// recovered code awaits (calls that are not awaited there are not awaited here).
//
// Dependencies are the bootstrap's root helpers, supplied lazily by the factory adapter. Names describe how this
// controller uses them; the root slot (and recovered function) is noted for traceability.
//   humanFor(page)            [230 Gt]     cursor/dwell helper; throws while its binding is uninitialised
//   stopped()                 [940]        generic "stopped" result
//   duplicateLogin()          [602 ni]     message used when another login took the account
//   clientTxnId(now)          [347 f502]   now.toString(36)
//   slotImminent(ms)          [632 f1024]  finite, > 0 and below the window limit [631 QT]
//   windowLimit()             [631 QT]     slot-imminent threshold in ms (uninitialised until the bootstrap sets it)
//   shouldSearch(info)        [633 f1025]  !skipSearch && !slotImminent && !skipBySetting
//   clearOverlays(page)       [474 f702]   clears page overlays, returns a promise
//   spaDecision(info)         [634 f1026]  'skip' | 'await-then-decide' | 'prime'
//   spaWait()                 [920 WC]     how long to wait for the SPA's own availability call
//   availabilityUrl()         [355 Ku], availabilityBody(job, train) [357 f507]   predictCnfChance request
//   boardingUrl()             [354 QI], boardingBody(job, train)     [372 f519]   boarding station enquiry
//   submitUrl()               [358 XI], bookingRequest(job, fields)  [378 f525]   passenger submit
//   retryNotice()             [598 Mt]     text shown while retrying after an Akamai block
//   parseResponse(body)       [405 f557], stationList(body) [417 f570], inputTimes(body) [419 f572],
//   cateringCodes(body)       [373 f520], bankDetail(body)  [390 f536], extractError(body) [396 f546],
//   isAkamaiBlock(body)       [409 f563], captchaChallenge(body) [411 f565],
//   berthPreferenceUnmet(r)   [415 f568], notConfirmed(r)    [416 f569], passengerWait(times, count) [927 f2368]
const NOT_BOOKABLE=/REGRET|DEPARTED|CANCELLED/i;
const CANNOT_BOOK=/WL|REGRET|NOT AVAIL/i;

const ignore=()=>undefined; // f2162 f2163 f2164 f2167

// Calls an optional operator callback (`opts.onKillPair`) with `opts` as receiver; result is not used.
function killPair(actor) {
  const opts=actor.opts;
  const kill=opts.onKillPair;
  if(kill!=null)Reflect.apply(kill,opts,[]);
}

async function runBrowserBooking(actor,job,suppliedOptions,deps) {
  const options=suppliedOptions!==undefined?suppliedOptions:{};
  const page=actor.session.page;
  const human=deps.humanFor(page);
  actor.captureLocationEarly();
  const trainNumber=(job.trainNumber==null?'':job.trainNumber).trim();
  let boardingStation=job.boardingStation?job.boardingStation:job.origin;
  let clientTxnId=deps.clientTxnId(actor.now());

  if(await actor.relaunchIfLoggedOut())return deps.stopped();
  if(!await actor.ensureAuthToken())return deps.stopped();

  const target=actor.resolveTarget(job);
  const untilMs=target?target.ms-actor.serverNow():Infinity;
  const slotImminent=deps.slotImminent(untilMs);
  const skipBySetting=Boolean(actor.opts.skipTrainSearch);
  const searchInfo={skipSearch:options.skipSearch,slotImminent,skipBySetting};
  const searchRequested=deps.shouldSearch(searchInfo);
  if(skipBySetting&&!options.skipSearch&&!slotImminent)
    actor.log('search','search SKIPPED — skipTrainSearch is ON; priming the journey with altAvlEnq/TC instead');
  if(slotImminent&&!options.skipSearch) {
    const log=actor.log;
    const prefix='search SKIPPED — slot opens in '+Math.round(untilMs/1000)+'s (< ';
    const limit=deps.windowLimit();
    Reflect.apply(log,actor,['search',prefix+(limit/1000)+'s); polling availability directly','warn']);
  }
  if(searchRequested) {
    await actor.searchTrains(job);
    if(actor.stopped)return deps.stopped();
  }
  if(actor.duplicateLogin)return actor.stopWith(deps.duplicateLogin(),{noRelaunch:true});
  if(!trainNumber) {
    actor.onProgress('booking:error','No train number on the form — pick a train first');
    return{success:false,message:'No train number selected'};
  }

  await page.waitForLoadState('domcontentloaded').catch(ignore);
  if(!searchRequested) {
    await deps.clearOverlays(page).catch(ignore);
    await human.dwell(300,700);
    actor.log('search','No UI search — overlays cleared; the app primes the journey (altAvlEnq/TC) below');
  } else {
    await human.dwell(2000,3000);
    actor.log('search','Results page settled (SPA altAvlEnq quiesced)');
  }
  const hide=actor.opts.hideBrowser;
  if(hide==null||hide)await actor.hideBrowser().catch(ignore);
  actor.api.resyncCsrf(actor.session.tokens.csrfToken);
  await actor.ensureCsrfEstablished(page,human,job,!actor.opts.manual);
  if(actor.stopped)return deps.stopped();
  actor.log('time','syncing server time (ensureServerTimeSynced)');
  await actor.ensureServerTimeSynced();
  if(actor.opts.serverTimeSync)await actor.syncServerTime();
  if(actor.stopped)return deps.stopped();

  let decision=deps.spaDecision({searched:searchRequested,spaFiredTc:actor.spaFiredTc});
  if(decision==='await-then-decide') {
    const wait=actor.waitForSpaTc;
    const fired=await Reflect.apply(wait,actor,[deps.spaWait()]);
    decision=deps.spaDecision({searched:searchRequested,spaFiredTc:fired});
    if(decision==='await-then-decide')decision='prime';
  }
  if(decision==='prime') {
    if(searchRequested)actor.log('search','search ran but the SPA never fired altAvlEnq/TC — priming the journey from the app','warn');
    await actor.primeJourneyContext(job);
    if(actor.relaunch)return deps.stopped();
    if(actor.terminal)return actor.stopWith(actor.terminal);
    if(actor.duplicateLogin)return actor.stopWith(deps.duplicateLogin(),{noRelaunch:true});
    if(actor.stopped)return deps.stopped();
  }

  const probe=await actor.preTargetProbe(job,20000);
  if(actor.stopped)return deps.stopped();
  actor.setTokenOwnership(true);
  if(probe!=='early') {
    const slot=actor.resolveTarget(job);
    if(slot&&actor.serverNow()<slot.ms) {
      let polls=0; // f2165 / f2166 share one counter per wait
      const cover=()=>{const poll=actor.pollWindowCover;const index=polls;polls=index+1;return Reflect.apply(poll,actor,[human,index]);};
      await actor.waitUntilTarget(slot,cover,activity=>actor.safeBrowseActivity(human,activity));
      if(actor.stopped)return deps.stopped();
    }
  }

  actor.api.resyncCsrf(actor.session.tokens.csrfToken);
  if(!actor.api.csrfToken()) {
    actor.log('api','no browser-captured csrf before availability — re-establishing','warn');
    await actor.ensureCsrfEstablished(page,human,job,!actor.opts.manual).catch(ignore);
    actor.api.resyncCsrf(actor.session.tokens.csrfToken);
  }
  {
    const log=actor.log;
    let message;
    if(!actor.api.csrfToken())message='csrf STILL missing before availability — the header will be omitted (expect a reject; check the login/search log above)';
    else message='csrf ready for availability (captured from the browser: '+(actor.api.csrfToken().slice(0,8)+'…')+')';
    Reflect.apply(log,actor,['api',message,actor.api.csrfToken()?'info':'warn']);
  }
  actor.onProgress('booking:availability','Checking availability for '+trainNumber);

  let fare=0;
  let boarding=null;
  const maxBoardingTries=6;
  for(let attempt=1;;attempt++) {
    // ---- availability, then the boarding station enquiry -----------------------------------------------------
    let retry=false;
    {
      if(!actor.isChancesFlow()) {
        const availability=await actor.pollAvailability(job,trainNumber,human,{skipWait:true});
        if(actor.terminal)return actor.stopWith(actor.terminal);
        if(actor.stopped)return deps.stopped();
        if(!availability)return{success:false,message:'No confirmed seats opened up before the deadline'};
        fare=availability.totalCollectibleAmount?availability.totalCollectibleAmount:0;
      } else {
        actor.onProgress('booking:availability','Checking availability for '+trainNumber);
        const race=actor.opts.chancesRaceCount==null?1:actor.opts.chancesRaceCount;
        let chance;
        if(race>=2&&actor.api) {
          const api=actor.api;
          const raceCall=api.raceCall;
          chance=await Reflect.apply(raceCall,api,['POST',deps.availabilityUrl(),deps.availabilityBody(job,trainNumber),{concurrency:race,timeoutMs:1500,maxAttempts:5}]);
        } else {
          const safeCall=actor.safeCall;
          chance=await Reflect.apply(safeCall,actor,['api','POST',deps.availabilityUrl(),deps.availabilityBody(job,trainNumber),{retries:3}]);
        }
        if(actor.terminal)return actor.stopWith(actor.terminal);
        if(actor.stopped)return deps.stopped();
        const log=actor.log;
        let status=chance==null?undefined:chance.status;
        if(status==null)status='-';
        const prefix='predictCnfChance → '+status+' ';
        const body=chance==null?undefined:chance.body;
        let excerpt;
        if(typeof body!=='string') {
          const stringify=JSON.stringify;
          let again=chance==null?undefined:chance.body;
          if(again==null)again=null;
          excerpt=Reflect.apply(stringify,JSON,[again]).slice(0,800);
        } else excerpt=chance.body.slice(0,800);
        Reflect.apply(log,actor,['api',prefix+excerpt]);
        fare=0;
      }
      actor.onProgress('booking:boarding','Validating boarding station');
      let covers=0; // f2168 counter, one per attempt
      const safeCall=actor.safeCall;
      const boardingRequest=deps.boardingBody(job,trainNumber);
      boarding=await Reflect.apply(safeCall,actor,['api','POST',deps.boardingUrl(),boardingRequest,{
        retries:50,max510:60,infinite511:true,
        terminalMsg:'Client IP issue at boarding — try again, or use a different ID / profile',
        retryCover:async()=>{
          covers=covers+1;
          if(covers===1||covers%4===0)actor.sensorCheckpoint('boarding retry '+covers);
          await actor.sensorJitter(human);
        },
      }]);
      if(actor.terminal)return actor.stopWith(actor.terminal);
      if(actor.stopped)return deps.stopped();
      if(boarding) {
        const parsed=deps.parseResponse(boarding.body);
        if(!parsed.noSeats) {
          if(!(deps.stationList(boarding.body).length>0)&&parsed.errorMessage) {
            if(attempt>=maxBoardingTries)
              return actor.stopWith('Boarding enquiry kept returning "'+parsed.errorMessage+'" — the booking window did not open');
            actor.log('boarding','boardingStationEnq "'+parsed.errorMessage+'" (try '+attempt+'/'+maxBoardingTries+') — booking not open yet, re-polling availability','warn');
            actor.onProgress('booking:availability','Booking not open yet — re-checking ('+attempt+'/'+maxBoardingTries+')');
            await actor.session.page.waitForTimeout(800);
            retry=true;
          }
        } else {
          const stopWith=actor.stopWith;
          const reason=parsed.stopReason==null?'No seats available in this class / quota':parsed.stopReason;
          return Reflect.apply(stopWith,actor,[reason]);
        }
      }
    }
    if(retry)continue;

    // ---- boarding station check, then everything that ends in a return ----------------------------------------
    if(boarding) {
      const stations=deps.stationList(boarding.body);
      const wanted=boardingStation.toUpperCase();
      if(stations.length&&!stations.includes(wanted)) {
        const includes=stations.includes;
        const origin=job.origin;
        if(!Reflect.apply(includes,stations,[origin.toUpperCase()]))
          return actor.stopWith('Boarding station '+wanted+' is not valid for this train / route');
        actor.log('boarding','boarding '+wanted+' not on route — auto-correcting to origin '+job.origin,'warn');
        actor.onProgress('booking:boarding','Boarding '+wanted+" isn't on this route — using "+job.origin);
        boardingStation=job.origin;
      }
    }
    const inputTimes=boarding?deps.inputTimes(boarding.body):[];
    const catering=boarding?deps.cateringCodes(boarding.body):null;
    if(catering) {
      const log=actor.log;
      Reflect.apply(log,actor,['boarding','catering train: food codes ['+[...catering].join(',')+']']);
    }
    if(actor.stopped)return deps.stopped();

    clientTxnId=deps.clientTxnId(actor.now());
    const build=deps.bookingRequest;
    const fields={
      trainNumber,boardingStation,clientTxnId,username:job.username,mobile:job.mobile,bookOnlyIfCnf:job.bookOnlyIfCnf,
      travelInsuranceOpted:job.travelInsurance==null?false:job.travelInsurance,foodSet:catering,
    };
    const request=build(job,fields);
    {
      const opts=actor.opts;
      const licenseCheck=opts.licenseCheck;
      if(licenseCheck!=null)Reflect.apply(licenseCheck,opts,[]);
    }
    await actor.boardingHold(human,job,deps.passengerWait(inputTimes,job.passengers.length));
    if(actor.stopped)return deps.stopped();

    let blocked;
    {
      const opts=actor.opts;
      const beforeBooking=opts.beforeBooking;
      blocked=beforeBooking==null?undefined:Reflect.apply(beforeBooking,opts,[]);
    }
    if(blocked) {
      actor.log('clientupdate','booking stopped at the final usage-ledger check','error');
      actor.onProgress('booking:error',blocked);
      return{success:false,message:blocked};
    }

    actor.api.resyncCsrf(actor.session.tokens.csrfToken);
    actor.onProgress('booking:submit','Submitting passengers');
    let submitted=null;
    let submitCovers=0; // f2169 counter
    for(let tries=0;;tries++) {
      const safeCall=actor.safeCall;
      submitted=await Reflect.apply(safeCall,actor,['api','POST',deps.submitUrl(),request,{
        retries:50,terminalOn503:true,max510:60,infinite511:true,optVar:true,optShape:'trail',ySubmit:true,
        fastAkamai:actor.opts.fastAkamaiPreSubmit===true,
        terminalMsg:'Akamai Rate Limit, Try New ID',
        onHighLoad:()=>{const poll=actor.pollWindowCover;const index=Number(submitCovers);submitCovers=index+1;return Reflect.apply(poll,actor,[human,index]);},
      }]);
      if(actor.terminal)return actor.stopWith(actor.terminal);
      if(actor.stopped)return deps.stopped();
      if(!submitted)return actor.stopWith('Booking request failed (no response)');
      if(!deps.isAkamaiBlock(submitted.body))break;
      if(tries>=5)return actor.stopWith('Request rejected (Akamai block) at passenger submit — use a different profile');
      actor.log('booking','Akamai block at submit — retrying '+(tries+1)+'/5','warn');
      const progress=actor.onProgress;
      Reflect.apply(progress,actor,['booking:retry',deps.retryNotice()]);
      await actor.session.page.waitForTimeout(3000);
    }

    // ---- read the submit response ----------------------------------------------------------------------------
    const outcome=deps.parseResponse(submitted.body);
    const challenge=deps.captchaChallenge(submitted.body);
    if(outcome.totalCollectibleAmount)fare=outcome.totalCollectibleAmount;
    actor.lastAvail=outcome.status?outcome.status:'';
    if(fare||actor.lastAvail)actor.onProgress('booking:fare',actor.lastAvail+'|'+(fare?fare:''));
    const bank=deps.bankDetail(submitted.body);
    actor.bankDetail=bank==null?actor.bankDetail:bank;
    if(outcome.noSeats) {
      const stopWith=actor.stopWith;
      const reason=outcome.stopReason==null?'No seats available — you may be too late':outcome.stopReason;
      return Reflect.apply(stopWith,actor,[reason]);
    }

    let waitlistAccepted=false;
    const rawStatus=outcome.status?outcome.status:'';
    const trimmed=rawStatus.trim();
    const shown=trimmed?trimmed:'NOT AVAILABLE';
    const preferenceNotMet=deps.berthPreferenceUnmet(outcome);
    const notConfirmed=deps.notConfirmed(outcome);
    if(!notConfirmed&&NOT_BOOKABLE.test(trimmed)) {
      actor.log('booking','/Y not bookable: '+shown+' → NOT BOOKED (no payment)','warn');
      return actor.stopWith('Choice of confirm berths not met — NOT BOOKED (availability was '+shown+')');
    }
    if(notConfirmed) {
      actor.onProgress('booking:confirm','Not confirmed ('+shown+') — Proceed (book the waitlist) or Cancel in the box');
      let proceed;
      if(!actor.opts.onConfirm)proceed=false;
      else {
        const opts=actor.opts;
        const confirm=opts.onConfirm;
        const question={kind:'waitlist',status:shown};
        question.detail=preferenceNotMet
          ?'Your berth preference may not be met due to insufficient availability. Do you want to proceed with booking without berth preferences?'
          :'This seat is a waitlist ('+shown+'), not confirmed. Book it anyway, or cancel? No money is charged if you cancel.';
        proceed=await Reflect.apply(confirm,opts,[question]);
      }
      if(actor.stopped)return deps.stopped();
      if(!proceed) {
        actor.log('booking','not confirmed ('+shown+') — CANCEL → NOT BOOKED (no payment)','warn');
        return actor.stopWith('Choice of confirm berths not met — NOT BOOKED (availability was '+shown+')');
      }
      actor.log('booking','not confirmed ('+shown+') — PROCEED → booking the waitlist','warn');
      waitlistAccepted=true;
    }

    if(outcome.aadhaar) {
      actor.onProgress('booking:otp','Aadhaar OTP verification required');
      const otp=await actor.solveAadhaarOtp(clientTxnId,outcome.captchaType,job);
      let result;
      if(!actor.stopped) {
        if(!otp.kill) {
          if(!otp.ok)result=actor.stopWith(otp.message,{noRelaunch:true});
          else {
            if(otp.amount)fare=otp.amount;
            result=await actor.runPayment(job,clientTxnId,fare);
          }
        } else {
          killPair(actor);
          result=deps.stopped();
        }
      } else result=deps.stopped();
      return result;
    }

    // ---- captcha / addon verification before payment ---------------------------------------------------------
    if(challenge||outcome.captchaRequired) {
      // the submit response itself asks for a captcha
      actor.onProgress('booking:addon','Verifying booking');
      const solver=actor.solveCaptchaAndVerify;
      const kind=outcome.captchaType?outcome.captchaType:'text';
      const solved=await Reflect.apply(solver,actor,[clientTxnId,challenge,job,kind]);
      if(actor.stopped)return deps.stopped();
      if(solved.kill) {
        actor.log('captcha','solver blocked this fingerprint (401/403/500) → killing the pair','warn');
        killPair(actor);
        return deps.stopped();
      }
      if(!solved.ok)return actor.stopWith(solved.message);
      if(solved.amount)fare=solved.amount;
    } else {
      if(outcome.errorMessage)return actor.stopWith('Booking rejected: '+outcome.errorMessage);
      if(!waitlistAccepted&&!outcome.bookable&&CANNOT_BOOK.test(outcome.status))return actor.stopWith('Cannot book — '+outcome.status);
      if(!submitted.ok)return actor.stopWith('Booking request failed ('+submitted.status+')');
      if(!actor.opts.skipAddonNoCaptcha) {
        actor.onProgress('booking:addon','Verifying booking');
        const verifyCall=actor.verifyCaptchaCall;
        const insurance=job.travelInsurance==null?false:job.travelInsurance;
        const verification=await Reflect.apply(verifyCall,actor,[clientTxnId,'BOOKINGWS',null,insurance,{
          retries:3,max510:60,infinite511:true,
          terminalMsg:'Client IP issue at verify — change your ID & use a different browser profile',
        }]);
        if(actor.terminal)return actor.stopWith(actor.terminal);
        if(actor.stopped)return deps.stopped();
        const proof=verification&&!deps.isAkamaiBlock(verification.body)?deps.captchaChallenge(verification.body):null;
        if(!proof) {
          if(verification&&!deps.isAkamaiBlock(verification.body)) {
            const rejection=deps.extractError(verification.body);
            if(rejection)return actor.stopWith('Booking rejected: '+rejection);
          }
        } else {
          const solver=actor.solveCaptchaAndVerify;
          const kind=proof.captchaType?proof.captchaType:'BOOKINGWS';
          const solved=await Reflect.apply(solver,actor,[clientTxnId,proof,job,kind]);
          if(actor.stopped)return deps.stopped();
          if(solved.kill) {
            killPair(actor);
            return deps.stopped();
          }
          if(!solved.ok)return actor.stopWith(solved.message);
          if(solved.amount)fare=solved.amount;
        }
      } else {
        actor.log('booking','no captcha + skipAddonNoCaptcha → skipping addonServices, going straight to bookingInitPayment','info');
      }
    }
    const payment=await actor.runPayment(job,clientTxnId,fare);
    return payment;
  }
}

module.exports={runBrowserBooking};
