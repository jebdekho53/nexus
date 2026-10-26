'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { install } = require('../src/main/runtime/special-train-selection.cjs');

function setup() {
  const handlers = new Map(), root = path.resolve(__dirname, '..'), now = Date.parse('2026-10-25T02:00:00Z');
  const electron = { ipcMain: { handle: (name, handler) => handlers.set(name, handler) } };
  const { interceptors } = install(electron, root, { now: () => now });
  const sender = { id: 1, getURL: () => pathToFileURL(path.join(root, 'src/renderer/form.html')).href + '?id=one', once: () => {} };
  return { electron, handlers, interceptors, sender, now };
}

test('explicit selection survives old save/normalization/export; old bool is not opted in', async () => {
  const s = setup();
  let saved;
  s.electron.ipcMain.handle('app:save-form', (_event, input) => { saved = input; return input; });
  assert.deepEqual(s.handlers.get('matrix:special-train-selection')({ sender: s.sender }, true), { ok: true });
  await s.handlers.get('app:save-form')({ sender: s.sender }, { id: 'one', journey: { specialTrain: true } });
  const normalized = s.interceptors.f472(() => ({ id: 'one', journey: { specialTrain: true } }), [saved]);
  assert.equal(normalized.journey.specialTrainSelectedAt, s.now);
  assert.equal(s.interceptors.f485(() => ({}), [normalized]).specialTrainSelectedAt, s.now);

  const old = s.interceptors.f472(() => ({ id: 'old', journey: { specialTrain: true } }), [{ id: 'old' }]);
  assert.equal(old.journey.specialTrainSelectedAt, undefined);

  s.handlers.get('matrix:special-train-selection')({ sender: s.sender }, false);
  await s.handlers.get('app:save-form')({ sender: s.sender }, { id: 'one', journey: { specialTrain: false } });
  const disabled = s.interceptors.f472(() => ({ id: 'one', journey: { specialTrain: false } }), [saved]);
  assert.equal(disabled.journey.specialTrainSelectedAt, undefined);
});

test('editing an existing form without retoggling preserves timestamp via known map', async () => {
  const s = setup();
  let saved;
  s.electron.ipcMain.handle('app:save-form', (_event, input) => { saved = input; return input; });
  // Step 1: User initially selected specialTrain
  s.handlers.get('matrix:special-train-selection')({ sender: s.sender }, true);
  await s.handlers.get('app:save-form')({ sender: s.sender }, { id: 'existing-form', journey: { specialTrain: true } });
  const normalized = s.interceptors.f472(() => ({ id: 'existing-form', journey: { specialTrain: true } }), [saved]);
  assert.equal(normalized.journey.specialTrainSelectedAt, s.now);

  // Step 2: Later, user edits form (new sender/window) without retoggling checkbox
  const sender2 = { id: 2, getURL: s.sender.getURL, once: () => {} };
  let editSaved;
  s.electron.ipcMain.handle('app:save-form', (_event, input) => { editSaved = input; return input; });
  await s.handlers.get('app:save-form')({ sender: sender2 }, { id: 'existing-form', journey: { specialTrain: true } });
  const editNormalized = s.interceptors.f472(() => ({ id: 'existing-form', journey: { specialTrain: true } }), [editSaved]);
  assert.equal(editNormalized.journey.specialTrainSelectedAt, s.now);

  // Step 3: Now user explicitly unchecks specialTrain
  s.handlers.get('matrix:special-train-selection')({ sender: sender2 }, false);
  let uncheckSaved;
  s.electron.ipcMain.handle('app:save-form', (_event, input) => { uncheckSaved = input; return input; });
  await s.handlers.get('app:save-form')({ sender: sender2 }, { id: 'existing-form', journey: { specialTrain: false } });
  const uncheckNormalized = s.interceptors.f472(() => ({ id: 'existing-form', journey: { specialTrain: false } }), [uncheckSaved]);
  assert.equal(uncheckNormalized.journey.specialTrainSelectedAt, undefined);

  // Step 4: After unchecking, known map was cleared; saving specialTrain without fresh selection does NOT regain timestamp
  const laterWithoutRetoggle = s.interceptors.f472(() => ({ id: 'existing-form', journey: { specialTrain: true } }), [{ id: 'existing-form', journey: { specialTrain: true } }]);
  assert.equal(laterWithoutRetoggle.journey.specialTrainSelectedAt, undefined);
});

test('f485 serializer interceptor preserves timestamp whether input is nested or flat', () => {
  const s = setup();
  // Nested journey input
  const nested = { journey: { specialTrainSelectedAt: s.now } };
  assert.equal(s.interceptors.f485(() => ({}), [nested]).specialTrainSelectedAt, s.now);

  // Flat input
  const flat = { specialTrainSelectedAt: s.now };
  assert.equal(s.interceptors.f485(() => ({}), [flat]).specialTrainSelectedAt, s.now);

  // Without timestamp
  assert.equal(s.interceptors.f485(() => ({}), [{}]).specialTrainSelectedAt, undefined);
});

test('selection rejects remote/unrelated renderers and future timestamps', () => {
  const s = setup();
  assert.deepEqual(s.handlers.get('matrix:special-train-selection')({ sender: { getURL: () => 'https://example.com/form.html' } }, true), { ok: false });
  const result = s.interceptors.f472(() => ({ journey: { specialTrain: true } }), [{ specialTrainSelectedAt: s.now + 1 }]);
  assert.equal(result.journey.specialTrainSelectedAt, undefined);
});
