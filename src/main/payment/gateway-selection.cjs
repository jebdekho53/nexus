'use strict';

function paymentCandidates(selected,table,{getOrder,isAvailable}) {
  if(selected&&!['phonepay','paytm','irctcqr','razorpayqr','paytmupi'].includes(selected))return[selected];
  const candidates=[];
  if(selected&&isAvailable(table,selected))candidates.push(selected);
  for(const method of getOrder()){
    if(method!==selected&&isAvailable(table,method)&&!candidates.includes(method))candidates.push(method);
  }
  if(candidates.length===0)candidates.push(selected||getOrder()[0]);
  return candidates;
}
function choosePaymentBank(table,method,{getIds,defaultBankId,hasBank}) {
  const ids=getIds()[method]??[defaultBankId(method)];
  return ids.find(id=>hasBank(table,id))??ids[0];
}
module.exports={paymentCandidates,choosePaymentBank};
