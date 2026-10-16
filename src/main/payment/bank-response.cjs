'use strict';

function interstitialDelay(html) {
  const full=/setTimeout\s*\(\s*function\s*\(\s*\)\s*\{[\s\S]*?\.submit\(\s*\)\s*;?[\s\S]*?\}\s*,\s*(\d+)\s*\)/.exec(html);
  if (full) return Number.parseInt(full[1],10);
  const compact=/setTimeout\s*\([\s\S]*?\.submit\(\s*\)[\s\S]*?,\s*(\d+)\s*\)/i.exec(html);
  return compact?Number.parseInt(compact[1],10):0;
}

async function bankResponse(actor, payload, responseKey='encdata', {isBrowserClosed,parseDelay}) {
  const url=actor.hosts.wps+'/eticketing/BankResponse';
  let withForm=true,emptyResponses=0,networkErrors=0;
  const origin=actor.bankResponseOrigin();
  while (true) {
    let response;
    try {
      response=await actor.req.post(url,{
        headers:await actor.gwHeaders('wps',{navigate:true,...(origin??{}),...(origin?{secFetchSite:'cross-site'}:{})}),
        timeout:0,
        ...(withForm?{form:{[responseKey]:payload}}:{}),
      });
    } catch (error) {
      if (isBrowserClosed(error)) {
        actor.log('bankResponse could not complete — the browser was closed and no settlement transport was armed','error');
        return false;
      }
      if (++networkErrors>3) { actor.log('bankResponse network errors exhausted');return false; }
      actor.log('bankResponse network error ('+error.message+') — retry '+networkErrors+'/3');
      withForm=false;
      await actor.sleep(3000);
      continue;
    }
    if (/booking-confirm/i.test(response.url())) { actor.log('bankResponse → booking-confirm');return true; }
    const html=await response.text().catch(()=>'');
    if (/booking-confirm/i.test(html)) { actor.log('bankResponse → booking-confirm (body)');return true; }
    const delay=parseDelay(html);
    if (delay) {
      actor.log('bankResponse interstitial → waiting the full '+delay+'ms then re-submitting bodiless');
      withForm=false;emptyResponses=0;
      await actor.sleep(delay);
      continue;
    }
    if (response.status()!==200) {
      actor.log('bankResponse non-200 ('+response.status()+') — chain still in flight, keep following');
      withForm=false;
      await actor.sleep(3500);
      continue;
    }
    if (++emptyResponses>2) break;
    actor.log('bankResponse: 200 no interstitial/redirect — retry '+emptyResponses+'/2');
    withForm=false;
    await actor.sleep(7000);
  }
  actor.log('bankResponse exhausted without booking-confirm');
  return false;
}

module.exports={interstitialDelay,bankResponse};
