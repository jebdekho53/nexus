'use strict';

// Recovered f2269 (pollAvailability method on the browser booking actor).
// Manages slot-gated train availability polling, Akamai/highload detection,
// reasonType 'S' seat allotment checks, train cancellation handling,
// and bounded adaptive retry intervals.

const special = require('./special-train-probe.cjs');

async function pollAvailability(actor, journey, trainNumber, quota, callOptions, deps = {}) {
  const options = callOptions || {};
  const random = deps.random || Math.random;
  const newSiteFlowAvail = Boolean(actor.opts?.newSiteFlowAvail);
  const canonical = special.canonicalizeJourney(journey);
  const target = actor.resolveTarget ? actor.resolveTarget(canonical) : null;

  // A stale caller skip flag must never move the first request before opening.
  if (!options.skipWait || target?.ms > (actor.serverNow?.() ?? Date.now())) {
    if (!target) {
      actor.log?.('availability', `NO slot gating: quota=${canonical?.quota} class=${canonical?.classCode} (slotKeyFor null / timing missing) — polling now`, 'warn');
    } else {
      const serverNow = actor.serverNow ? actor.serverNow() : Date.now();
      const diffMs = target.ms - serverNow;
      const targetIstDate = new Date(target.ms + 19800000);
      const timeStr = targetIstDate.toISOString().slice(11, 23);

      if (diffMs <= 0) {
        const passedSec = Math.round((-diffMs) / 1000);
        actor.log?.('availability', `slot ${target.label} (${timeStr} IST) ALREADY PASSED ${passedSec}s ago — polling immediately (set a future avail time to see the wait)`, 'warn');
      } else {
        const waitSec = Math.round(diffMs / 1000);
        actor.log?.('availability', `slot ${target.label} opens ${timeStr} IST — WAITING ${waitSec}s before the first avlFarenquiry hit`);
        actor.onProgress?.('booking:availability', `Waiting for the ${target.label} slot (${timeStr} IST)…`);
        await actor.waitUntilTarget?.(target);
      }
    }
  } else {
    actor.log?.('availability', 'slot wait already handled by the caller (probe + strict wait) — polling now');
  }

  if (actor.stopped) return null;

  actor.sensorCheckpoint?.('slot open');

  const env = deps.env || process.env;
  const maxAttempts = Math.max(1, Number(env.WEBLOGIN_AVAIL_MAX_ATTEMPTS) || 50);
  const startServerNow = actor.serverNow ? actor.serverNow() : Date.now();
  let consecutiveSuccess = 0;
  let attempt = 0;
  const networkGraceMs = Math.max(15000, Number(env.WEBLOGIN_NETWORK_GRACE_MS) || 120000);

  let optStep = (actor.opts?.initialFlag || actor.opts?.masterCache) ? 1 : 0;
  let firstNetFailureTime = 0;
  const key = special.journeyKey(journey, trainNumber);
  const overallAnchorMs = Math.max(target?.ms ?? startServerNow, startServerNow);
  const windowMs = deps.slotTimeoutWindowMs ?? 600000;
  let specialActive = false;

  while (true) {
    if (actor.stopped) return null;
    if (actor.session?.page?.isClosed?.()) return null;

    const current = actor.serverNow?.() ?? Date.now();
    const existing = actor.specialProbeState;
    if (existing?.journeyKey === key && current >= (existing.overallAnchorMs ?? overallAnchorMs) + windowMs) return null;
    let probeJourney = canonical, shifted = false;
    const guard = !newSiteFlowAvail && special.specialGuard(actor, canonical, target);
    const baseDate = special.getJourneyDate(journey);
    if (specialActive && guard && existing?.journeyKey === key && !special.checkFallbackDeadline(actor, existing)) {
      const date = special.calculateShiftedDate(baseDate, current, existing.dateIndex);
      if (date && date !== baseDate) {
        probeJourney = { ...canonical, date, journeyDate: date };
        shifted = true;
      }
    }
    const attemptStartNow = actor.now ? actor.now() : Date.now();
    attempt++;

    const body = !newSiteFlowAvail
      ? (deps.buildBody ? deps.buildBody(probeJourney, trainNumber) : null)
      : (typeof deps.newSiteBody==='function'?deps.newSiteBody(journey,trainNumber):deps.newSiteBody);
    const url = !newSiteFlowAvail
      ? (deps.buildUrl ? deps.buildUrl(probeJourney, trainNumber) : null)
      : (typeof deps.newSiteUrl==='function'?deps.newSiteUrl(journey,trainNumber):deps.newSiteUrl??null);

    if (actor.onProviderPage && !actor.onProviderPage()) {
      const ok = await actor.ensureOnProviderPage('check availability');
      if (!ok) {
        if (!actor.stopped) {
          actor.terminal = 'Open the IRCTC train-search page, then Try Again';
        }
        return null;
      }
    }

    const res = await actor.safeCall('api', 'POST', url, body, {
      terminalOn503: true,
      optVar: true,
      optShape: 'eticket',
      optStep
    });

    if (actor.terminal || actor.stopped || actor.session?.page?.isClosed?.()) return null;

    if (res) {
      firstNetFailureTime = 0;
      if (res.status === 510 || actor.opts?.masterCache) {
        const max = deps.maxOptStep ?? 5;
        optStep = Math.min(optStep + 1, max);
      }
    }

    const hlStatuses = deps.highloadStatuses || new Set([429, 502, 504, 510, 511]);
    if (res && (hlStatuses.has?.(res.status) || res.status === 510 || res.status === 511)) {
      actor.onProgress?.('booking:availability', `Check #${attempt} - checking…`);
      actor.log?.('availability', `High load (${res.status}) — retrying (check #${attempt})`, 'warn');
      let delay = Math.floor(random() * 2000);
      if (shifted && existing?.fallbackAtMs) {
        delay = Math.max(0, Math.min(delay, existing.fallbackAtMs - (actor.serverNow?.() ?? Date.now())));
      }
      if (actor.session?.page?.waitForTimeout) {
        await actor.session.page.waitForTimeout(delay);
      }
      continue;
    }

    let waitingAvail = false;
    let pollSuccess = false;

    if (res && res.ok) {
      if (deps.isAkamaiBlock?.(res.body)) {
        actor.onProgress?.('booking:availability', `Check #${attempt} - checking…`);
        actor.log?.('availability', 'Akamai block page during availability — retrying', 'warn');
      } else {
        const parsed = !newSiteFlowAvail
          ? (deps.parseResponse ? deps.parseResponse(res.body) : res.body)
          : (deps.parseNewSiteResponse ? deps.parseNewSiteResponse(res.body, journey) : res.body);

        if (actor.bookingNotAllowedTerminal?.()) {
          const rawErr = deps.extractErrorText ? deps.extractErrorText(res.body) : '';
          if (/booking not allowed/i.test(rawErr)) {
            actor.terminal = rawErr || 'booking not allowed';
            return null;
          }
          if (parsed?.errorMessage && /booking not allowed/i.test(parsed.errorMessage)) {
            actor.terminal = parsed.errorMessage;
            return null;
          }
        }

        const reasonStr = parsed?.reason ? ` reason="${parsed.reason}"` : '';
        actor.log?.('availability', `status="${parsed?.status}" reasonType="${parsed?.reasonType}"${reasonStr} amount=${parsed?.totalCollectibleAmount}`);
        const statusText = parsed?.status || 'checking…';
        actor.onProgress?.('booking:availability', `Check #${attempt} - ${statusText}`);

        if (shifted) {
          const state = actor.specialProbeState;
          if (!special.checkFallbackDeadline(actor, state)) {
            const highLoadBody = deps.isHighLoadBody ? deps.isHighLoadBody(parsed) : null;
            if (highLoadBody) {
              actor.log?.('availability', `Special shifted-date high load in 200 body — retrying: ${highLoadBody}`, 'warn');
              actor.onProgress?.('booking:availability', `Check #${attempt} - checking…`);
              const delay = Math.max(0, Math.min(Math.floor(random() * 2000), (state.fallbackAtMs ?? 0) - (actor.serverNow?.() ?? Date.now())));
              if (actor.session?.page?.waitForTimeout) {
                await actor.session.page.waitForTimeout(delay);
              }
              continue;
            }
            if (special.recordSpecialEnquiryOutcome(actor, state, parsed, probeJourney.date)) {
              return { ...parsed, reasonType: 'S', status: '', totalCollectibleAmount: 0 };
            }
          }
          // Rejected alternate responses never terminate the original journey.
          await actor.session?.page?.waitForTimeout?.(Math.min(1500, Math.max(0, state.fallbackAtMs - (actor.serverNow?.() ?? Date.now()))));
          continue;
        }
        if (guard && special.canStartSpecial(parsed)) {
          const state = special.getOrCreateSpecialProbeState(actor, key, { overallAnchorMs });
          if (!special.checkFallbackDeadline(actor, state)) {
            state.completed = false;
            specialActive = true;
            actor.log?.('availability', 'Usable original-date W after the opening guard — starting shifted enquiries', 'warn');
            continue;
          }
        }
        if (parsed?.reasonType === 'S') {
          return parsed;
        }

        if (parsed?.noSeats) {
          actor.terminal = parsed.stopReason || 'No seats available in this class / quota';
          return null;
        }

        const highLoadBody = deps.isHighLoadBody ? deps.isHighLoadBody(parsed) : null;
        if (highLoadBody) {
          actor.log?.('availability', 'stopping — Provider errorMessage: ' + highLoadBody, 'error');
          actor.terminal = highLoadBody;
          return null;
        }

        if (parsed?.cancelled) {
          return await actor.pollCancelledTrain(journey, trainNumber, quota);
        }

        const akamaiBlocked = deps.isAkamaiBlockedBody ? deps.isAkamaiBlockedBody(parsed) : null;
        if (akamaiBlocked) {
          actor.onProgress?.('booking:availability', `Check #${attempt} - checking…`);
          actor.log?.('availability', `Provider high load in the response body — retrying (check #${attempt}): ${akamaiBlocked}`, 'warn');
        } else {
          waitingAvail = true;
          pollSuccess = true;
        }
      }
    } else if (!res) {
      if (!firstNetFailureTime) {
        firstNetFailureTime = actor.now ? actor.now() : Date.now();
      }
      actor.log?.('availability', `Network is slow (request failed — DNS / connection) — retrying (check #${attempt})`, 'warn');
      actor.onProgress?.('booking:availability', 'Network is slow');
      const now = actor.now ? actor.now() : Date.now();
      if ((now - firstNetFailureTime) >= networkGraceMs) {
        actor.terminal = 'Network is too slow / unreachable — check your connection and Try Again';
        return null;
      }
    } else {
      actor.onProgress?.('booking:availability', `Check #${attempt} - checking…`);
      pollSuccess = true;
    }

    const targetMs = target ? Math.max(target.ms, startServerNow) : null;
    const verdict = deps.pollStatusVerdict
      ? deps.pollStatusVerdict({ now: actor.serverNow ? actor.serverNow() : Date.now(), targetMs, waitingAvail })
      : { expired: false, windowOpen: false, slow: false };

    if (verdict.expired) {
      const min = Math.round((deps.slotTimeoutWindowMs ?? 600000) / 60000);
      actor.log?.('availability', `waitlisted for ${min} min without reasonType 'S' — no seats opened`);
      return null;
    }

    if (pollSuccess) {
      consecutiveSuccess++;
      if (consecutiveSuccess >= maxAttempts && !verdict.windowOpen) {
        actor.log?.('availability', `polled ${consecutiveSuccess} times (non-high-load) without reasonType 'S' — no seats opened`);
        return null;
      }
    }

    if (actor.sensorJitter) {
      await actor.sensorJitter(quota);
    }

    let interval = 1500;
    if (!verdict.slow) {
      const currentServerNow = actor.serverNow ? actor.serverNow() : Date.now();
      if (target && currentServerNow < target.ms) {
        interval = 300;
      } else {
        interval = 1500;
      }
    } else {
      interval = deps.slowRetryDelayMs ? deps.slowRetryDelayMs() : 3000;
    }

    if (verdict.slow) {
      const delaySec = (interval / 1000).toFixed(1);
      const min = Math.round((deps.slotTimeoutWindowMs ?? 600000) / 60000);
      actor.log?.('availability', `waitlisted (check #${attempt}) — re-checking in ${delaySec}s (up to ${min} min from the slot)`);
    }

    const elapsed = (actor.now ? actor.now() : Date.now()) - attemptStartNow;
    const sleepTime = Math.max(0, interval - elapsed);
    if (sleepTime > 0 && actor.session?.page?.waitForTimeout) {
      await actor.session.page.waitForTimeout(sleepTime);
    }
  }
}

module.exports = {
  pollAvailability,
};
