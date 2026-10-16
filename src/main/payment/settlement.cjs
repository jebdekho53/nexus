'use strict';

async function settlePayment(actor,payment,responseKey,transactionId,journey,requireBankResponse=false,{normalizeProxy}={}) {
  if(actor.stopped&&payment.kind!=='paid')return actor.stoppedResult();
  const pendingMessage='Payment received — IRCTC is still processing it; your ticket MIGHT be booked. Check your IRCTC account before retrying (any amount debited is auto-refunded).';
  if(payment.kind==='paid'){
    actor.beginSettling();actor.opts.onQrClose?.();
    if(journey.paymentPause&&actor.opts.onConfirm){
      actor.onProgress('booking:payment','Payment received — awaiting your decision to hit the PNR…');
      const proceed=await actor.opts.onConfirm({kind:'payment-pause',detail:'You have paid. Choose to hit the PNR now, or stop (any amount debited is auto-refunded).'}).catch(()=>true);
      if(actor.stopped)return actor.stoppedResult();
      if(!proceed){actor.onProgress('booking:error','Payment stopped by user');return{success:false,message:'Payment stopped by user'};}
    }
    if(actor.gateway){
      actor.gateway.useSurvivorProxy(actor.session.proxy?.server?.trim()?{
        server:normalizeProxy(actor.session.proxy.server),username:actor.session.proxy.username,password:actor.session.proxy.password,
      }:undefined);
      await actor.gateway.armSurvivor().catch(()=>{});
    }
    actor.onProgress('booking:payment','Payment received — confirming your booking…');
    if(payment.encdata){
      const reachedConfirm=await actor.gateway.bankResponse(payment.encdata,responseKey).catch(()=>false);
      if(!reachedConfirm){
        actor.log('gateway','BankResponse did not reach booking-confirm — polling bookingData anyway (booking may still complete → clientUpdate)','warn');
        return actor.finishBooking(await actor.pollBookingData(transactionId,journey));
      }
    }else if(requireBankResponse){
      actor.log('gateway','PAID but no encdata for the mandatory BankResponse — best-effort PNR poll then check-account','error');
      const result=await actor.finishBooking(await actor.pollBookingData(transactionId,journey));
      if(result.success)return result;
      actor.onProgress('booking:error',pendingMessage);return{success:false,message:pendingMessage};
    }
    actor.onProgress('booking:payment','Generating your PNR…');
    return actor.finishBooking(await actor.pollBookingData(transactionId,journey));
  }
  if(payment.kind==='declined'){
    const message='Payment declined: '+payment.reason;actor.onProgress('booking:error',message);return{success:false,message};
  }
  if(payment.kind==='failed'){
    const message='Payment failed: '+payment.reason;actor.onProgress('booking:error',message);return{success:false,message};
  }
  if(payment.kind==='timeout'){
    const message='Payment timed out — check your UPI app and try again';actor.onProgress('booking:error',message);return{success:false,message};
  }
  if(payment.kind==='stopped')return actor.stoppedResult();
}
module.exports={settlePayment};
