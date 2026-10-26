'use strict';

// Reconstructed f2172. The migration adapter supplies explicit lexical helpers.
async function initializePayment(actor,journey,transactionId,amount,excluded,helpers,{random=Math.random}={}) {
  const candidates=helpers.getCandidates(journey.paymentMethod||'',actor.bankDetail).filter(method=>!excluded.has(method));
  if(candidates.length===0)return{success:false,message:'No payment gateway available — change your ID / use a different profile'};
  actor.log('payment','gateway candidates ['+candidates.join(', ')+'] (selected="'+(journey.paymentMethod||'(none)')+'")');
  let method=candidates[0]||journey.paymentMethod||'paytm',response=null;
  for(let index=0;index<candidates.length;index++){
    method=candidates[index];
    const bankId=helpers.chooseBank(actor.bankDetail,method);
    const body=helpers.buildPaymentBody(method,amount,bankId);
    actor.onProgress('booking:payment',index===0?'Payment Redirect Start… (₹'+(amount||'—')+')':
      'Gateway unavailable — switching to '+method+' (₹'+(amount||'—')+')');
    if(index>0)actor.log('payment','auto-switch → '+method+' (bankId '+bankId+')','warn');
    const referrer=method==='wallet'?actor.paymentPageReferrer():undefined;
    const request=()=>actor.safeCall('api','POST',helpers.buildPaymentUrl(transactionId,journey.travelInsurance??false),body,
      {retries:5,referrer,max510:60,infinite511:true,optVar:true,optShape:'both',terminalMsg:'Akamai Rate Limit, Try New ID'});
    response=await request();
    if(actor.stopped)return helpers.stoppedResult();
    if(actor.terminal)return actor.stopWith(actor.terminal);
    if(response&&response.ok&&!helpers.isBankError(response.body))break;
    if(response&&!response.ok&&response.status>=500&&!helpers.isBankError(response.body)){
      let recovered=false;
      for(let retry=0;retry<3&&!actor.stopped;retry++){
        await actor.session.page.waitForTimeout(800+Math.floor(random()*1200)).catch(()=>{});
        actor.log('payment','init '+method+' '+response?.status+' (transient) — retrying same gateway '+(retry+1)+'/3','warn');
        response=await request();
        if(actor.stopped)return helpers.stoppedResult();
        if(actor.terminal)return actor.stopWith(actor.terminal);
        if(response&&response.ok&&!helpers.isBankError(response.body)){recovered=true;break;}
      }
      if(recovered)break;
    }
    actor.log('payment','init for '+method+' failed ('+(response?response.status:'no response')+
      (response&&helpers.isBankError(response.body)?', bank-end error':'')+')','warn');
    response=null;
  }
  if(!response)return actor.stopWith('Payment init failed on every available gateway — change your ID / use a different profile');
  const error=helpers.extractError(response.body)||(typeof response.body==='string'?response.body:'');
  if(method!=='wallet'&&/unable to process/i.test(error))return actor.stopWith(/unable to process request/i.test(error)?
    'Client-IP issue at the payment step — change your IRCTC ID & use a fresh GoLogin profile.':
    'IRCTC account blocked at the payment step — use a different ID / GoLogin profile.');
  if(method!=='wallet'){
    const data=response.body&&typeof response.body==='object'?response.body:null;
    const returnedId=data&&data.transationId!=null?String(data.transationId):'';
    const rejection=helpers.extractError(response.body);
    if(rejection&&(returnedId==='0'||returnedId==='')){
      actor.log('payment','bookingInitPayment REJECTED: "'+rejection+'" (transationId='+(returnedId||'none')+') — NOT proceeding to the gateway','error');
      return actor.stopWith('Payment could not start — IRCTC dropped the transaction ('+rejection+'). Try Again, or use a different ID / profile.');
    }
  }
  actor.opts.onProxyOutcome?.('working');
  const routed=await actor.routeGatewayThroughFormProxy();
  if(!routed) {
    const attached=actor.session?.cdpAttached===true||actor.session?.provider==='gologin';
    const missingProfileProxy=attached&&actor.session?.vendorProxyMayBeActive!==false&&!actor.session?.proxy?.server?.trim();
    return actor.stopWith(missingProfileProxy?
      'Payment stopped: this browser profile may use its own proxy. Set and verify that proxy on the form, then Try Again':
      'Payment failed: form proxy could not be set up — check proxy settings and Try Again',{noRelaunch:true});
  }
  if(amount||actor.lastAvail)actor.onProgress('booking:fare',actor.lastAvail+'|'+(amount||''));
  actor.onProgress('booking:pay-ready','Reached payment — ready to pay (₹'+(amount||'—')+')');
  if(/^(paytm|phonepay|phonepe|providerqr|irctcqr|razorpayqr)$/i.test(method)){
    actor.onProgress('booking:payment','Redirecting to QR…');actor.opts.onQrPrepare?.();
  }
  // Minimize is deliberately not awaited in the original flow.
  if(actor.opts.hideBrowser??true)actor.minimizeBrowser().catch(()=>{});
  const result=await actor.dispatchGateway(journey,transactionId,amount,method,response);
  return result.gatewayDown?{...result,downMethod:method}:result;
}
module.exports={initializePayment};
