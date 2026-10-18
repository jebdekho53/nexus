'use strict';

// Recovered f3149 (second half) with callbacks f3152-f3159: boarding-station correction, the pre-/Y wait, the
// passenger submit (/Y), waitlist / Aadhaar / captcha handling, the fare limit and the hand-over to the payment step.
// Every path ends in a return; see railone-booking.cjs for the conventions (evaluation order, receivers, awaits).
const {payRailOneWallet,payRailOneUpi,payRailOneQr,callOptional}=require('./railone-payment.cjs');

const fail=message=>({ok:false,message});
const ignore=()=>undefined;
const NOT_BOOKABLE=/REGRET|DEPARTED|CANCELLED/i;
const CANNOT_BOOK=/WL|REGRET|NOT AVAIL/i;

function withBoardingStation(job,station) {
  const copy={...job};
  copy.boardingStation=station;
  return copy;
}

async function submitBooking(actor,suppliedJob,passengers,deps,state) {
  let job=suppliedJob;
  const{progress,check,boardingBody,validateWait,paymentWait,env}=state;
  let amount=state.amount;
  if(actor.d.stopAfter==='boarding')return{ok:true,message:'read-leg OK (stopped before passenger submit /Y)',amount,data:boardingBody};

  // ---- boarding station must be on the route ---------------------------------------------------------------------
  const stations=deps.stationList(boardingBody);
  const wanted=(job.boardingStation?job.boardingStation:'').toUpperCase();
  if(wanted&&wanted!==job.srcStn.toUpperCase()&&stations.length&&!stations.includes(wanted)) {
    actor.log('boarding station '+job.boardingStation+' is NOT on the train route ('+stations.join('/')+') — using the source station '+job.srcStn,'warn');
    progress('railone:boarding','Boarding '+job.boardingStation+' not on route — using source '+job.srcStn);
    job=withBoardingStation(job,job.srcStn);
  }

  // ---- pre-/Y wait: the provider's minimum passenger input time ---------------------------------------------------
  const inputTimes=deps.inputTimes(boardingBody);
  const slotMs=inputTimes.length?Math.round(deps.passengerWait(inputTimes,passengers.length)*1000):0;
  const baseWait=inputTimes.length?slotMs:validateWait;
  const margin=Number(env.RAILONE_Y_MARGIN_MS)||200+Math.floor(deps.random()*100);
  const safety=baseWait>0?margin:0;
  let wait=actor.d.waitBeforeYMs;
  if(wait==null)wait=baseWait+safety;
  {
    const log=actor.log;
    const list=inputTimes.length?inputTimes.join('#')+'s':'n/a';
    const message='pre-/Y wait '+Math.round(wait)+'ms (minPsgnInputTime '+baseWait+'ms + '+Math.round(safety)+'ms safety margin) — boarding minPsgnInputTime='+list+' ('+passengers.length+' psgn → slot '+Math.round(slotMs)+'ms), validateUser fallback '+validateWait+'ms';
    Reflect.apply(log,actor,[message]);
  }
  const txn=deps.clientTxnId(deps.deviceId(actor.greq),actor.d.wsUserLogin?actor.d.wsUserLogin:'');
  actor.log('clientTxnId '+txn+' (deviceId '+deps.deviceId(actor.greq)+')');

  // ---- food choices for catering trains ---------------------------------------------------------------------------
  const catering=deps.cateringCodes(boardingBody);
  const menu=catering?[...catering].join(','):'(none — non-catering train)';
  const sent=passengers.map(passenger=>{
    const copy={...passenger};
    let food=deps.foodChoice(passenger.foodChoice,catering);
    if(food==null)food=undefined;
    copy.foodChoice=food;
    return copy;
  });
  {
    const log=actor.log;
    const summary=passengers.map((passenger,index)=>passenger.name+': selected='+(passenger.foodChoice?passenger.foodChoice:'none')+' → sent='+(sent[index].foodChoice?sent[index].foodChoice:'none'));
    Reflect.apply(log,actor,['food (train menu: '+menu+') — '+summary.join(' | ')]);
  }

  const bodyFields=()=>({clientTransactionId:txn,mobileNumber:actor.d.mobile,wsUserLogin:actor.d.wsUserLogin});
  const body=deps.bookingBody(job,sent,bodyFields());
  const raw=deps.rawJson(JSON.stringify(body),deps.rawKeys());
  {
    const log=actor.log;
    Reflect.apply(log,actor,['/Y request body (FULL) — '+JSON.stringify(body)]);
  }
  progress('booking:countdown','Booking|'+Math.round(wait));
  callOptional(actor.d,'licenseCheck');

  // ---- wait for the slot; keep the token warm just before the end of the wait -------------------------------------------
  {
    const call=actor.call;
    Reflect.apply(call,actor,['GET',deps.tokenUrl(),{retryOnTransient:false}]).catch(ignore);
    if(actor.d.tokenPrime&&wait>deps.primeWindowMs()) {
      await actor.sleep(wait-deps.primeWindowMs());
      await actor.d.tokenPrime().catch(ignore);
      await actor.sleep(deps.primeWindowMs());
    } else {
      await actor.sleep(wait);
    }
  }
  if(actor.isStopped())return fail('Stopped');
  const blocked=callOptional(actor.d,'beforeBooking');
  if(blocked) {
    actor.log('booking stopped at the final usage-ledger check','error');
    progress('booking:error',blocked);
    return fail(blocked);
  }

  // ---- submit the passengers (/Y) ----------------------------------------------------------------------------------------
  progress('railone:fare','Final fare (passenger submit)…');
  let response=await actor.callY(body,raw);
  if(!deps.sensor().isSensorExhausted(response)&&deps.boardingRejected(response.body)) {
    const station=job.boardingStation?job.boardingStation:'';
    if(station.toUpperCase()!==job.srcStn.toUpperCase()) {
      actor.log('/Y rejected boarding '+job.boardingStation+' (not an intermediate station) — retrying with the source station '+job.srcStn,'warn');
      progress('railone:fare','Boarding not on route — retrying from source '+job.srcStn+'…');
      job=withBoardingStation(job,job.srcStn);
      const retryBody=deps.bookingBody(job,sent,bodyFields());
      {
        const log=actor.log;
        Reflect.apply(log,actor,['/Y retry body (FULL) — '+JSON.stringify(retryBody)]);
      }
      response=await actor.callY(retryBody);
    }
  }
  const failure=check(response,'allLapAvlFareEnq/Y');
  if(failure)return failure;

  const fareBody=response.body;
  if(actor.d.trace) {
    actor.log('/Y response shape — '+deps.responseShape(fareBody),'info');
    actor.log('/Y body preview — '+deps.responsePreview(fareBody),'info');
  }
  const fare=deps.parseResponse(deps.journeyFilter(fareBody,job.jrnyClass));
  if(!fare.totalCollectibleAmount) {
    const found=deps.amountOf(fareBody);
    amount=found?found:amount;
  } else amount=fare.totalCollectibleAmount;
  actor.fareAvail=fare.status?fare.status:'';
  if(amount?amount:actor.fareAvail) {
    const hooks=actor.d.hooks;
    if(hooks!=null) {
      const onProgress=hooks.onProgress;
      if(onProgress!=null)Reflect.apply(onProgress,hooks,['booking:fare',actor.fareAvail+'|'+(amount?amount:'')]);
    }
  }
  if(fare.noSeats)return fail(fare.stopReason==null?'No seats available — you may be too late':fare.stopReason);

  // ---- waitlist / berth preference confirmation -------------------------------------------------------------------------
  let waitlistAccepted=false;
  const trimmed=(fare.status?fare.status:'').trim();
  const shown=trimmed?trimmed:'NOT AVAILABLE';
  const preferenceUnmet=deps.berthPreferenceUnmet(fare);
  const notConfirmed=deps.notConfirmed(fare);
  if(!notConfirmed&&NOT_BOOKABLE.test(trimmed)) {
    actor.log('/Y not bookable: '+shown+' → NOT BOOKED (no payment)','warn');
    return fail('Choice of confirm berths not met — NOT BOOKED (availability was '+shown+')');
  }
  if(notConfirmed) {
    progress('booking:confirm','Not confirmed ('+shown+') — Proceed (book the waitlist) or Cancel in the box');
    let proceed;
    if(!actor.d.onConfirm)proceed=false;
    else {
      const d=actor.d;
      const confirm=d.onConfirm;
      const question={kind:'waitlist',status:shown};
      question.detail=preferenceUnmet?'Your berth preference may not be met due to insufficient availability. Do you want to proceed with booking without berth preferences?':'This seat is a waitlist ('+shown+'), not confirmed. Book it anyway, or cancel? No money is charged if you cancel.';
      proceed=await Reflect.apply(confirm,d,[question]).catch(()=>false);
    }
    if(actor.isStopped())return fail('Stopped');
    if(!proceed) {
      actor.log('not confirmed ('+shown+') — CANCEL → NOT BOOKED (no payment)','warn');
      return fail('Choice of confirm berths not met — NOT BOOKED (availability was '+shown+')');
    }
    actor.log('not confirmed ('+shown+') — PROCEED → booking the waitlist','warn');
    waitlistAccepted=true;
  }

  // ---- Aadhaar OTP, then captcha handling ------------------------------------------------------------------------------
  if(fare.aadhaar) {
    progress('railone:otp','Aadhaar OTP verification required');
    const otp=await actor.solveAadhaarOtp(txn,fare.captchaType,job.trainNo);
    if(!otp.ok)return fail(otp.message);
    if(otp.amount)amount=otp.amount;
    actor.log('Aadhaar OTP verified — proceeding to payment (no captcha / addonServices)');
  }
  callOptional(actor.d,'licenseCheck');
  let challenge=!fare.aadhaar?deps.captchaFrom(fareBody):null;
  let challengeSource='/Y response';
  let advanced=false;
  if(!challenge&&!fare.aadhaar) {
    const fallback=await actor.call('GET',deps.captchaGenerateUrl(txn),{retryOnTransient:true});
    if(!deps.sensor().isSensorExhausted(fallback)) {
      const fresh=deps.captchaFrom(fallback.body);
      if(fresh) {
        challenge=fresh;
        challengeSource='captchaganetate (fallback)';
      }
    }
  }
  if(!challenge&&!fare.aadhaar) {
    if(fare.errorMessage)return fail('Booking rejected: '+fare.errorMessage);
    if(!waitlistAccepted&&!fare.bookable&&CANNOT_BOOK.test(fare.status))return fail('Cannot book — '+fare.status);
    progress('railone:addon','Submitting booking details…');
    const addon=await actor.verifyCaptcha(txn,null,job.trainNo);
    if(deps.sensor().isSensorExhausted(addon))return fail('Out of sensor tokens — tap GET TOKEN to collect a fresh batch.');
    if(deps.statuses().has(addon.status))return fail(deps.failureText(addon.status,addon.body));
    if(addon.ok&&deps.isAkamaiBlock(addon.body))
      return fail('Request rejected (Akamai block) at booking submit — re-pair (GET TOKEN) or use a different ID / proxy');
    const next=deps.captchaFrom(addon.body);
    if(!next) {
      const verdict=deps.classifyAddon(addon.body);
      if(verdict.verdict==='noseats'||verdict.verdict==='fail'||verdict.verdict==='unbookable')return fail(verdict.message);
      if(verdict.verdict==='success'&&verdict.amount)amount=verdict.amount;
      actor.log('no /Y captcha → advanced via addonServices(captchaAns:null) → payment','info');
      advanced=true;
    } else {
      challenge=next;
      challengeSource='addonServices no-captcha advance';
    }
  }
  if(!challenge) {
    // reached without a captcha: Aadhaar bookings, or the addon step advanced the booking by itself
    if(!advanced) {
      if(fare.errorMessage)return fail('Booking rejected: '+fare.errorMessage);
      if(!waitlistAccepted&&!fare.bookable&&CANNOT_BOOK.test(fare.status))return fail('Cannot book — '+fare.status);
      actor.log('no captcha in the /Y response → proceeding to payment');
    }
  } else {
    actor.log('captcha from '+challengeSource);
    let solved=false;
    for(let attempt=1;attempt<=5&&!actor.isStopped();attempt++) {
      let answer=null;
      if(attempt<=2&&actor.d.captchaSolve) {
        progress('railone:captcha','Solving booking captcha…');
        const d=actor.d;
        answer=await d.captchaSolve(challenge).catch(()=>null);
      }
      if(!answer&&actor.d.captchaManual) {
        progress('railone:captcha','Enter the captcha shown');
        const d=actor.d;
        answer=await d.captchaManual(challenge).catch(()=>null);
      }
      if(!answer)return fail('Booking captcha not solved (no answer / cancelled)');
      progress('railone:addon','Submitting captcha…');
      response=await actor.verifyCaptcha(txn,answer,job.trainNo);
      if(deps.sensor().isSensorExhausted(response))return fail('Out of sensor tokens.');
      if(deps.statuses().has(response.status))return fail(deps.failureText(response.status,response.body));
      if(response.ok&&deps.isAkamaiBlock(response.body))
        return fail('Request rejected (Akamai block) at booking submit — re-pair (GET TOKEN) or use a different ID / proxy');
      const verdict=deps.classifyAddon(response.body);
      if(verdict.verdict==='success') {
        if(verdict.amount)amount=verdict.amount;
        solved=true;
        break;
      }
      if(verdict.verdict==='noseats'||verdict.verdict==='fail'||verdict.verdict==='unbookable')return fail(verdict.message);
      const fresh=deps.captchaFrom(response.body);
      if(!fresh)return fail('Captcha rejected and no fresh challenge returned — please try again');
      challenge=fresh;
      actor.log('captcha rejected (invalid) — showing a fresh one','warn');
    }
    if(!solved)return fail('Captcha rejected repeatedly — please try again');
  }

  // ---- fare limit for premium-tatkal trains ------------------------------------------------------------------------------
  if(job.origQuota==='TQ'||job.origQuota==='PT') {
    if(job.fareLimit&&amount>job.fareLimit) {
      const over=Math.round((amount-job.fareLimit)*100)/100;
      progress('booking:confirm','Fare ₹'+amount+' exceeds your limit ₹'+job.fareLimit+' — Proceed or Cancel in the box');
      let proceed;
      if(!actor.d.onConfirm)proceed=false;
      else {
        const d=actor.d;
        const confirm=d.onConfirm;
        const question={kind:'fare-limit',status:'₹'+amount};
        question.breakdown=[
          {label:'Your limit',value:'₹'+job.fareLimit},
          {label:'Live fare',value:'₹'+amount,tone:'bad'},
          {label:'Over by',value:'₹'+over,tone:'warn'},
        ];
        question.detail='This premium-tatkal train is dynamically priced — the live fare is above the limit you set. Book at ₹'+amount+", or cancel to stop (you won't be charged).";
        proceed=await Reflect.apply(confirm,d,[question]).catch(()=>false);
      }
      if(actor.isStopped())return fail('Stopped');
      if(!proceed)return fail('Fare ₹'+amount+' exceeds your fare limit ₹'+job.fareLimit+' — cancelled');
    }
  }

  // ---- payment -----------------------------------------------------------------------------------------------------------
  if(actor.isStopped())return fail('Stopped');
  const run={actor,deps,progress,check,txn,amount,paymentWait,fareBody};
  if(actor.d.paymentMethod==='railoneqr')return payRailOneQr(run);
  if(actor.d.paymentMethod==='railoneupi')return payRailOneUpi(run);
  return payRailOneWallet(run);
}

module.exports={submitBooking,withBoardingStation,NOT_BOOKABLE,CANNOT_BOOK};
