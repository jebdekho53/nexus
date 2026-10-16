'use strict';

// The spelling and the empty insured value are the provider's existing wire
// contract. Preserve JavaScript concatenation; do not re-encode identifiers.
function bookingPaymentUrl(apiBase,transactionId,insuranceApplicable) {
  return apiBase+'/bookingInitPayment/'+transactionId+'?insurenceApplicable='+(insuranceApplicable?'':'NA');
}
function bookingDataUrl(apiBase,transactionId){return apiBase+'/bookingData/'+transactionId;}
module.exports={bookingPaymentUrl,bookingDataUrl};
