'use strict';

// Recovered f2255 (static). The provider's own site, including subdomains.
function providerOriginOk(url) {
  try {
    const host=new URL(url).host.toLowerCase();
    return host==='irctc.co.in'||host.endsWith('.irctc.co.in');
  } catch {return false;}
}

// Recovered f2256. True while there is no page or the page is on the provider origin; an unreadable URL counts
// as on-origin so a transient navigation never stops the run.
function onProviderPage(actor,{originCheck}) {
  if(!actor.session.page)return true;
  try {
    return originCheck(actor.session.page.url());
  } catch {return true;}
}

// Recovered f2257 (+f2258–f2261). When the operator left the provider site the run pauses (up to 10 minutes,
// polling every 700 ms) and resumes automatically once the provider page is back.
async function ensureOnProviderPage(actor,action) {
  if(actor.onProviderPage())return true;
  await actor.focusBrowser().catch(()=>undefined);
  actor.onProgress('booking:handover','Open the IRCTC train-search page in the browser to '+action+' — resumes automatically');
  const currentHost=()=>{
    try {return new URL(actor.session.page.url()).host;} catch {return '?';}
  };
  actor.log('availability','off the IRCTC origin ('+currentHost()+') — waiting for the operator to return to irctc.co.in','warn');
  const deadline=actor.now()+600000;
  while(!actor.stopped&&actor.now()<deadline) {
    await actor.session.page.waitForTimeout(700).catch(()=>undefined);
    if(actor.onProviderPage()) {
      actor.log('availability','back on the IRCTC page — resuming','info');
      if(actor.opts.hideBrowser??true)await actor.hideBrowser().catch(()=>undefined);
      return true;
    }
  }
  return false;
}

module.exports={providerOriginOk,onProviderPage,ensureOnProviderPage};
