'use strict';
const {runProviderQr}=require('../payment/provider-qr.cjs');
const {bookingPaymentUrl,bookingDataUrl}=require('../payment/request-url.cjs');
const {startPaytmWatch}=require('../payment/paytm-watch.cjs');
const {runPaytm}=require('../payment/paytm.cjs');
const {runPhonePe}=require('../payment/phonepe.cjs');
const {bookingPaymentBody}=require('../payment/request-body.cjs');
const {isBankProcessingError,paymentResponseError,isBrowserClosedError}=require('../payment/payment-error.cjs');
const {paymentCandidates,choosePaymentBank}=require('../payment/gateway-selection.cjs');
const {runRazorpay}=require('../payment/razorpay.cjs');
const {initializePayment}=require('../payment/payment-init.cjs');
const {dispatchPayment}=require('../payment/gateway-dispatch.cjs');
const {settlePayment}=require('../payment/settlement.cjs');
const {canRequestPnr,waitForPnrRetry}=require('../payment/pnr-lifecycle.cjs');
const {pollBookingData}=require('../payment/booking-data.cjs');
const {emptyBooking,normalizeBooking}=require('../payment/booking-result.cjs');
const {bookingRetryDelay}=require('../payment/retry-delay.cjs');
const {sessionTokens,paymentPageReferrer,paymentRequestId}=require('../payment/session-context.cjs');
const {finishBooking,finishBookingCore}=require('../payment/finish-booking.cjs');
const {attachPrintTicket}=require('../payment/print-ticket.cjs');
const {requestBookingData,requestPrintTicket}=require('../payment/gateway-requests.cjs');
const {gatewayHeaders}=require('../payment/gateway-headers.cjs');
const {retryGatewayRequest}=require('../payment/gateway-retry.cjs');
const {clientHints,gatewayHints,liveProviderOrigin,setGatewayPageOrigin,gatewayPageReferrer,originFor}=require('../payment/gateway-session.cjs');
const {disposeSurvivor,disposeDirectContext}=require('../payment/gateway-lifecycle.cjs');
const {createHash}=require('node:crypto');
const contracts=require('../payment/recovered-contract.json');

// Development-only migration switch. The installed release retains the old
// implementation until the reconstructed path has also had service validation.
function reconstructedPayment({development=false,managedRelease=false,enabled=false,definitions,dependencies={}}={}) {
  if(!development||managedRelease||!enabled)return {};
  definitions??=require('../generated/index.cjs');
  for(const[id,expected]of Object.entries(contracts)){
    const actual=definitions[id];
    if(!actual||actual.nativeId!==expected.nativeId||createHash('sha256').update(JSON.stringify({kind:actual.kind,parameterCount:actual.parameterCount,constants:actual.constants,code:actual.code})).digest('hex')!==expected.sha256)
      throw new Error('Reconstructed payment contract changed for '+id+'. Review the recovered definition and comparison tests before enabling this candidate.');
  }
  return {
    f1621:()=>function(){return disposeSurvivor(this);},
    f1630:()=>function(){return disposeDirectContext(this);},
    f1659:()=>function(){return liveProviderOrigin(this);},
    f1660:()=>function(){return clientHints(this);},
    f1662:()=>function(){return gatewayHints(this);},
    f1663:()=>function(url){return setGatewayPageOrigin(this,url);},
    f1664:()=>function(){return gatewayPageReferrer(this);},
    f1665:()=>function(host){return originFor(this,host);},
    f152:()=>isBrowserClosedError,
    f1666:()=>function(host,options){return gatewayHeaders(this,host,options);},
    f1756:({readBinding})=>function(label,operation,maxAttempts,stopRetry){return retryGatewayRequest(this,label,operation,maxAttempts,stopRetry,{isBrowserClosed:error=>readBinding(139,undefined,1)(error),timers:dependencies.timers});},
    f1719:()=>function(input){return requestBookingData(this,input);},
    f1727:()=>function(input){return requestPrintTicket(this,input);},
    f2230:()=>function(){return sessionTokens(this);},
    f2231:()=>function(){return paymentPageReferrer(this);},
    f2232:()=>function(){return paymentRequestId(this,dependencies);},
    f2243:()=>function(booking){return finishBooking(this,booking);},
    f2233:()=>function(booking){return finishBookingCore(this,booking,dependencies);},
    f2247:()=>function(booking){return attachPrintTicket(this,booking);},
    f510:({readBinding})=>function(transactionId,insuranceApplicable){
      return bookingPaymentUrl(readBinding(345,'rt'),transactionId,insuranceApplicable);
    },
    f535:({readBinding})=>function(method,amount,bankOverride){
      return bookingPaymentBody(method,amount,bankOverride,key=>readBinding(386)(key));
    },
    f545:()=>isBankProcessingError,
    f554:()=>emptyBooking,
    f547:({readBinding})=>function(transactionId){return bookingDataUrl(readBinding(345,'rt'),transactionId);},
    f548:()=>bookingRetryDelay,
    f549:({readBinding})=>function(response){
      return normalizeBooking(response,{extractError:value=>readBinding(396)(value),empty:()=>readBinding(400)()});
    },
    f2220:()=>function(){return canRequestPnr(this);},
    f2221:()=>function(ms){return waitForPnrRetry(this,ms,dependencies.timers);},
    f2226:({readBinding})=>function(transactionId,journey,maxAttempts){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return pollBookingData(this,transactionId,journey,maxAttempts,{bookingDataUrl:binding(397),retryAfter:binding(398),normalizeBooking:binding(399)},dependencies);
    },
    f2172:({readBinding})=>function(journey,transactionId,amount,excluded){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return initializePayment(this,journey,transactionId,amount,excluded,{
        getCandidates:binding(394),chooseBank:binding(393),buildPaymentBody:binding(387),
        buildPaymentUrl:binding(362),isBankError:binding(395),extractError:binding(396),stoppedResult:binding(940),
      },dependencies);
    },
    f546:()=>paymentResponseError,
    f2181:({readBinding})=>function(payment,responseKey,transactionId,journey,requireBankResponse){
      return settlePayment(this,payment,responseKey,transactionId,journey,requireBankResponse,{normalizeProxy:value=>readBinding(561,undefined,1)(value)});
    },
    f2176:({readBinding})=>function(journey,transactionId,amount,method,initResponse){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return dispatchPayment(this,journey,transactionId,amount,method,initResponse,{
        extractError:binding(396),normalizeBooking:binding(399),stoppedResult:binding(940),
      });
    },
    f542:({readBinding})=>function(table,method){
      return choosePaymentBank(table,method,{getIds:()=>readBinding(388,'cT'),defaultBankId:key=>readBinding(386)(key),hasBank:(data,id)=>readBinding(391)(data,id)});
    },
    f544:({readBinding})=>function(selected,table){
      return paymentCandidates(selected,table,{getOrder:()=>readBinding(389,'Zu'),isAvailable:(data,key)=>readBinding(392)(data,key)});
    },
    f2186:()=>function(journey,transactionId,amount){return runProviderQr(this,journey,transactionId,amount,dependencies);},
    f2193:()=>function(journey,transactionId,amount){return runPaytm(this,journey,transactionId,amount,dependencies);},
    f2208:()=>function(journey,transactionId,amount){return runPhonePe(this,journey,transactionId,amount,dependencies);},
    f2213:()=>function(journey,transactionId,amount,flow){return runRazorpay(this,journey,transactionId,amount,flow,dependencies);},
    f2196:({readBinding})=>function(resolve){
      return startPaytmWatch(resolve,readBinding(2),readBinding(4),readBinding(5),readBinding(6));
    },
  };
}
module.exports={reconstructedPayment};
