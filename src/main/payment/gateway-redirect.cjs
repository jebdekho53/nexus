'use strict';

function hiddenFormValue(html, name) {
  const input = new RegExp('<input[^>]*name=["\']' + name + '["\'][^>]*>', 'i').exec(html)?.[0];
  return input ? /value=["']([^"']*)["']/.exec(input)?.[1] ?? '' : '';
}

function formAction(html) {
  return /<form[^>]*action=["']([^"']+)["']/.exec(html)?.[1] ?? '';
}

async function paymentRedirect(actor, input, {getAction,getField}) {
  const transaction = input.username + ':' + input.clientTxnId;
  const form = {token:input.accessToken,txn:transaction,[transaction]:input.rand8 + '.' + input.csrf};
  let action='',encdata='',blocked=false;
  for (let attempt=0; attempt<4; attempt++) {
    const response = await actor.req.post(actor.hosts.wps + '/eticketing/PaymentRedirect', {
      headers:await actor.gwHeaders('wps', {navigate:true,htmlAccept:false}),
      form,
    });
    const html = await response.text();
    action = getAction(html);
    encdata = getField(html, 'encdata');
    blocked = /unable to process/i.test(html);
    actor.log('paymentRedirect → ' + response.status() + ' action=' + (action?'y':'n') + ' encdata=' + (encdata?'y':'n') + (blocked?' BLOCKED':'') + (attempt?' (try '+(attempt+1)+')':''));
    if (action || blocked) break;
    if (attempt < 3) await actor.sleep(700 + attempt * 700);
  }
  actor.noteGatewayPage(action);
  return {action,encdata,blocked};
}

function paytmRedirectForm(html, {getAction=formAction,getField=hiddenFormValue}={}) {
  function firstValue(...names) {
    for (const name of names) {
      const value=getField(html,name);
      if (value) return value;
    }
    return '';
  }
  return {
    action:getAction(html),
    encData:firstValue('encData','ENC_DATA','encdata','enc_data'),
    mid:firstValue('mid','MID'),
    checksum:firstValue('checksum','CHECKSUMHASH','checksumhash','checkSum'),
  };
}

async function paytmRedirect(actor,input,{parseForm}) {
  const transaction=input.username+':'+input.clientTxnId;
  const form={token:input.accessToken,txn:transaction,[transaction]:input.rand8+'.'+input.csrf};
  let result={action:'',encData:'',mid:'',checksum:''};
  for(let attempt=0;attempt<4;attempt++) {
    const response=await actor.reqRetry('paytmRedirect',async()=>actor.req.post(actor.hosts.wps+'/eticketing/PaymentRedirect',{
      headers:await actor.gwHeaders('wps',{navigate:true,htmlAccept:false}),form,
    })).catch(()=>null);
    if(!response) {
      if(attempt<3)await actor.sleep(700+attempt*700);
      continue;
    }
    const html=await response.text();
    result=parseForm(html);
    const logger=actor.log;
    const message='PaymentRedirect → '+response.status()+' action='+(result.action?'y':'-')+' mid='+(result.mid?'y':'-')+' enc='+(result.encData?'y':'-')+' chk='+(result.checksum?'y':'-')+(attempt?' (try '+(attempt+1)+')':'');
    // Retain helper evaluation/errors, but keep page HTML and action URLs out of logs.
    actor.snip(html);
    logger.call(actor,message);
    if(result.action&&result.mid&&result.encData&&result.checksum)return result;
    if(attempt<3)await actor.sleep(700+attempt*700);
  }
  return result;
}

module.exports = {hiddenFormValue,formAction,paymentRedirect,paytmRedirectForm,paytmRedirect};
