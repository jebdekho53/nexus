'use strict';

function showPaytmProgress() {
  try {
    document.title='Processing payment…';
    document.body.innerHTML='<div style="font:600 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d4ed8;text-align:center;margin-top:34vh">Finalizing your booking…</div>';
    document.body.style.background='#ffffff';
  } catch {}
}

async function paytmOriginPage(actor,globals=globalThis) {
  if(actor.paytmPage&&!actor.paytmPage.isClosed())return actor.paytmPage;
  try {
    const page=await actor.page.context().newPage();
    await page.goto(actor.hosts.paytm+'/',{waitUntil:'domcontentloaded',timeout:15000}).catch(()=>{});
    if(new globals.URL(page.url()).origin!==new globals.URL(actor.hosts.paytm).origin) {
      await page.close().catch(()=>{});
      return null;
    }
    await page.evaluate(showPaytmProgress).catch(()=>{});
    actor.paytmPage=page;
    return page;
  } catch {return null;}
}

async function requestInPaytmPage({url,method,body,referer}) {
  try {
    const options={method,credentials:'include'};
    if(referer)options.referrer=referer;
    if(method==='POST') {
      options.headers={'Content-Type':'application/x-www-form-urlencoded'};
      options.body=body||'';
    }
    const response=await fetch(url,options);
    return{status:response.status,text:await response.text()};
  } catch {return{status:0,text:''};}
}

async function paytmPageRequest(actor,path,options) {
  const page=await actor.paytmOriginPage();
  if(!page)return null;
  const url=''+actor.hosts.paytm+path;
  return page.evaluate(requestInPaytmPage,{url,method:options.method,body:options.body,referer:options.referer}).catch(()=>null);
}

async function disposePaytmPage(actor) {
  const page=actor.paytmPage;
  actor.paytmPage=undefined;
  if(page&&!page.isClosed())await page.close().catch(()=>{});
}

module.exports={showPaytmProgress,paytmOriginPage,requestInPaytmPage,paytmPageRequest,disposePaytmPage};
