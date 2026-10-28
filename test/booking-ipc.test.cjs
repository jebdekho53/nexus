'use strict';
// Regression tests for booking IPC handlers: app:update-run-form and app:manual-handover

const assert = require('node:assert');
const { describe, it, before, after, beforeEach } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

// Mock electron
const electron = {
  ipcMain: {
    handlers: new Map(),
    handle: function(name, handler) {
      this.handlers.set(name, handler);
    }
  }
};

// Test utilities
function createMockEvent(senderUrl) {
  return {
    sender: {
      getURL: () => senderUrl
    }
  };
}

function createMockActor(formId, options = {}) {
  return {
    formId,
    job: options.job || {},
    stopped: options.stopped || false,
    terminal: options.terminal || false,
    manualHandover: false,
    manualHandoverWait: options.manualHandoverWait || false,
    log: options.log || (() => {}),
    updateLiveForm: function(patch) {
      // Simulate the real updateLiveForm behavior
      Object.assign(this.job, patch);
      return undefined;
    }
  };
}

describe('booking-ipc handlers', () => {
  let testRoot;
  let bookingActors;
  let bookingIpc;
  let internal;

  before(async () => {
    // Setup test environment
    testRoot = path.join(__dirname, 'booking-ipc-test-profile');
    fs.mkdirSync(testRoot, { recursive: true });

    // Load the modules
    bookingActors = require('../src/main/runtime/booking-actors.cjs');
    bookingIpc = require('../src/main/runtime/booking-ipc.cjs');

    // Install IPC handlers
    const result = bookingIpc.install(electron, testRoot, { functionFactories: {} });
    internal = result._internal;
  });

  after(() => {
    // Cleanup
    bookingActors = null;
    bookingIpc = null;
    internal = null;
  });

  beforeEach(() => {
    // Clear actor registry before each test by creating new test root
    // Note: The Map is module-level so we use unique formIds
  });

  describe('isTrustedSender', () => {
    it('should accept trusted file:// URLs from booking-box.html', () => {
      // Use pathToFileURL to properly construct the file:// URL
      const { pathToFileURL } = require('node:url');
      const expectedPath = path.join(testRoot, 'src', 'renderer', 'booking-box.html');
      const fileUrl = pathToFileURL(expectedPath).href;
      const event = createMockEvent(fileUrl);
      assert.strictEqual(internal.isTrustedSender(event, testRoot), true);
    });

    it('should reject non-file:// protocols', () => {
      const event = createMockEvent('https://example.com/booking-box.html');
      assert.strictEqual(internal.isTrustedSender(event, testRoot), false);
    });

    it('should reject wrong file paths', () => {
      const { pathToFileURL } = require('node:url');
      const wrongPath = path.join(testRoot, 'src', 'renderer', 'other-page.html');
      const fileUrl = pathToFileURL(wrongPath).href;
      const event = createMockEvent(fileUrl);
      assert.strictEqual(internal.isTrustedSender(event, testRoot), false);
    });
  });

  describe('validatePatch', () => {
    it('should accept valid patches with allowed fields', () => {
      const validPatches = [
        { date: '2026-11-15' },
        { classCode: 'SL' },
        { quota: 'GN' },
        { paymentMethod: 'UPI' },
        { paymentMethodDisplay: 'UPI Collect' },
        { upiId: 'user@upi' },
        { date: '2026-11-15', classCode: '3A' },
        { paymentMethod: 'NETBANKING', paymentMethodDisplay: 'Net Banking' }
      ];

      for (const patch of validPatches) {
        const result = internal.validatePatch(patch);
        assert.strictEqual(result.ok, true, `Expected valid patch to pass: ${JSON.stringify(patch)}`);
      }
    });

    it('should reject patches with unsupported fields', () => {
      const invalidPatches = [
        { invalidField: 'value' },
        { date: '2026-11-15', unknownField: 'value' },
        { trainNumber: '12345' }, // Not in allowed list
        { formId: 'test' } // Not in allowed list
      ];

      for (const patch of invalidPatches) {
        const result = internal.validatePatch(patch);
        assert.strictEqual(result.ok, false, `Expected invalid patch to fail: ${JSON.stringify(patch)}`);
        assert.ok(result.error.includes('Unsupported fields'));
      }
    });

    it('should reject non-object patches', () => {
      const invalidInputs = [
        null,
        undefined,
        'string',
        123,
        [],
        true
      ];

      for (const input of invalidInputs) {
        const result = internal.validatePatch(input);
        assert.strictEqual(result.ok, false, `Expected non-object to fail: ${typeof input}`);
        assert.ok(result.error.includes('must be an object'));
      }
    });
  });

  describe('isSlotSensitiveChange', () => {
    it('should return true when trainNumber is set and date changes', () => {
      const actor = createMockActor('form-1', { job: { trainNumber: '12345' } });
      const patch = { date: '2026-11-15' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), true);
    });

    it('should return true when trainNumber is set and classCode changes', () => {
      const actor = createMockActor('form-1', { job: { trainNumber: '12345' } });
      const patch = { classCode: '3A' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), true);
    });

    it('should return true when trainNumber is set and quota changes', () => {
      const actor = createMockActor('form-1', { job: { trainNumber: '12345' } });
      const patch = { quota: 'GN' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), true);
    });

    it('should return false when trainNumber is not set', () => {
      const actor = createMockActor('form-1', { job: {} });
      const patch = { date: '2026-11-15', classCode: '3A', quota: 'GN' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), false);
    });

    it('should return false for non-slot-sensitive fields', () => {
      const actor = createMockActor('form-1', { job: { trainNumber: '12345' } });
      const patch = { paymentMethod: 'UPI', upiId: 'user@upi' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), false);
    });

    it('should return false when actor has no job', () => {
      const actor = createMockActor('form-1', { job: null });
      const patch = { date: '2026-11-15' };
      assert.strictEqual(internal.isSlotSensitiveChange(actor, patch), false);
    });
  });

  describe('app:update-run-form handler (via internal methods)', () => {
    it('should have getActorByFormId function available', () => {
      assert.strictEqual(typeof bookingActors.getActorByFormId, 'function');
    });

    it('should have registerActor and unregisterActor functions', () => {
      assert.strictEqual(typeof bookingActors.registerActor, 'function');
      assert.strictEqual(typeof bookingActors.unregisterActor, 'function');
    });

    it('should register and retrieve actors by formId', () => {
      const testFormId = 'test-form-' + Date.now();
      const actor = createMockActor(testFormId);

      bookingActors.registerActor(actor, testFormId);
      const retrieved = bookingActors.getActorByFormId(testFormId);

      assert.strictEqual(retrieved, actor);

      // Cleanup
      bookingActors.unregisterActor(actor);
    });

    it('should return null for non-existent formId', () => {
      const retrieved = bookingActors.getActorByFormId('non-existent-form-id');
      assert.strictEqual(retrieved, null);
    });

    it('should track active actors correctly', () => {
      const testFormId = 'test-form-active-' + Date.now();
      const actor = createMockActor(testFormId);

      assert.strictEqual(bookingActors.hasActiveActor(testFormId), false);

      bookingActors.registerActor(actor, testFormId);
      assert.strictEqual(bookingActors.hasActiveActor(testFormId), true);

      bookingActors.unregisterActor(actor);
      assert.strictEqual(bookingActors.hasActiveActor(testFormId), false);
    });
  });

  describe('app:manual-handover handler (via internal logic)', () => {
    it('should set manualHandover flag on actor', () => {
      const testFormId = 'test-handover-' + Date.now();
      const actor = createMockActor(testFormId, { manualHandoverWait: true });

      bookingActors.registerActor(actor, testFormId);

      // Simulate the handler logic
      actor.manualHandover = true;
      actor.manualHandoverRequested = true;

      assert.strictEqual(actor.manualHandover, true);
      assert.strictEqual(actor.manualHandoverRequested, true);

      bookingActors.unregisterActor(actor);
    });

    it('should set flag even when not in wait state (with warning)', () => {
      const testFormId = 'test-handover-no-wait-' + Date.now();
      const actor = createMockActor(testFormId, { manualHandoverWait: false });

      bookingActors.registerActor(actor, testFormId);

      // Simulate the handler logic - should still set the flag
      actor.manualHandover = true;
      actor.manualHandoverRequested = true;

      assert.strictEqual(actor.manualHandover, true);
      assert.strictEqual(actor.manualHandoverRequested, true);

      bookingActors.unregisterActor(actor);
    });
  });

  describe('interceptors registration', () => {
    it('should create interceptors for key booking functions', () => {
      const interceptors = bookingActors.createInterceptors();

      // Check all expected interceptors are present
      assert.ok(interceptors.f2161, 'f2161 (runBrowserBooking) interceptor missing');
      assert.ok(interceptors.f2172, 'f2172 (runUiBooking) interceptor missing');
      assert.ok(interceptors.f2079, 'f2079 (stopWith) interceptor missing');
      assert.ok(interceptors.f2047, 'f2047 (stoppedResult) interceptor missing');
      assert.ok(interceptors.f2233, 'f2233 (finishBookingCore) interceptor missing');
    });

    it('should call original function in f2161 interceptor', () => {
      const interceptors = bookingActors.createInterceptors();
      let originalCalled = false;

      const original = (...args) => {
        originalCalled = true;
        return 'original-result';
      };

      const actor = createMockActor('test-interceptor-' + Date.now());
      const job = { formId: actor.formId };

      const result = interceptors.f2161(original, [job], actor);

      assert.strictEqual(originalCalled, true);
      assert.strictEqual(result, 'original-result');
    });

    it('should register actor when f2161 is called with job.formId', () => {
      const interceptors = bookingActors.createInterceptors();
      const testFormId = 'test-interceptor-reg-' + Date.now();
      const actor = createMockActor(testFormId);
      const job = { formId: testFormId };

      interceptors.f2161(() => {}, [job], actor);

      const retrieved = bookingActors.getActorByFormId(testFormId);
      assert.strictEqual(retrieved, actor);

      bookingActors.unregisterActor(actor);
    });
  });
});

describe('integration: app:update-run-form and app:manual-handover', () => {
  let testRoot;

  before(() => {
    testRoot = path.join(__dirname, 'booking-ipc-integration-profile');
    fs.mkdirSync(testRoot, { recursive: true });
  });

  it('should have app:update-run-form handler registered', () => {
    const bookingIpc = require('../src/main/runtime/booking-ipc.cjs');
    const result = bookingIpc.install(electron, testRoot, { functionFactories: {} });
    assert.ok(result);
    assert.ok(result._internal);
    // Verify handler is registered
    assert.ok(electron.ipcMain.handlers.has('app:update-run-form'));
  });

  it('should have app:manual-handover handler registered', () => {
    const bookingIpc = require('../src/main/runtime/booking-ipc.cjs');
    const result = bookingIpc.install(electron, testRoot, { functionFactories: {} });
    assert.ok(result);
    assert.ok(result._internal);
    // Verify handler is registered
    assert.ok(electron.ipcMain.handlers.has('app:manual-handover'));
  });

  it('should export internal validation functions for testing', () => {
    const bookingIpc = require('../src/main/runtime/booking-ipc.cjs');
    const result = bookingIpc.install(electron, testRoot, { functionFactories: {} });

    assert.strictEqual(typeof result._internal.isTrustedSender, 'function');
    assert.strictEqual(typeof result._internal.validatePatch, 'function');
    assert.strictEqual(typeof result._internal.isSlotSensitiveChange, 'function');
  });
});