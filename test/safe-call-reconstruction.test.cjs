'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, plain } = require('./helpers/recovered-harness.cjs');
const { safeCall } = require('../src/main/booking/safe-call.cjs');

function createActor(overrides = {}, trace = []) {
  const defaultOpts = {
    initialFlag: false,
    masterCache: false,
    optimizeSpace: false,
    fastAmz: false,
    ...(overrides.opts || {})
  };

  const actor = {
    stopped: false,
    proxyClientIpFired: false,
    retryCoverBusy: false,
    terminal: null,
    hlCoverAt: 0,
    opts: defaultOpts,
    session: {
      page: {
        isClosed: () => Boolean(overrides.pageClosed),
        waitForTimeout: async (ms) => { trace.push(['waitForTimeout', ms]); }
      },
      tokens: {
        csrfToken: 'csrf-123'
      }
    },
    api: {
      call: async (method, path, body, unk, ref) => {
        trace.push(['api.call', method, path, body, ref]);
        if (typeof overrides.callHandler === 'function') {
          return overrides.callHandler(method, path, body, unk, ref);
        }
        if (overrides.networkError) throw new Error(overrides.networkError);
        return {
          status: overrides.status ?? 200,
          body: overrides.responseBody ?? { success: true },
          headers: overrides.headers ?? {},
          serverTiming: overrides.serverTiming ?? null
        };
      },
      resyncCsrf: (token) => { trace.push(['resyncCsrf', token]); }
    },
    akamai: {
      record: (score) => { trace.push(['akamai.record', score]); },
      fastRefresh: async () => { trace.push(['akamai.fastRefresh']); }
    },
    log: (target, msg, level) => { trace.push(['log', target, msg, level]); },
    onProgress: (event, msg) => { trace.push(['onProgress', event, msg]); },
    altEgressPaced: (res) => Boolean(overrides.altEgressPaced),
    hlDelay: () => overrides.hlDelay ?? 1000,
    now: () => overrides.now ?? 10000,
    ...overrides
  };
  return actor;
}

const slotConfig = {
  364: (shape) => 3,
  365: (url, step) => url + '/step' + step,
  368: (url, shape, step) => url + '/' + shape + '/' + step,
  581: 3,
  598: 'High Load.. Retrying Again',
  601: 'IP Not Working with IRCTC — please change your IP / network, then Try Again',
  602: 'Duplicate IRCTC ID Login Detected — change the ID, or log in only one pair at a time',
  603: 'The browser was closed — press a login button to start again',
  774: { parseAkScore: (timing) => (timing ? 42 : null) },
  877: (now, last, window) => (now - last > (window || 1000)),
  922: 250,
  923: 12000,
  930: (status, body, headers) => {
    if (status === 200) return 'ok';
    if (status === 204) return 'other';
    if (status === 510 || status === 511) return 'highload';
    if (status === 403 || status === 500) return 'terminal';
    if (status === 409) return 'csrf';
    if (status === 429) return 'retry';
    return 'ok';
  },
  931: (status, body) => 'Failed with status ' + status,
  939: (body, isFare) => JSON.stringify(body || {}),
};

async function runOracle(overridesFactory, target = 'api', method = 'POST', url = 'https://irctc.co.in/eticketing/protected/mapps1/test', body = { req: 1 }, opts = {}) {
  const getOverridesRec = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceRec = [];
  const actorRec = createActor(getOverridesRec, traceRec);

  const h = harness({
    slots: slotConfig,
    globals: {
      setTimeout: (fn, ms) => {
        traceRec.push(['sleep', ms]);
        fn();
      },
      Math: Object.assign(Object.create(Math), { random: () => 0.5 })
    }
  });
  const fnContext = h.engine.context(10, h.root);
  const fn = h.engine.makeFunction('f2064', fnContext);

  const resRec = await fn.call(actorRec, target, method, url, body, opts);

  const getOverridesNat = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceNat = [];
  const actorNat = createActor(getOverridesNat, traceNat);
  const deps = {
    formatPathStep: slotConfig[365],
    formatPathShape: slotConfig[368],
    maxOpt: slotConfig[364],
    ewLimit: slotConfig[581],
    highloadText: slotConfig[598],
    ipBlockedMessage: slotConfig[601],
    duplicateLoginMessage: slotConfig[602],
    terminalClosed: slotConfig[603],
    parseAkScore: slotConfig[774].parseAkScore,
    hlCoverRateLimit: slotConfig[877],
    fastRetryDelay: slotConfig[922],
    hlCoverWindow: slotConfig[923],
    classifyResponse: slotConfig[930],
    describeFailure: slotConfig[931],
    previewBody: slotConfig[939],
    random: () => 0.5,
    sleep: async (ms) => {
      traceNat.push(['sleep', ms]);
    }
  };

  const resNat = await safeCall(actorNat, target, method, url, body, opts, deps);

  assert.deepEqual(plain(resNat), plain(resRec), 'results must match');
  assert.deepEqual(traceNat, traceRec, 'traces must match');
  assert.equal(actorNat.terminal, actorRec.terminal, 'terminal error state must match');
  assert.equal(actorNat.proxyClientIpFired, actorRec.proxyClientIpFired, 'proxyClientIpFired must match');
}

test('safeCall oracle: 200 OK without sensor', async () => {
  await runOracle({}, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/altAvlEnq', { train: '12345' }, {});
});

test('safeCall oracle: 200 OK with serverTiming akScore', async () => {
  await runOracle({ serverTiming: 'ak=123' }, 'api', 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: 204 status other returns immediately', async () => {
  await runOracle({ status: 204 }, 'api', 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: stopped actor returns null immediately', async () => {
  await runOracle({ stopped: true }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: browser closed on network error triggers terminal', async () => {
  await runOracle({ networkError: 'Page crashed', pageClosed: true }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: network error boundedRetry exhaustion', async () => {
  await runOracle({ networkError: 'socket hang up' }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, { boundedRetry: 0 });
});

test('safeCall oracle: 403 terminal after 3 retries', async () => {
  await runOracle({ status: 403 }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: 500 terminal describes failure', async () => {
  await runOracle({ status: 500 }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: csrf duplicate login detection', async () => {
  await runOracle({ status: 409 }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {});
});

test('safeCall oracle: 510 path step rotation with optVar and masterCache', async () => {
  await runOracle(() => {
    let callCount = 0;
    return {
      opts: { masterCache: true, onProxyOutcome: (x) => {} },
      callHandler: async (method, path, body, unk, ref) => {
        callCount++;
        return {
          status: callCount === 1 ? 510 : 200,
          body: { ok: true },
          headers: {}
        };
      }
    };
  }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/allLapAvlFareEnq', null, { optVar: true, max510: 5 });
});

test('safeCall oracle: 429 retry status server busy with boundedRetry', async () => {
  await runOracle(() => {
    let callCount = 0;
    return {
      callHandler: async (method, path, body, unk, ref) => {
        callCount++;
        return {
          status: callCount === 1 ? 429 : 200,
          body: { ok: true },
          headers: {}
        };
      }
    };
  }, 'api', 'GET', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, { boundedRetry: 2 });
});

test('safeCall oracle: 511 high load retry loop with infinite511', async () => {
  await runOracle(() => {
    let callCount = 0;
    return {
      callHandler: async (method, path, body, unk, ref) => {
        callCount++;
        return {
          status: callCount === 1 ? 511 : 200,
          body: { ok: true },
          headers: {}
        };
      }
    };
  }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, { infinite511: true });
});

test('safeCall oracle: retryCover fires on highload and recovers', async () => {
  let coverFired = false;
  await runOracle(() => {
    let callCount = 0;
    return {
      callHandler: async (method, path, body, unk, ref) => {
        callCount++;
        return {
          status: callCount === 1 ? 510 : 200,
          body: { ok: true },
          headers: {}
        };
      }
    };
  }, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {
    retryCover: async () => { coverFired = true; }
  });
});

