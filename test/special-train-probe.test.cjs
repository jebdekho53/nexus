'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FALLBACK_DEADLINE_MS,
  isArpOrInvalidDateError,
  calculateShiftedDate,
  getOrCreateSpecialProbeState,
  checkFallbackDeadline,
  recordSpecialEnquiryOutcome
} = require('../src/main/booking/special-train-probe.cjs');

test('isArpOrInvalidDateError: classifies ARP/date errors vs route/class errors', () => {
  assert.equal(isArpOrInvalidDateError('Booking before ARP not allowed'), true);
  assert.equal(isArpOrInvalidDateError('ADVANCE RESERVATION PERIOD exceeded (50018)'), true);
  assert.equal(isArpOrInvalidDateError('JOURNEY DATE IS INVALID OR BEYOND ALLOWED LIMIT'), true);
  assert.equal(isArpOrInvalidDateError('CLASS 3A DOES NOT EXIST FOR THIS TRAIN'), false);
  assert.equal(isArpOrInvalidDateError('INVALID TRAIN NUMBER'), false);
  assert.equal(isArpOrInvalidDateError(''), false);
  assert.equal(isArpOrInvalidDateError(null), false);
});

test('calculateShiftedDate: returns valid candidate shifted dates', () => {
  const original = '2026-10-31';
  const nowMs = Date.UTC(2026, 9, 24, 2, 30, 0); // 8:00 AM IST

  const arpProbe = calculateShiftedDate(original, nowMs, 0);
  assert.equal(arpProbe, '2026-10-21'); // 10 days before

  const leadCandidate = calculateShiftedDate(original, nowMs, 1);
  assert.ok(leadCandidate.startsWith('2026-10-'));

  const rotatedCandidate = calculateShiftedDate(original, nowMs, 2);
  assert.equal(rotatedCandidate, '2026-10-29'); // IST today +5 days (excluding first two)
});

test('getOrCreateSpecialProbeState & checkFallbackDeadline: 4-minute bounded fallback', () => {
  const trace = [];
  const actor = {
    serverNow: () => 1000000,
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
    onProgress: (e, msg) => trace.push(['progress', e, msg]),
  };

  const state = getOrCreateSpecialProbeState(actor, '12951-NDLS-BCT-2026-10-31');
  assert.equal(state.journeyKey, '12951-NDLS-BCT-2026-10-31');
  assert.equal(state.fallbackAtMs, 1000000 + FALLBACK_DEADLINE_MS);
  assert.equal(state.fallbackToOriginal, false);

  // Before 4 minutes (e.g. +2 minutes)
  actor.serverNow = () => 1000000 + 120000;
  assert.equal(checkFallbackDeadline(actor, state), false);
  assert.equal(state.fallbackToOriginal, false);

  // At or after 4 minutes
  actor.serverNow = () => 1000000 + 240001;
  assert.equal(checkFallbackDeadline(actor, state), true);
  assert.equal(state.fallbackToOriginal, true);
  assert.ok(trace.some(t => t[0] === 'log' && t[2].includes('Special shifted-date S did not arrive within 4 minutes — polling the original date and quota')));
});

test('recordSpecialEnquiryOutcome: bounded rotation on empty and completion on S', () => {
  const trace = [];
  const actor = {
    log: (t, msg, lvl) => trace.push(['log', t, msg, lvl]),
  };
  const state = { dateIndex: 0, emptyResponses: 0, completed: false, fallbackToOriginal: false };

  // 1st empty response -> increments emptyResponses
  recordSpecialEnquiryOutcome(actor, state, { noSeats: true });
  assert.equal(state.emptyResponses, 1);
  assert.equal(state.dateIndex, 0);

  // 2nd empty response -> rotates dateIndex to 1, resets emptyResponses
  recordSpecialEnquiryOutcome(actor, state, { cancelled: true });
  assert.equal(state.emptyResponses, 0);
  assert.equal(state.dateIndex, 1);

  // S response -> marks completed, logs immediate boarding with original journey
  recordSpecialEnquiryOutcome(actor, state, { reasonType: 'S', totalCollectibleAmount: 1850 });
  assert.equal(state.completed, true);
  assert.ok(trace.some(t => t[0] === 'log' && t[2].includes('8AM alternate-date S — trying boarding with the original quota and date immediately')));
});

test('Invariant Preservation: Original job remains intact', () => {
  const originalJob = Object.freeze({
    trainNumber: '12951',
    origin: 'NDLS',
    destination: 'BCT',
    date: '2026-10-31',
    quota: '8AM',
    classCode: '3A',
  });

  // State machine tracks probe state separately
  const actor = { serverNow: () => 1000 };
  const state = getOrCreateSpecialProbeState(actor, `${originalJob.trainNumber}-${originalJob.date}`);
  const shiftedDate = calculateShiftedDate(originalJob.date, 1000, 2);

  assert.equal(originalJob.date, '2026-10-31');
  assert.equal(originalJob.quota, '8AM');
  assert.notEqual(shiftedDate, originalJob.date);
});
