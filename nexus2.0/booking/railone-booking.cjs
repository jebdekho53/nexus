'use strict';

// Recovered f3149 (runInner) and its callbacks f3150-f3151: the first half of the RailOne booking flow.
// validateUser -> search -> availability -> boarding station (re-driven while "not allowed yet") and then the hand-over
// to railone-submit.cjs (pre-/Y wait, passenger submit, waitlist/Aadhaar/captcha, fare limit, payment).
//
// Results are plain objects: failures `{ok:false,message}`, read-leg stops `{ok:true,message,...}`. As in the
// recovered code every branch ends in a return, evaluation order is kept where it is observable (methods are read
// before their arguments, getters are read the same number of times, optional callbacks run with their owner as
// receiver, calls the recovered code does not await are not awaited).
//
// Helpers come from the bootstrap (wiring in runtime/reconstructed-payment.cjs). Their names describe how the flow
// uses them and are inferred from the recovered code. Values behind a temporal dead zone are accessed through
// functions (deps.statuses(), deps.validateUrl() ...) so that reading them throws exactly when the recovered code does.
const {submitBooking}=require('./railone-submit.cjs');

const fail=message=>({ok:false,message});
const stoppedResult=()=>fail('Stopped');
const exhaustedResult=()=>fail('Out of sensor tokens — tap GET TOKEN to collect a fresh batch.');
const noSeats=reason=>fail(reason==null?'No seats available in this class / quota':reason);
const ignore=()=>undefined; // f3150 (default progress), f3154, f3155, f3156 .. f3159 style no-ops live next to their use

// f3151: classifies a response; returns a failure result when the run has to stop, otherwise null.
function responseCheck(actor,deps) {
  return(response,label)=>{
    if(actor.rateLimitStop) {
      const reason=actor.rateLimitStop;
      actor.rateLimitStop=undefined;
      return fail(reason);
    }
    const sensor=deps.sensor();
    if(sensor.isSensorExhausted(response))return exhaustedResult();
    if(response.ok) {
      const hard=deps.hardError(response.body);
      if(!hard)return null;
      actor.log(label+' → HARD error — stopping + showing it: '+hard,'error');
      return fail(hard);
    }
    const statuses=deps.statuses();
    if(statuses.has(response.status))return fail(deps.failureText(response.status,response.body));
    const rejected=deps.hardError(response.body);
    if(!rejected)return fail(label+' failed (HTTP '+response.status+')');
    actor.log(label+' REJECTED (HTTP '+response.status+'): '+rejected,'error');
    return fail(rejected);
  };
}

async function runRailOne(actor,suppliedJob,passengers,deps) {
  let job=suppliedJob;
  const hooks=actor.d.hooks;
  const reported=hooks==null?undefined:hooks.onProgress;
  const progress=reported==null?ignore:reported;
  if(!actor.bmiyek)return fail('Missing bmiyek — the /clearance bundle had no usable bmiyekEncrypted. Re-pair.');
  const check=responseCheck(actor,deps);

  // ---- validate the session --------------------------------------------------------------------------------------
  progress('railone:validate','Validating session…');
  {
    const sleep=actor.sleep;
    await Reflect.apply(sleep,actor,[3000+Math.floor(deps.random()*1000)]);
  }
  let response;
  {
    const call=actor.call;
    response=await Reflect.apply(call,actor,['GET',deps.validateUrl(),{sensor:true}]);
  }
  if(!deps.sensor().isSensorExhausted(response)&&response.ok&&!deps.hasSession(response.body)) {
    if(await actor.tryRelogin('validate session empty/stuck')) {
      actor.log('validateUser returned without a valid session — dropped + re-logged in, retrying validate','warn');
      response=await actor.call('GET',deps.validateUrl(),{sensor:true});
    }
  }
  const validation=check(response,'validateUser');
  if(validation)return validation;
  if(!deps.sensor().isSensorExhausted(response)&&!deps.hasSession(response.body))
    return fail('Session validation failed — please re-pair (GET TOKEN) or try a different ID.');
  const validateWait=deps.validateWait(response.body);
  const paymentWait=deps.paymentWait(response.body);
  if(actor.d.stopAfter==='validate')return{ok:true,message:'validateUser OK (stopped)',data:response.body};

  // ---- search and availability -----------------------------------------------------------------------------------
  progress('railone:search','Searching trains…');
  {
    const call=actor.call;
    await Reflect.apply(call,actor,['POST',deps.searchUrl(),{body:deps.searchBody(job),retryOnTransient:true}]);
  }
  if(actor.d.beforeAvailability) {
    progress('railone:slot','Waiting for the availability slot…');
    await actor.d.beforeAvailability();
  }
  progress('railone:availability','Checking availability…');
  const availability=await actor.pollAvailability(job,progress);
  if(actor.isStopped())return stoppedResult();
  if(!availability.ok) {
    if(!availability.exhausted)return noSeats(availability.stop);
    return exhaustedResult();
  }
  const firstAmount=availability.parsed.totalCollectibleAmount;
  let amount=firstAmount?firstAmount:deps.amountOf(availability.body);
  if(actor.d.stopAfter==='availability')return{ok:true,message:'availability OK (stopped)',amount,data:availability.body};

  // ---- boarding station, re-driven while the booking window is not open ------------------------------------------
  const env=deps.environment();
  const redriveMax=Number(env.RAILONE_BOARDING_REDRIVE_MAX)||10;
  const redriveWait=Number(env.RAILONE_BOARDING_REDRIVE_WAIT_MS)||2500;
  let boardingBody=null;
  for(let redrives=0;;redrives++) {
    if(actor.isStopped())return stoppedResult();
    progress('railone:boarding','Boarding station…');
    actor.pinEtMapp=actor.lastRolledEtMapp;
    {
      const call=actor.call;
      response=await Reflect.apply(call,actor,['POST',deps.boardingUrl(),{body:deps.boardingBody(job),retryOnTransient:true}]);
    }
    actor.pinEtMapp=null;
    if(deps.sensor().isSensorExhausted(response))return exhaustedResult();
    const statuses=deps.statuses();
    if(statuses.has(response.status))return fail(deps.failureText(response.status,response.body));
    boardingBody=response.body;
    const parsed=deps.parseResponse(deps.journeyFilter(response.body,job.jrnyClass));
    if(parsed.noSeats)return noSeats(parsed.stopReason);
    const hasStations=deps.stationList(response.body).length>0;
    const hard=deps.hardError(response.body);
    if(deps.isFatal(parsed.errorMessage)||deps.isFatal(hard)) {
      let message=parsed.errorMessage;
      if(!message) {
        message=hard;
        if(!message)message=deps.genericFailure();
      }
      return fail(message);
    }
    if(hard&&hasStations)return fail(hard);
    if(hasStations||!parsed.errorMessage)break;
    // stations missing and the enquiry says "not allowed yet": wait for the window, re-poll, fire again
    if(redrives>=redriveMax)return fail(parsed.errorMessage?parsed.errorMessage:'Boarding station not available yet — not submitting without a valid boarding station. Try Again.');
    actor.log("boarding 'not allowed yet' ("+parsed.errorMessage+') — wait '+redriveWait+'ms for the window to open, then re-poll + re-fire ('+(redrives+1)+'/'+redriveMax+')','warn');
    await actor.sleep(redriveWait);
    if(actor.isStopped())return stoppedResult();
    const repoll=await actor.pollAvailability(job,progress);
    if(actor.isStopped())return stoppedResult();
    if(!repoll.ok)return repoll.exhausted?exhaustedResult():noSeats(repoll.stop);
    if(repoll.parsed.totalCollectibleAmount)amount=repoll.parsed.totalCollectibleAmount;
  }
  return submitBooking(actor,job,passengers,deps,{progress,check,amount,boardingBody,validateWait,paymentWait,env});
}

module.exports={runRailOne,responseCheck,fail,stoppedResult,exhaustedResult,noSeats,ignore};
