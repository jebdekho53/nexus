'use strict';
// Registry for active booking actors by formId.
// Allows IPC handlers to resolve the correct actor for a running booking.

const actorsByFormId = new Map();
const actorFormId = new WeakMap();

function registerActor(actor, formId) {
  if (!actor || !formId) return;
  if (actorsByFormId.has(formId)) {
    // Log but don't overwrite - there should only be one active booking per formId
    console.warn('[booking-actors] Actor already registered for formId:', formId);
  }
  actorsByFormId.set(formId, actor);
  actorFormId.set(actor, formId);
}

function unregisterActor(actor) {
  const formId = actorFormId.get(actor);
  if (formId) {
    actorsByFormId.delete(formId);
    actorFormId.delete(actor);
  }
}

function getActorByFormId(formId) {
  return actorsByFormId.get(formId) || null;
}

function getFormIdByActor(actor) {
  return actorFormId.get(actor) || null;
}

function hasActiveActor(formId) {
  return actorsByFormId.has(formId);
}

// Interceptors for booking start/end to maintain the registry
function createInterceptors() {
  return {
    // f2161 = runBrowserBooking
    f2161: (original, args, actor) => {
      const job = args[0];
      const formId = job?.formId || job?.id;
      if (formId) registerActor(actor, formId);
      try {
        return original(...args);
      } finally {
        // Cleanup when booking completes (success or failure)
        // Note: We don't unregister here immediately because the actor may still be
        // referenced by waitForManualHandover. Let the stop/cleanup handle it.
      }
    },
    // f2172 = runUiBooking
    f2172: (original, args, actor) => {
      const job = args[0];
      const formId = job?.formId || job?.id;
      if (formId) registerActor(actor, formId);
      try {
        return original(...args);
      } finally {
        // Same as above
      }
    },
    // f2079 = stopWith - called when booking is stopped
    f2079: (original, args, actor) => {
      const result = original(...args);
      // If stopped, unregister after a brief delay to allow any in-flight handlers
      if (actor?.stopped) {
        setImmediate(() => unregisterActor(actor));
      }
      return result;
    },
    // f2047 = stoppedResult - called when booking ends
    f2047: (original, args, actor) => {
      const result = original(...args);
      setImmediate(() => unregisterActor(actor));
      return result;
    },
    // f2233 = finishBookingCore - called when booking completes successfully
    f2233: (original, args, actor) => {
      const result = original(...args);
      setImmediate(() => unregisterActor(actor));
      return result;
    },
  };
}

module.exports = {
  registerActor,
  unregisterActor,
  getActorByFormId,
  getFormIdByActor,
  hasActiveActor,
  createInterceptors,
};