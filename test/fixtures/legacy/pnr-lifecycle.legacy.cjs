'use strict';

function canRequestPnr(actor) {
  return !actor.stopped&&!actor.terminal&&!actor.securityQuarantined&&
    (!actor.session.page?.isClosed()||actor.isSettlingPayment());
}
function waitForPnrRetry(actor,ms,timers=globalThis) {
  if(!actor.canRequestPnr())return Promise.resolve(false);
  return new Promise(resolve=>{
    const finish=resume=>{
      timers.clearTimeout(timer);
      if(actor.cancelPnrWait===cancel)actor.cancelPnrWait=undefined;
      resolve(resume&&actor.canRequestPnr());
    };
    const cancel=()=>finish(false);
    const timer=timers.setTimeout(()=>finish(true),ms);
    actor.cancelPnrWait=cancel;
  });
}
module.exports={canRequestPnr,waitForPnrRetry};
