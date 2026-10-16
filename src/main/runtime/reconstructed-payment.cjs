'use strict';
const {runProviderQr}=require('../payment/provider-qr.cjs');
const {bookingPaymentUrl}=require('../payment/request-url.cjs');
const {startPaytmWatch}=require('../payment/paytm-watch.cjs');
const {runPaytm}=require('../payment/paytm.cjs');
const {runPhonePe}=require('../payment/phonepe.cjs');
const {bookingPaymentBody}=require('../payment/request-body.cjs');
const {isBankProcessingError,paymentResponseError}=require('../payment/payment-error.cjs');
const {paymentCandidates,choosePaymentBank}=require('../payment/gateway-selection.cjs');
const {runRazorpay}=require('../payment/razorpay.cjs');
const {initializePayment}=require('../payment/payment-init.cjs');
const {dispatchPayment}=require('../payment/gateway-dispatch.cjs');
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
    f510:({readBinding})=>function(transactionId,insuranceApplicable){
      return bookingPaymentUrl(readBinding(345,'rt'),transactionId,insuranceApplicable);
    },
    f535:({readBinding})=>function(method,amount,bankOverride){
      return bookingPaymentBody(method,amount,bankOverride,key=>readBinding(386)(key));
    },
    f545:()=>isBankProcessingError,
    f2172:({readBinding})=>function(journey,transactionId,amount,excluded){
      const binding=slot=>(...args)=>readBinding(slot,undefined,1)(...args);
      return initializePayment(this,journey,transactionId,amount,excluded,{
        getCandidates:binding(394),chooseBank:binding(393),buildPaymentBody:binding(387),
        buildPaymentUrl:binding(362),isBankError:binding(395),extractError:binding(396),stoppedResult:binding(940),
      },dependencies);
    },
    f546:()=>paymentResponseError,
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
