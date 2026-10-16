'use strict';

async function disposeContext(actor, field) {
  const context = actor[field];
  // Relinquish ownership before awaiting disposal. An older completion must
  // never clear a replacement context created while disposal was pending.
  actor[field] = undefined;
  await context?.dispose().catch(() => {});
}

function disposeSurvivor(actor) { return disposeContext(actor, 'survivorReq'); }
function disposeDirectContext(actor) { return disposeContext(actor, 'directCtx'); }

module.exports = {disposeSurvivor,disposeDirectContext};
