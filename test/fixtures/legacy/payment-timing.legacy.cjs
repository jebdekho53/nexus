'use strict';
// Observe only: never retain URLs, query strings, bodies, headers or credentials.
function observePaymentTiming(context,log=()=>{},now=()=>performance.now()) {
  if(typeof context?.on!=='function')return;
  const pending=new WeakMap();let sequence=0;
  const emit=(event,data)=>{try{log(event,data);}catch{}};
  const request=req=>{
    let endpoint;
    try{
      const url=new URL(req.url());
      if(url.protocol!=='https:'||!/(^|\.)irctc\.co\.in$/i.test(url.hostname))return;
      endpoint=url.pathname.match(/\/(allLapAvlFareEnq|addonServices|bookingInitPayment|boardingStationEnq)(?:\/|$)/)?.[1];
    }catch{return;}
    if(!endpoint)return;
    const record={id:++sequence,endpoint,started:now()};pending.set(req,record);
    emit('matrix-payment-request-start',{id:record.id,endpoint});
  };
  const finish=(req,failed)=>{
    const record=pending.get(req);if(!record)return;pending.delete(req);
    emit('matrix-payment-request-end',{id:record.id,endpoint:record.endpoint,durationMs:Math.round(Math.max(0,now()-record.started)),failed});
  };
  const response=res=>{
    const record=pending.get(res.request());if(!record)return;
    emit('matrix-payment-response',{id:record.id,endpoint:record.endpoint,status:res.status(),responseMs:Math.round(Math.max(0,now()-record.started))});
  };
  context.on('request',request);context.on('response',response);
  context.on('requestfinished',req=>finish(req,false));context.on('requestfailed',req=>finish(req,true));
}
function paymentTiming(log=()=>{},now=()=>performance.now()) {
  let sequence=0;
  const emit=(event,data)=>{try{log(event,data);}catch{}};
  return Object.fromEntries(Object.entries({f2172:'payment-init',f2176:'gateway-dispatch',f2186:'provider-qr'}).map(([id,step])=>[id,async(original,args)=>{
    const requestId=++sequence,started=now();let failed=true;
    emit('matrix-payment-step-start',{requestId,step});
    try{const result=await original(...args);failed=false;return result;}
    finally{emit('matrix-payment-step-end',{requestId,step,durationMs:Math.round(Math.max(0,now()-started)),failed});}
  }]));
}
module.exports={observePaymentTiming,paymentTiming};
