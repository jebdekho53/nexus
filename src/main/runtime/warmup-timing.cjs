'use strict';

const NEAR_SLOT_MS=5*60*1000;

// TS 1.0.78 extends the recovered pre-slot exclusion to late starts as well.
// Intercept only the dummy UI helper: leave the target, form and actor options
// intact so the real booking still performs its own slot/authentication checks.
function nearOpening(actor,job) {
  if(actor?.session?.mode!=='weblogin'||!actor.opts?.akamaiWarmUp||actor.opts.resume)return null;
  try {
    const target=actor.resolveTarget?.(job);
    const now=actor.serverNow?.();
    if(!Number.isFinite(target?.ms)||!Number.isFinite(now))return null;
    const delta=target.ms-now;
    return delta>-NEAR_SLOT_MS&&delta<NEAR_SLOT_MS?delta:null;
  } catch {return null;}
}

function warmupTiming(log=()=>{}) {
  return {
    async f2136(original,args,actor) {
      const delta=nearOpening(actor,args[0]);
      if(delta===null)return original(...args);
      const message='warm-up SKIPPED — slot is '+Math.abs(Math.round(delta/1000))+'s '+(delta<0?'past':'away')+' → direct booking';
      try{actor.log?.('warmup',message,'warn');}catch{}
      try{log('matrix-warmup-slot-skip',{deltaMs:delta});}catch{}
      return undefined;
    },
  };
}

module.exports={NEAR_SLOT_MS,nearOpening,warmupTiming};
