'use strict';

async function attachPrintTicket(actor, booking) {
  if (!actor.gateway || !actor.opts.gatewayHosts?.wps || !booking.pnr) return;
  const tokens = actor.tok();
  const detail = await actor.gateway.printTicket({
    pnr:booking.pnr,
    accessToken:tokens.accessToken,
    greq:tokens.greq,
    bmiyek:tokens.bmiyek,
    spaCsrf:actor.api?.currentCsrf || actor.spaCsrf(),
  }).catch(error => {
    actor.log('payment', 'printTicket fetch failed: ' + error.message, 'warn');
    return null;
  });
  if (detail && typeof detail === 'object') {
    booking.printDetail = detail;
    actor.log('payment', 'printTicket detail captured for PNR ' + booking.pnr);
  }
}

module.exports = {attachPrintTicket};
