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

module.exports = {hiddenFormValue,formAction,paymentRedirect};
