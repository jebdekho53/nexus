'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, plain } = require('./helpers/recovered-harness.cjs');
const { pollAvailability } = require('../src/main/booking/availability.cjs');

function createActor(overrides = {}, trace = []) {
  const actor = {
    stopped: false,
    terminal: null,
    opts: {
      newSiteFlowAvail: false,
      initialFlag: false,
      masterCache: false,
      ...(overrides.opts || {})
    },
    session: {
      page: {
        isClosed: () => Boolean(overrides.pageClosed),
        waitForTimeout: async (ms) => { trace.push(['waitForTimeout', ms]); }
      }
    },
    resolveTarget: (journey) => (overrides.target !== undefined ? overrides.target : null),
    serverNow: () => overrides.serverNow ?? 10000000,
    now: () => overrides.now ?? 20000000,
    waitUntilTarget: async (target) => { trace.push(['waitUntilTarget', target]); },
    sensorCheckpoint: (label) => { trace.push(['sensorCheckpoint', label]); },
    onProviderPage: () => (overrides.onProviderPage !== undefined ? overrides.onProviderPage : true),
    ensureOnProviderPage: async (label) => {
      trace.push(['ensureOnProviderPage', label]);
      return overrides.ensurePageOk ?? true;
    },
    safeCall: async (target, method, url, body, options) => {
      trace.push(['safeCall', target, method, url, body, options]);
      if (typeof overrides.safeCallHandler === 'function') {
        return overrides.safeCallHandler(target, method, url, body, options);
      }
      return overrides.safeCallResult ?? {
        ok: true,
        status: 200,
        body: overrides.responseBody ?? { status: 'AVAILABLE 12', reasonType: 'S', totalCollectibleAmount: 500 }
      };
    },
    pollCancelledTrain: async (journey, trainNumber, quota) => {
      trace.push(['pollCancelledTrain', journey, trainNumber, quota]);
      return { cancelledHandled: true };
    },
    sensorJitter: async (quota) => { trace.push(['sensorJitter', quota]); },
    log: (target, msg, level) => { trace.push(['log', target, msg, level]); },
    onProgress: (event, msg) => { trace.push(['onProgress', event, msg]); },
    ...overrides,
    serverNow: typeof overrides.serverNow === 'function' ? overrides.serverNow : () => (overrides.serverNow ?? 10000000),
    now: typeof overrides.now === 'function' ? overrides.now : () => (overrides.now ?? 20000000)
  };
  return actor;
}

const slotConfig = {
  351: (journey, trainNumber) => ({ trainNumber }),
  353: '{}',
  363: 5,
  369: (journey, trainNumber) => 'https://irctc.co.in/eticketing/protected/mapps1/avlFarenquiry',
  371: (journey, trainNumber) => 'https://irctc.co.in/eticketing/protected/mapps1/newAvl',
  403: (parsed) => parsed?.highLoadError || null,
  404: (parsed) => (parsed?.akamaiBlocked ? 'akamai' : null),
  405: (body) => body,
  408: (body, journey) => body,
  409: (body) => Boolean(body?.akamaiBlock),
  912: 600000,
  915: () => 3000,
  916: ({ now, targetMs, waitingAvail }) => ({ expired: false, windowOpen: true, slow: false }),
  921: new Set([429, 502, 504, 510, 511])
};

async function runOracle(overridesFactory, journey = { quota: 'GN', classCode: 'SL' }, trainNumber = '12345', quota = 'GN', opts = {}) {
  const getOverridesRec = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceRec = [];
  const actorRec = createActor(getOverridesRec, traceRec);

  const h = harness({
    slots: slotConfig,
    globals: {
      process,
      Math: Object.assign(Object.create(Math), { random: () => 0.5 })
    }
  });
  const fnContext = h.engine.context(10, h.root);
  const fn = h.engine.makeFunction('f2269', fnContext);

  const resRec = await fn.call(actorRec, journey, trainNumber, quota, opts);

  const getOverridesNat = typeof overridesFactory === 'function' ? overridesFactory() : overridesFactory;
  const traceNat = [];
  const actorNat = createActor(getOverridesNat, traceNat);
  const deps = {
    buildBody: slotConfig[351],
    newSiteBody: slotConfig[353],
    buildUrl: slotConfig[369],
    newSiteUrl: slotConfig[371],
    maxOptStep: slotConfig[363],
    isHighLoadBody: slotConfig[403],
    isAkamaiBlockedBody: slotConfig[404],
    parseResponse: slotConfig[405],
    parseNewSiteResponse: slotConfig[408],
    isAkamaiBlock: slotConfig[409],
    slotTimeoutWindowMs: slotConfig[912],
    slowRetryDelayMs: slotConfig[915],
    pollStatusVerdict: slotConfig[916],
    highloadStatuses: slotConfig[921],
    random: () => 0.5,
    env: { WEBLOGIN_AVAIL_MAX_ATTEMPTS: '5', WEBLOGIN_NETWORK_GRACE_MS: '30000' }
  };

  const resNat = await pollAvailability(actorNat, journey, trainNumber, quota, opts, deps);

  assert.deepEqual(plain(resNat), plain(resRec), 'results must match');
  // Deliberate correction: f2269 passed body/url reversed; safeCall contract is URL then body.
  const correctedTrace=traceRec.map(row=>row[0]==='safeCall'?[...row.slice(0,3),row[4],row[3],...row.slice(5)]:row);
  assert.deepEqual(traceNat, correctedTrace, 'traces must match except corrected URL/body contract');
  assert.equal(actorNat.terminal, actorRec.terminal, 'terminal error state must match');
}

test('pollAvailability oracle: seats available (reasonType S) immediate success', async () => {
  await runOracle({}, { quota: 'GN', classCode: '3A' }, '12001', 'GN', {});
});

test('pollAvailability oracle: target slot in future waits until target', async () => {
  const target = { ms: 10005000, label: 'GN' };
  await runOracle({ target, serverNow: 10000000 }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});

test('pollAvailability oracle: target slot already passed logs warn and polls immediately', async () => {
  const target = { ms: 10000000, label: 'GN' };
  await runOracle({ target, serverNow: 10005000 }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});

test('pollAvailability oracle: skipWait option logs note when the slot wait is already handled', async () => {
  const target = { ms: 9999000, label: 'GN' };
  await runOracle({ target, serverNow: 10000000 }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', { skipWait: true });
});

test('pollAvailability oracle: noSeats terminates with reason', async () => {
  await runOracle({
    responseBody: { status: 'REGRET', reasonType: 'W', noSeats: true, stopReason: 'Class Full' }
  }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});

test('pollAvailability oracle: high load body errorMessage terminates with error', async () => {
  await runOracle({
    responseBody: { status: 'ERROR', reasonType: 'E', highLoadError: 'Server Busy Try Later' }
  }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});

test('pollAvailability oracle: train cancelled delegates to pollCancelledTrain', async () => {
  await runOracle({
    responseBody: { status: 'CANCELLED', reasonType: 'C', cancelled: true }
  }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});

test('pollAvailability oracle: stopped actor returns null immediately', async () => {
  await runOracle({ stopped: true }, { quota: 'GN', classCode: 'SL' }, '12001', 'GN', {});
});
