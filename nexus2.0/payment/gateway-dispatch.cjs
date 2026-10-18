'use strict';

async function dispatchPayment(actor,journey,transactionId,amount,method,initResponse,helpers) {
  const hosts=actor.opts.gatewayHosts;
  if(method==='irctcqr'&&actor.gateway&&hosts?.qrGateway)return await actor.runProviderQr(journey,transactionId,amount);
  if(method==='wallet'&&actor.gateway&&hosts?.wps){
    const initError=helpers.extractError(initResponse.body);
    if(initError){
      const body=initResponse.body??{};
      const params=Array.isArray(body.paramList)?body.paramList:[];
      const balance=params.find(row=>row?.key==='BALANCE')?.value;
      const balanceText=balance!=null?' (wallet balance ₹'+balance+')':'';
      actor.log('payment','wallet bookingInitPayment errored: "'+initError+'" (BALANCE='+(balance??'?')+', withoutOTP='+String(body.withoutOTP)+')','warn');
      return actor.stopWith('IRCTC Wallet payment init failed: '+initError+balanceText);
    }
    actor.onProgress('booking:countdown','paying|10000');
    const deadline=actor.now()+10000;
    while(actor.now()<deadline&&!actor.stopped)await actor.session.page.waitForTimeout(150).catch(()=>{});
    if(actor.stopped)return helpers.stoppedResult();
    actor.onProgress('booking:payment','Submitting Provider Wallet payment (₹'+(amount||'—')+')…');
    actor.beginSettling();actor.beginFinalPnrRequest();
    const tokens=actor.tok();
    const response=await actor.gateway.walletVerify({accessToken:tokens.accessToken,greq:tokens.greq,bmiyek:tokens.bmiyek,
      spaCsrf:actor.api?.currentCsrf||actor.tok().csrfToken||'',clientTxnId:transactionId,amount,
      init:initResponse.body??{},stopRetry:()=>actor.securityQuarantined,
    }).catch(error=>{actor.log('gateway','walletVerify failed: '+error.message,'error');return null;});
    const booking=helpers.normalizeBooking(response);
    if(booking&&(booking.pnr||booking.errorMessage))return actor.finishBooking(booking);
    const error=helpers.extractError(response);
    return error?actor.stopWith('Wallet payment failed: '+error):actor.finishBooking(booking);
  }
  if(method==='paytm'&&actor.gateway&&hosts?.wps&&hosts?.paytm)return await actor.runPaytmQr(journey,transactionId,amount);
  if(method==='phonepay'&&actor.gateway&&hosts?.wps&&hosts?.phonepeApi)return await actor.runPhonePeQr(journey,transactionId,amount);
  if(method==='razorpayqr'&&actor.gateway&&hosts?.wps&&hosts?.razorpay)return await actor.runRazorpay(journey,transactionId,amount,'intent');
  if(method==='paytmupi'&&actor.gateway&&hosts?.wps&&hosts?.razorpay)return await actor.runRazorpay(journey,transactionId,amount,'collect');
  return actor.paymentSetupFailed(method+': payment gateway not configured');
}
module.exports={dispatchPayment};
