'use strict';

// Recovered f2064 (safeCall method on the browser booking actor) and child closures f2065-f2078.
// Core HTTP transport for browser booking with path variants, server timing / Akamai score parsing,
// bounded network retries, 403 edge/IP-block backoff, 510/511 highload retry loops,
// CSRF re-seeding, and duplicate-login / terminal error dispatch.

function cleanPath(url) {
  if (typeof url !== 'string') return url;
  const withoutQuery = url.split('?')[0];
  const splitMapps = withoutQuery.split('/mapps1/')[1];
  return splitMapps || withoutQuery;
}

function resolvePath(actor, targetUrl, optStep, options, deps) {
  if (options.optVar) {
    if (actor.opts?.masterCache) {
      return deps.formatPathStep ? deps.formatPathStep(targetUrl, optStep) : targetUrl;
    }
    if (actor.opts?.optimizeSpace) {
      const shape = options.optShape ?? 'trail';
      return deps.formatPathShape ? deps.formatPathShape(targetUrl, shape, optStep) : targetUrl;
    }
  }
  return targetUrl;
}

async function safeCall(actor, target, method, url, body, callOptions, deps = {}) {
  const options = callOptions || {};
  const random = deps.random || Math.random;
  const sleep = deps.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

  const cleanUrl = cleanPath(url);
  const retries = options.retries ?? 0;

  let optStep = options.optStep;
  if (optStep == null) {
    optStep = (actor.opts?.initialFlag || actor.opts?.masterCache) ? 1 : 0;
  }

  let retryLoop = 0;       // r9: general / server busy / csrf retry count
  let count510 = 0;        // r10: 510 counter
  let count511 = 0;        // r11: 511 counter
  let networkRetries = 0;  // r12: network failure counter
  let count403 = 0;        // r13: 403 counter

  while (true) {
    if (actor.stopped) return null;

    const pathForCall = resolvePath(actor, url, optStep, options, deps);
    const pathSuffix = (pathForCall === url)
      ? cleanUrl
      : pathForCall.replace(/^https?:\/\/[^/]+/i, '');

    let res;
    try {
      res = await actor.api.call(method, pathForCall, body, undefined, options.referrer);
    } catch (err) {
      if (actor.stopped) return null;
      if (actor.session?.page?.isClosed?.()) {
        actor.terminal = deps.terminalClosed;
        return null;
      }
      networkRetries++;
      const maxRetry = options.boundedRetry ?? 60;
      if (networkRetries > maxRetry) {
        actor.log(target, `${method} ${pathSuffix} FAILED (network, ${networkRetries} tries): ${err.message}`, 'error');
        return null;
      }
      const delay = 2000 + Math.floor(random() * 2000);
      actor.log(target, `${method} ${pathSuffix} network error — retry ${networkRetries}/${maxRetry} after ${Math.round(delay)}ms: ${err.message}`, 'warn');
      actor.onProgress?.('booking:highload', deps.highloadText);
      await sleep(delay);
      continue;
    }

    const akScore = deps.parseAkScore ? deps.parseAkScore(res.serverTiming) : null;
    if (akScore != null && actor.akamai?.record) {
      actor.akamai.record(akScore);
    }

    const statusCat = deps.classifyResponse(res.status, res.body, res.headers);

    if (res.status === 510 || (actor.opts?.masterCache && (statusCat === 'highload' || statusCat === 'retry'))) {
      const shape = options.optShape ?? 'trail';
      const max = deps.maxOpt ? deps.maxOpt(shape) : 3;
      optStep = Math.min(optStep + 1, max);
    }

    const akStr = akScore != null ? ` ak=${akScore}` : '';
    const isFare = /allLapAvlFareEnq/i.test(cleanUrl);
    const preview = deps.previewBody ? deps.previewBody(res.body, isFare) : '';
    const logMsg = `${method} ${pathSuffix} → ${res.status}${akStr} [${statusCat}]  ${preview}`;
    const logLevel = statusCat === 'ok' ? 'info' : 'warn';
    actor.log(target, logMsg, logLevel);

    if (statusCat === 'ok' || statusCat === 'other') {
      return res;
    }

    if (options.retryCover && (statusCat === 'highload' || statusCat === 'retry')) {
      if (!actor.retryCoverBusy) {
        actor.retryCoverBusy = true;
        Promise.resolve(options.retryCover())
          .catch(() => {})
          .finally(() => {
            actor.retryCoverBusy = false;
          });
      }
    }

    if (statusCat === 'terminal') {
      if (res.status !== 403) {
        actor.terminal = deps.describeFailure ? deps.describeFailure(res.status, res.body) : String(res.status);
        return null;
      }
      count403++;
      if (count403 <= 3) {
        const delay = 2000 + Math.floor(random() * 2000);
        actor.log(target, `${method} ${pathSuffix} 403 (edge/IP block) — retry ${count403}/3 after ${Math.round(delay)}ms`, 'warn');
        actor.onProgress?.('booking:highload', deps.highloadText);
        await sleep(delay);
        continue;
      } else {
        actor.log(target, `${method} ${pathSuffix} 403 persisted after ${count403 - 1} retries → IP blocked`, 'error');
        actor.terminal = deps.ipBlockedMessage;
        return null;
      }
    }

    if (statusCat === 'csrf') {
      actor.terminal = deps.duplicateLoginMessage;
      return null;
    }

    if (statusCat === 'highload' && res.status === 510 && options.max510 != null) {
      count510++;
      const ewLimit = deps.ewLimit ?? 20;
      if (count510 >= ewLimit) {
        if (!actor.proxyClientIpFired && /^allLapAvlFareEnq/.test(cleanUrl)) {
          actor.proxyClientIpFired = true;
          actor.opts?.onProxyOutcome?.('client_ip');
        }
      }
      actor.onProgress?.('booking:highload', deps.highloadText);
      if (actor.altEgressPaced?.(res)) {
        actor.log(target, cleanUrl + ': 510 over the alt egress — retrying NOW (new exit if budget remains, else the session route)', 'warn');
        continue;
      }
      if (options.onHighLoad) {
        const now = actor.now ? actor.now() : Date.now();
        const shouldCover = deps.hlCoverRateLimit ? deps.hlCoverRateLimit(now, actor.hlCoverAt, deps.hlCoverWindow) : true;
        if (shouldCover) {
          actor.hlCoverAt = actor.now ? actor.now() : Date.now();
          await Promise.resolve(options.onHighLoad()).catch(() => {});
          actor.hlCoverAt = actor.now ? actor.now() : Date.now();
        }
      }
      if (!actor.opts?.fastAmz) {
        if (actor.akamai?.fastRefresh) {
          await actor.akamai.fastRefresh().catch(() => {});
        } else if (actor.session?.page?.waitForTimeout) {
          const delay = actor.hlDelay ? actor.hlDelay() : 1000;
          await actor.session.page.waitForTimeout(delay).catch(() => {});
        }
      } else {
        if (actor.session?.page?.waitForTimeout) {
          const delay = actor.hlDelay ? actor.hlDelay() : 1000;
          await actor.session.page.waitForTimeout(delay).catch(() => {});
        }
      }
      continue;
    }

    if (statusCat === 'highload' && res.status === 511 && options.infinite511) {
      count510 = 0;
      count511++;
      actor.log(target, `${cleanUrl}: 511 high load — retry ${count511}`, 'warn');
      actor.onProgress?.('booking:retry', deps.highloadText);
      if (!actor.altEgressPaced?.(res)) {
        if (actor.opts?.fastAmz) {
          const delay = /^(allLapAvlFareEnq|bookingInitPayment)/.test(cleanUrl)
            ? 1000
            : (actor.hlDelay ? actor.hlDelay() : 1000);
          if (actor.session?.page?.waitForTimeout) {
            await actor.session.page.waitForTimeout(delay).catch(() => {});
          }
        } else if (actor.akamai?.fastRefresh) {
          await actor.akamai.fastRefresh().catch(() => {});
        } else if (actor.session?.page?.waitForTimeout) {
          const delay = actor.hlDelay ? actor.hlDelay() : 1000;
          await actor.session.page.waitForTimeout(delay).catch(() => {});
        }
      }
      continue;
    }

    if (statusCat !== 'retry') {
      count510 = 0;
      if (retryLoop < retries) {
        if (statusCat !== 'highload') {
          if (statusCat === 'csrf') {
            actor.log(target, `${cleanUrl}: csrf mismatch — re-seeding & retrying ${retryLoop + 1}/${retries}`, 'warn');
            actor.onProgress?.('booking:retry', deps.highloadText);
            actor.api?.resyncCsrf?.(actor.session?.tokens?.csrfToken);
          }
          retryLoop++;
          if (actor.session?.page?.waitForTimeout) {
            const delay = Math.min(400 + retryLoop * 600, 10000);
            await actor.session.page.waitForTimeout(delay);
          }
          continue;
        } else {
          retryLoop++;
          let delay = 0;
          if (!actor.altEgressPaced?.(res)) {
            if (/(allLapAvlEnq|avlFarenquiry)/.test(cleanUrl)) {
              delay = deps.fastRetryDelay ?? 250;
            } else {
              delay = actor.hlDelay ? actor.hlDelay() : 1000;
            }
          }
          const delaySec = (delay / 1000).toFixed(1);
          const paceNotice = delay === 0 ? ' (alt egress paces itself)' : '';
          actor.log(target, `${cleanUrl}: ${res.status} (high load) — retrying ${retryLoop}/${retries} in ${delaySec}s${paceNotice}`, 'warn');
          actor.onProgress?.('booking:retry', deps.highloadText);
          if (delay && actor.session?.page?.waitForTimeout) {
            await actor.session.page.waitForTimeout(delay);
          }
          continue;
        }
      } else {
        return res;
      }
    } else {
      count510 = 0;
      if (options.boundedRetry != null && retryLoop >= options.boundedRetry) {
        return res;
      }
      retryLoop++;
      actor.api?.resyncCsrf?.(actor.session?.tokens?.csrfToken);
      const isEnq = /(allLapAvlEnq|avlFarenquiry)/.test(cleanUrl);
      let delay = 0;
      if (!actor.altEgressPaced?.(res)) {
        if (!isEnq) {
          delay = actor.hlDelay ? actor.hlDelay() : 1000;
        } else {
          delay = deps.fastRetryDelay ?? 250;
        }
      }
      const delaySec = (delay / 1000).toFixed(1);
      const paceNotice = delay === 0 ? ' (alt egress paces itself)' : '';
      actor.log(target, `${cleanUrl}: server busy (${res.status}) — retry ${retryLoop} in ${delaySec}s${paceNotice}`, 'warn');
      actor.onProgress?.('booking:retry', deps.highloadText);
      if (delay && actor.session?.page?.waitForTimeout) {
        await actor.session.page.waitForTimeout(delay).catch(() => {});
      }
      continue;
    }
  }
}

module.exports = {
  cleanPath,
  resolvePath,
  safeCall,
};
