'use strict';

// Keep cleanup synchronous and ordered, including when the core rejects.
async function finishBooking(actor, booking) {
  try {
    return await actor.finishBookingCore(booking);
  } finally {
    actor.endFinalPnrRequest();
    actor.endSettling();
  }
}

module.exports = {finishBooking};
