/**
 * Nexus 2.0 - Standalone Verification Test Suite
 */
'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const BOOKING_DIR = path.join(__dirname, 'booking');
const PAYMENT_DIR = path.join(__dirname, 'payment');

test('Nexus 2.0: all booking modules require without errors', (t) => {
  const files = fs.readdirSync(BOOKING_DIR).filter(f => f.endsWith('.cjs'));
  assert.ok(files.length > 5, 'Booking files must be present');
  for (const file of files) {
    const fullPath = path.join(BOOKING_DIR, file);
    assert.doesNotThrow(() => {
      require(fullPath);
    }, `Failed to require booking module: ${file}`);
  }
});

test('Nexus 2.0: all payment modules require without errors', (t) => {
  const files = fs.readdirSync(PAYMENT_DIR).filter(f => f.endsWith('.cjs'));
  assert.ok(files.length > 10, 'Payment files must be present');
  for (const file of files) {
    const fullPath = path.join(PAYMENT_DIR, file);
    assert.doesNotThrow(() => {
      require(fullPath);
    }, `Failed to require payment module: ${file}`);
  }
});

test('Nexus 2.0: index.cjs exports booking and payment structures', () => {
  const nexus = require('./index.cjs');
  assert.ok(nexus.booking, 'nexus.booking must be defined');
  assert.ok(nexus.payment, 'nexus.payment must be defined');
  assert.strictEqual(typeof nexus.booking.rules.isSeniorCitizen, 'function');
  assert.strictEqual(typeof nexus.payment.redirect.formAction, 'function');
});
