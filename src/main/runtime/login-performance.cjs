'use strict';

function loginPerformance(log=()=>{},dependencies={}) {
  const now=dependencies.now||(()=>performance.now());
  return {
    async f698(original,[page,settings={}]) {
      if(await require('./private-browser.cjs').checkAccessDenied(page,log))throw new Error(require('./private-browser.cjs').denialMessage);
      // Readiness probing consumes the existing settle budget, not an extra
      // four seconds before that budget. Keep popup handling in one invocation.
      const started=now(),budget=Number.isFinite(settings.maxMs)?Math.max(0,settings.maxMs):9000;
      let ready=false;
      try {if(budget>0){
        await page.waitForFunction(()=>{
          const root=document.querySelector('app-root');
          if(document.readyState==='loading'||!root?.children.length)return false;
          if(!root.querySelector('header,nav,input,button,a'))return false;
          return ![...document.querySelectorAll('.loading-overlay,.ui-blockui,.block-ui-wrapper,.ngx-spinner-overlay')]
            .some(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        },undefined,{timeout:Math.min(4000,budget),polling:100});
        ready=true;
      }} catch {}
      const probeMs=Math.max(0,now()-started),remaining=Math.max(0,budget-probeMs);
      const options={...settings,maxMs:ready?Math.min(remaining,1500):remaining,...(ready?{quietMs:Math.min(settings.quietMs??2600,200)}:{})};
      if(ready)log('matrix-login-ready-short-wait');
      try{return await original(page,options);}
      finally{log('matrix-login-settle-timing',{ready,probeMs:Math.round(probeMs),handlerBudgetMs:Math.round(options.maxMs),durationMs:Math.round(Math.max(0,now()-started))});}
    },
    async f583(original,[actor,field,value]) {
      // Playwright fill dispatches input/change and checks editability.
      try {
        await field.fill(value,{timeout:5000});
        if(await field.inputValue()===value) {
          log('matrix-login-field-fill-verified');
          return true;
        }
      } catch {}
      return original(actor,field,value);
    },
  };
}
module.exports={loginPerformance};
