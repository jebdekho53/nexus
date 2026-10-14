'use strict';

function loginPerformance(log=()=>{}) {
  return {
    async f698(original,[page,settings={}]) {
      // Keep the recovered popup handling. Shorten only its quiet period once
      // the application DOM is usable; slow/blocked pages retain the old path.
      try {
        await page.waitForFunction(()=>{
          const root=document.querySelector('app-root');
          if(document.readyState==='loading'||!root?.children.length)return false;
          if(!root.querySelector('header,nav,input,button,a'))return false;
          return ![...document.querySelectorAll('.loading-overlay,.ui-blockui,.block-ui-wrapper,.ngx-spinner-overlay')]
            .some(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        },undefined,{timeout:4000,polling:100});
        log('matrix-login-ready-short-wait');
        return original(page,{...settings,maxMs:Math.min(settings.maxMs??9000,1500),quietMs:200});
      } catch {
        return original(page,settings);
      }
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
