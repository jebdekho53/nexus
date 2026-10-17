'use strict';

async function requestBookingData(actor, input) {
  const response = await actor.reqRetry('bookingData', async () => actor.req.get(
    actor.hosts.wps + '/eticketing/protected/mapps1/bookingData/' + input.clientTxnId,
    {headers:await actor.gwHeaders('wps', {
      omitOrigin:true,
      extra:{
        Authorization:input.accessToken ? 'Bearer ' + input.accessToken : '',
        greq:input.greq,
        bmiyek:input.bmiyek,
        'Spa-Csrf-Token':input.spaCsrf,
      },
    })},
  ), 4, input.stopRetry);
  return response.json().catch(() => ({}));
}

async function requestPrintTicket(actor, input) {
  const response = await actor.reqRetry('printTicket', async () => actor.req.get(
    actor.hosts.wps + '/eticketing/protected/mapps1/printTicket/' + input.pnr + '/' + (input.lang || 'en'),
    {headers:await actor.gwHeaders('wps', {
      omitOrigin:true,
      extra:{
        Authorization:input.accessToken ? 'Bearer ' + input.accessToken : '',
        greq:input.greq,
        bmiyek:input.bmiyek,
        'Spa-Csrf-Token':input.spaCsrf,
        'Content-Type':'application/json; charset=UTF-8',
      },
    })},
  ));
  const detail = await response.json().catch(() => null);
  actor.log('printTicket/' + input.pnr + ' → ' + response.status());
  return detail;
}

module.exports = {requestBookingData, requestPrintTicket};
