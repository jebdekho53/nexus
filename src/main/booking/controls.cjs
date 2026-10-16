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
  try {
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
  } catch {}
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
  try {
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
  } catch {}
}

module.exports={controlProxyContext,routeGatewayThroughFormProxy,cancelPayment,stoppedResult,highLoadDelay,focusBrowser,hideBrowser,minimizeBrowser};
