'use strict';

const DEFAULT_PRESLOT_LEAD_MS = 35000;
const DEFAULT_PRESLOT_MIN_LEAD_MS = 10000;
const refreshes = new WeakMap();

// The live API token is authoritative after a request. Never replace it with
// the older token captured during login when the countdown completes.
function resyncCurrentCsrf(actor) {
  const current = actor.api?.csrfToken?.();
  if (current) {
    if (actor.session?.tokens) actor.session.tokens.csrfToken = current;
  } else if (actor.session?.tokens?.csrfToken) {
    actor.api?.resyncCsrf?.(actor.session.tokens.csrfToken);
  }
}

function pendingCsrfRefresh(actor) { return refreshes.get(actor); }

/**
 * Live token refresh helper matching TS 1.0.78 (part-06.js:8729-8796).
 * Sends a GET request to the validateUser endpoint. If a new CSRF token
 * is captured, updates and logs info; otherwise retains current token and logs warning.
 */
function refreshCsrfFromSpa(actor, reason = 'manual') {
  if (!actor?.api || actor.stopped) return Promise.resolve(false);
  if (refreshes.has(actor)) return refreshes.get(actor);
  const work = performRefresh(actor, reason);
  refreshes.set(actor, work);
  void work.finally(() => { if (refreshes.get(actor) === work) refreshes.delete(actor); }).catch(() => {});
  return work;
}

async function performRefresh(actor, reason) {
  const validateUserPath = actor.session?.tokens?.validateUserPath || '/eticketing/protected/mapps1/validateUser?source=3';
  const oldCsrf = typeof actor.api.csrfToken === 'function' ? actor.api.csrfToken() : null;
  try {
    await actor.api.call('GET', validateUserPath, undefined, { 'Content-Type': 'application/x-www-form-urlencoded' });
  } catch {}
  const newCsrf = typeof actor.api.csrfToken === 'function' ? actor.api.csrfToken() : null;
  const changed = Boolean(newCsrf && newCsrf !== oldCsrf);
  if (newCsrf && actor.session?.tokens) actor.session.tokens.csrfToken = newCsrf;
  if (changed) {
    actor.log?.('api', `csrf refreshed via validateUser (${reason})`, 'info');
  } else {
    actor.log?.('api', `csrf refresh via validateUser (${reason}) returned no new token — keeping the current one`, 'warn');
  }
  return changed;
}

/**
 * Guarded pre-slot token refresh helper matching TS 1.0.78 (part-06.js:8808-8871).
 * Arms during the countdown before opening:
 * - If delta > leadMs (35s): returns false (wait until closer).
 * - If delta < minLeadMs (10s): skips refresh and marks 'too-close' so availability is never delayed.
 * - If delta is within [minLeadMs, leadMs]: refreshes token and marks 'refreshed'.
 */
async function maybePreSlotCsrfRefresh(actor, targetMs, options = {}) {
  try {
    if (!actor?.csrfPreSlotArmed || actor.csrfPreSlot !== 'pending' || actor.stopped || !actor.api || !Number.isFinite(targetMs)) {
      return false;
    }
    const leadMs = options.leadMs ?? (Number(process.env.WEBLOGIN_CSRF_PRESLOT_LEAD_MS) || DEFAULT_PRESLOT_LEAD_MS);
    const minLeadMs = options.minLeadMs ?? (Number(process.env.WEBLOGIN_CSRF_PRESLOT_MIN_LEAD_MS) || DEFAULT_PRESLOT_MIN_LEAD_MS);
    const serverNow = typeof actor.serverNow === 'function' ? actor.serverNow() : Date.now();
    const delta = targetMs - serverNow;
    if (delta > leadMs) {
      return false;
    }
    if (delta < minLeadMs) {
      actor.csrfPreSlot = 'too-close';
      const remainingSec = Math.max(0, Math.round(delta / 1000));
      const floorSec = Math.round(minLeadMs / 1000);
      actor.log?.('api', `csrf refresh SKIPPED — only ${remainingSec}s to the slot (floor ${floorSec}s); going in on the token in hand so nothing delays availability`, 'warn');
      return false;
    }
    actor.csrfPreSlot = 'refreshing';
    resyncCurrentCsrf(actor);
    const reason = `${Math.max(0, Math.round(delta / 1000))}s before the slot`;
    await refreshCsrfFromSpa(actor, reason).catch(() => {});
    actor.csrfPreSlot = 'refreshed';
    return true;
  } catch {
    return false;
  }
}

/**
 * Attach CSRF recovery and guarded refresh helpers to an actor instance.
 */
function attachCsrfRecovery(actor) {
  if (!actor) return;
  if (!actor.refreshCsrfFromSpa) {
    actor.refreshCsrfFromSpa = function(reason) {
      return refreshCsrfFromSpa(this, reason);
    };
  }
  if (!actor.maybePreSlotCsrfRefresh) {
    actor.maybePreSlotCsrfRefresh = function(targetMs, opts) {
      return maybePreSlotCsrfRefresh(this, targetMs, opts);
    };
  }
  if (actor.csrfPreSlot == null) {
    actor.csrfPreSlot = 'pending';
  }
}

module.exports = {
  DEFAULT_PRESLOT_LEAD_MS,
  DEFAULT_PRESLOT_MIN_LEAD_MS,
  refreshCsrfFromSpa,
  maybePreSlotCsrfRefresh,
  attachCsrfRecovery,
  resyncCurrentCsrf,
  pendingCsrfRefresh,
};
