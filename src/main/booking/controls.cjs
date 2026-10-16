'use strict';

// Recovered f2046. A cancellation is ignored once a PNR was seen or settlement started.
function cancelPayment(actor,reason) {
  if(actor.pnrSeen||actor.settlingPayment)return;
  actor.paymentCancelled=reason;
  actor.stopped=true;
  actor.cancelPnrWait?.();
}

// Recovered f2047. Ends any settling/final PNR request, then reports either the operator cancellation
// or the generic stopped result supplied by the bootstrap.
function stoppedResult(actor,{defaultResult}) {
  actor.endSettling();
  actor.endFinalPnrRequest();
  if(actor.paymentCancelled) {
    actor.onProgress('booking:error',actor.paymentCancelled);
    return{success:false,message:actor.paymentCancelled};
  }
  return defaultResult();
}

// Recovered f2063. Wait between high-load retries: the configured callback or 2000–3999 ms.
function highLoadDelay(actor,{random=Math.random}={}) {
  if(actor.opts.highLoadDelayMs)return actor.opts.highLoadDelayMs();
  return 2000+Math.floor(random()*2000);
}

// Recovered f2055. Brings the run's browser page to the front; failures are ignored.
async function focusBrowser(actor,{bringToFront}) {
  if(actor.session.page)await bringToFront(actor.session.page).catch(()=>undefined);
}

// Recovered f2057. Moves a locally owned browser off-screen so the operator uses the mini box.
async function hideBrowser(actor,{moveOffScreen}) {
  if(actor.session.page&&!actor.opts.vendorBrowser) {
    await moveOffScreen(actor.session.page,true).catch(()=>undefined);
    actor.log('booking','browser moved off-screen — operator interacts via the mini box (captcha/QR/status)');
  }
}

// Recovered f2049. Minimizes the run's browser window through the DevTools protocol; never throws.
async function minimizeBrowser(actor) {
  if(actor.session.page) {
    try {
      const page=actor.session.page;
      const cdp=await page.context().newCDPSession(page);
      const target=await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds',{windowId:target.windowId,bounds:{windowState:'minimized'}});
      await cdp.detach().catch(()=>undefined);
      actor.log('payment','minimized this run’s browser — pay via the QR in the mini box');
    } catch(error) {
      actor.log('payment','minimize failed (non-fatal): '+error.message,'warn');
    }
  }
}

// Recovered f2051. One request context per proxy identity; a different identity does not replace it.
async function controlProxyContext(actor,proxy,{createContext}) {
  if(!proxy?.server?.trim())return undefined;
  const key=proxy.server+'|'+(proxy.username||'')+'|'+(proxy.password||'');
  if(actor.controlReqCtx)return actor.controlReqCtxKey===key?actor.controlReqCtx:undefined;
  try {
    actor.controlReqCtx=await createContext(proxy);
    actor.controlReqCtxKey=key;
    return actor.controlReqCtx;
  } catch {return undefined;}
}

// Recovered f2052 with callbacks f2053–f2054. For proxied browser providers the gateway must not use
// page.request (it would leak the machine address), so a request context carrying the proxy and the
// page's live cookies replaces it. Failure falls back to page.request and is logged, never thrown.
async function routeGatewayThroughFormProxy(actor,{isFilteredCookie,normalizeProxy,bypass,playwright}) {
  if(!actor.gateway||actor.gatewayReqCtx)return;
  const session=actor.session;
  const proxied=session.cdpAttached===true||session.provider==='gologin';
  const proxy=session.proxy;
  if(!(proxied&&proxy?.server?.trim()&&session.page))return;
  try {
    const cookies=await session.page.context().cookies();
    const live=actor.opts.cookieF5?cookies.filter(cookie=>!isFilteredCookie(cookie.name)):cookies;
    const userAgent=await session.page.evaluate(()=>navigator.userAgent).catch(()=>'');
    const context=await playwright().request.newContext({
      ...(userAgent?{userAgent}:{}),
      proxy:{server:normalizeProxy(proxy.server),username:proxy.username||undefined,password:proxy.password||undefined,bypass:bypass()},
      storageState:{cookies:live,origins:[]},
    });
    actor.gatewayReqCtx=context;
    actor.gateway.useProxiedRequest(context);
    actor.log('gateway','gateway routed through the form proxy ('+session.provider+(session.cdpAttached?', attached':'')+': page.request would leak the machine IP → wps 403) with '+live.length+' live cookies');
  } catch(error) {
    actor.log('gateway','could not route the gateway via the form proxy ('+error.message+') — using page.request','warn');
  }
}

// Page-side collector for dumpAuthState (runs inside the booking page, so it cannot use module scope).
function collectAuthState() {
  const uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const describe=storage=>{
    const out={};
    try {
      for(let index=0;index<storage.length;index++) {
        const key=storage.key(index),value=storage.getItem(key)??'',match=value.match(uuid);
        if(match)out[key]=`UUID:${match[0].slice(0,10)}… len=${value.length}`;
        else if(/token|csrf|greq|auth|bearer|bmiyek|jwt/i.test(key))out[key]=`${value.slice(0,20)} len=${value.length}`;
        else out[key]=`len=${value.length}`;
      }
    } catch {}
    return out;
  };
  const win={};
  try {
    for(const name of ['accessToken','csrfToken','greq','bmiyek','token','authToken','access_token']) {
      const value=window[name];
      if(typeof value=='string')win[name]=value.slice(0,12);
    }
  } catch {}
  return{local:describe(localStorage),session:describe(sessionStorage),win};
}

// Recovered f2061 (+f2062). Debug dump of the page's storage with the collector's partial masking.
// Preserved as recovered; it logs short prefixes of token-like values, so leave it unused unless debugging.
async function dumpAuthState(actor,page) {
  try {
    const state=await page.evaluate(collectAuthState);
    actor.log('authdump','localStorage='+JSON.stringify(state.local));
    actor.log('authdump','sessionStorage='+JSON.stringify(state.session));
    actor.log('authdump','window='+JSON.stringify(state.win));
  } catch(error) {
    actor.log('authdump','dump failed: '+error.message,'warn');
  }
}

// Recovered f2059. Surfaces the browser and clicks the page's print control (UI-login runs only).
async function printTicketInBrowser(actor,{bringToFront}) {
  const page=actor.session.page;
  if(!(actor.session.mode==='uilogin'&&page))return false;
  try {
    await bringToFront(page);
    await actor.dismissPostBookingPopup(page);
    const control=page.locator('a.fa-print, a[title="Print Ticket"], [title="Print Ticket"], .fa-print').filter({visible:true}).first();
    if(await control.count()) {
      await control.click({timeout:5000}).catch(()=>undefined);
      actor.log('ui','Print Ticket: surfaced the browser + clicked the print control');
    } else {
      actor.log('ui','Print Ticket: print control not found — browser surfaced for a manual print','warn');
    }
    return true;
  } catch(error) {
    actor.log('ui','Print Ticket failed: '+error.message,'warn');
    return false;
  }
}

// Recovered f2079 (+f2080). Ends settlement, optionally asks the AI helper to recover a dead session, and
// reports the run as stopped.
async function stopWith(actor,reason,options,{shouldRecover}) {
  actor.endSettling();
  actor.endFinalPnrRequest();
  if(actor.stuck) {
    actor.onProgress('booking:stuck','Waiting for Response…');
    return{success:false,message:'Stopped: '+reason,stuck:true};
  }
  if(!actor.stopped) {
    if(shouldRecover(reason,!!actor.ai,!!options?.noRelaunch)) {
      await actor.aiResolve('Recover the dead session so the booking can continue (relaunch on a fresh browser if needed).',reason);
      if(actor.relaunch)return{success:false,message:'Stopped: '+reason};
    }
  }
  if(actor.opts.hideBrowser??true)await actor.focusBrowser().catch(()=>undefined);
  actor.onProgress('booking:error','Stopped: '+reason);
  return{success:false,message:'Stopped: '+reason};
}

// Recovered f2081. Applies a mid-run edit of the live form and logs which fields changed.
function updateLiveForm(actor,patch) {
  const form=actor.liveForm;
  if(!form)return undefined;
  const changes=[];
  for(const[field,label]of[['date','date='],['classCode','class='],['quota','quota='],['paymentMethod','pay=']]) {
    if(patch[field]!==undefined&&patch[field]!==form[field]) {
      form[field]=patch[field];
      changes.push(label+patch[field]);
    }
  }
  if(patch.paymentMethodDisplay!==undefined)form.paymentMethodDisplay=patch.paymentMethodDisplay;
  if(patch.upiId!==undefined)form.upiId=patch.upiId;
  if(patch.paymentMethod!==undefined||patch.paymentMethodDisplay!==undefined)
    actor.chosenPaymentMethod=form.paymentMethodDisplay||form.paymentMethod||'';
  if(changes.length)actor.log('edit','live edit applied (mid-run): '+changes.join(', '));
  return undefined;
}

// Recovered f2083 (+f2084–f2086). Refuses to continue without an access token; waits up to 90 s (checking
// every 500 ms, reporting every 10 s) for the operator to finish signing in, then stops the run.
async function ensureAuthToken(actor,{bringToFront,terminalClosed,terminalNoToken}) {
  const page=actor.session.page;
  if(!page)return true;
  const hasToken=()=>(actor.session.tokens?.accessToken??'').trim();
  if(hasToken())return true;
  const waitMs=90000;
  const started=actor.now();
  actor.log('login','NO access token — refusing to fire protected calls; waiting for the sign-in to complete','warn');
  actor.onProgress('booking:login','Waiting for sign-in to complete…');
  let reported=0;
  while(!actor.stopped&&actor.now()-started<waitMs) {
    if(page.isClosed()) {
      actor.terminal=terminalClosed();
      return false;
    }
    await page.waitForTimeout(500).catch(()=>undefined);
    if(hasToken()) {
      actor.log('login','access token captured after '+((actor.now()-started)/1000).toFixed(1)+'s — continuing');
      return true;
    }
    const tick=Math.floor((actor.now()-started)/10000);
    if(tick>reported) {
      reported=tick;
      actor.log('login','still waiting for the sign-in ('+(tick*10)+'s) — finish the login in the browser window','warn');
    }
  }
  if(!actor.stopped) {
    actor.log('login','no access token after the wait — stopping instead of booking an unauthenticated session','error');
    await bringToFront(page).catch(()=>undefined);
    actor.terminal=terminalNoToken();
  }
  return false;
}

// Recovered f2087 (+f2088–f2093). When the login form reappears the session was dropped: the run stops and
// asks to be relaunched on a fresh browser, unless the page is positively logged in.
async function relaunchIfLoggedOut(actor,{loginButtonVisible,positivelyLoggedIn,waitForHydration}) {
  const page=actor.session.page;
  if(!(page&&await loginButtonVisible(page).catch(()=>false)))return false;
  if(await positivelyLoggedIn(page).catch(()=>false)) {
    actor.log('login','LOGIN button present but the page is positively logged in (MY ACCOUNT / search form) — NOT relaunching');
    return false;
  }
  if(actor.session.tokens?.accessToken) {
    await page.waitForTimeout(2500).catch(()=>undefined);
    await waitForHydration(page).catch(()=>undefined);
    if((await positivelyLoggedIn(page).catch(()=>false))||!(await loginButtonVisible(page).catch(()=>false))) {
      actor.log('login','login button showed transiently after login but the SPA hydrated logged-in — NOT relaunching');
      return false;
    }
  }
  actor.log('login','login form reappeared (session dropped) — relaunching on a fresh browser to re-login','warn');
  actor.onProgress('booking:error','Session dropped (login form reappeared) — re-logging in on a fresh browser');
  actor.relaunch=true;
  actor.stopped=true;
  return true;
}

module.exports={ensureAuthToken,relaunchIfLoggedOut,dumpAuthState,printTicketInBrowser,stopWith,updateLiveForm,collectAuthState,controlProxyContext,routeGatewayThroughFormProxy,cancelPayment,stoppedResult,highLoadDelay,focusBrowser,hideBrowser,minimizeBrowser};
