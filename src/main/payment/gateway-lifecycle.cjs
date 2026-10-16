'use strict';

async function disposeContext(actor, field) {
  const context = actor[field];
  // Relinquish ownership before awaiting disposal. An older completion must
  // never clear a replacement context created while disposal was pending.
  actor[field] = undefined;
  await context?.dispose().catch(() => {});
}

function disposeSurvivor(actor) { return disposeContext(actor, 'survivorReq'); }
function disposeDirectContext(actor) { return disposeContext(actor, 'directCtx'); }

function useProxiedRequest(actor, request) { actor.proxiedReq = request; }
function useSurvivorProxy(actor, proxy) { actor.survivorProxy = proxy; }
function setProxyFallback(actor, active, onFallback) { actor.proxyActive = active;actor.onFallback = onFallback; }

async function armSurvivor(actor, {getRequest,isFilteredCookie}) {
  if (actor.survivorReq) return true;
  try {
    const hints = await actor.clientHints();
    const cookies = await actor.page.context().cookies();
    const selected = actor.stripF5 ? cookies.filter(cookie => !isFilteredCookie(cookie.name)) : cookies;
    actor.survivorReq = await getRequest().newContext({
      ...(hints.ua ? {userAgent:hints.ua} : {}),
      ...(actor.survivorProxy?.server ? {proxy:{server:actor.survivorProxy.server,username:actor.survivorProxy.username||undefined,password:actor.survivorProxy.password||undefined}} : {}),
      storageState:{cookies:selected,origins:[]},
    });
    actor.log('settlement transport armed (' + selected.length + ' cookies) — the PNR fetch now survives a browser close');
    return true;
  } catch (error) {
    actor.log('could not arm the settlement transport: ' + error.message, 'warn');
    return false;
  }
}

async function ensureDirectContext(actor, {getRequest,isFilteredCookie}) {
  if (actor.directCtx) return actor.directCtx;
  const cookies = await actor.page.context().cookies().catch(() => []);
  const selected = actor.stripF5 ? cookies.filter(cookie => !isFilteredCookie(cookie.name)) : cookies;
  actor.directCtx = await getRequest().newContext({storageState:{cookies:selected,origins:[]}});
  return actor.directCtx;
}

function sleep(ms, timers=globalThis) {
  return new Promise(resolve => {
    const setTimeout = timers.setTimeout;
    setTimeout(resolve, ms);
  });
}

module.exports = {disposeSurvivor,disposeDirectContext,useProxiedRequest,useSurvivorProxy,setProxyFallback,armSurvivor,ensureDirectContext,sleep};
