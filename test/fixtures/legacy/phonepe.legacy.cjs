'use strict';

async function runPhonePe(actor,journey,transactionId,amount,{random=Math.random}={}) {
  const gateway=actor.gateway,tokens=actor.tok();
  const randomId=String(Math.floor(10000000+random()*90000000));
  actor.onProgress('booking:payment','Connecting to PhonePe…');
  const redirect=await gateway.phonePeRedirect({accessToken:tokens.accessToken,username:journey.username??'',
    clientTxnId:transactionId,csrf:actor.api.currentCsrf,rand8:randomId,
  }).catch(error=>{
    actor.log('gateway','phonePeRedirect failed: '+error.message,'error');return{action:'',token:''};
  });
  const action=redirect.action,token=redirect.token;
  if(!token)return actor.paymentSetupFailed('PhonePe redirect failed (no token) — change your IRCTC ID / IP / GoLogin profile, then retry');
  actor.onProgress('booking:payment','Generating PhonePe QR…');
  const qr=await gateway.phonePeQr(action,token).catch(error=>{
    actor.log('gateway','phonePeQr failed: '+error.message,'error');return{qrBase64:'',phonePeToken:''};
  });
  const image=qr.qrBase64,phonePeToken=qr.phonePeToken;
  if(!image||!phonePeToken)return actor.paymentSetupFailed('PhonePe QR not extracted');
  actor.opts.onQr?.({imageBase64:image,amount,caption:journey.origin+' → '+journey.destination});
  actor.onProgress('booking:qr','Scan the PhonePe QR to complete payment');
  const payment=await gateway.pollPhonePe(phonePeToken,()=>actor.stopped||actor.pnrSeen,
    ()=>actor.onProgress('booking:payment','Awaiting PhonePe payment…'));
  return await actor.settlePayment(payment,'response',transactionId,journey,true);
}
module.exports={runPhonePe};
