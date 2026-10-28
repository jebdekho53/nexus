'use strict';
// IPC handlers for booking-related channels that were missing in Matrix v1.0.30
// Implements: app:update-run-form, app:manual-handover

const { getActorByFormId, hasActiveActor } = require('./booking-actors.cjs');
const { updateLiveForm } = require('../booking/controls.cjs');

function isTrustedSender(event, root) {
  try {
    const url = new URL(event.sender.getURL());
    if (url.protocol !== 'file:') return false;
    const { resolve } = require('node:path');
    const expected = resolve(root, 'src/renderer/booking-box.html');
    // url.pathname on Windows has a leading slash (e.g., '/C:/path'), strip it for resolve()
    const pathname = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    const actual = resolve(pathname);
    return actual === expected;
  } catch {
    return false;
  }
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'Invalid patch: must be an object' };
  }
  const allowedFields = new Set([
    'date', 'classCode', 'quota', 'paymentMethod',
    'paymentMethodDisplay', 'upiId'
  ]);
  const unknownFields = Object.keys(patch).filter(k => !allowedFields.has(k));
  if (unknownFields.length > 0) {
    return { ok: false, error: 'Unsupported fields in patch: ' + unknownFields.join(', ') };
  }
  return { ok: true };
}

// Check if a field change requires restart (slot-sensitive)
function isSlotSensitiveChange(actor, patch) {
  // If the booking has already committed to a specific slot (train selected, availability confirmed)
  // then changing date, classCode, or quota requires restart
  if (actor?.job?.trainNumber && (patch.date !== undefined || patch.classCode !== undefined || patch.quota !== undefined)) {
    return true;
  }
  return false;
}

function install(electron, root, { functionFactories } = {}) {
  // app:update-run-form - Live Form Update
  electron.ipcMain.handle('app:update-run-form', async (event, formId, patch) => {
    if (!isTrustedSender(event, root)) {
      return { ok: false, error: 'Untrusted sender' };
    }
    if (!formId || typeof formId !== 'string') {
      return { ok: false, error: 'Invalid formId' };
    }

    const validation = validatePatch(patch);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const actor = getActorByFormId(formId);
    if (!actor) {
      return { ok: false, error: 'No active booking for this formId' };
    }

    if (actor.stopped || actor.terminal) {
      return { ok: false, error: 'Booking is stopped or terminated', restartRequired: false };
    }

    // Check for slot-sensitive changes
    if (isSlotSensitiveChange(actor, patch)) {
      return {
        ok: false,
        error: 'Slot-sensitive field change requires restart',
        restartRequired: true,
        changedFields: Object.keys(patch).filter(k => ['date', 'classCode', 'quota'].includes(k))
      };
    }

    // Use the existing updateLiveForm behavior
    // The function factory f2081 calls updateLiveForm(this, patch)
    // We call it directly with the actor as context
    try {
      const result = updateLiveForm.call(actor, patch);
      // updateLiveForm returns undefined on success
      return { ok: true, result };
    } catch (error) {
      return { ok: false, error: 'Update failed: ' + error.message };
    }
  });

  // app:manual-handover - Manual Handover
  electron.ipcMain.handle('app:manual-handover', async (event, formId) => {
    if (!isTrustedSender(event, root)) {
      return { ok: false, error: 'Untrusted sender' };
    }
    if (!formId || typeof formId !== 'string') {
      return { ok: false, error: 'Invalid formId' };
    }

    const actor = getActorByFormId(formId);
    if (!actor) {
      return { ok: false, error: 'No active booking for this formId' };
    }

    if (actor.stopped || actor.terminal) {
      return { ok: false, error: 'Booking is stopped or terminated' };
    }

    // Check if the booking is actually waiting for manual handover
    // The waitForManualHandover (f2132) sets up the wait and checks actor.manualHandover
    // We should only signal handover if the booking is in a state where it's waiting
    if (!actor.manualHandoverWait) {
      // Not currently waiting for handover - this could be a duplicate or premature signal
      // Allow it but log a warning (the flag will be set and picked up when wait starts)
      actor.log?.('warn', 'Manual handover signaled but not in wait state; flag will be picked up when wait begins');
    }

    // Set the handover flag - this is what requestManualHandover (f2045) does
    // Both compiled and interpreter runtimes set actor.manualHandover = true
    actor.manualHandover = true;

    // Also set a flag to indicate handover was explicitly requested
    actor.manualHandoverRequested = true;

    return { ok: true };
  });

  return {
    // Expose for testing
    _internal: { isTrustedSender, validatePatch, isSlotSensitiveChange }
  };
}

module.exports = { install };