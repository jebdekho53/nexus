'use strict';

// Reconstructed from f2186 and its six local callbacks. Dependencies belong to
// the booking actor; this module owns no browser, account or global run state.
async function runProviderQr(actor,journey,transactionId,amount,{random=Math.random}={}) {
  const gateway=actor.gateway;
  const tokens=actor.tok();
  const randomId=String(Math.floor(10000000+random()*90000000));
  actor.onProgress('booking:payment','Connecting to the IRCTC QR gateway…');
  let action='',encryptedData='',blocked=false;
  for(let attempt=1;attempt<=3&&!actor.stopped;attempt++) {
    const redirect=await gateway.paymentRedirect({
      accessToken:tokens.accessToken,username:journey.username??'',
      clientTxnId:transactionId,csrf:actor.api.currentCsrf,rand8:randomId,
    }).catch(error=>{
      actor.log('gateway','paymentRedirect attempt '+attempt+'/3 failed: '+error.message,'warn');
      return null;
    });
    if(redirect){action=redirect.action;encryptedData=redirect.encdata;blocked=redirect.blocked;}
    if(blocked||encryptedData)break;
    if(attempt<3){
      actor.log('gateway','paymentRedirect empty (no encdata) — retry '+(attempt+1)+'/3 after backoff','warn');
      await actor.session.page.waitForTimeout(1200+attempt*800).catch(()=>{});
    }
  }
  if(blocked)return {success:false,message:'IRCTC account blocked at the payment step — use a different ID / GoLogin profile.'};
  if(!encryptedData)return {success:false,message:'Payment redirect failed (no encdata) — change your IP / proxy or use a different GoLogin profile, then retry.'};
  actor.onProgress('booking:payment','Generating QR…');
  const qr=await gateway.providerQr(action,encryptedData).catch(error=>{
    actor.log('gateway','providerQr failed: '+error.message,'error');return null;
  });
  if(!qr?.payload)return actor.paymentSetupFailed('IRCTC QR not returned by the gateway');
  const qrAmount=qr.qrAmount??amount;
  if(qr.qrAmount)actor.paidQrAmount=qr.qrAmount;
  actor.opts.onQr?.({payload:qr.payload,amount:qrAmount,caption:journey.origin+' → '+journey.destination,checkNow:true});
  actor.onProgress('booking:qr','Scan the QR to complete payment (₹'+qrAmount+')');
  const pollInterval=(actor.opts.irctcqrPollSec&&actor.opts.irctcqrPollSec>0?actor.opts.irctcqrPollSec:10)*1000;
  const maxAttempts=Math.max(30,Math.ceil(720000/pollInterval));
  const payment=await gateway.pollProviderQr(qr,
    ()=>actor.stopped||actor.pnrSeen,
    ()=>actor.onProgress('booking:payment','Awaiting UPI payment…'),
    maxAttempts,pollInterval,ms=>actor.checkNowSleep(ms));
  return await actor.settlePayment(payment,'encdata',transactionId,journey,true);
}
module.exports={runProviderQr};
