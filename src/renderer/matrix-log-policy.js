'use strict';
(()=>{
 const isBookingStage=name=>/^(weblogin|booking|search|ui|railone|payment|gologin|browser)(:|$)/.test(String(name||''));
 function isBookingRecord(event,details={}){
  if(/^matrix-(?:browser-|private-|irctc-|login-|payment-|qr-|csrf-|warmup-|booking-|eticket-|proxy-|general-|special-train-)/.test(event))return true;
  return /^(?:action-start|action-end|development-ipc-error)$/.test(event)&&/^app:(?:login|start-booking|stop-run|logout)(?:\s|$)/.test(String(details.page||''));
 }
 const isBookingRow=row=>!!row&&(isBookingStage(row.stage)||isBookingRecord(row.stage,{page:row.message}));
 const policy={isBookingStage,isBookingRecord,isBookingRow};
 if(typeof module==='object'&&module.exports)module.exports=policy;
 else globalThis.MatrixLogPolicy=policy;
})();
