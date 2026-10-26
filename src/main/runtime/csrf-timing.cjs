'use strict';
const { attachCsrfRecovery, pendingCsrfRefresh } = require('../booking/csrf-recovery.cjs');

/**
 * Interceptor ensuring that live booking actors receive CSRF recovery
 * and guarded pre-slot refresh helpers during execution.
 */
function csrfTiming(log = () => {}, timers = globalThis) {
  return {
    async f2161(original, args, actor) {
      if (!actor) return original(...args);
      actor.specialProbeState = null;
      attachCsrfRecovery(actor);
      await pendingCsrfRefresh(actor);
      actor.csrfPreSlot = 'pending';
      actor.csrfPreSlotArmed = false;
      try { return await original(...args); }
      finally { actor.csrfPreSlotArmed = false; }
    },
    async f2064(original, args, actor) {
      if (actor) attachCsrfRecovery(actor);
      return original(...args);
    },
    async f2282(original, args, actor) {
      if (!actor?.csrfPreSlotArmed || !Number.isFinite(args[0]?.ms)) return original(...args);
      let closed = false;
      let check;
      const tick = () => {
        if (closed || check) return check;
        check = Promise.resolve(actor.maybePreSlotCsrfRefresh(args[0].ms)).catch(() => false);
        void check.finally(() => { check = undefined; });
        return check;
      };
      await tick();
      const timer = timers.setInterval(tick, 250);
      const callback = fn => typeof fn !== 'function' ? fn : async (...values) => {
        await tick();
        await pendingCsrfRefresh(actor);
        if (!actor.stopped) return fn(...values);
      };
      try { return await original(args[0], callback(args[1]), callback(args[2])); }
      finally {
        closed = true;
        timers.clearInterval(timer);
        await check;
        await pendingCsrfRefresh(actor);
        // If a fast/late wait never entered the refresh window, classify it
        // before availability instead of starting a new request at opening.
        await actor.maybePreSlotCsrfRefresh(args[0].ms);
      }
    }
  };
}

module.exports = { csrfTiming };
