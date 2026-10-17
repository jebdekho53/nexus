'use strict';

// Booking run controls. The run-control logic (cancel/stop, browser window handling, live-form edits, sign-in waiting,
// session-drop and duplicate-login detection, AI hand-off, print control) is TypeScript: src/ts/main/booking/run-controls.ts.
// What stays here is the gateway proxy routing with its cookie filtering, the high-load delay and the storage debug dump,
// which are kept as recovered and are not part of the TypeScript migration (see docs/typescript-migration.md).
const {loadTs}=require('../runtime/ts-build.cjs');
const {attachDuplicateLoginWatch,aiResolve,ensureAuthToken,relaunchIfLoggedOut,printTicketInBrowser,stopWith,updateLiveForm,cancelPayment,stoppedResult,focusBrowser,hideBrowser,minimizeBrowser}=loadTs('main/booking/run-controls');

// Recovered f2063. Wait between high-load retries: the configured callback or 2000–3999 ms.
function highLoadDelay(actor,{random=Math.random}={}) {
  if(actor.opts.highLoadDelayMs)return actor.opts.highLoadDelayMs();
  return 2000+Math.floor(random()*2000);
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

module.exports={attachDuplicateLoginWatch,aiResolve,ensureAuthToken,relaunchIfLoggedOut,dumpAuthState,printTicketInBrowser,stopWith,updateLiveForm,collectAuthState,controlProxyContext,routeGatewayThroughFormProxy,cancelPayment,stoppedResult,highLoadDelay,focusBrowser,hideBrowser,minimizeBrowser};
