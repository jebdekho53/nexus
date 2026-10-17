'use strict';

function sessionTokens(actor) {
  return actor.session.tokens;
}

function paymentPageReferrer(actor) {
  try {
    const source = actor.session.page?.url() || actor.opts.providerUrl || '';
    const origin = source ? new URL(source).origin : '';
    return origin ? origin + '/nget/payment/bkgPaymentOptions' : undefined;
  } catch {
    return undefined;
  }
}

function paymentRequestId(actor, {globals=globalThis, random=Math.random}={}) {
  const crypto = globals.crypto;
  const suffix = crypto?.randomUUID ? crypto.randomUUID() : random().toString(36).slice(2);
  return actor.now() + ':' + suffix;
}

module.exports = {sessionTokens, paymentPageReferrer, paymentRequestId};
