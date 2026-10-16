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
const {createHash}=require('node:crypto');
const contracts=require('../payment/recovered-contract.json');

// Development-only migration switch. The installed release retains the old
// implementation until the reconstructed path has also had service validation.
function reconstructedPayment({development=false,managedRelease=false,enabled=false,definitions}={}) {
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
    f546:()=>paymentResponseError,
    f542:({readBinding})=>function(table,method){
      return choosePaymentBank(table,method,{getIds:()=>readBinding(388,'cT'),defaultBankId:key=>readBinding(386)(key),hasBank:(data,id)=>readBinding(391)(data,id)});
    },
    f544:({readBinding})=>function(selected,table){
      return paymentCandidates(selected,table,{getOrder:()=>readBinding(389,'Zu'),isAvailable:(data,key)=>readBinding(392)(data,key)});
    },
    f2186:()=>function(...args){return runProviderQr(this,...args);},
    f2193:()=>function(...args){return runPaytm(this,...args);},
    f2208:()=>function(...args){return runPhonePe(this,...args);},
    f2213:()=>function(...args){return runRazorpay(this,...args);},
    f2196:({readBinding})=>function(resolve){
      return startPaytmWatch(resolve,readBinding(2),readBinding(4),readBinding(5),readBinding(6));
    },
  };
}
module.exports={reconstructedPayment};
