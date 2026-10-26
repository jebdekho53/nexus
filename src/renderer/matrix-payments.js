'use strict';
((root)=>{
  const labels=Object.freeze({paytm:'Paytm QR',phonepay:'PhonePe QR',phonepe:'PhonePe QR',razorpayqr:'Razorpay QR',irctcqr:'IRCTC QR',webwallet:'WebLogin Wallet',paytmupi:'Razorpay UPI'});
  const label=method=>labels[method]||String(method||'Not selected');
  const normalize=text=>{
    const clean=String(text).trim().replace(/^[📲🚆🌐↗️\s]+/u,'').replace(/\s*—\s*(?:Ultra Fast|Super Fast|Fast|RailOne only|WebLogin only)$/i,'');
    const match=Object.values(labels).find(value=>value.toLowerCase()===clean.toLowerCase());
    if(match)return match;
    if(/^PhonePay QR$/i.test(clean))return 'PhonePe QR';
    return text;
  };
  const catalog=Object.freeze({labels,label,normalize});
  if(typeof module==='object'&&module.exports)module.exports=catalog;else root.MATRIX_PAYMENTS=catalog;
})(globalThis);
