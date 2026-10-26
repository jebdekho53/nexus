'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeCall } = require('../src/main/booking/safe-call.cjs');
const { pollAvailability } = require('../src/main/booking/availability.cjs');
const { webBookingUpgrades } = require('../src/main/runtime/web-booking-upgrades.cjs');
const { createCompiledRuntime } = require('../src/main/runtime/compiled-runtime.cjs');
const { createEngine } = require('../src/main/runtime/engine.cjs');

function makeActor(overrides = {}) {
  const logs = [];
  const progress = [];
  let csrfToken = 'test-token';
  return {
    stopped: false,
    proxyClientIpFired: false,
    retryCoverBusy: false,
    terminal: null,
    hlCoverAt: 0,
    opts: {
      initialFlag: false,
      masterCache: false,
      optimizeSpace: false,
      fastAmz: false,
      ...(overrides.opts || {})
    },
    session: {
      tokens: { csrfToken: 'test-token' },
      page: {
        isClosed: () => Boolean(overrides.pageClosed),
        waitForTimeout: async (ms) => { logs.push(['waitForTimeout', ms]); }
      }
    },
    api: {
      call: overrides.apiCall || (async () => ({ status: 200, body: {}, headers: {} })),
      resyncCsrf: (tok) => { csrfToken = tok; logs.push(['resyncCsrf', tok]); },
      csrfToken: () => csrfToken
    },
    log: (t, msg, lvl) => logs.push([lvl || 'info', t, msg]),
    onProgress: (stage, text) => progress.push([stage, text]),
    hlDelay: () => overrides.hlDelay ?? 1000,
    now: overrides.now || (() => Date.now()),
    serverNow: overrides.serverNow || (() => Date.now()),
    logs,
    progress,
    ...overrides
  };
}

test('safeCall: 510 counter accumulates monotonically across transient errors without resetting', async () => {
  let outcomeCalled = null;
  let callCount = 0;
  const actor = makeActor({
    opts: {
      onProxyOutcome: (kind) => { outcomeCalled = kind; }
    },
    apiCall: async () => {
      callCount++;
      // Call 1-19: 510 error
      // Call 20: 511 in between (should NOT reset count510)
      // Call 21: 510 error (count510 reaches 20, triggering client_ip on allLapAvlFareEnq)
      // Call 22: success 200
      if (callCount <= 19) return { status: 510, body: {}, headers: {} };
      if (callCount === 20) return { status: 511, body: {}, headers: {} };
      if (callCount === 21) return { status: 510, body: {}, headers: {} };
      return { status: 200, body: { success: true }, headers: {} };
    }
  });

  const deps = {
    classifyResponse: (status) => status === 510 || status === 511 ? 'highload' : 'ok',
    ewLimit: 20,
    maxOpt: () => 3,
    highloadText: 'busy',
    sleep: async () => {}
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/allLapAvlFareEnq', null, {
    max510: 60,
    infinite511: true
  }, deps);

  assert.equal(res?.status, 200);
  assert.equal(actor.proxyClientIpFired, true);
  assert.equal(outcomeCalled, 'client_ip');
  assert.equal(callCount, 22);
});

test('safeCall: 403 edge/IP block retries 3 times then terminates with ipBlockedMessage', async () => {
  let attempts = 0;
  const actor = makeActor({
    apiCall: async () => {
      attempts++;
      return { status: 403, body: { error: 'Akamai 403 Forbidden' }, headers: {} };
    }
  });

  const deps = {
    classifyResponse: () => 'terminal',
    describeFailure: (s) => String(s),
    ipBlockedMessage: 'IP blocked by edge',
    highloadText: 'busy',
    sleep: async () => {}
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {}, deps);
  assert.equal(res, null);
  assert.equal(attempts, 4); // initial + 3 retries
  assert.equal(actor.terminal, 'IP blocked by edge');
});

test('safeCall: non-403 terminal status (e.g. 401, 409) terminates immediately without retry', async () => {
  let attempts = 0;
  const actor = makeActor({
    apiCall: async () => {
      attempts++;
      return { status: 401, body: { error: 'invalid access token' }, headers: {} };
    }
  });

  const deps = {
    classifyResponse: () => 'terminal',
    describeFailure: (s, b) => b?.error || String(s),
    sleep: async () => {}
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {}, deps);
  assert.equal(res, null);
  assert.equal(attempts, 1);
  assert.equal(actor.terminal, 'invalid access token');
});

test('safeCall: special train "booking not allowed" in terminal terminates with exact error text', async () => {
  let attempts = 0;
  const actor = makeActor({
    bookingNotAllowedTerminal: () => true,
    apiCall: async () => {
      attempts++;
      return { status: 200, body: { errorMessage: 'Booking not allowed for this special train at 8AM' }, headers: {} };
    }
  });

  const deps = {
    classifyResponse: (s, b, h, opts) => {
      if (opts?.bookingNotAllowedTerminal !== false && /booking not allowed/i.test(b?.errorMessage || '')) {
        return 'terminal';
      }
      return 'ok';
    },
    extractErrorText: (b) => b?.errorMessage || '',
    describeFailure: (s, b) => b?.errorMessage || String(s)
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/test', null, {}, deps);
  assert.equal(res, null);
  assert.equal(attempts, 1);
  assert.equal(actor.terminal, 'Booking not allowed for this special train at 8AM');
});

test('safeCall: HTTP 429 and 200 high-load bodies classify as retry and bound correctly', async () => {
  let attempts = 0;
  const actor = makeActor({
    apiCall: async () => {
      attempts++;
      if (attempts === 1) return { status: 429, body: 'Server Busy', headers: {} };
      if (attempts === 2) return { status: 200, body: { errorMessage: '50066: high load please retry later' }, headers: {} };
      return { status: 200, body: { success: true }, headers: {} };
    }
  });

  const deps = {
    classifyResponse: (s, b) => {
      if (s === 429) return 'retry';
      if (/high load|please retry|50066/i.test(JSON.stringify(b))) return 'retry';
      return 'ok';
    },
    fastRetryDelay: 50,
    sleep: async () => {}
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/eticketing/protected/mapps1/allLapAvlEnq', null, { boundedRetry: 5 }, deps);
  assert.equal(res?.status, 200);
  assert.equal(attempts, 3);
});

test('safeCall: stop flag aborts immediately without hanging', async () => {
  const actor = makeActor({
    stopped: true,
    apiCall: async () => { throw new Error('should not call'); }
  });

  const res = await safeCall(actor, 'api', 'POST', '/test', null, {}, {});
  assert.equal(res, null);
});

test('safeCall: page closed on network error sets terminalClosed and exits', async () => {
  const actor = makeActor({
    pageClosed: true,
    apiCall: async () => { throw new Error('Target closed'); }
  });

  const deps = {
    terminalClosed: 'Browser window was closed'
  };

  const res = await safeCall(actor, 'api', 'POST', '/test', null, {}, deps);
  assert.equal(res, null);
  assert.equal(actor.terminal, 'Browser window was closed');
});

test('pollAvailability: shifted probe 200 high load retries within fallback deadline and falls back to original', async () => {
  const opening = Date.parse('2026-10-25T02:30:00Z'); // 08:00 IST
  let now = opening + 301;
  const requests = [];
  const waits = [];

  const job = {
    origin: 'NDLS',
    destination: 'BCT',
    date: '2026-11-01',
    quota: '8AM',
    classCode: '3A',
    specialTrain: true,
    specialTrainSelectedAt: opening - 1000
  };

  const responses = [
    // 1st request: original date, returns W -> triggers special probe shifted mode
    { status: 'WL/2', reasonType: 'W' },
    // 2nd request: shifted probe, returns 200 high load body -> retries without cancelling booking
    { status: 200, errorMessage: 'unable to process request high load' },
    // 3rd request: falls back to original journey date after deadline reached -> returns S
    { status: 'AVAILABLE 10', reasonType: 'S', totalCollectibleAmount: 1200 }
  ];

  let reqIndex = 0;
  const actor = makeActor({
    opts: { specialTimings: true, tatkalSpecial: true },
    session: {
      tokens: { serverTimeOffsetMs: 0 },
      page: {
        isClosed: () => false,
        waitForTimeout: async (ms) => {
          waits.push(ms);
          now += ms;
          // Advance past 4-minute fallback deadline (240000ms) so next enquiry falls back to original
          now += 240001;
        }
      }
    },
    resolveTarget: () => ({ ms: opening, label: '8AM', family: 'eightAm' }),
    serverNow: () => now,
    now: () => now,
    safeCall: async (label, method, url, body) => {
      requests.push({ label, method, url, body });
      const resp = responses[Math.min(reqIndex++, responses.length - 1)];
      return { status: 200, ok: true, body: resp };
    }
  });

  const deps = {
    buildUrl: (j) => 'https://example.invalid/availability/' + j.date,
    buildBody: (j) => ({ date: j.date, quota: j.quota }),
    parseResponse: (b) => b,
    isHighLoadBody: (b) => /high load|unable to process/i.test(b?.errorMessage || '') ? b.errorMessage : null,
    highloadStatuses: new Set([429, 502, 504, 510, 511]),
    random: () => 0.1,
    slotTimeoutWindowMs: 600000,
    env: { WEBLOGIN_AVAIL_MAX_ATTEMPTS: '10' }
  };

  const res = await pollAvailability(actor, job, '12345', '8AM', { skipWait: true }, deps);
  assert.equal(res?.reasonType, 'S');
  assert.ok(requests.length >= 3);
  assert.equal(requests[0].body.date, '2026-11-01');
  assert.equal(requests[1].body.date, '2026-10-22');
  assert.equal(requests[requests.length - 1].body.date, '2026-11-01');
});

test('runtime adapters: compiled and instruction web booking upgrades execute safeCall with upgraded high-load handling', async () => {
  for (const compiled of [false, true]) {
    const upgrades = webBookingUpgrades({
      dependencies: {
        timers: { sleep: async () => {} },
        random: () => 0
      }
    });

    const options = { functionFactories: upgrades };
    const runtime = compiled
      ? createCompiledRuntime(options)
      : createEngine(require('../src/main/generated/index.cjs'), options);

    const root = runtime.context(2000, null);
    const scope = runtime.context(2, root);

    // Mock root bindings expected by f2064
    Object.assign(root, {
      364: () => 3,
      365: (url, step) => `${url}/step${step}`,
      368: (url, shape, step) => `${url}/${shape}${step}`,
      581: 20,
      598: 'busy',
      601: 'ip_blocked',
      602: 'duplicate_session',
      603: 'window_closed',
      774: { parseAkScore: () => null },
      877: () => true,
      922: 250,
      923: 3000,
      928: (b) => b?.errorMessage || b?.error || '',
      930: (status, body) => {
        if (status === 429) return 'retry';
        if (status === 510 || status === 511) return 'highload';
        if (status === 403) return 'terminal';
        return status >= 200 && status < 300 ? 'ok' : 'other';
      },
      931: (status) => String(status),
      939: () => ''
    });

    let calls = 0;
    const actor = {
      opts: { masterCache: true },
      session: { tokens: { csrfToken: 'tok1' }, page: { isClosed: () => false, waitForTimeout: async () => {} } },
      log: () => {},
      onProgress: () => {},
      api: {
        call: async () => {
          calls++;
          if (calls === 1) return { status: 510, body: {}, headers: {} };
          return { status: 200, body: { ok: true }, headers: {} };
        },
        resyncCsrf: () => {}
      }
    };

    const fn = runtime.makeFunction('f2064', scope);
    const result = await fn.call(actor, 'api', 'POST', '/test-enq', null, { optVar: true, max510: 10 });
    assert.equal(result?.status, 200);
    assert.equal(calls, 2);
  }
});
