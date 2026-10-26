'use strict';
// Reviewed web adapters are enabled in ordinary, packaged and development runs.
// Unrelated reconstructed payment/RailOne modules retain their existing gate.
module.exports={webBookingUpgrades:require('./reconstructed-payment.cjs').webBookingUpgrades};
