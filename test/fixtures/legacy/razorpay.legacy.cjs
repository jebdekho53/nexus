'use strict';

async function runRazorpay(actor,journey,transactionId,amount,flow,{random=Math.random}={}) {
  const gateway=actor.gateway,tokens=actor.tok();
  const randomId=String(Math.floor(10000000+random()*90000000));
  actor.onProgress('booking:payment','Connecting to Razorpay…');
  const redirect=await gateway.razorpayRedirect({accessToken:tokens.accessToken,username:journey.username??'',
    clientTxnId:transactionId,csrf:actor.api.currentCsrf,rand8:randomId,
  }).catch(error=>{actor.log('gateway','razorpayRedirect failed: '+error.message,'error');return{action:'',encdata:''};});
  const action=redirect.action,encryptedData=redirect.encdata;
  if(!action||!encryptedData)return actor.paymentSetupFailed('Razorpay redirect failed — change your IRCTC ID / IP / GoLogin profile, then retry');
  const order=await gateway.razorpayCheckout(action,encryptedData).catch(error=>{
    actor.log('gateway','razorpayCheckout failed: '+error.message,'error');return null;
  });
  if(!order||!order.keyId||!order.orderId)return actor.paymentSetupFailed('Razorpay order not parsed');
  const sessionToken=await gateway.razorpaySessionToken(order.keyId,flow==='intent').catch(()=>'');
  actor.onProgress('booking:payment',flow==='intent'?'Generating Razorpay QR…':'Sending the UPI collect request…');
  const created=await gateway.razorpayCreate({keyId:order.keyId,sessionToken,order,amount,flow,vpa:journey.upiId})
    .catch(error=>{actor.log('gateway','razorpayCreate failed: '+error.message,'error');return{paymentId:'',intentUrl:'',pollUrl:''};});
  const paymentId=created.paymentId,intentUrl=created.intentUrl,pollUrl=created.pollUrl;
  if(!paymentId)return actor.paymentSetupFailed('Razorpay payment not created');
  if(flow==='intent'&&intentUrl){
    actor.opts.onQr?.({payload:intentUrl,amount,caption:journey.origin+' → '+journey.destination});
    actor.onProgress('booking:qr','Scan the Razorpay QR to complete payment');
  }else if(flow==='intent'){
    actor.log('gateway','Razorpay returned no intent_url → cannot render the QR (see razorpayCreate response shape above)','error');
    return actor.paymentSetupFailed('Could not generate the Razorpay QR — tap Try Again, or switch the payment method');
  }else{
    actor.opts.onUpiCollect?.({vpa:journey.upiId,amount,caption:journey.origin+' → '+journey.destination});
    actor.onProgress('booking:qr','UPI collect request sent'+(journey.upiId?' to '+journey.upiId:'')+' — approve in your UPI app');
  }
  const interval=(actor.opts.razorpayPollSec&&actor.opts.razorpayPollSec>0?actor.opts.razorpayPollSec:5)*1000;
  const payment=await gateway.pollRazorpay({paymentId,pollUrl,callbackUrl:order.callbackUrl,order},
    ()=>actor.stopped||actor.pnrSeen,()=>actor.onProgress('booking:payment','Awaiting Razorpay payment…'),interval);
  return await actor.settlePayment(payment,'encdata',transactionId,journey);
}
module.exports={runRazorpay};
