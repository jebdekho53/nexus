'use strict';

async function recordHttp(actor, method, url, options, response, error, {clock=Date}={}) {
  // The existing callback is opt-in. This module does not enable a logger or
  // introduce any transport/destination for the record.
  if (!actor.onHttpRecord) return;
  try {
    const form=options?.form;
    const requestBody=form ? Object.entries(form).map(([key,value])=>key+'='+String(value).slice(0,600)).join('&') :
      typeof options?.data==='string' ? options.data.slice(0,2000) :
      options?.data ? JSON.stringify(options.data).slice(0,2000) : undefined;
    const record={
      ts:clock.now(),method:method.toUpperCase()+'*',url,status:response?response.status():0,
      reqHeaders:options?.headers??{},
      reqBody:error?(requestBody??'')+' [THREW: '+String(error?.message??error).slice(0,200)+']':requestBody,
      resHeaders:response?response.headers():{},
      resBody:response?(await response.text().catch(()=>'')).slice(0,16000):undefined,
    };
    actor.onHttpRecord(record);
  } catch {}
}

module.exports={recordHttp};
