'use strict';

const noop = () => {};
const pendingMessage = 'Payment is still being processed — your ticket MIGHT be booked. Check your IRCTC account before retrying; any amount debited is auto-refunded by IRCTC.';

async function finishBookingCore(actor, booking, {timers=globalThis}={}) {
  actor.gateway?.disposeSurvivor().catch(noop);
  actor.gateway?.disposeDirectContext().catch(noop);
  if (actor.gatewayReqCtx) {
    actor.gatewayReqCtx.dispose().catch(noop);
    actor.gatewayReqCtx = undefined;
  }
  if (actor.paymentCancelled) return actor.stoppedResult();

  if (booking && booking.pnr) {
    if (actor.paidQrAmount && Number.isFinite(actor.paidQrAmount) && actor.paidQrAmount > 0 && booking.amount !== actor.paidQrAmount) {
      actor.log('gateway', 'IRCTC-QR: ticket follows the QR amount ₹' + actor.paidQrAmount + ' (bookingData reported ₹' + booking.amount + ')', 'info');
      booking.amount = actor.paidQrAmount;
    }
    const label = booking.allConfirmed ? 'Confirmed' : 'Booked';
    await Promise.race([
      actor.attachPrintTicket(booking),
      new Promise(resolve => timers.setTimeout(resolve, 3000)),
    ]).catch(noop);
    actor.opts.onBooked?.(booking);
    actor.onProgress('booking:pnr', 'PNR ' + booking.pnr + ' — ' + label);

    if (booking.passengers.some(passenger => passenger.confirmed)) {
      let completed = false;
      const report = actor.reportClientUpdate(booking).finally(() => { completed = true; });
      await Promise.race([
        report,
        new Promise(resolve => timers.setTimeout(() => {
          if (!completed) actor.log('clientupdate', 'report not confirmed in 5s — ticket already shown (report continues in the background)', 'warn');
          resolve();
        }, 5000)),
      ]);
      // Recovered code awaits again after the race. Keep parity here; changing
      // this timing requires an explicit behavior change with separate tests.
      await report;
    } else {
      actor.log('clientupdate', 'skipped — PNR ' + booking.pnr + ' has no confirmed passenger (waitlist/RAC)', 'info');
    }
    return {success:true, reference:booking.pnr, message:'PNR ' + booking.pnr + ' (' + label + ')'};
  }
  if (booking && booking.errorMessage) {
    actor.onProgress('booking:error', 'Booking failed: ' + booking.errorMessage);
    return {success:false, message:booking.errorMessage};
  }
  actor.onProgress('booking:error', pendingMessage);
  return {success:false, message:pendingMessage};
}

// Keep cleanup synchronous and ordered, including when the core rejects.
async function finishBooking(actor, booking) {
  try {
    return await actor.finishBookingCore(booking);
  } finally {
    actor.endFinalPnrRequest();
    actor.endSettling();
  }
}

module.exports = {finishBooking, finishBookingCore};
