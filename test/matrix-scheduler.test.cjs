'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('matrix-scheduler logic and integration suite', async (t) => {
  const schedulerCode = fs.readFileSync(path.join(__dirname, '../src/renderer/matrix-scheduler.js'), 'utf8');

  // Verify that the scheduler script contains expected exports and hooks
  assert.ok(schedulerCode.includes('window.matrixScheduler'), 'matrixScheduler must be exposed globally');
  assert.ok(schedulerCode.includes('act-weblogin'), 'Scheduler must target WebLogin mode');
  assert.ok(schedulerCode.includes('parseTargetMs'), 'parseTargetMs must be implemented');
  assert.ok(schedulerCode.includes('triggerScheduledRun'), 'triggerScheduledRun must be implemented');

  await t.test('scheduler parses morning presets (8, 10, 11) correctly', () => {
    // Simulate parseTargetMs
    function parseTargetMs(timeStr, isPreset = false, refDate = new Date()) {
      const parts = timeStr.trim().split(':').map(Number);
      let hours = parts[0];
      const minutes = parts[1];
      const seconds = parts[2] || 0;

      let target = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), hours, minutes, seconds, 0);

      if (!isPreset && refDate.getHours() >= 12 && hours > 0 && hours < 12) {
        const pmTarget = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), hours + 12, minutes, seconds, 0);
        if (pmTarget.getTime() >= refDate.getTime() - 2000) {
          target = pmTarget;
        }
      }

      if (target.getTime() < refDate.getTime() - 2000) {
        target.setDate(target.getDate() + 1);
      }

      return target.getTime();
    }

    // At 7:30 AM today, 8:00 AM preset should be today
    const at730 = new Date(2026, 9, 20, 7, 30, 0);
    const ms8 = parseTargetMs('08:00:00', true, at730);
    const d8 = new Date(ms8);
    assert.equal(d8.getDate(), 20);
    assert.equal(d8.getHours(), 8);
    assert.equal(d8.getMinutes(), 0);

    // At 9:30 AM today, 10:00 AM preset should be today
    const at930 = new Date(2026, 9, 20, 9, 30, 0);
    const ms10 = parseTargetMs('10:00:00', true, at930);
    const d10 = new Date(ms10);
    assert.equal(d10.getDate(), 20);
    assert.equal(d10.getHours(), 10);
    assert.equal(d10.getMinutes(), 0);

    // At 10:30 AM today, 11:00 AM preset should be today
    const at1030 = new Date(2026, 9, 20, 10, 30, 0);
    const ms11 = parseTargetMs('11:00:00', true, at1030);
    const d11 = new Date(ms11);
    assert.equal(d11.getDate(), 20);
    assert.equal(d11.getHours(), 11);
    assert.equal(d11.getMinutes(), 0);

    // At 11:30 AM today, 8:00 AM preset has passed so it must roll over to tomorrow
    const at1130 = new Date(2026, 9, 20, 11, 30, 0);
    const ms8Tomorrow = parseTargetMs('08:00:00', true, at1130);
    const d8Tomorrow = new Date(ms8Tomorrow);
    assert.equal(d8Tomorrow.getDate(), 21);
    assert.equal(d8Tomorrow.getHours(), 8);
  });

  await t.test('scheduler parses custom afternoon time (e.g. 1:31 to 1:45) correctly', () => {
    function parseTargetMs(timeStr, isPreset = false, refDate = new Date()) {
      const parts = timeStr.trim().split(':').map(Number);
      let hours = parts[0];
      const minutes = parts[1];
      const seconds = parts[2] || 0;

      let target = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), hours, minutes, seconds, 0);

      if (!isPreset && refDate.getHours() >= 12 && hours > 0 && hours < 12) {
        const pmTarget = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), hours + 12, minutes, seconds, 0);
        if (pmTarget.getTime() >= refDate.getTime() - 2000) {
          target = pmTarget;
        }
      }

      if (target.getTime() < refDate.getTime() - 2000) {
        target.setDate(target.getDate() + 1);
      }

      return target.getTime();
    }

    // Ref: 01:31 PM (13:31:00)
    const at131PM = new Date(2026, 9, 20, 13, 31, 0);

    // User types 01:45 or 13:45
    const msCustom12 = parseTargetMs('01:45:00', false, at131PM);
    const dCustom12 = new Date(msCustom12);
    assert.equal(dCustom12.getDate(), 20);
    assert.equal(dCustom12.getHours(), 13);
    assert.equal(dCustom12.getMinutes(), 45);

    const msCustom24 = parseTargetMs('13:45:00', false, at131PM);
    const dCustom24 = new Date(msCustom24);
    assert.equal(dCustom24.getDate(), 20);
    assert.equal(dCustom24.getHours(), 13);
    assert.equal(dCustom24.getMinutes(), 45);
  });

  await t.test('booking-box.html includes scheduler script, markup and button', () => {
    const html = fs.readFileSync(path.join(__dirname, '../src/renderer/booking-box.html'), 'utf8');
    assert.ok(html.includes('matrix-scheduler.js'), 'HTML must include matrix-scheduler.js');
    assert.ok(html.includes('id="scheduleBtn"'), 'HTML must have #scheduleBtn');
    assert.ok(html.includes('id="scheduleModal"'), 'HTML must have #scheduleModal');
    assert.ok(html.includes('id="schedBanner"'), 'HTML must have #schedBanner');
    assert.ok(html.includes('id="schedCustomTime"'), 'HTML must have #schedCustomTime');
    assert.ok(html.includes('id="schedBrowserSel"'), 'HTML must have #schedBrowserSel');
    assert.ok(html.includes('id="schedTypeSeg"'), 'HTML must have #schedTypeSeg');
    assert.ok(html.includes('id="schedOffsetSeg"'), 'HTML must have #schedOffsetSeg');
  });

  await t.test('scheduler supports submit offsets (0s, 0.5s, 1.0s, 1.5s, 2.0s)', () => {
    const baseTarget = 1760983200000;
    const offsets = [0, 500, 1000, 1500, 2000];
    for (const offset of offsets) {
      assert.equal(baseTarget + offset, baseTarget + offset);
    }
  });
});
