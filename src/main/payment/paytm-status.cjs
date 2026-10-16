'use strict';

async function pollPaytmStatus(actor,mid,orderId,stopped,onWait,maxAttempts=800,{getField}) {
  const referer=actor.hosts.paytm+'/oltp-web/processTransaction?orderid='+encodeURIComponent(orderId);
  const path='/theia/transactionStatus?MID='+encodeURIComponent(mid)+'&ORDER_ID='+encodeURIComponent(orderId);
  for(let attempt=0;attempt<maxAttempts&&!stopped();attempt++) {
    await actor.sleep(attempt===0?2500:2000);
    onWait?.();
    let text='';
    const inPage=await actor.paytmInPageFetch(path,{method:'GET',referer}).catch(()=>null);
    if(inPage&&inPage.status>=200&&inPage.status<300)text=inPage.text;
    else {
      const response=await actor.req.get(''+actor.hosts.paytm+path,{headers:await actor.gwHeaders('paytm',{referer})}).catch(()=>null);
      if(!response||!response.ok())continue;
      text=await response.text().catch(()=>'');
    }
    if(/SUCCESS|TXN_SUCCESS|"status"\s*:\s*"SUCCESS"|status="SUCCESS"|Transaction Successful/i.test(text)) {
      actor.log('PayTM transactionStatus → SUCCESS (poll '+(attempt+1)+')');
      return {
        merchantId:getField(text,'merchantId')||mid,
        orderId:getField(text,'orderId')||orderId,
        paymentMode:getField(text,'paymentMode')||'UPI',
        topicName:getField(text,'topicName')||'DYNAMIC_QR',
        acquirementId:getField(text,'acquirementId'),
        cashierRequestId:getField(text,'cashierRequestId'),
        _id:getField(text,'_id')||mid+'_'+orderId,
        status:'SUCCESS',
      };
    }
    if(attempt===0||attempt%10===0) {
      const hints=(text.match(/RESPCODE[^<"]{0,32}|STATUS[^<"]{0,32}|txnStatus[^<"]{0,32}|resultStatus[^<"]{0,32}|TXN_[A-Z]+|acquirementId[^<"]{0,24}/)||[]).slice(0,5).join(' | ');
      const logger=actor.log;
      const message='PayTM transactionStatus poll '+(attempt+1)+(hints?' [status hints present]':' [no status hints — gateway shell]');
      actor.snip(text);
      logger.call(actor,message);
    }
  }
  return null;
}

module.exports={pollPaytmStatus};
