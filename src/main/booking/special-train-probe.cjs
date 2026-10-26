'use strict';

/**
 * Special-train enquiry state machine matching TS 1.0.78 (part-05.js:8113-8518, part-06.js:5938-7332).
 * 
 * Provides:
 * 1. ARP / date-invalid error classifier (isArpOrInvalidDateError)
 * 2. Shifted-date probe state tracking with a 4-minute fallback deadline
 * 3. Bounded date rotation
 * 4. Critical Invariant: Boarding ALWAYS retains the original journey date & quota
 * 5. Canonical aliases for flat and nested journey representations
 */

const FALLBACK_DEADLINE_MS = 240000; // 4 minutes

function isArpOrInvalidDateError(text) {
  if (!text || typeof text !== 'string') return false;
  const upper = text.trim().toUpperCase();
  if (/\bCLASS\b.{0,50}\b(?:DOES\s+NOT\s+EXIST|NOT\s+AVAILABLE|NOT\s+FOUND|INVALID)\b|\b(?:INVALID|UNKNOWN|WRONG)\s+(?:TRAIN|ROUTE)\b|\b(?:AVAILABILITY\s+)?ENQUIRY\s+LIMIT\b|\bCHECKING\s+AVAILABILITY\s+TOO\s+OFTEN\b|\bMALFORMED\s+REQUEST\b/.test(upper)) {
    return false;
  }
  return /\bARP\b|\b50018\b|ADVANCE\s+RESERVATION\s+PERIOD|\bBOOKING\s+BEFORE\b|\b(?:JOURNEY|TRAVEL|BOOKING|DEPARTURE|SELECTED)\s+DATE\b.{0,60}\b(?:INVALID|WRONG|NOT\s+(?:VALID|AVAILABLE|ALLOWED)|OUTSIDE|BEYOND|PAST|EXPIRED)\b|\b(?:INVALID|WRONG|OUTSIDE|BEYOND|PAST|EXPIRED)\b.{0,60}\b(?:JOURNEY|TRAVEL|BOOKING|DEPARTURE|SELECTED)\s+DATE\b/.test(upper);
}

const DAY_MS = 86400000, IST_OFFSET_MS = 19800000;
function dateEpoch(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const epoch = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value ? epoch : null;
}
function calculateShiftedDate(originalDate, serverNowMs, index) {
  const original = dateEpoch(originalDate);
  if (original === null || !Number.isFinite(serverNowMs) || !Number.isSafeInteger(index) || index < 0) return null;
  const today = Math.floor((serverNowMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
  const first = original - 10 * DAY_MS;
  const second = original - DAY_MS > today ? original - DAY_MS : today + 5 * DAY_MS;
  const rotation = [5, 4, 3, 2, 6, 7, 1].map(days => today + days * DAY_MS).filter(epoch => ![original, first, second].includes(epoch));
  const candidate = index === 0 ? first : index === 1 ? second : rotation.length ? rotation[(index - 2) % rotation.length] : null;
  return candidate === null ? null : new Date(candidate).toISOString().slice(0, 10);
}

function getJourneyDate(journey) {
  return journey?.date || journey?.journeyDate || journey?.journey?.date || journey?.journey?.journeyDate || null;
}
function getJourneyOrigin(journey) {
  return journey?.origin || journey?.fromStation || journey?.journey?.origin || journey?.journey?.fromStation || '';
}
function getJourneyDestination(journey) {
  return journey?.destination || journey?.toStation || journey?.journey?.destination || journey?.journey?.toStation || '';
}
function getJourneyClassCode(journey) {
  return journey?.classCode || journey?.coach || journey?.journey?.classCode || journey?.journey?.coach || '';
}
function getJourneyQuota(journey) {
  return journey?.quota || journey?.journey?.quota || '';
}
function getJourneySpecialTrain(journey) {
  return journey?.specialTrain ?? journey?.journey?.specialTrain ?? false;
}
function getJourneySpecialTrainSelectedAt(journey) {
  return journey?.specialTrainSelectedAt ?? journey?.journey?.specialTrainSelectedAt ?? undefined;
}

function canonicalizeJourney(journey) {
  if (!journey || typeof journey !== 'object') return journey;
  const date = getJourneyDate(journey);
  const origin = getJourneyOrigin(journey);
  const destination = getJourneyDestination(journey);
  const classCode = getJourneyClassCode(journey);
  const quota = getJourneyQuota(journey);
  const specialTrain = getJourneySpecialTrain(journey);
  const specialTrainSelectedAt = getJourneySpecialTrainSelectedAt(journey);
  return {
    ...journey,
    date: date ?? journey.date,
    journeyDate: date ?? journey.journeyDate,
    origin: origin || journey.origin,
    fromStation: origin || journey.fromStation,
    destination: destination || journey.destination,
    toStation: destination || journey.toStation,
    classCode: classCode || journey.classCode,
    coach: classCode || journey.coach,
    quota: quota || journey.quota,
    specialTrain,
    specialTrainSelectedAt,
  };
}

// TS selection cycle changes at 09:00 IST; old saved flags cannot silently opt in.
function specialTrainSelected(flag, selectedAt, now) {
  if (flag !== true || !Number.isFinite(now) || !Number.isSafeInteger(selectedAt) || selectedAt <= 0 || selectedAt > now) return false;
  let cutoff = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS + 9 * 3600000;
  if (now < cutoff) cutoff -= DAY_MS;
  return selectedAt >= cutoff;
}

function specialGuard(actor, journey, target) {
  const now = actor.serverNow?.();
  const opts = actor.opts || {};
  const enabled = typeof opts.getSpecialTimings === 'function' ? opts.getSpecialTimings() === true : opts.specialTimings === true;
  const tatkal = typeof opts.getTatkalSpecial === 'function' ? opts.getTatkalSpecial() === true : opts.tatkalSpecial === true;
  const quota = String(getJourneyQuota(journey) || '').toUpperCase();
  const classCode = String(getJourneyClassCode(journey) || '').toUpperCase();
  const family = target?.family || target?.key || target?.slotKey;
  let hour;
  if (['8AM', 'LD', 'SS'].includes(quota)) hour = 8;
  else if (['TQ', 'PT'].includes(quota)) hour = family === 'slTatkal' || !['1A', '2A', '3A', '3E', 'CC', 'EC', 'EA', 'FC'].includes(classCode) ? 11 : 10;
  if (!enabled || !hour || (hour !== 8 && !tatkal) || !Number.isFinite(now) || !Number.isFinite(actor.session?.tokens?.serverTimeOffsetMs)) return false;
  const specialTrain = getJourneySpecialTrain(journey);
  const selectedAt = getJourneySpecialTrainSelectedAt(journey);
  if (!specialTrainSelected(specialTrain, selectedAt, actor.now?.() ?? now)) return false;
  return ((now + IST_OFFSET_MS) % DAY_MS + DAY_MS) % DAY_MS >= hour * 3600000 + 300;
}

function journeyKey(journey, train) {
  const origin = getJourneyOrigin(journey);
  const dest = getJourneyDestination(journey);
  const cls = getJourneyClassCode(journey);
  const quota = getJourneyQuota(journey);
  const date = getJourneyDate(journey);
  return [train, origin, dest, cls, quota, date].join('|');
}

function getOrCreateSpecialProbeState(actor, key, options = {}) {
  const now = actor.serverNow?.() ?? Date.now();
  if (!actor.specialProbeState || actor.specialProbeState.journeyKey !== key) {
    actor.specialProbeState = {
      journeyKey: key,
      dateIndex: 0,
      completed: false,
      fallbackToOriginal: false,
      emptyResponses: 0,
      overallAnchorMs: options.overallAnchorMs ?? now,
      fallbackAtMs: now + (options.fallbackMs ?? FALLBACK_DEADLINE_MS)
    };
  }
  return actor.specialProbeState;
}

function checkFallbackDeadline(actor, state) {
  if (!state || state.fallbackToOriginal) return true;
  if ((actor.serverNow?.() ?? Date.now()) >= state.fallbackAtMs) {
    state.fallbackToOriginal = true;
    actor.log?.('availability', 'Special shifted-date S did not arrive within 4 minutes — polling the original date and quota', 'warn');
    actor.onProgress?.('booking:availability', 'Checking availability on the original journey');
    return true;
  }
  return false;
}

function usableSpecialResult(result, requestedDate) {
  const replyDate = result?.date ?? result?.journeyDate ?? result?.jrnyDate;
  return String(result?.reasonType || '').trim().toUpperCase() === 'S' &&
    !result.noSeats &&
    !result.cancelled &&
    !result.errorMessage &&
    !/REGRET|CANCELL?ED|DEPARTED|NOT AVAIL|NO SEATS|SOLD OUT/i.test(result.status || '') &&
    (!replyDate || replyDate === requestedDate);
}

function recordSpecialEnquiryOutcome(actor, state, result, requestedDate) {
  if (!state || state.completed || state.fallbackToOriginal) return false;
  if (usableSpecialResult(result, requestedDate)) {
    state.completed = true;
    state.emptyResponses = 0;
    actor.log?.('availability', '8AM alternate-date S — trying boarding with the original quota and date immediately', 'warn');
    return true;
  }
  state.emptyResponses++;
  if (state.emptyResponses >= 2) {
    state.dateIndex++;
    state.emptyResponses = 0;
  }
  return false;
}

function canStartSpecial(result) {
  return String(result?.reasonType || '').trim().toUpperCase() === 'W' &&
    !result.noSeats &&
    !result.cancelled &&
    !result.errorMessage &&
    /^(?:AVAILABLE|CURR_AVBL|RAC|[A-Z]{0,6}WL)(?:[- /#]|\d|$)/i.test(String(result.status || '').trim()) &&
    !/^(?:AVAILABLE|CURR_AVBL)[- ]+0+(?!\d)/i.test(result.status || '');
}

module.exports = {
  FALLBACK_DEADLINE_MS,
  isArpOrInvalidDateError,
  calculateShiftedDate,
  getJourneyDate,
  getJourneyOrigin,
  getJourneyDestination,
  getJourneyClassCode,
  getJourneyQuota,
  getJourneySpecialTrain,
  getJourneySpecialTrainSelectedAt,
  canonicalizeJourney,
  getOrCreateSpecialProbeState,
  checkFallbackDeadline,
  recordSpecialEnquiryOutcome,
  specialTrainSelected,
  specialGuard,
  journeyKey,
  usableSpecialResult,
  canStartSpecial
};
