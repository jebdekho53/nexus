'use strict';

// Recovered f3132 (transport call method) with callbacks f3133-f3136.
// Performs HTTP requests against the backend/IRCTC endpoints with sensor tokens,
// TLS profiles, path variants on 510/Akamai, cookie capture, auto-relogin on 401/403,
// and bounded exponential/jitter retries.

function formatHeaders(headers) {
  if (!headers) return '';
  return Object.entries(headers).map(([k, v]) => k + ': ' + v).join('\n');
}

function extractSetCookies(res) {
  try {
    const list = res.headers?.getSetCookie?.();
    return list || [];
  } catch (_) {
    return [];
  }
}

async function callTransport(actor, method, url, callOptions, deps) {
  const options = callOptions || {};
  const splitUrl = url.split('/mapps1/')[1] ?? url;
  const baseUrl = (options.baseUrl ?? actor.d.baseUrl).replace(/\/+$/, '');

  let optStep = options.optStep;
  if (optStep == null) {
    optStep = (actor.d.initialFlag || actor.d.masterCache) ? 1 : 0;
  }

  let body = options.bodyRaw;
  if (body == null) {
    body = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  }

  const hasSensor = Boolean(options.sensor);
  let retryMax = 0;
  if (!hasSensor) {
    if (options.retryOnTransient) {
      retryMax = options.sensorRetryMax ?? 60;
    } else {
      retryMax = 0;
    }
  } else {
    retryMax = options.sensorRetryMax ?? actor.d.sensorRetryMax;
  }

  let attempt = 0;
  while (true) {
    if (attempt > 0) {
      if (actor.securityQuarantined && actor.finalPnrRequestPending) {
        return { status: 0, ok: false, body: null };
      }
    }

    let modifiedPath = url;
    if (options.optVar && actor.d.masterCache) {
      modifiedPath = deps.formatPathStep ? deps.formatPathStep(url, optStep) : url;
    } else if (actor.d.optimizeSpace && options.optVar) {
      const shape = options.optShape ?? 'trail';
      modifiedPath = deps.formatPathShape ? deps.formatPathShape(url, shape, optStep) : url;
    }

    let targetUrl;
    const combined = baseUrl + modifiedPath;
    if (combined !== baseUrl + url) {
      targetUrl = combined.slice(baseUrl.length);
    } else {
      targetUrl = splitUrl;
    }

    let sensorToken = undefined;
    if (hasSensor) {
      if (!actor.d.tokenSource) {
        sensorToken = actor.nextSensor();
      } else {
        const priority = options.staged ? 'submit' : 'normal';
        const tokenRes = await actor.d.tokenSource({ priority, label: splitUrl });
        sensorToken = tokenRes ?? undefined;
      }
      if (!sensorToken) {
        return { status: 0, ok: false, body: null, sensorExhausted: true };
      }
      if (actor.isStopped()) {
        actor.log(splitUrl + ': stopped while waiting for a token — not sending', 'warn');
        return { status: 0, ok: false, body: null };
      }
    }

    const headers = actor.buildHeaders(body, sensorToken, options.headerVariant);
    const logHeader = '→ ' + method + ' ' + targetUrl + '  REQ hdr {' + (deps.formatHdr ? deps.formatHdr(headers) : JSON.stringify(headers)) + '}';
    const logBody = body === undefined ? '' : '  body ' + (deps.formatBody ? deps.formatBody(options.body) : JSON.stringify(options.body));
    actor.log(logHeader + logBody);

    let isAltEgress = false;
    try {
      let tlsProfile = undefined;
      const ja3 = actor.d.ja3Profiles;
      if (actor.d.smartFlow === true && hasSensor && ja3 && ja3.length > 0) {
        if (attempt > 0) {
          tlsProfile = ja3[(attempt - 1) % ja3.length];
        }
      }
      const tlsObj = tlsProfile ? { tlsProfile } : {};
      const fetchFn = actor.activeFetch(combined);
      isAltEgress = Boolean(actor.yAltThisCall);

      const fetchOpts = {
        method,
        headers,
        body,
        signal: actor.abort.signal,
        ...tlsObj
      };

      const response = await fetchFn(combined, fetchOpts);
      actor.captureCookies(response);

      const rawText = await response.text();
      let parsedBody = rawText;
      try {
        parsedBody = JSON.parse(rawText);
      } catch (_) {}

      if (actor.d.onTrace) {
        const reqHdrs = Object.entries(headers).map(([k, v]) => k + ': ' + v).join('\n');
        const setCookies = [];
        try {
          response.headers?.forEach?.((val, key) => setCookies.push(key + ': ' + val));
        } catch (_) {}
        const traceDivider = '='.repeat(100) + '\n→ ' + method + ' ' + combined + '\n' + reqHdrs + '\n\n';
        const bodyContent = body != null ? body : '(no request body)';
        const respHdr = traceDivider + bodyContent + '\n\n← HTTP ' + response.status + '\n';
        const traceStr = respHdr + setCookies.join('\n') + '\n\n' + rawText + '\n';
        actor.d.onTrace(traceStr);
      }

      const cookies = extractSetCookies(response);
      const respLogBase = '← ' + targetUrl + ' ' + response.status + (hasSensor ? ' [+sensor]' : '');
      const respLogBody = '  RESP ' + (deps.formatBody ? deps.formatBody(parsedBody) : JSON.stringify(parsedBody));
      const respLogCookies = cookies.length ? '  set-cookie ' + cookies.map(c => c.split(';')[0]).join(', ') : '';
      actor.log(respLogBase + respLogBody + respLogCookies);

      if (response.status === 200 && /bookingInitPayment/.test(combined)) {
        actor.payInitAt = actor.now();
      }

      if (/allLapAvlFareEnq/.test(combined)) {
        actor.judgeAltEgress(response.status, parsedBody);
        if (response.status === 510) {
          actor.railY510 = (actor.railY510 || 0) + 1;
          const ewLimit = deps.ewLimit ?? 3;
          if (actor.railY510 >= ewLimit && !actor.proxyClientIpFired) {
            actor.proxyClientIpFired = true;
            actor.d.onProxyOutcome?.('client_ip');
          }
        } else if (response.status !== 0) {
          actor.railY510 = 0;
        }
      }

      const isForbiddenBlock = deps.znSet ? deps.znSet.has(response.status) : (response.status === 510);
      const isOkOrEmpty = isForbiddenBlock || response.status === 0 || (deps.isNotAvail ? deps.isNotAvail(parsedBody) : false);

      if (response.status === 510 || (actor.d.masterCache && isOkOrEmpty)) {
        const maxOpt = deps.maxOpt ? deps.maxOpt(options.optShape) : 3;
        optStep = Math.min(optStep + 1, maxOpt);
        if (response.status === 510) {
          if (!actor.d.optimizeSpace && !actor.d.masterCache) {
            actor.log(targetUrl + ' → 510 — path variant OFF (server optimizeSpace/masterCache=false) — same path on the retry', 'warn');
          } else if (options.optVar) {
            actor.log(targetUrl + ' → 510 — next attempt adds a slash (variant level ' + optStep + '/' + maxOpt + ')', 'warn');
          }
        }
      }

      if (actor.securityQuarantined && actor.finalPnrRequestPending) {
        return { status: response.status, ok: response.ok, body: parsedBody };
      }

      const isInvalidToken = deps.isInvalidToken ? deps.isInvalidToken(parsedBody) : false;
      if (isAltEgress && response.status === 403 && !isInvalidToken && actor.yAltSpent) {
        actor.log(method + ' ' + splitUrl + ' → 403 over the alt route — not a session fault; retrying on the session route', 'warn');
        attempt++;
        continue;
      }

      if (!isInvalidToken && response.status !== 401 && response.status !== 403) {
        if (hasSensor) {
          const jeSet = deps.jeSet || new Set([403]);
          if (jeSet.has(response.status)) {
            actor.log(method + ' ' + targetUrl + ' → ' + response.status + ' — TERMINAL (a fresh sensor won\'t help) — stopping', 'error');
            return { status: response.status, ok: false, body: parsedBody };
          }
        }

        const isBlockStatus = deps.znSet ? deps.znSet.has(response.status) : (response.status === 510);
        const isNotAvail = isBlockStatus || response.status === 0 || (deps.isNotAvail ? deps.isNotAvail(parsedBody) : false);

        if (hasSensor && !isNotAvail) {
          const isTerm = options.terminalBody ? options.terminalBody(parsedBody) : false;
          if (isTerm) {
            actor.log(method + ' ' + targetUrl + ' → ' + response.status + ' — terminal body (no retry; e.g. wallet balance too low)', 'warn');
            return { status: response.status, ok: false, body: parsedBody };
          }
        }

        const is510WithoutOwn = (response.status === 510 && !options.ownRetries);
        const shouldCheckRetry = hasSensor || options.retryOnTransient;
        const isZeroStatus = response.status === 0;

        if (shouldCheckRetry) {
          const inZn = deps.znSet ? deps.znSet.has(response.status) : (response.status === 510);
          const allowRetryStatus = inZn || isZeroStatus || is510WithoutOwn || (deps.isNotAvail && deps.isNotAvail(parsedBody) && !deps.isQuarantined?.(parsedBody));

          if (allowRetryStatus && (is510WithoutOwn || actor.canRetry(retryMax, attempt))) {
            actor.d.hooks?.onProgress?.('railone:highload', deps.highloadText ?? 'highload');
            let delay = 0;
            if (!isAltEgress) {
              if (actor.d.sensorRetryDelayMs) {
                delay = actor.d.sensorRetryDelayMs();
              } else {
                delay = 2000 + Math.floor(Math.random() * 2000);
              }
            } else {
              delay = 0;
            }

            const rotSensor = hasSensor ? ' (rotate sensor)' : '';
            const altPace = delay === 0 ? ' (alt egress paces itself)' : '';
            const retryLimitStr = retryMax !== undefined ? ' (' + (attempt + 1) + '/' + retryMax + ')' : ' (no limit)';
            actor.log(method + ' ' + targetUrl + ' → ' + response.status + ' — retry' + rotSensor + ' after ' + Math.round(delay) + 'ms' + altPace + retryLimitStr, 'warn');

            if (delay) {
              await actor.sleep(delay);
            }
            attempt++;
            continue;
          }
        }

        return { status: response.status, ok: response.ok, body: parsedBody };
      }

      // Re-login on 401 / 403 / invalid_token
      const reason = isInvalidToken ? 'invalid_token' : String(response.status);
      const reLoggedIn = await actor.tryRelogin(reason);
      if (!reLoggedIn) {
        const errType = isInvalidToken ? 'invalid_token' : response.status;
        const reLoginStatus = actor.d.reLogin ? 'failed/exhausted' : 'unavailable';
        actor.log(method + ' ' + splitUrl + ' → ' + errType + ' — TERMINAL (session/forbidden; re-login ' + reLoginStatus + ')', 'error');
        return {
          status: response.status === 200 ? 401 : response.status,
          ok: false,
          body: parsedBody
        };
      }
      attempt++;
      continue;
    } catch (err) {
      if (actor.securityQuarantined && actor.finalPnrRequestPending) {
        return { status: 0, ok: false, body: null };
      }
      if (actor.abort?.signal?.aborted || actor.isStopped?.()) {
        actor.log(method + ' ' + splitUrl + ' ABORTED (operator stop) — not retrying', 'warn');
        return { status: 0, ok: false, body: null };
      }

      if (isAltEgress && !actor.yAltSpent) {
        actor.yAltSpent = true;
        actor.log('alt egress: transport failure — switching /Y to the session route for the rest of this run', 'warn');
      }

      const allowNetworkRetry = (hasSensor || options.retryOnTransient) && actor.canRetry(retryMax, attempt);
      if (allowNetworkRetry) {
        let delay = 0;
        if (!isAltEgress) {
          if (actor.d.sensorRetryDelayMs) {
            delay = actor.d.sensorRetryDelayMs();
          } else {
            delay = 1000 + Math.floor(Math.random() * 3000);
          }
        } else {
          delay = 0;
        }

        const rotSensor = hasSensor ? ' (rotate sensor)' : '';
        const altPace = delay === 0 ? ' (alt egress paces itself)' : '';
        actor.log(method + ' ' + splitUrl + ' network error — retry' + rotSensor + ' after ' + Math.round(delay) + 'ms' + altPace, 'warn');

        if (delay) {
          await actor.sleep(delay);
        }
        attempt++;
        continue;
      }

      actor.log(method + ' ' + splitUrl + ' FAILED: ' + (err?.message || String(err)), 'error');
      return { status: 0, ok: false, body: null };
    }
  }
}

module.exports = { callTransport };
