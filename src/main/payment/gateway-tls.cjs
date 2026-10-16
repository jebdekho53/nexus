'use strict';

async function sendViaWebTlsGateway(actor, method, url, input, {cookieHeader,filterCookieHeader,filterSetCookies,applySetCookies}) {
  const gateway=actor.webTlsGateway,options=input??{},headers={};
  const supplied=options.headers??{};
  for (const name of Object.keys(supplied)) headers[name.toLowerCase()]=supplied[name];
  let data;
  const form=options.form;
  if (form && typeof form==='object') {
    const encoded=new URLSearchParams();
    for (const name of Object.keys(form)) encoded.append(name,String(form[name]));
    data=encoded.toString();
    if (!headers['content-type']) headers['content-type']='application/x-www-form-urlencoded';
  } else if (options.data!==undefined && options.data!==null) {
    data=typeof options.data==='string'?options.data:JSON.stringify(options.data);
    if (!headers['content-type']) headers['content-type']='application/json';
  }
  let cookies=await cookieHeader(actor.page.context(),url).catch(()=>'');
  if (cookies && actor.stripF5) cookies=filterCookieHeader(cookies);
  if (cookies) headers.cookie=cookies;
  const timeout=Number(options.timeout??0);
  const response=await gateway(url,{
    method:method==='post'?'POST':'GET',headers,data,
    manualRedirect:Number(options.maxRedirects??-1)===0,
    timeoutMs:timeout>0?timeout:undefined,
  });
  const rawHeaders={};
  for (const name of Object.keys(response.headers??{})) rawHeaders[name.toLowerCase()]=response.headers[name];
  const responseCookies=rawHeaders['set-cookie']??[];
  const selected=actor.stripF5?filterSetCookies(responseCookies):responseCookies;
  if (selected.length) await applySetCookies(actor.page.context(),url,selected).catch(()=>{});
  const flattened={};
  for (const name of Object.keys(rawHeaders)) flattened[name]=rawHeaders[name].join(', ');
  const status=response.status,body=response.body??'';
  return {
    status:()=>status,
    statusText:()=>'',
    ok:()=>status>=200&&status<300,
    url:()=>response.url||url,
    text:async()=>body,
    json:async()=>JSON.parse(body),
    body:async()=>Buffer.from(body),
    headers:()=>flattened,
    headersArray:()=>Object.keys(rawHeaders).flatMap(name=>rawHeaders[name].map(value=>({name,value}))),
    dispose:async()=>{},
    fetchUid:()=>'',
  };
}

module.exports={sendViaWebTlsGateway};
