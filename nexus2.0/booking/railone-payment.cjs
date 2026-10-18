'use strict';

// Recovered f3149 (payment branches) with callbacks f3160-f3175: RailOne Wallet, RailOne UPI collect and RailOne QR.
// The three branches share the same bookingInitPayment call and the verifyPayment / PNR tail but differ in their
// request options, order lookups, messages and callbacks, so each keeps its own text from the recovered code.
// Conventions as in railone-booking.cjs: evaluation order follows the recovered instructions, optional operator
// callbacks run with their owner as receiver, `.catch` fallbacks return the recovered no-op values.

const fail=message=>({ok:false,message});
const WALLET_KEYS=['remainingBalance'];

// Calls an optional callback stored on `owner`; `args` may be a function so that its arguments are only built when the
// callback exists (the recovered code evaluates them inside the call).
function callOptional(owner,name,args=[]) {
  const callback=owner[name];
  return callback==null?undefined:Reflect.apply(callback,owner,typeof args==='function'?args():args);
}

// The bookingInitPayment call (K[251] / K[291] / K[317]): option keys keep the order of the recovered literals.
async function initPayment(run,bodyFor,rawFor,terminalBody) {
  const{actor,deps,check,txn}=run;
  const call=actor.call;
  const url=deps.paymentInitUrl(txn);
  const body=bodyFor();
  const options={body,bodyRaw:rawFor(body),sensor:true,staged:true,optVar:true,optShape:'both'};
  options.sensorRetryMax=deps.sensorRetryMax();
  if(terminalBody)options.terminalBody=terminalBody;
  const response=await Reflect.apply(call,actor,['POST',url,options]);
  return{response,failure:check(response,'bookingInitPayment')};
}

// ---- RailOne Wallet ----------------------------------------------------------------------------------------------------
async function payRailOneWallet(run) {
  const{actor,deps,progress,txn,amount,paymentWait}=run;
  progress('railone:pay','Payment Redirect Start…');
  const walletBody=deps.walletBody(amount,actor.d.mobile);
  const{response,failure}=await initPayment(run,()=>walletBody,body=>deps.rawJson(JSON.stringify(body),[...WALLET_KEYS]));
  if(failure)return failure;
  const init=deps.walletInit(response.body);
  const declined=deps.walletDeclined(init.encData);
  if(declined) {
    actor.log('R-Wallet init DECLINED — '+declined.message+' (encData respCode != 0)','error');
    return fail(!declined.low?'RailOne Wallet declined: '+declined.message:'WALLET BALANCE IS LOW — top up the RailOne Wallet, then retry');
  }
  if(init.encData&&init.transationId) {
    callOptional(actor.d,'onProxyOutcome',['working']);
    if(!actor.d.mpsBaseUrl) {
      progress('railone:done','Payment order created (verify host not configured)');
      return{ok:true,message:'RailOne payment initiated (verify pending — set RAILONE_MPS_BASE_URL)',data:response.body,amount};
    }
    const wait=init.minPaymentMs?init.minPaymentMs:paymentWait;
    progress('booking:countdown','paying|'+Math.round(wait));
    await actor.sleep(wait);
    if(actor.isStopped())return fail('Stopped');
    actor.beginSettlingPayment();
    progress('railone:pay','Hitting for PNR…');
    const verifyBody=deps.walletVerifyBody(amount,init.transationId,init.encData);
    const raw=deps.rawJson(JSON.stringify(verifyBody),[...WALLET_KEYS]);
    actor.beginFinalPnrRequest();
    const verification=await actor.verifyPaymentWithRetryAfter(txn,verifyBody,raw,{retryOnTransient:true,sensorRetryMax:3});
    if(deps.sensor().isSensorExhausted(verification))return fail('sensor pool exhausted before verify');
    if(deps.statuses().has(verification.status))return fail(deps.failureText(verification.status,verification.body));
    const booking=verification.ok?deps.parseVerify(verification.body):null;
    if(booking&&booking.pnr) {
      actor.log('R-Wallet booking CONFIRMED — PNR '+booking.pnr,'info');
      await callOptional(actor.d,'onBooked',[booking]);
      progress('railone:done','Booked — PNR '+booking.pnr);
      return{ok:true,message:'Booked — PNR '+booking.pnr,data:verification.body,amount};
    }
    if(booking&&booking.errorMessage)return fail('Payment failed: '+booking.errorMessage);
    actor.log('verifyPayment returned no PNR (status '+verification.status+') — single-shot, not re-polling','warn');
    return fail('Booking Not Confirmed - Payment From Bank Getting Rejected By IRCTC');
  }
  {
    const log=actor.log;
    Reflect.apply(log,actor,['R-Wallet init missing data — transationId='+init.transationId+' encData='+(init.encData?'present':'MISSING'),'error']);
  }
  return fail('RailOne Wallet payment init failed (no transaction data) — please try again');
}

// ---- UPI collect and QR: shared order creation, polling and verification ------------------------------------------------
const closeQr=actor=>callOptional(actor.d,'onQrClose');

async function pollUntilPaid(run,client,order,preferences,transactionId) {
  const{actor,deps,progress}=run;
  const speed=actor.d.pollSpeedSec;
  const interval=Math.max(1000,Math.round((speed==null?2:speed)*1000));
  const deadline=actor.now()+preferences.upiTimerSec*1000;
  let status=null;
  for(;;) {
    if(actor.isStopped())break;
    if(!(actor.now()<deadline))break;
    status=deps.statusView(await client.queryweb(transactionId,order.mercid,order.orOrderid).catch(()=>({})));
    if(status.paid)break;
    if(!status.failed) {
      progress('railone:pay','Awaiting payment…');
      await actor.sleep(interval);
      continue;
    }
    closeQr(actor);
    return{result:fail('Payment failed'+(status.reason?': '+status.reason:''))};
  }
  return{status};
}

async function verifyPaid(run,order,status,labels) {
  const{actor,deps,progress,txn,response}=run;
  actor.beginSettlingPayment();
  closeQr(actor);
  await actor.awaitPaymentGate();
  await actor.settleBeforeVerify();
  progress('railone:pay','Hitting for PNR…');
  if(!actor.d.mpsBaseUrl)return{ok:true,message:labels.unverified,data:response.body,amount:run.collectAmount};
  const orderId=Number(status.orderid)||order.transationId;
  const orderText=status.orderid?status.orderid:String(order.transationId);
  const verifyBody=deps.verifyBody(run.collectAmount,orderId,status.encdata,orderText,order.mercid);
  const raw=deps.rawJson(JSON.stringify(verifyBody),[...WALLET_KEYS]);
  actor.beginFinalPnrRequest();
  const verification=await actor.verifyPaymentWithRetryAfter(txn,verifyBody,raw);
  if(deps.sensor().isSensorExhausted(verification))return fail('sensor pool exhausted before verify');
  if(deps.statuses().has(verification.status))return fail(deps.failureText(verification.status,verification.body));
  const booking=verification.ok?deps.parseVerify(verification.body):null;
  if(booking&&booking.pnr) {
    actor.log(labels.confirmed+booking.pnr,'info');
    await callOptional(actor.d,'onBooked',[booking]);
    progress('railone:done','Booked — PNR '+booking.pnr);
    return{ok:true,message:'Booked — PNR '+booking.pnr,data:verification.body,amount:run.collectAmount};
  }
  if(!deps.serverBusy(verification.body)) {
    if(booking&&booking.errorMessage)return fail('Payment failed: '+booking.errorMessage);
    actor.log('verifyPayment returned no PNR (status '+verification.status+') — single-shot, not re-polling','warn');
    return fail('Booking Not Confirmed - Payment From Bank Getting Rejected By IRCTC');
  }
  return fail('Payment likely went through — IRCTC could not confirm the ticket immediately (server busy). Check "My Bookings" in a few minutes; do NOT pay again.');
}

// the hosted-order client (root 1402) is given the actor's live fetch / stop / log
function clientFor(run,order,withAgent) {
  const{actor,deps}=run;
  const Client=deps.billdeskClient();
  const options={baseUrl:order.billdeskBaseUrl,otoken:order.otoken};
  options.fetchImpl=(...args)=>Reflect.apply(actor.activeFetch(),undefined,args);
  if(withAgent)options.ua=deps.userAgent();
  options.isStopped=()=>actor.isStopped();
  options.log=(level,message)=>actor.log(level,message);
  return new Client(options);
}

async function payRailOneUpi(run) {
  const{actor,deps,progress,amount,fareBody}=run;
  const entered=actor.d.upiId;
  const vpa=(entered==null?'':entered).trim();
  if(!deps.validVpa(vpa))return fail('RailOne UPI needs a valid UPI ID (VPA) saved in the form (e.g. name@bank).');
  actor.log('RailOne UPI — offered banks (bankId:enableFlag): ['+deps.bankList(fareBody)+']','info');
  if(!deps.bankOffered(fareBody,'501')) {
    actor.log('RailOne UPI (bankId 501 / SuperApp UPI PG) is NOT offered/enabled in bankDetailDTO for this account','error');
    return fail('RailOne UPI is not available for this account — choose RailOne Wallet (or another method). (SuperApp UPI / bankId 501 wasn’t offered by IRCTC for this booking.)');
  }
  const quoted=deps.upiAmount(fareBody);
  const collectAmount=quoted?quoted:amount;
  actor.log('RailOne UPI amount — UPI ₹'+collectAmount+' (regular ₹'+amount+') → collect to '+deps.maskedVpa(vpa),'info');
  progress('railone:pay','Payment Redirect Start…');
  const{response,failure}=await initPayment(run,()=>deps.upiBody(collectAmount),()=>deps.upiRawBody(collectAmount),body=>deps.terminalBody(body));
  if(failure)return failure;
  const order=deps.orderInfo(response.body);
  if(!order) {
    const reason=deps.initRejection(response.body);
    const log=actor.log;
    Reflect.apply(log,actor,['RailOne UPI init rejected — '+(reason?reason:'no SuperApp PG handoff (no authToken / order)'),'error']);
    return fail(!reason?'RailOne UPI payment init failed — please try again':"RailOne UPI couldn't start: "+reason);
  }
  actor.log('RailOne UPI order created — txn='+order.transationId+' bdorder='+order.orOrderid+' mercid='+order.mercid,'info');
  callOptional(actor.d,'onProxyOutcome',['working']);
  progress('railone:qr','Sending the UPI collect request…');
  const client=clientFor(run,order,true);
  const orders=deps.ordersView(await client.ordersGet(order.mercid,order.orOrderid).catch(()=>({})));
  const preferences=deps.prefView(await client.mercpref(order.mercid,order.orOrderid).catch(()=>({})));
  const collect=deps.transactionView(await client.transactionsOrderCollect(order.mercid,order.orOrderid,orders.itemcode,vpa).catch(()=>({})));
  if(actor.isStopped())return fail('Stopped');
  if(!collect.transactionid) {
    actor.log('RailOne UPI: collect order not created (no transactionid)','error');
    return fail('RailOne UPI collect request failed — please try again');
  }
  callOptional(actor.d,'onUpiCollect',()=>[deps.maskedVpa(vpa),collectAmount]);
  progress('railone:qr','Accept the UPI request in your app');
  const polled=await pollUntilPaid(run,client,order,preferences,collect.transactionid);
  if(polled.result)return polled.result;
  const status=polled.status;
  if(actor.isStopped()) {
    closeQr(actor);
    return fail('Stopped');
  }
  if(status&&status.paid&&status.encdata) {
    return verifyPaid({...run,response,collectAmount},order,status,{
      unverified:'RailOne UPI paid (verify host not configured)',
      confirmed:'RailOne UPI booking CONFIRMED — PNR ',
    });
  }
  closeQr(actor);
  return fail('UPI collect not approved in time — accept the request in your UPI app, then retry');
}

async function payRailOneQr(run) {
  const{actor,deps,progress,amount,fareBody}=run;
  actor.log('RailOne QR — offered banks (bankId:enableFlag): ['+deps.bankList(fareBody)+']','info');
  if(!deps.bankOffered(fareBody,'501')) {
    actor.log('RailOne QR (bankId 501 / SuperApp UPI PG) is NOT offered/enabled in bankDetailDTO for this account','error');
    return fail('RailOne QR is not available for this account — choose RailOne Wallet (or another method). (SuperApp UPI / bankId 501 wasn’t offered by IRCTC for this booking.)');
  }
  const quoted=deps.upiAmount(fareBody);
  const collectAmount=quoted?quoted:amount;
  actor.log('RailOne QR amount — UPI ₹'+collectAmount+' (regular ₹'+amount+')','info');
  progress('booking:fare',actor.fareAvail+'|'+collectAmount);
  progress('railone:pay','Payment Redirect Start…');
  const{response,failure}=await initPayment(run,()=>deps.upiBody(collectAmount),()=>deps.upiRawBody(collectAmount),body=>deps.terminalBody(body));
  if(failure)return failure;
  const order=deps.orderInfo(response.body);
  if(!order) {
    const reason=deps.initRejection(response.body);
    const log=actor.log;
    Reflect.apply(log,actor,['RailOne QR init rejected — '+(reason?reason:'no SuperApp PG handoff (no authToken / order)'),'error']);
    return fail(!reason?'RailOne QR payment init failed — please try again':"RailOne QR couldn't start: "+reason);
  }
  actor.log('RailOne QR order created — txn='+order.transationId+' bdorder='+order.orOrderid+' mercid='+order.mercid,'info');
  callOptional(actor.d,'onProxyOutcome',['working']);
  progress('railone:qr','Redirecting to QR…');
  const client=clientFor(run,order,false);
  const orders=deps.ordersView(await client.ordersGet(order.mercid,order.orOrderid).catch(()=>({})));
  const preferences=deps.prefView(await client.mercpref(order.mercid,order.orOrderid).catch(()=>({})));
  const intent=deps.transactionView(await client.transactionsOrder(order.mercid,order.orOrderid,orders.itemcode).catch(()=>({})));
  if(actor.isStopped())return fail('Stopped');
  if(!intent.transactionid||!intent.intentUpi) {
    const log=actor.log;
    Reflect.apply(log,actor,['RailOne QR: no UPI intent generated (tr='+(intent.transactionid?intent.transactionid:'none')+')','error']);
    return fail('RailOne QR QR not generated — please try again');
  }
  callOptional(actor.d,'onQr',[intent.intentUpi,collectAmount]);
  progress('railone:qr','Scan the QR to pay');
  const polled=await pollUntilPaid(run,client,order,preferences,intent.transactionid);
  if(polled.result)return polled.result;
  const status=polled.status;
  if(actor.isStopped()) {
    closeQr(actor);
    return fail('Stopped');
  }
  if(status&&status.paid&&status.encdata) {
    return verifyPaid({...run,response,collectAmount},order,status,{
      unverified:'RailOne QR paid (verify host not configured)',
      confirmed:'RailOne QR booking CONFIRMED — PNR ',
    });
  }
  closeQr(actor);
  return fail('UPI payment timed out — scan + pay within the timer, then retry');
}

module.exports={payRailOneWallet,payRailOneUpi,payRailOneQr,callOptional};
