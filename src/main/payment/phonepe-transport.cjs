'use strict';

// Recovered f1730. A browser fingerprint id is generated once per gateway and cached.
function fingerprint(actor,{globals=globalThis,random=Math.random}={}) {
  if(actor.fp)return actor.fp;
  const crypto=globals.crypto;
  if(crypto?.getRandomValues) {
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    actor.fp=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  } else {
    actor.fp=Array.from({length:32},()=>Math.floor(random()*16).toString(16)).join('');
  }
  return actor.fp;
}

// Recovered f1733. A token adds both custom and (unless bearer is false) Authorization headers.
async function phonePeHeaders(actor,token,options={}) {
  const bearer=options.bearer!==false;
  const userAgent=bearer?(await actor.gatewayHints()).ua:'';
  return actor.gwHeaders('phonepe',{extra:{
    Accept:'application/json, text/plain, */*',
    priority:'u=1, i',
    'sec-gpc':'1',
    'x-browser-fingerprint':actor.fingerprint(),
    ...(actor.peRoutingKey?{'x-routing-key':actor.peRoutingKey}:{}),
    ...(userAgent?{'x-user-agent':userAgent}:{}),
    ...(token?{'x-auth-token':token,...(bearer?{authorization:'Bearer '+token}:{})}:{}),
    ...(options.extra??{}),
  }});
}

// Recovered f1734/f1735. The form transaction field and its dynamic key both use "<username>:<transaction>".
// Diagnostics report only presence flags; the raw action, token and page remain private
// although the snip helper still runs.
async function phonePeRedirect(actor,input,{getAction,getField}) {
  const label=input.username+':'+input.clientTxnId;
  const response=await actor.reqRetry('phonePeRedirect',async()=>actor.req.post(actor.hosts.wps+'/eticketing/PaymentRedirect',{
    headers:await actor.gwHeaders('wps'),
    form:{token:input.accessToken,txn:label,[label]:input.rand8+'.'+input.csrf},
  }));
  const html=await response.text();
  const action=getAction(html);
  const token=getField(html,'token')||getField(html,'encdata');
  const message='phonePeRedirect → '+response.status()+' action='+(action?'y':'-')+' token='+(token?'y':'-');
  actor.snip(html);
  actor.log(message);
  return{action,token};
}

const CHECKOUT='/apis/pg/checkout/ui/v2';
const status=response=>response?response.status():'error';

// Failed bodies run through the snip helper for its effects; the text is never logged.
async function omittedBody(actor,response,readText) {
  if(!response||response.ok())return '';
  const body=await readText();
  actor.snip(body);
  return ' :: [response omitted]';
}

// Recovered f1736 with callbacks f1737–f1750. Runs the PhonePe checkout sequence and returns the
// QR image together with the exchanged session token. Diagnostics report only status codes and
// presence flags; routing key, token, response bodies and QR contents are not logged.
async function phonePeQr(actor,action,token) {
  const mercury=actor.hosts.phonepeMercury??'',api=actor.hosts.phonepeApi??'';
  actor.peRoutingKey='';
  const pageUrl=new URL(action||'/',mercury).toString();
  const text=response=>response.text().catch(()=>'');

  const mercuryResponse=await actor.reqRetry('phonePe mercury',async()=>actor.req.post(pageUrl,{
    headers:await actor.gwHeaders('mercury',{extra:{'Content-Type':'application/x-www-form-urlencoded'}}),
    form:{token},
  })).catch(error=>{actor.log('phonePe mercury POST failed: '+error.message);return null;});
  actor.log('phonePe mercury POST → '+status(mercuryResponse));

  const routing=await actor.req.get(api+CHECKOUT+'/routing-key',{headers:await actor.phonePeHeaders(token,{bearer:false})}).catch(()=>undefined);
  if(routing?.ok()) {
    const data=await routing.json().catch(()=>({}));
    if(data.routingKey)actor.peRoutingKey=String(data.routingKey);
  }
  if(!actor.peRoutingKey)actor.peRoutingKey='V';
  actor.log('phonePe routing-key → '+status(routing));

  const exchange=await actor.reqRetry('phonePe token/exchange',async()=>actor.req.get(api+CHECKOUT+'/token/exchange',{
    headers:await actor.phonePeHeaders(token,{bearer:false}),
  }));
  const exchangeText=await text(exchange);
  let exchanged={};
  try {exchanged=JSON.parse(exchangeText);} catch {}
  const sessionToken=String(exchanged.token??'');
  let line='phonePe token/exchange → '+exchange.status()+' token='+(sessionToken?'y':'-');
  if(!exchange.ok()) {actor.snip(exchangeText);line+=' :: [response omitted]';}
  actor.log(line);
  if(!sessionToken)return{qrBase64:'',phonePeToken:''};

  const chromeMatch=/Chrome\/(\d+)/.exec((await actor.clientHints()).ua);
  const chromeVersion=chromeMatch?.[1]??'120';

  const details=await actor.reqRetry('phonePe transaction/details',async()=>actor.req.post(api+CHECKOUT+'/transaction/details',{
    headers:await actor.phonePeHeaders(sessionToken,{extra:{
      'Content-Type':'application/json; charset=UTF-8',Checkouttype:'STANDARD_CHECKOUT','X-App-Package-Name':'',
      'X-Client':'browser','X-Client-Name':'Chrome','X-Client-Subtype':'dweb','X-Client-Type':'desktop',
      'X-Client-Version':chromeVersion+'.0.0.0','X-Device-Type':'desktop',
      'X-Merchant-Domain':actor.hosts.wps+'/','X-Source':'API','X-Source-Integration-Mode':'REDIRECTION',
    }}),
    data:{retryConsentGranted:false,skipUpiIntentUrl:true},
  })).catch(()=>undefined);
  actor.log('phonePe transaction/details → '+status(details)+await omittedBody(actor,details,()=>text(details)));

  const validation=await actor.reqRetry('phonePe instrument/validate',async()=>actor.req.post(api+CHECKOUT+'/instrument/validate',{
    headers:await actor.phonePeHeaders(sessionToken,{extra:{'Content-Type':'application/json'}}),
    data:{type:'UPI_QR'},
  })).catch(()=>undefined);
  actor.log('phonePe instrument/validate → '+status(validation)+await omittedBody(actor,validation,()=>text(validation)));

  const payHeaders=await actor.phonePeHeaders(sessionToken,{extra:{'Content-Type':'application/json','x-device-type':'desktop'}});
  const payUrl=api+CHECKOUT+'/pay';
  const pay=await actor.reqRetry('phonePe pay',async()=>actor.req.post(payUrl,{headers:payHeaders,data:{type:'UPI_QR'}}));
  const payText=await text(pay);
  let payment={};
  try {payment=JSON.parse(payText);} catch {}
  const qrBase64=String(payment.qrData??payment.qrCode??'').replace(/^data:image\/png;base64,/,'');
  let payLine='phonePe pay POST hdrs=['+Object.keys(payHeaders).join(',')+'] → '+pay.status()+' qr='+(qrBase64?qrBase64.length+'b':'-');
  if(!pay.ok()) {actor.snip(payText);payLine+=' :: [response omitted]';}
  actor.log(payLine);
  return{qrBase64,phonePeToken:sessionToken};
}

module.exports={fingerprint,phonePeHeaders,phonePeRedirect,phonePeQr};
