'use strict';

function bookingPaymentBody(method,amount,bankOverride,defaultBankId) {
  const bankId=bankOverride??defaultBankId(method);
  if(method==='wallet')return {
    bankId,txnType:7,paramList:[{key:'TXN_PASSWORD',value:''}],
    amount:String(amount),transationId:0,txnStatus:1,
  };
  return{bankId,txnType:1,paramList:[],amount:String(amount),transationId:0,txnStatus:1};
}
module.exports={bookingPaymentBody};
