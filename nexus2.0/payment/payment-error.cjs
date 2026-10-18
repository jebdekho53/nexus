'use strict';

function isBankProcessingError(response) {
  const message=typeof response==='string'?response:String(response?.errorMessage??response?.error??response?.message??'');
  return /unable to process payment|issue at bank end|unable to process the request due to issue at bank/i.test(message);
}
function paymentResponseError(response) {
  if(typeof response==='string')return '';
  const body=response??{};
  for(const key of ['errorMessage','errorMsg','error_description','error']){
    const value=body[key];
    if(typeof value==='string'&&value.trim())return value.trim();
  }
  return '';
}
function isBrowserClosedError(error) {
  const message=error instanceof Error?error.message:String(error??'');
  return !!message&&/Request context disposed|Target (?:page|context|browser)[\s\S]{0,40}has been closed|Target closed|browser has been closed|has been closed|Execution context was destroyed|Protocol error[\s\S]{0,30}(?:Target closed|Session closed)/i.test(message);
}
module.exports={isBankProcessingError,paymentResponseError,isBrowserClosedError};
