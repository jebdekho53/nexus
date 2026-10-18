'use strict';

function gatewayRequest(actor, {prepareCookies,isTlsHost,isBrowserClosed,isProxyNetworkError,canFallbackRequest,getConfig}) {
  const request=actor.proxiedReq ?? actor.page.request;

  async function prepare() {
    if (actor.stripF5 && !actor.proxiedReq) {
      await prepareCookies(actor.page.context()).catch(()=>{});
    }
  }

  async function send(method,url,input) {
    await prepare();
    const options={...(input??{}),timeout:input?.timeout??0};
    let host='';
    try { host=new URL(url).hostname.toLowerCase(); } catch {}
    if (actor.directHosts.has(host)) {
      const direct=await actor.directContext();
      return direct[method](url,options);
    }
    if (actor.browserGone && actor.survivorReq) return actor.survivorReq[method](url,options);

    if (actor.webTlsGateway && isTlsHost(host) && !actor.browserGone) {
      try {
        const response=await actor.sendViaWebTlsGateway(method,url,options);
        await actor.record(method+'*+tls',url,options,response);
        return response;
      } catch (error) {
        actor.log('gateway transport unavailable for '+host+' — using the normal path ('+String(error?.message??error).slice(0,70)+')','warn');
      }
    }

    try {
      const response=await request[method](url,options);
      actor.failStreak.delete(host);
      actor.logSetCookies(host,url,response);
      await actor.record(method,url,options,response);
      return response;
    } catch (error) {
      await actor.record(method,url,options,null,error);
      if (isBrowserClosed(error)) {
        actor.browserGone=true;
        if (actor.survivorReq) {
          actor.log('the browser closed mid-call — continuing '+host+' on the settlement transport','warn');
          return actor.survivorReq[method](url,options);
        }
        throw error;
      }
      if (!actor.proxyActive || !isProxyNetworkError(error) || !canFallbackRequest(url)) throw error;
      const failures=(actor.failStreak.get(host)??0)+1;
      actor.failStreak.set(host,failures);
      if (failures<getConfig().FALLBACK_AFTER) throw error;
      actor.directHosts.add(host);
      actor.log('PROXY FALLBACK: '+host+' is unreachable through your proxy — that host is going direct for this run','error');
      actor.onFallback?.(host);
      const direct=await actor.directContext();
      return direct[method](url,options);
    }
  }

  return {get:(url,options)=>send('get',url,options),post:(url,options)=>send('post',url,options)};
}

module.exports={gatewayRequest};
