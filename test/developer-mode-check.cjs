'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Developer Mode Comprehensive UI & Feature Verification
 * Tests all pages, buttons, dropdowns, and scheduler in development mode.
 */
async function run(electron, root, log = () => {}) {
  const diagDir = path.join(root, 'diagnostics', 'dev-check');
  fs.mkdirSync(diagDir, { recursive: true });

  const report = {
    startedAt: new Date().toISOString(),
    isDevelopment: true,
    pagesTested: {},
    schedulerTested: {},
    bookingBoxTested: {},
    windowsFound: []
  };

  try {
    let controller;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      controller = electron.BrowserWindow.getAllWindows().find(w => {
        try {
          return w.webContents.getURL().includes('controller.html') && !w.webContents.isLoading();
        } catch { return false; }
      });
      if (controller) break;
      await new Promise(r => setTimeout(r, 300));
    }

    if (!controller) throw new Error('Controller window failed to load in developer mode');

    log('dev-check-controller-ready', { id: controller.id });

    // 1. Test Controller Toolbar Buttons
    const actions = [
      { name: 'new-form', page: 'form.html' },
      { name: 'open-form', page: 'open-form.html' },
      { name: 'login-data', page: 'login-data.html' },
      { name: 'proxy', page: 'proxy.html' },
      { name: 'payment', page: 'payment.html' },
      { name: 'history', page: 'history.html' },
      { name: 'tools', page: 'tools.html' },
      { name: 'updates', page: 'updates.html' },
      { name: 'logs', page: 'logs.html' }
    ];

    for (const item of actions) {
      try {
        const actionResult = await controller.webContents.executeJavaScript(
          `window.api.controllerAction(${JSON.stringify(item.name)})`
        );
        await new Promise(r => setTimeout(r, 600));

        const targetWin = electron.BrowserWindow.getAllWindows().find(w => {
          try { return w.webContents.getURL().includes(item.page); } catch { return false; }
        });

        report.pagesTested[item.name] = {
          triggered: true,
          actionResult,
          windowCreated: !!targetWin,
          title: targetWin ? targetWin.getTitle() : null
        };

        if (targetWin) {
          const domCheck = await targetWin.webContents.executeJavaScript(`({
            readyState: document.readyState,
            elements: document.querySelectorAll('*').length,
            buttons: document.querySelectorAll('button').length,
            inputs: document.querySelectorAll('input, select').length,
            brandLogoPresent: !!document.querySelector('img[src*="matrix-logo"], svg, .brand'),
            hasErrorText: /error|unlicensed|forbidden/i.test(document.body.innerText)
          })`).catch(e => ({ error: e.message }));
          report.pagesTested[item.name].dom = domCheck;
        }
      } catch (err) {
        report.pagesTested[item.name] = { error: err.message };
      }
    }

    // 2. Test Scheduler Modal & Buttons inside booking-box.html
    const qaForm = {
      id: 'dev-mode-qa-form',
      label: 'Developer Mode QA',
      account: { username: 'dev-user', password: 'DevPassword123' },
      journey: { trainNumber: '12301', journeyDate: '2026-10-21', origin: 'NDLS', destination: 'HWH', quota: 'GN', classCode: '3A' },
      payment: { method: 'paytm' },
      passengers: [{ name: 'Test User', age: 32, gender: 'M', berth: 'No Preference', food: 'No Food' }]
    };

    await controller.webContents.executeJavaScript(`window.api.saveForm(${JSON.stringify(qaForm)})`);
    await controller.webContents.executeJavaScript(`window.api.openBookingBox(${JSON.stringify(qaForm.id)})`);
    await new Promise(r => setTimeout(r, 1500));

    const boxWin = electron.BrowserWindow.getAllWindows().find(w => {
      try { return w.webContents.getURL().includes('booking-box.html'); } catch { return false; }
    });

    if (boxWin) {
      try {
        const schedCheck = await boxWin.webContents.executeJavaScript(`(() => {
          const btn = document.getElementById('scheduleBtn');
          const modal = document.getElementById('scheduleModal');
          if (!btn) return { hasButton: false };

          btn.click();
          const isOpen = modal && !modal.classList.contains('hidden');

          // Check options
          const presets = Array.from(document.querySelectorAll('.sched-preset-btn')).map(el => el.getAttribute('data-time'));
          const offsets = Array.from(document.querySelectorAll('#schedOffsetSeg .sched-seg-btn')).map(el => el.getAttribute('data-offset'));
          const browserSel = document.getElementById('schedBrowserSel');
          const browsers = browserSel ? Array.from(browserSel.options).map(o => o.value) : [];

          // Click close
          const closeBtn = document.getElementById('schedClose');
          if (closeBtn) closeBtn.click();
          const isClosed = modal && modal.classList.contains('hidden');

          return {
            hasButton: true,
            modalOpens: isOpen,
            modalCloses: isClosed,
            presets,
            browsers,
            offsets
          };
        })()`);
        report.schedulerTested = schedCheck;
      } catch (e) {
        report.schedulerTested = { error: e.message };
      }

      // 3. Test Booking Box Panel (interactive components)
      try {
        const boxDom = await boxWin.webContents.executeJavaScript(`(() => {
          return {
            account: document.querySelector('#acctPick .bb-pick-label')?.textContent?.trim(),
            payment: document.querySelector('#payPick .bb-pick-label')?.textContent?.trim(),
            loginMode: document.getElementById('loginModeVal')?.textContent?.trim(),
            status: document.getElementById('statusText')?.textContent?.trim(),
            hasBookNow: !!document.getElementById('matrixGeneralTimer') || !!document.querySelector('.act-book'),
            hasScheduleBtn: !!document.getElementById('scheduleBtn'),
            clockVisible: !!document.getElementById('clock')?.textContent?.trim()
          };
        })()`);
        report.bookingBoxTested = { windowCreated: true, ...boxDom };
      } catch (e) {
        report.bookingBoxTested = { error: e.message };
      }
    } else {
      report.bookingBoxTested = { windowCreated: false };
    }

    // Cleanup test form
    await controller.webContents.executeJavaScript(`window.api.deleteForm(${JSON.stringify(qaForm.id)})`).catch(() => {});

    // 4. Capture all open windows and DOM state
    for (const win of electron.BrowserWindow.getAllWindows()) {
      try {
        const u = win.webContents.getURL();
        const info = {
          id: win.id,
          url: u,
          title: win.getTitle(),
          visible: win.isVisible()
        };
        const shot = await win.webContents.capturePage();
        const shotPath = path.join(diagDir, `window-${win.id}.png`);
        fs.writeFileSync(shotPath, shot.toPNG());
        info.screenshot = shotPath;
        report.windowsFound.push(info);
      } catch {}
    }

    report.success = true;
    report.finishedAt = new Date().toISOString();
  } catch (err) {
    report.success = false;
    report.error = err.message;
  }

  const outJson = path.join(diagDir, 'developer-check-report.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  log('dev-check-completed', { success: report.success, pages: Object.keys(report.pagesTested).length });
  return report;
}

module.exports = { run };
