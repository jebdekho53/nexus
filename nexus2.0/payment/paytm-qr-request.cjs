'use strict';

function paytmAppData(html,globals=globalThis) {
  const match=/pushAppData\s*=\s*["']([^"']+)["']/.exec(html);
  if(!match)return null;
  try {
    const text=typeof globals.atob==='function'?globals.atob(match[1]):globals.Buffer.from(match[1],'base64').toString('utf8');
    return JSON.parse(text);
  } catch {return null;}
}

function paytmQrImage(data) {
  const qr=data?.qr;
  const image=qr?.dataurl??qr?.dataUrl??qr?.image??'';
  return typeof image==='string'?image.replace(/^data:image\/png;base64,/,''):'';
}

function paytmOrderFromUrl(url,globals=globalThis) {
  try {
    const parsed=new globals.URL(url);
    return parsed.searchParams.get('orderid')||parsed.searchParams.get('orderId')||parsed.searchParams.get('ORDER_ID')||'';
  } catch {return '';}
}

function paytmOrderFromData(data,url,globals=globalThis) {
  const order=data?.orderId??data?.orderid??data?.ORDER_ID;
  if(order)return String(order);
  return paytmOrderFromUrl(url,globals);
}

async function fetchPaytmQr(actor,input,{parseData,extractImage,orderFromUrl,orderFromData,globals=globalThis}) {
  const url=new globals.URL(input.action||'/',actor.hosts.paytm).toString();
  const response=await actor.reqRetry('paytmFetchQr',async()=>actor.req.post(url,{
    headers:await actor.gwHeaders('paytm',{extra:{'Content-Type':'application/x-www-form-urlencoded',Accept:'text/html,application/xhtml+xml'}}),
    form:{MID:input.mid,ENC_DATA:input.encData,CHECKSUMHASH:input.checksum},
  }));
  const html=await response.text();
  const data=parseData(html);
  const qrBase64=extractImage(data);
  const orderId=orderFromUrl(url)||orderFromData(data,url)||orderFromUrl(response.url())||orderFromData(data,response.url());
  const logger=actor.log;
  const status=response.status();
  response.url(); // Preserve the original diagnostic helper's evaluation/errors.
  const message='PayTM enc → '+status+' pushApp='+(data?'y':'-')+' qr='+(qrBase64?qrBase64.length+'b':'-')+' orderId='+(orderId?'y':'-');
  actor.snip(html);
  logger.call(actor,message);
  return{qrBase64,orderId};
}

module.exports={paytmAppData,paytmQrImage,paytmOrderFromUrl,paytmOrderFromData,fetchPaytmQr};
