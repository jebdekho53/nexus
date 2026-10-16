'use strict';

// Recovered f150. Only checkout.razorpay.com style hosts keep their address; anything else
// (including cluster-internal names) is rewritten onto the public checkout host.
function razorpayLocation(location) {
  try {
    const url=new URL(location);
    if(/\.svc\.cluster\.local$/i.test(url.hostname)||!/(?:^|\.)razorpay\.com$/i.test(url.hostname))
      return 'https://checkout.razorpay.com'+url.pathname+url.search;
    return location;
  } catch {return location;}
}

// Recovered f1612. Reads the JSON_DATA block (or a bare JSON document) from the hosted checkout page.
function parseRazorpayCheckoutPage(html) {
  let source=(/\/\*+JSON_DATA_START\*+\/([\s\S]*?)\/\*+JSON_DATA_END\*+\//.exec(html)?.[1]??'').trim()
    .replace(/^(?:var|let|const|window\.)\s*[\w.]+\s*=\s*/,'').replace(/;\s*$/,'');
  if(!source.trim()&&/"order_id"|"key"\s*:/.test(html))source=html;
  let data={};
  try {data=JSON.parse(source);} catch {data={};}
  const url=data.url??{},notes={};
  for(const[key,value]of Object.entries(data.notes??{}))if(value!=null)notes[key]=String(value);
  return{
    keyId:String(data.key??data.key_id??''),
    orderId:String(data.order_id??data.orderId??''),
    amount:Number(data.amount??0),
    callbackUrl:String(url.callback??data.callback_url??''),
    notes,
    hostedId:'',
  };
}

const NAVIGATION_ACCEPT='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

// Recovered f1760 with callbacks f1761–f1763. Posts the encrypted data to the checkout page, follows a
// single redirect manually and extracts the order data. Diagnostics report only status codes, lengths
// and presence flags; hosts, identifiers, callback addresses and page text are never logged.
async function razorpayCheckout(actor,action,encdata,{resolveLocation,parseCheckout}) {
  const checkoutUrl=new URL(action||'/',actor.hosts.razorpay??actor.hosts.wps).toString();
  let origin='';
  try {origin=new URL(checkoutUrl).origin;} catch {}
  const refererOrigin=/checkout-hosted\./i.test(origin)?origin:actor.hosts.wps;
  const navigation=extra=>({origin:refererOrigin,referer:refererOrigin+'/',secFetchSite:'cross-site',extra});

  const response=await actor.reqRetry('razorpayCheckout',async()=>actor.req.post(checkoutUrl,{
    headers:await actor.gwHeaders('razorpay',navigation({
      'Content-Type':'application/x-www-form-urlencoded',Accept:NAVIGATION_ACCEPT,
      'sec-fetch-mode':'navigate','sec-fetch-dest':'document','Upgrade-Insecure-Requests':'1',
    })),
    form:{encdata},
    maxRedirects:0,
  }));
  const location=response.headers().location??'';
  let body;
  if(response.status()>=300&&response.status()<400&&location) {
    const orderUrl=resolveLocation(location);
    const page=await actor.reqRetry('razorpayOrderPage',async()=>actor.req.get(orderUrl,{
      headers:await actor.gwHeaders('razorpay',navigation({
        Accept:NAVIGATION_ACCEPT,'sec-fetch-mode':'navigate','sec-fetch-dest':'document','Upgrade-Insecure-Requests':'1',
      })),
    }));
    body=await page.text();
    actor.log('razorpayCheckout 302 → order page ('+body.length+'b, JSON_DATA='+body.includes('JSON_DATA_START')+')');
  } else {
    body=await response.text();
  }
  const checkout=parseCheckout(body);
  checkout.hostedId=/[?&]x_ranid=([^&]+)/.exec(location)?.[1]
    ??/[?&]x_ranid=([^&]+)/.exec(response.url())?.[1]
    ??/[?&]x_ranid=([^&]+)/.exec(checkoutUrl)?.[1]??'';
  let line='razorpayCheckout body: len='+body.length+' hasJSON_DATA='+body.includes('JSON_DATA_START');
  actor.log(line+' :: [body omitted]');
  line='razorpayCheckout → '+response.status()+' key='+(checkout.keyId?'y':'-')+' order='+(checkout.orderId?'y':'-')
    +' cb='+(checkout.callbackUrl?'y':'-')+' hosted='+(checkout.hostedId?'y':'-')+' notes='+Object.keys(checkout.notes).length;
  actor.snip(body);
  actor.log(line+' :: [response omitted]');
  return checkout;
}

module.exports={razorpayLocation,parseRazorpayCheckoutPage,razorpayCheckout};
