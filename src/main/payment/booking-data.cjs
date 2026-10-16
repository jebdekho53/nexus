'use strict';

async function fetchBookingData(actor,transactionId,tokens,{bookingDataUrl}) {
  if(!actor.canRequestPnr())return null;
  actor.beginFinalPnrRequest();actor.onProgress('booking:payment','Hitting for PNR…');
  if(!actor.canRequestPnr()){actor.endFinalPnrRequest();return null;}
  if(actor.gateway)return await actor.gateway.bookingData({
    accessToken:tokens.accessToken,greq:tokens.greq,bmiyek:tokens.bmiyek,clientTxnId:transactionId,
    spaCsrf:actor.spaCsrf(),stopRetry:()=>!actor.canRequestPnr(),
  }).catch(()=>{actor.log('gateway','bookingData request failed','warn');return null;});
  const response=await actor.safeCall('api','GET',bookingDataUrl(transactionId),{retries:0});
  return actor.terminal?null:response?.body??null;
}

async function pollBookingData(actor,transactionId,journey,_maxAttempts=20,helpers,{env=process.env}={}) {
  if(!actor.canRequestPnr())return null;
  const tokens=actor.tok();
  if(actor.opts.slowDownPayment&&!actor.securityQuarantined){
    const delay=Number(env.SLOW_DOWN_PAYMENT_MS)||2000;
    actor.log('gateway','slowDownPayment: waiting '+delay+'ms before the bookingData GET','info');
    if(!await actor.waitForPnrRetry(delay))return null;
  }
  let body=await fetchBookingData(actor,transactionId,tokens,helpers);
  for(let retry=0;retry<=5;retry++){
    // Unlike the recovered logger, never serialize booking/passenger data or
    // transaction IDs. Request order, results and provider waits are preserved.
    actor.log('gateway','bookingData response received','info');
    const booking=helpers.normalizeBooking(body);
    if(booking&&(booking.pnr||booking.errorMessage)){actor.pnrSeen=true;return booking;}
    if(!actor.canRequestPnr())break;
    const delay=helpers.retryAfter(body);
    if(!delay||retry>=5)break;
    actor.log('gateway','bookingData: server asked to re-verify after '+delay+'ms ('+(retry+1)+'/5) — PRS still settling, waiting then re-firing','warn');
    if(!await actor.waitForPnrRetry(delay))break;
    body=await fetchBookingData(actor,transactionId,tokens,helpers);
  }
  actor.log('gateway','bookingData returned no PNR — no retryAfterMili, single-shot','warn');return null;
}
module.exports={fetchBookingData,pollBookingData};
