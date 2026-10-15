'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AsyncLocalStorage}=require('node:async_hooks');
const loginScope=new AsyncLocalStorage();
const denialMessage='IRCTC denied this browser session at its security challenge. Login was stopped; an IP block has not been confirmed.';
function canonicalEntry(value){
  try{
    const url=new URL(value);
    if(url.protocol==='https:'&&url.host==='www.irctc.co.in'&&url.pathname==='/'&&!url.search&&!url.hash){url.pathname='/nget/';return url.href;}
  }catch{}
  return value;
}
async function checkAccessDenied(page,log=()=>{},state=loginScope.getStore()){
  if(typeof page?.evaluate!=='function')return false;
  let denied=false;
  try{denied=await page.evaluate(()=>/access denied/i.test(document.title)&&/(_sec\/cpr\/challenge|errors\.edgesuite\.net)/i.test(document.body?.innerText||''));}catch{}
  if(denied){if(state)state.denied=true;log('matrix-irctc-access-denied',{message:denialMessage});}
  return denied;
}
async function withPrivateLogin(invoke){
  return loginScope.run({denied:false,disposers:new Set()},async()=>{
    const state=loginScope.getStore();let result;
    try{result=await invoke();}catch(error){if(!state.denied)throw error;}
    if(!state.denied)return result;
    await Promise.allSettled([...state.disposers].map(dispose=>dispose()));
    return {ok:false,error:denialMessage,code:'IRCTC_ACCESS_DENIED'};
  });
}

// Native Chromium providers share f184. Keep browser discovery/proxy/process
// ownership in the recovered launcher, but never browse in its disk profile.
function privateBrowser(log=()=>{},dependencies={}) {
  const files=dependencies.fs||fs;
  const freshLogin=(original,[credentials,options={}])=>original(credentials,{...options,cookieState:undefined,cookieStatePool:undefined});
  return {
    // A fresh private context must not subsequently receive a saved cookie jar.
    f811:freshLogin,
    f829:freshLogin,
    async f184(original,[options={}]) {
      const state=loginScope.getStore();
      if(state?.denied)throw new Error(denialMessage);
      const directory=await files.mkdtemp(path.join(dependencies.tmpdir||os.tmpdir(),'matrix-private-'));
      let session,context,disposal;
      const cleanup=async()=>{
        try {await files.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
        catch(error){log('matrix-private-cleanup-pending',{error:String(error.code||'cleanup failed')});throw error;}
      };
      const dispose=()=>disposal??=Promise.resolve().then(async()=>{
        try {await context?.close();}
        finally {try{await session?.dispose();}finally{await cleanup();}}
        log('matrix-private-session-closed');
      });
      try {
        session=await original({...options,userDataDir:directory});
        const browser=session?.context?.browser();
        if(typeof browser?.newContext!=='function')throw new Error('Native browser cannot create a private session');
        // Browser.newContext is Chromium's off-the-record (Incognito) context.
        // Do not copy storageState, cookies, user agents or profile init scripts.
        context=await browser.newContext({viewport:null,...(options.proxy?.server?{proxy:options.proxy}:{})});
        const page=await context.newPage();
        // The legacy login preflight visits the site's bare origin before the
        // SPA. Use its supported application entry, as a normal bookmark does.
        // Challenge URLs and denied responses are never rewritten or retried.
        if(typeof page.goto==='function'){
          const goto=page.goto.bind(page);
          page.goto=(url,...args)=>{
            const entry=canonicalEntry(url);
            if(entry!==url)log('matrix-irctc-canonical-entry',{path:'/nget/'});
            return goto(entry,...args);
          };
        }
        for(const oldPage of session.context.pages())await oldPage.close().catch(()=>{});
        context.once('close',()=>{dispose().catch(()=>{});});
        browser.once('disconnected',()=>{dispose().catch(()=>{});});
        state?.disposers.add(dispose);
        page.on('domcontentloaded',()=>{checkAccessDenied(page,log,state).catch(()=>{});});
        log('matrix-private-session-created',{persistent:false,proxy:!!options.proxy?.server});
        if(dependencies.onCreated)await dependencies.onCreated({page,context,browser,dispose,directory});
        return {...session,context,page,dispose};
      } catch(error) {
        await dispose().catch(()=>{});
        throw error;
      }
    },
  };
}
module.exports={privateBrowser,withPrivateLogin,checkAccessDenied,denialMessage,canonicalEntry};
