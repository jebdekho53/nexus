'use strict';

/**
 * Matrix Booking Scheduler
 * Schedules WebLogin & Submit runs at preset opening times (08:00, 10:00, 11:00)
 * or custom times (e.g. 01:45:00) on a user-chosen browser with configurable submit offset.
 */
(() => {
  let scheduleTimer = null;
  let preLoginTimer = null;
  let targetTimestamp = null;
  let targetBrowserId = 'chrome';
  let targetDisplayTime = '';
  let scheduleType = 'auto'; // 'auto' (Login + Submit), 'submit' (Submit Only), 'login' (WebLogin Only)
  let submitOffsetMs = 0; // 0, 500, 1000, 1500, 2000 ms
  let isArmed = false;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function getBrowserDisplayName(id) {
    const map = {
      'chrome': 'Google Chrome',
      'brave': 'Brave Browser',
      'brave-beta': 'Brave Beta',
      'edge': 'Microsoft Edge',
      'chrome-advance': 'Chrome Advance',
      'gologin': 'GoLogin'
    };
    return map[id] || id;
  }

  function parseTargetMs(timeStr, isPreset = false) {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;

    let hours = parts[0];
    const minutes = parts[1];
    const seconds = parts[2] || 0;

    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds, 0);

    // If it's not an explicit morning preset, and user entered 1..11 PM time when current hour is >= 12
    if (!isPreset && now.getHours() >= 12 && hours > 0 && hours < 12) {
      const pmTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours + 12, minutes, seconds, 0);
      if (pmTarget.getTime() >= now.getTime() - 2000) {
        target = pmTarget;
      }
    }

    // If the target has already passed today by more than 2 seconds, move to tomorrow
    if (target.getTime() < now.getTime() - 2000) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime();
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '0s';
    const totalSec = Math.ceil(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hrs > 0) {
      return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
    }
    if (mins > 0) {
      return `${mins}m ${pad(secs)}s`;
    }
    return `${secs}s`;
  }

  function populateBrowsers() {
    const sel = document.getElementById('schedBrowserSel');
    if (!sel) return;

    if (window.api && typeof window.api.detectBrowsers === 'function') {
      window.api.detectBrowsers().then(res => {
        if (res && res.ok && Array.isArray(res.data) && res.data.length > 0) {
          sel.innerHTML = '';
          for (const b of res.data) {
            if (b && b.id) {
              const opt = document.createElement('option');
              opt.value = b.id;
              opt.textContent = `${b.label || getBrowserDisplayName(b.id)} ${b.installed === false ? '(not detected)' : '✓'}`;
              if (b.id === targetBrowserId) opt.selected = true;
              sel.appendChild(opt);
            }
          }
        }
      }).catch(() => {});
    }
  }

  function openScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const customInput = document.getElementById('schedCustomTime');
    if (customInput && !customInput.value) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5);
      customInput.value = formatTime(now);
    }
    updateModalSummary();
    populateBrowsers();
  }

  function closeScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.add('hidden');
  }

  function updateModalSummary() {
    const summary = document.getElementById('schedSummary');
    const customInput = document.getElementById('schedCustomTime');
    const browserSel = document.getElementById('schedBrowserSel');
    if (!summary) return;

    const activePreset = document.querySelector('.sched-preset-btn.active');
    const timeVal = activePreset ? activePreset.dataset.time : (customInput ? customInput.value : '');
    const isPreset = !!activePreset;
    const browserId = browserSel ? browserSel.value : 'chrome';

    const targetMs = parseTargetMs(timeVal, isPreset);
    if (!targetMs) {
      summary.textContent = 'Please choose a preset or valid custom time (HH:MM:SS).';
      return;
    }

    const effectiveMs = targetMs + submitOffsetMs;
    const diff = effectiveMs - Date.now();
    const targetDate = new Date(effectiveMs);
    const displayTime = formatTime(new Date(targetMs));
    const dayName = targetDate.getDate() === new Date().getDate() ? 'Today' : 'Tomorrow';
    const offsetStr = submitOffsetMs > 0 ? ` (+${submitOffsetMs / 1000}s)` : '';

    if (scheduleType === 'auto') {
      summary.innerHTML = `Mode: <strong>Login + Auto-Submit</strong> on <strong>${getBrowserDisplayName(browserId)}</strong>. Target opening: <strong>${displayTime}</strong>${offsetStr} (${dayName}, in <strong>${formatRemaining(diff)}</strong>).`;
    } else if (scheduleType === 'submit') {
      summary.innerHTML = `Mode: <strong>Submit Only</strong> at <strong>${displayTime}</strong>${offsetStr} on <strong>${getBrowserDisplayName(browserId)}</strong> (${dayName}, in <strong>${formatRemaining(diff)}</strong>).`;
    } else {
      summary.innerHTML = `Mode: <strong>WebLogin Trigger</strong> at <strong>${displayTime}</strong> on <strong>${getBrowserDisplayName(browserId)}</strong> (${dayName}, in <strong>${formatRemaining(diff)}</strong>).`;
    }
  }

  function armSchedule(targetMs, browserId, displayTime, type = 'auto', offsetMs = 0) {
    disarmSchedule();

    targetTimestamp = targetMs;
    targetBrowserId = browserId || 'chrome';
    targetDisplayTime = displayTime;
    scheduleType = type;
    submitOffsetMs = offsetMs;
    isArmed = true;

    closeScheduleModal();

    const banner = document.getElementById('schedBanner');
    const bannerText = document.getElementById('schedBannerText');
    const schedBtn = document.getElementById('scheduleBtn');
    const statusText = document.getElementById('statusText');

    if (banner) banner.classList.remove('hidden');
    if (schedBtn) {
      schedBtn.classList.add('armed');
      schedBtn.title = 'Click to cancel armed schedule';
    }

    const effectiveTargetMs = targetTimestamp + submitOffsetMs;
    const offsetLabel = submitOffsetMs > 0 ? ` (+${submitOffsetMs / 1000}s)` : '';
    const typeLabel = scheduleType === 'auto' ? 'Login + Submit' : scheduleType === 'submit' ? 'Submit Only' : 'WebLogin';

    // If 'auto' mode and more than 60s remain, schedule pre-login at targetMs - 60s
    const preLoginLeadMs = 60000;
    if (scheduleType === 'auto' && (targetTimestamp - Date.now()) > preLoginLeadMs) {
      const preLoginDelay = (targetTimestamp - preLoginLeadMs) - Date.now();
      preLoginTimer = setTimeout(() => {
        console.log('[Matrix Scheduler] Pre-opening login stage triggered');
        if (isArmed) {
          triggerBrowserLogin(targetBrowserId);
        }
      }, Math.max(100, preLoginDelay));
    }

    const updateTick = () => {
      const now = Date.now();
      const remaining = effectiveTargetMs - now;

      if (remaining <= 0) {
        clearInterval(scheduleTimer);
        scheduleTimer = null;
        triggerScheduledRun();
        return;
      }

      const remStr = formatRemaining(remaining);
      if (bannerText) {
        bannerText.innerHTML = `⏰ Scheduled: <strong>${typeLabel}</strong> at <strong>${targetDisplayTime}</strong>${offsetLabel} on <strong>${getBrowserDisplayName(targetBrowserId)}</strong> (in ${remStr})`;
      }
      if (schedBtn) {
        schedBtn.textContent = `⏹ Cancel (${remStr})`;
      }
    };

    updateTick();
    scheduleTimer = setInterval(updateTick, 500);

    if (statusText) {
      statusText.textContent = `Scheduled: ${targetDisplayTime}${offsetLabel} [${typeLabel}] (${getBrowserDisplayName(targetBrowserId)})`;
    }
  }

  function disarmSchedule(statusMessage = '') {
    if (scheduleTimer) {
      clearInterval(scheduleTimer);
      scheduleTimer = null;
    }
    if (preLoginTimer) {
      clearTimeout(preLoginTimer);
      preLoginTimer = null;
    }
    isArmed = false;
    targetTimestamp = null;

    const banner = document.getElementById('schedBanner');
    const schedBtn = document.getElementById('scheduleBtn');
    const statusText = document.getElementById('statusText');

    if (banner) banner.classList.add('hidden');
    if (schedBtn) {
      schedBtn.classList.remove('armed');
      schedBtn.textContent = '⏰ Schedule';
      schedBtn.title = 'Schedule WebLogin or Submit booking at 8:00, 10:00, 11:00 or custom time';
    }

    if (statusMessage && statusText) {
      statusText.textContent = statusMessage;
    }
  }

  function triggerBrowserLogin(browserId) {
    console.log('[Matrix Scheduler] Launching WebLogin on browser:', browserId);
    window.__scheduledBrowserToPick = browserId;

    const browserModal = document.getElementById('browserModal');
    if (browserModal) {
      browserModal.classList.add('sched-auto-pick');
    }

    const webLoginBtn = document.querySelector('.act-weblogin');
    if (webLoginBtn) {
      webLoginBtn.click();
    }

    let attempts = 0;
    const maxAttempts = 60;
    const interval = setInterval(() => {
      attempts++;
      const tiles = Array.from(document.querySelectorAll('#browserList .browser-tile'));

      if (tiles.length > 0) {
        clearInterval(interval);
        window.__scheduledBrowserToPick = null;

        let matched = tiles.find(t => {
          const tid = (t.dataset.id || '').toLowerCase();
          const txt = (t.textContent || '').toLowerCase();
          return tid === browserId.toLowerCase() || txt.includes(browserId.toLowerCase());
        });

        if (!matched) {
          matched = tiles.find(t => !t.disabled && !t.classList.contains('disabled')) || tiles[0];
        }

        if (matched) {
          matched.click();
        }

        setTimeout(() => {
          if (browserModal) browserModal.classList.remove('sched-auto-pick');
        }, 300);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        if (browserModal) browserModal.classList.remove('sched-auto-pick');
      }
    }, 50);
  }

  function triggerScheduledRun() {
    const browserId = targetBrowserId || 'chrome';
    const offsetLabel = submitOffsetMs > 0 ? ` (+${submitOffsetMs / 1000}s)` : '';
    console.log(`[Matrix Scheduler] Firing schedule (${scheduleType}) on ${browserId}${offsetLabel}`);

    const bannerText = document.getElementById('schedBannerText');
    if (bannerText) {
      bannerText.textContent = `🚀 Firing ${scheduleType === 'submit' ? 'Submit' : 'WebLogin'} on ${getBrowserDisplayName(browserId)}...`;
    }

    const statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = `Firing ${scheduleType} (${getBrowserDisplayName(browserId)})...`;
    }

    // Trigger WebLogin / Run
    triggerBrowserLogin(browserId);

    setTimeout(() => {
      disarmSchedule(`Scheduled ${scheduleType} launched on ${getBrowserDisplayName(browserId)}`);
    }, 1000);
  }

  function init() {
    // Schedule button in action bar
    const scheduleBtn = document.getElementById('scheduleBtn');
    if (scheduleBtn) {
      scheduleBtn.addEventListener('click', () => {
        if (isArmed) {
          disarmSchedule('Schedule cancelled');
        } else {
          openScheduleModal();
        }
      });
    }

    // Modal close & cancel
    const closeBtn = document.getElementById('schedClose');
    const cancelBtn = document.getElementById('schedCancel');
    if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeScheduleModal);

    // Banner cancel
    const bannerCancel = document.getElementById('schedBannerCancel');
    if (bannerCancel) {
      bannerCancel.addEventListener('click', () => disarmSchedule('Schedule cancelled'));
    }

    // Schedule Type segment buttons (Login + Submit, Submit Only, WebLogin)
    const typeBtns = document.querySelectorAll('#schedTypeSeg .sched-seg-btn');
    typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        typeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scheduleType = btn.dataset.type || 'auto';
        updateModalSummary();
      });
    });

    // Preset slot buttons (08:00, 10:00, 11:00)
    const presetBtns = document.querySelectorAll('.sched-preset-btn');
    const customInput = document.getElementById('schedCustomTime');

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (customInput) customInput.value = btn.dataset.time;
        updateModalSummary();
      });
    });

    // Custom time input change
    if (customInput) {
      customInput.addEventListener('input', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        updateModalSummary();
      });
    }

    // Quick minute adjust buttons (+1m, +5m, +10m, +15m)
    const adjBtns = document.querySelectorAll('.sched-adj-btn');
    adjBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        presetBtns.forEach(b => b.classList.remove('active'));
        const mins = Number(btn.dataset.mins) || 1;
        const now = new Date();
        now.setMinutes(now.getMinutes() + mins);
        now.setSeconds(0);
        if (customInput) customInput.value = formatTime(now);
        updateModalSummary();
      });
    });

    // Submit Offset buttons (Exact 0s, +0.5s, +1.0s, +1.5s, +2.0s)
    const offsetBtns = document.querySelectorAll('#schedOffsetSeg .sched-seg-btn');
    offsetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        offsetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        submitOffsetMs = Number(btn.dataset.offset) || 0;
        updateModalSummary();
      });
    });

    // Browser select change
    const browserSel = document.getElementById('schedBrowserSel');
    if (browserSel) {
      browserSel.addEventListener('change', () => {
        targetBrowserId = browserSel.value;
        updateModalSummary();
      });
    }

    // Arm / Submit Schedule button
    const armBtn = document.getElementById('schedArmBtn');
    if (armBtn) {
      armBtn.addEventListener('click', () => {
        const activePreset = document.querySelector('.sched-preset-btn.active');
        const timeVal = activePreset ? activePreset.dataset.time : (customInput ? customInput.value : '');
        const isPreset = !!activePreset;
        const browserId = browserSel ? browserSel.value : 'chrome';

        const targetMs = parseTargetMs(timeVal, isPreset);
        if (!targetMs) {
          alert('Please enter a valid schedule time (HH:MM:SS)');
          return;
        }

        const displayTime = formatTime(new Date(targetMs));
        armSchedule(targetMs, browserId, displayTime, scheduleType, submitOffsetMs);
      });
    }

    populateBrowsers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Global interface for testing & programmatic control
  window.matrixScheduler = {
    arm: (timeStr, browserId = 'chrome', isPreset = false, type = 'auto', offsetMs = 0) => {
      const ms = parseTargetMs(timeStr, isPreset);
      if (ms) armSchedule(ms, browserId, formatTime(new Date(ms)), type, offsetMs);
      return ms;
    },
    disarm: () => disarmSchedule(),
    isArmed: () => isArmed,
    getTargetTimestamp: () => targetTimestamp,
    getTargetBrowser: () => targetBrowserId,
    getScheduleType: () => scheduleType,
    getSubmitOffsetMs: () => submitOffsetMs,
    triggerNow: () => triggerScheduledRun()
  };
})();
