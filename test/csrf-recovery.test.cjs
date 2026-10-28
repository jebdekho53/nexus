'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PRESLOT_LEAD_MS,
  DEFAULT_PRESLOT_MIN_LEAD_MS,
  refreshCsrfFromSpa,
  maybePreSlotCsrfRefresh,
  attachCsrfRecovery
} = require('../src/main/booking/csrf-recovery.cjs');
const { safeCall } = require('../src/main/booking/safe-call.cjs');
const { runBrowserBooking } = require('../src/main/booking/browser-booking.cjs');

test('refreshCsrfFromSpa: fetches validateUser and detects changed CSRF token', async () => {
  const trace = [];
  let currentToken = 'old-token-1111';
  const actor = {
    session: { tokens: { validateUserPath: '/custom/validateUser' } },
    api: {
      csrfToken: () => currentToken,
      call: async (method, path, body, unk, headers) => {
        trace.push(['call', method, path, headers]);
        currentToken = 'new-token-9999';
        return { status: 200 };
      }
    },
    log: (target, msg, level) => trace.push(['log', target, msg, level]),
  };

  const changed = await refreshCsrfFromSpa(actor, 'test-slot');
  assert.equal(changed, true);
  assert.equal(trace[0][0], 'call');
  assert.equal(trace[0][1], 'GET');
  assert.equal(trace[0][2], '/custom/validateUser');
  assert.ok(trace[1][2].includes('csrf refreshed via validateUser (test-slot)'));
  assert.equal(trace[1][2].includes('new-token'),false);
  assert.equal(actor.session.tokens.csrfToken,'new-token-9999');
  assert.equal(trace[1][3], 'info');
});

test('refreshCsrfFromSpa: logs warning when token is unchanged', async () => {
  const trace = [];
  const actor = {
    session: { tokens: {} },
    api: {
      csrfToken: () => 'same-token',
      call: async () => ({ status: 200 })
    },
    log: (target, msg, level) => trace.push(['log', target, msg, level]),
  };

  const changed = await refreshCsrfFromSpa(actor, 'retry');
  assert.equal(changed, false);
  assert.ok(trace[0][2].includes('returned no new token — keeping the current one'));
  assert.equal(trace[0][3], 'warn');
});

test('maybePreSlotCsrfRefresh: enforces lead window boundaries and skip logic', async () => {
  const targetMs = 100000;

  // Case 1: delta > 35s (e.g. 50s away) -> not yet in lead window
  {
    const actor = {
      csrfPreSlotArmed: true,
      csrfPreSlot: 'pending',
      serverNow: () => targetMs - 50000,
      api: { csrfToken: () => 'tok' },
      log: () => {},
    };
    const didRefresh = await maybePreSlotCsrfRefresh(actor, targetMs);
    assert.equal(didRefresh, false);
    assert.equal(actor.csrfPreSlot, 'pending');
  }

  // Case 2: delta < 10s (e.g. 5s away) -> too close, skip refresh so availability is never delayed
  {
    const logs = [];
    const actor = {
      csrfPreSlotArmed: true,
      csrfPreSlot: 'pending',
      serverNow: () => targetMs - 5000,
      api: { csrfToken: () => 'tok' },
      log: (t, msg, lvl) => logs.push([t, msg, lvl]),
    };
    const didRefresh = await maybePreSlotCsrfRefresh(actor, targetMs);
    assert.equal(didRefresh, false);
    assert.equal(actor.csrfPreSlot, 'too-close');
    assert.ok(logs[0][1].includes('csrf refresh SKIPPED — only 5s to the slot'));
    assert.equal(logs[0][2], 'warn');
  }

  // Case 3: delta between 10s and 35s (e.g. 20s away) -> refreshes token and marks 'refreshed'
  {
    const trace = [];
    let tok = 'old-tok';
    const actor = {
      csrfPreSlotArmed: true,
      csrfPreSlot: 'pending',
      serverNow: () => targetMs - 20000,
      session: { tokens: { csrfToken: 'session-tok' } },
      api: {
        csrfToken: () => tok,
        resyncCsrf: (t) => trace.push(['resync', t]),
        call: async () => { tok = 'refreshed-tok'; return { status: 200 }; }
      },
      log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    };
    const didRefresh = await maybePreSlotCsrfRefresh(actor, targetMs);
    assert.equal(didRefresh, true);
    assert.equal(actor.csrfPreSlot, 'refreshed');
    assert.equal(trace.some(row=>row[0]==='resync'),false,'the older login token must not overwrite the live token');
    assert.equal(actor.session.tokens.csrfToken,'refreshed-tok');
  }
});

test('safeCall CSRF recovery: retries on mismatch and recovers if next attempt succeeds', async () => {
  const trace = [];
  let callCount = 0;
  const actor = {
    stopped: false,
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    onProgress: (e, msg) => trace.push(['progress', e, msg]),
    refreshCsrfFromSpa: async (reason) => { trace.push(['refreshCsrf', reason]); },
    api: {
      call: async () => {
        callCount++;
        if (callCount === 1) return { status: 409, body: { error: 'csrf mismatch' } };
        return { status: 200, body: { success: true } };
      }
    }
  };

  const deps = {
    classifyResponse: (status) => status === 409 ? 'csrf' : 'ok',
    highloadText: 'Waiting for high load…',
    duplicateLoginMessage: 'duplicate session terminal',
    maxCsrfRetries: 3,
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/test', {}, {}, deps);
  assert.equal(res.status, 200);
  assert.equal(callCount, 2);
  assert.equal(trace.some(t => t[0] === 'refreshCsrf' && t[1] === 'csrf mismatch 1/3'), true);
  assert.ok(!actor.terminal);
});

test('safeCall CSRF recovery: terminates after max CSRF retries exceeded', async () => {
  const trace = [];
  let callCount = 0;
  const actor = {
    stopped: false,
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    onProgress: (e, msg) => trace.push(['progress', e, msg]),
    refreshCsrfFromSpa: async (reason) => { trace.push(['refreshCsrf', reason]); },
    api: {
      call: async () => {
        callCount++;
        return { status: 409, body: { error: 'csrf mismatch' } };
      }
    }
  };

  const deps = {
    classifyResponse: () => 'csrf',
    highloadText: 'Waiting for high load…',
    duplicateLoginMessage: 'duplicate session terminal',
    maxCsrfRetries: 3,
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/test', {}, {}, deps);
  assert.equal(res, null);
  assert.equal(callCount, 4); // 1 initial + 3 retries
  assert.match(actor.terminal, /CSRF mismatch persisted.*log in again/);
  assert.equal(trace.some(t=>t[0]==='progress'&&t[1]==='booking:highload'),false);
  assert.ok(trace.some(t => t[0] === 'log' && t[2].includes('csrf MISMATCH persisted after 3 refresh(es)')));
});

test('safeCall recovery after first lost response: triggers refreshCsrfFromSpa', async () => {
  const trace = [];
  let callCount = 0;
  const actor = {
    stopped: false,
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    onProgress: () => {},
    refreshCsrfFromSpa: async (reason) => { trace.push(['refreshCsrf', reason]); },
    api: {
      call: async () => {
        callCount++;
        if (callCount === 1) throw new Error('ECONNRESET');
        return { status: 200, body: { success: true } };
      }
    }
  };

  const deps = {
    classifyResponse: () => 'ok',
    sleep: async () => {},
    random: () => 0.5,
  };

  const res = await safeCall(actor, 'api', 'POST', 'https://irctc.co.in/test', {}, { boundedRetry: 2 }, deps);
  assert.equal(res.status, 200);
  assert.equal(trace.some(t => t[0] === 'refreshCsrf' && t[1] === 'after a lost response'), true);
});

test('runBrowserBooking: respects pre-slot refreshed status and skips redundant refresh at opening', async () => {
  const trace = [];
  const actor = {
    csrfPreSlotArmed: true,
    csrfPreSlot: 'refreshed', // token was already refreshed during countdown
    stopped: false,
    opts: { hideBrowser: false },
    session: {
      page: {
        waitForLoadState: async () => {},
      },
      tokens: { csrfToken: 'tok-live' }
    },
    api: {
      resyncCsrf: () => {},
      csrfToken: () => 'tok-live-valid',
    },
    captureLocationEarly: () => {},
    now: () => 1000,
    serverNow: () => 1000,
    resolveTarget: () => null,
    relaunchIfLoggedOut: async () => false,
    ensureAuthToken: async () => true,
    refreshCsrfFromSpa: async (reason) => { trace.push(['refreshCsrf', reason]); },
    preTargetProbe: async () => { assert.equal(actor.csrfPreSlotArmed,true,'refresh must be armed before the probe starts waiting');return 'early'; },
    setTokenOwnership: () => {},
    ensureServerTimeSynced: async () => {},
    ensureCsrfEstablished: async () => {},
    isChancesFlow: () => false,
    pollAvailability: async () => { actor.stopped = true; return null; },
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    onProgress: (e, msg) => trace.push(['progress', e, msg]),
    stopWith: (r) => ({ stopped: true, reason: r }),
  };

  const deps = {
    clientTxnId: () => 'txn-1',
    slotImminent: () => false,
    windowLimit: () => 10000,
    shouldSearch: () => false,
    clearOverlays: async () => {},
    spaDecision: () => 'skip',
    stopped: () => ({ stopped: true }),
  };

  // Human stub with dwell
  const human = { dwell: async () => {} };

  // Run a minimal booking pass using runBrowserBooking
  await runBrowserBooking(actor, { trainNumber: '12345', origin: 'NDLS', passengers: [] }, {}, {
    ...deps,
    humanFor: () => human,
  });

  // Verify that refreshCsrfFromSpa was NOT called redundantly at opening
  assert.equal(trace.some(t => t[0] === 'refreshCsrf'), false);
  // Verify that the straight-to-availability log was made
  assert.ok(trace.some(t => t[0] === 'log' && t[2].includes('csrf already refreshed on the countdown — going straight to availability')));

  // Also verify 'too-close' case:
  const traceTooClose = [];
  actor.csrfPreSlot = 'too-close';
  actor.stopped = false;
  actor.log = (t, msg, lvl) => traceTooClose.push(['log', t, msg, lvl]);
  actor.refreshCsrfFromSpa = async (r) => traceTooClose.push(['refreshCsrf', r]);
  await runBrowserBooking(actor, { trainNumber: '12345', origin: 'NDLS', passengers: [] }, {}, {
    ...deps,
    humanFor: () => human,
  });
  assert.equal(traceTooClose.some(t => t[0] === 'refreshCsrf'), false);
  assert.ok(traceTooClose.some(t => t[0] === 'log' && t[2].includes('csrf refresh skipped (slot was imminent) — going straight to availability on the token in hand')));

  // Also verify 'pending' case (unrefreshed, e.g. instant run):
  const tracePending = [];
  actor.csrfPreSlot = 'pending';
  actor.stopped = false;
  actor.log = (t, msg, lvl) => tracePending.push(['log', t, msg, lvl]);
  actor.refreshCsrfFromSpa = async (r) => tracePending.push(['refreshCsrf', r]);
  await runBrowserBooking(actor, { trainNumber: '12345', origin: 'NDLS', passengers: [] }, {}, {
    ...deps,
    humanFor: () => human,
  });
  assert.equal(tracePending.some(t => t[0] === 'refreshCsrf' && t[1] === 'before availability'), true);
});
