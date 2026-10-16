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

// Recovered f1764/f1765. The token may appear in an uppercase hex literal or as a window assignment.
// Only the status code and a presence flag are logged.
async function razorpaySessionToken(actor,keyId,newSession) {
  const url=(actor.hosts.razorpay??'')+'/v1/checkout/public?key_id='+encodeURIComponent(keyId)+(newSession?'&checkout_v2=1&new_session=1':'');
  const response=await actor.reqRetry('razorpaySessionToken',async()=>actor.req.get(url,{headers:await actor.gwHeaders('razorpay')}));
  const text=await response.text();
  const token=/session_token\s*[:=]\s*["']([A-F0-9]{40,})["']/i.exec(text)?.[1]
    ??/window\.session_token\s*=\s*["']([^"']+)["']/.exec(text)?.[1]??'';
  actor.log('razorpaySessionToken → '+response.status()+' token='+(token?'y':'-'));
  return token;
}
// Recovered f151. Poll addresses are kept on razorpay.com hosts and otherwise moved onto the checkout host.
function razorpayPollUrl(url,base) {
  if(!url)return '';
  try {
    const parsed=new URL(url);
    if(/(?:^|\.)razorpay\.com$/i.test(parsed.hostname))return parsed.toString();
    return 'https://'+new URL(base).host+parsed.pathname+parsed.search;
  } catch {return '';}
}

const presence=value=>value?'y':'-';

// Recovered f1766 with callbacks f1767–f1770. Builds the standard-checkout form for a UPI QR/intent
// payment and retries rate-limited (429) or server-side failures with the provider-required waits
// (limits come from the bootstrap constants: 100 rate-limit attempts, 3 error attempts, 3000 ms wait,
// plus a fixed 1500 ms pause between error retries). Diagnostics report only status codes and presence
// flags; payment identifiers, poll/intent addresses and provider error text are never logged although
// the snip helper still runs for its effects.
async function razorpayCreate(actor,order,{pollUrl=razorpayPollUrl,limits,clock=Date,random=Math.random,timers=globalThis}) {
  const host=actor.hosts.razorpay??'';
  const userAgent=(await actor.clientHints()).ua;
  const os=/Windows/i.test(userAgent)?'windows':'macos';
  const fingerprintHash=actor.fingerprint();
  const deviceId='1.'+fingerprintHash+'.'+clock.now()+'.'+Math.floor(1000+random()*9000);
  const intent=order.flow==='intent';

  const body={};
  for(const[key,value]of Object.entries(order.order.notes??{}))body['notes['+key+']']=value;
  body.key_id=order.keyId;
  body.callback_url=order.order.callbackUrl;
  body.currency='INR';
  body.amount=String(order.order.amount||'');
  body.order_id=order.order.orderId;
  body.method='upi';
  if(intent) {
    body['_[flow]']='intent';body['upi[flow]']='intent';body['_[upiqr]']='1';
  } else {
    body.vpa=order.vpa??'';body['upi[flow]']='collect';
  }
  body.fee='0';
  body['_[checkout_id]']=random().toString(36).slice(2);
  body['_[device.id]']=deviceId;
  body['_[library]']='hosted';
  if(intent) {body['_[library_src]']='no-src';body['_[current_script_src]']='no-src';}
  body['_[platform]']='browser';
  if(intent) {body['_[env]']='';body['_[is_magic_script]']='false';}
  body['_[os]']=os;
  body['_[referer]']=actor.hosts.wps+'/';
  body['_[shield][fhash]']=fingerprintHash;
  body['_[shield][tz]']='330';
  if(intent) {body['_[device_id]']=deviceId;body['_[request_index]']='0';}

  const url=host+'/v1/standard_checkout/payments/create/ajax?key_id='+encodeURIComponent(order.keyId)+'&session_token='+encodeURIComponent(order.sessionToken);
  const headers=await actor.gwHeaders('razorpay',{extra:{'Content-Type':'application/x-www-form-urlencoded','X-Session-Token':order.sessionToken}});

  let paymentId='',intentUrl='',poll='',shape='';
  for(let attempt=0;attempt<limits.rateLimitAttempts();attempt++) {
    const response=await actor.req.post(url,{headers,form:body}).catch(()=>null);
    const data=response?await response.json().catch(()=>({})):{};
    paymentId=String(data.payment_id??'');
    const payload=data.data??{};
    const upi=payload.upi??{};
    intentUrl=String(payload.intent_url??payload.upi_intent_url??upi.intent_url??payload.link??payload.qr_code_url??payload.qr_code??data.link??data.qr_code_url??'');
    const requested=String((data.request??{}).url??'');
    poll=pollUrl(requested,host);

    let line='razorpayCreate('+order.flow+') → '+(response?.status()??'ERR')+' (try '+(attempt+1)+'/'+limits.rateLimitAttempts()+') payId='+presence(paymentId)
      +' intent='+presence(intentUrl)+' poll=';
    if(poll)actor.snip(poll);
    line+=presence(poll);
    if(requested&&poll!==requested) {actor.snip(requested);line+=' (rewritten)';}
    line+=' err=';
    if(data.error)actor.snip(JSON.stringify(data.error));
    line+=presence(data.error);
    actor.log(line);

    if(intent&&!intentUrl&&response&&response.status()<400) {
      const top=Object.keys(data).join(','),inner=Object.keys(payload).join(',');
      actor.snip(JSON.stringify(data.next??payload.next??''));
      shape='top=['+top+'] data=['+inner+']';
    }
    if(intent?intentUrl:paymentId)break;
    if((response?.status())===429) {
      if(attempt>=limits.rateLimitAttempts()-1) {
        actor.log('razorpayCreate rate-limited (429) on all '+limits.rateLimitAttempts()+' attempts — falling back to another gateway (the browser stays open)','warn');
        break;
      }
      const delay=limits.rateLimitDelay();
      actor.log('razorpayCreate rate-limited (429) — retry '+(attempt+2)+'/'+limits.rateLimitAttempts()+' in '+delay+'ms','warn');
      await new Promise(resolve=>timers.setTimeout(resolve,delay));
      continue;
    }
    if(response&&response.status()>=400&&response.status()<500)break;
    if(attempt>=limits.errorAttempts()-1)break;
    await new Promise(resolve=>timers.setTimeout(resolve,1500));
  }
  if(intent&&!intentUrl&&shape)actor.log('razorpayCreate intent returned NO QR url — response shape: '+shape);
  return{paymentId,intentUrl,pollUrl:poll};
}

// Recovered f1771 with callbacks f1772–f1775. Polls the Razorpay payment status every `interval`
// milliseconds (RAZORPAY_POLL_MS or 5000; default budget is 20 minutes of polling). On a captured/return
// result it posts the signed data to the booking callback once and reports the confirmation encdata.
// Diagnostics omit provider error text, signatures and addresses; those values are only returned.
async function pollRazorpay(actor,payment,stopped,onWait,interval,maxAttempts,{getField,environment=process.env}) {
  if(interval===undefined)interval=Number(environment.RAZORPAY_POLL_MS)||5000;
  if(maxAttempts===undefined)maxAttempts=Math.floor(1200000/interval);
  const host=actor.hosts.razorpay??'';
  const statusUrl=payment.pollUrl||host+'/pg_router/v1/payments/'+encodeURIComponent(payment.paymentId)+'/status';
  for(let attempt=0;attempt<maxAttempts;attempt++) {
    if(stopped())return{kind:'stopped'};
    await actor.sleep(interval);
    onWait?.();
    const response=await actor.req.get(statusUrl,{headers:await actor.gwHeaders('razorpay')}).catch(()=>null);
    if(!response)continue;
    const body=await response.json().catch(()=>({}));
    const state=String(body.status??'');
    const error=body.error;
    const description=String(error?.description??body.error_description??'').trim();
    if(response.status()===400&&error) {
      const reason=description||'Payment declined or cancelled';
      actor.log('razorpay → declined (400)');
      return{kind:'declined',reason};
    }
    if(state==='failed') {
      const reason=description||'Payment failed or rejected';
      actor.log('razorpay → failed');
      return{kind:'failed',reason};
    }
    if(body.type==='error'||error) {
      const reason=description||'Payment cancelled or failed';
      actor.log('razorpay → error/cancelled');
      return{kind:'declined',reason};
    }
    if(!response.ok())continue;
    const request=body.request??{};
    const returned=body.type==='return'&&request.content;
    const settled=state==='captured'||state==='authorized'||body.razorpay_payment_id;
    if(!(returned||settled))continue;
    const content=request.content??body;
    const signed={
      razorpay_order_id:String(content.razorpay_order_id??payment.order.orderId),
      razorpay_payment_id:String(content.razorpay_payment_id??payment.paymentId),
      razorpay_signature:String(content.razorpay_signature??''),
    };
    if(payment.order.hostedId)signed.razorpay_hosted_id=payment.order.hostedId;
    let callback=String(request.url??payment.callbackUrl);
    try {callback=new URL(callback,actor.hosts.wps).toString();} catch {}
    actor.log('razorpay status → return/captured (poll '+(attempt+1)+'); completing');
    const result=await actor.req.post(callback,{
      headers:await actor.gwHeaders('razorpay',{extra:{'Content-Type':'application/x-www-form-urlencoded'}}),
      form:signed,
    }).catch(()=>null);
    const text=await(result==null?undefined:result.text().catch(()=>''));
    const page=text??'';
    const encdata=getField(page,'encdata');
    const confirmed=/booking-confirm/i.test(page)||/booking-confirm/i.test(String(result?.url()??''));
    actor.log('razorpay callback → '+(result?.status()??'-')+' encdata='+(encdata?'y':'-')+' confirmed='+confirmed);
    return{kind:'paid',encdata:encdata||''};
  }
  return{kind:'timeout'};
}

module.exports={pollRazorpay,razorpayLocation,parseRazorpayCheckoutPage,razorpayCheckout,razorpaySessionToken,razorpayPollUrl,razorpayCreate};
