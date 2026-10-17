'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, compare, plain } = require('./helpers/recovered-harness.cjs');
const { callTransport } = require('../src/main/booking/transport-retry.cjs');

function createActor(overrides = {}, trace = []) {
  const defaultD = {
    baseUrl: 'https://irctc.co.in/eticketing/protected/mapps1/',
    initialFlag: false,
    masterCache: false,
    optimizeSpace: false,
    sensorRetryMax: 2,
    sensorRetryDelayMs: () => 10,
    tokenSource: false,
    ...(overrides.d || {})
  };

  const actor = {
    securityQuarantined: false,
    finalPnrRequestPending: false,
    railY510: 0,
    proxyClientIpFired: false,
    yAltThisCall: false,
    yAltSpent: false,
    abort: { signal: {} },
    isStopped: () => Boolean(overrides.stopped),
    log: (...args) => trace.push(['log', ...args]),
    nextSensor: () => 'tok-123',
    buildHeaders: (body, sensor, variant) => ({ 'x-test': 'hdr-1' }),
    activeFetch: (url) => async (u, opts) => {
      trace.push(['fetch', u, opts.method, opts.headers]);
      if (typeof overrides.fetchHandler === 'function') {
        return overrides.fetchHandler(u, opts, trace);
      }
      if (overrides.fetchError) throw new Error(overrides.fetchError);
      return {
        status: overrides.status ?? 200,
        ok: (overrides.status ?? 200) === 200,
        headers: {
          forEach: (cb) => { cb('cookie-val', 'set-cookie'); },
          getSetCookie: () => ['c=1; Path=/']
        },
        text: async () => JSON.stringify(overrides.responseBody ?? { success: true }),
      };
    },
    captureCookies: (res) => trace.push(['captureCookies']),
    now: () => 1000,
    judgeAltEgress: (status, body) => trace.push(['judgeAltEgress', status]),
    canRetry: (max, attempt) => attempt < max,
    sleep: async (ms) => { trace.push(['sleep', ms]); },
    tryRelogin: async (reason) => {
      trace.push(['tryRelogin', reason]);
      return overrides.reloginSuccess ?? false;
    },
    ...overrides,
    d: defaultD
  };
  return actor;
}

const slotConfig = {
  60: () => ({ profile: 'default' }),
  364: (x) => 3,
  365: (url, step) => url + '/step' + step,
  368: (url, shape, step) => url + '/' + shape + '/' + step,
  581: 3,
  598: 'highload',
  1404: new Set([403]),
  1405: new Set([510]),
  1411: (b) => false,
  1421: (b) => false,
  1422: (b) => false,
  1428: (h) => JSON.stringify(h),
  1429: (b) => JSON.stringify(b),
};

async function runOracle(overridesFactory, method = 'GET', url = 'https://irctc.co.in/eticketing/protected/mapps1/test', opts = {}) {
  const getOverridesRec = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceRec = [];
  const actorRec = createActor(getOverridesRec, traceRec);

  const h = harness({ slots: slotConfig });
  const fnContext = h.engine.context(10, h.root);
  const fn = h.engine.makeFunction('f3132', fnContext);

  const resRec = await fn.call(actorRec, method, url, opts);

  const getOverridesNat = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceNat = [];
  const actorNat = createActor(getOverridesNat, traceNat);
  const deps = {
    formatPathStep: slotConfig[365],
    formatPathShape: slotConfig[368],
    formatHdr: slotConfig[1428],
    formatBody: slotConfig[1429],
    ewLimit: 3,
    highloadText: 'highload',
    jeSet: slotConfig[1404],
    znSet: slotConfig[1405],
    isNotAvail: () => false,
    isQuarantined: () => false,
    isInvalidToken: () => false,
    maxOpt: () => 3
  };

  const resNat = await callTransport(actorNat, method, url, opts, deps);

  assert.deepEqual(plain(resNat), plain(resRec), 'results must match');
  assert.deepEqual(traceNat, traceRec, 'traces must match');
}

test('callTransport oracle: 200 OK without sensor', async () => {
  await runOracle({}, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', {});
});

test('callTransport oracle: 200 OK with sensor token', async () => {
  await runOracle({}, 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', { sensor: true, body: { a: 1 } });
});

test('callTransport oracle: 401 relogin failure', async () => {
  await runOracle({ status: 401, reloginSuccess: false }, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', {});
});

test('callTransport oracle: 401 relogin success then 200 OK', async () => {
  await runOracle(() => {
    let callCount = 0;
    return {
      reloginSuccess: true,
      fetchHandler: () => {
        if (callCount++ === 0) {
          return {
            status: 401,
            ok: false,
            headers: { forEach: () => {}, getSetCookie: () => [] },
            text: async () => 'unauthorized'
          };
        }
        return {
          status: 200,
          ok: true,
          headers: { forEach: () => {}, getSetCookie: () => [] },
          text: async () => JSON.stringify({ recovered: true })
        };
      }
    };
  }, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', {});
});

test('callTransport oracle: network error with retries exhausted', async () => {
  await runOracle({}, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', { sensor: true }, { fetchError: 'ECONNRESET' });
});

test('callTransport oracle: stopped operator check', async () => {
  await runOracle({ stopped: true }, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', { sensor: true });
});

test('callTransport oracle: securityQuarantined and finalPnrRequestPending early return', async () => {
  await runOracle(() => {
    return {
      fetchHandler: () => ({
        status: 500,
        ok: false,
        headers: { forEach: () => {}, getSetCookie: () => [] },
        text: async () => 'err'
      }),
      securityQuarantined: true,
      finalPnrRequestPending: true
    };
  }, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', { sensor: true });
});

test('callTransport oracle: 510 path step rotation', async () => {
  await runOracle(() => {
    let step = 0;
    return {
      d: { masterCache: true, optimizeSpace: true },
      fetchHandler: () => {
        if (step++ < 2) {
          return {
            status: 510,
            ok: false,
            headers: { forEach: () => {}, getSetCookie: () => [] },
            text: async () => 'blocked 510'
          };
        }
        return {
          status: 200,
          ok: true,
          headers: { forEach: () => {}, getSetCookie: () => [] },
          text: async () => JSON.stringify({ success: true })
        };
      }
    };
  }, 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', { sensor: true, optVar: true });
});
