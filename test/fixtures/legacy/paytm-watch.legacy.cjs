'use strict';

// The caller's Promise executor uses the first truthy payment result. A falsy
// WebSocket result must not discard a later successful polling response.
function startPaytmWatch(resolve,actor,gateway,redirect,orderId,timers=globalThis) {
  let pending=2,settled=false,timer;
  const finish=value=>{
    if(settled)return;
    settled=true;
    if(timer)timers.clearInterval(timer);
    resolve(value);
  };
  const accept=value=>{if(value)finish(value);};
  const completed=()=>{if(--pending===0)finish(null);};
  timer=timers.setInterval(()=>{if(actor.stopped)finish(null);},300);
  const stopped=()=>actor.stopped||settled||actor.pnrSeen;
  gateway.waitForPaytmWs(redirect.mid,orderId,undefined,stopped)
    .then(accept).catch(()=>{}).finally(completed);
  gateway.pollPaytmStatus(redirect.mid,orderId,stopped,()=>{
    if(!stopped())actor.onProgress('booking:payment','Awaiting PayTM payment…');
  }).then(accept).catch(()=>{}).finally(completed);
}
module.exports={startPaytmWatch};
