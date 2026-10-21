'use strict';

/**
 * MATRIX Mobile Controller Client
 * Manages mobile connection, instant QR delivery, one-tap UPI intents,
 * Tatkal scheduling, and live engine status.
 */
(() => {
  let eventSource = null;
  let pollInterval = null;
  let armedTimer = null;
  let targetTimestamp = null;
  let isArmed = false;
  let deferredPrompt = null;

  // DOM Elements
  const statusPill = document.getElementById('statusPill');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const countdownBadge = document.getElementById('countdownBadge');
  const customTimeGroup = document.getElementById('customTimeGroup');
  const customTimeInput = document.getElementById('customTimeInput');
  const browserSelect = document.getElementById('browserSelect');
  const offsetSelect = document.getElementById('offsetSelect');
  const btnArm = document.getElementById('btnArm');
  const btnStartNow = document.getElementById('btnStartNow');
  const btnStop = document.getElementById('btnStop');
  const btnSaveForm = document.getElementById('btnSaveForm');
  const logBox = document.getElementById('logBox');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const engineHostInput = document.getElementById('engineHostInput');
  const qrModal = document.getElementById('qrModal');
  const qrImage = document.getElementById('qrImage');
  const qrAmount = document.getElementById('qrAmount');
  const qrCaption = document.getElementById('qrCaption');
  const btnUpiIntent = document.getElementById('btnUpiIntent');
  const btnCloseQr = document.getElementById('btnCloseQr');
  const btnInstallPwa = document.getElementById('btnInstallPwa');

  function getBaseUrl() {
    const custom = (engineHostInput.value || '').trim();
    if (custom && custom !== '/') return custom.replace(/\/+$/, '');
    return window.location.origin;
  }

  function appendLog(text, kind = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${kind}`;
    const time = new Date().toTimeString().split(' ')[0];
    entry.textContent = `[${time}] ${text}`;
    logBox.appendChild(entry);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setOnlineState(online, text = 'ONLINE') {
    if (online) {
      statusDot.className = 'status-dot online';
      statusText.textContent = text;
      statusText.style.color = 'var(--accent-green)';
    } else {
      statusDot.className = 'status-dot offline';
      statusText.textContent = text;
      statusText.style.color = 'var(--accent-rose)';
    }
  }

  // Presets handling
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const timeVal = chip.dataset.time;
      if (timeVal === 'custom') {
        customTimeGroup.style.display = 'block';
      } else {
        customTimeGroup.style.display = 'none';
      }
    });
  });

  // Calculate Target Ms
  function getTargetMs() {
    const activeChip = document.querySelector('.preset-chip.active');
    const isCustom = activeChip && activeChip.dataset.time === 'custom';
    let timeStr = isCustom ? customTimeInput.value : activeChip?.dataset.time;
    if (!timeStr) return null;

    const parts = timeStr.trim().split(':').map(Number);
    const targetH = parts[0] || 0;
    const targetM = parts[1] || 0;
    const targetS = parts[2] || 0;

    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH, targetM, targetS, 0);

    // If time is in past today, target next cycle
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  function updateCountdown() {
    if (!isArmed || !targetTimestamp) {
      countdownBadge.style.display = 'none';
      return;
    }
    const diff = targetTimestamp - Date.now();
    if (diff <= 0) {
      countdownBadge.textContent = 'TRIGGERING...';
      countdownBadge.style.color = 'var(--accent-green)';
      triggerBookingAction('scheduled-fire');
      disarmScheduler();
      return;
    }

    const s = Math.floor((diff / 1000) % 60);
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const h = Math.floor(diff / (1000 * 60 * 60));
    countdownBadge.textContent = `ARMED: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    countdownBadge.style.display = 'inline-block';
  }

  function armScheduler() {
    targetTimestamp = getTargetMs();
    if (!targetTimestamp) return;
    isArmed = true;
    btnArm.innerHTML = '<span>⏳ DISARM</span><span style="font-size:10px;">Click to cancel timer</span>';
    btnArm.classList.replace('btn-arm', 'btn-stop');
    updateCountdown();
    if (armedTimer) clearInterval(armedTimer);
    armedTimer = setInterval(updateCountdown, 1000);
    appendLog(`Scheduler armed for ${new Date(targetTimestamp).toLocaleTimeString()}`, 'success');
  }

  function disarmScheduler() {
    isArmed = false;
    targetTimestamp = null;
    if (armedTimer) clearInterval(armedTimer);
    btnArm.innerHTML = '<span>⚡ ARM SCHEDULER</span><span style="font-size:10px;">Auto-fires at target time</span>';
    btnArm.classList.replace('btn-stop', 'btn-arm');
    countdownBadge.style.display = 'none';
    appendLog('Scheduler disarmed', 'warn');
  }

  btnArm.addEventListener('click', () => {
    if (isArmed) disarmScheduler();
    else armScheduler();
  });

  // Action Dispatcher
  async function triggerBookingAction(action) {
    const base = getBaseUrl();
    const payload = {
      action,
      browser: browserSelect.value,
      offsetMs: Number(offsetSelect.value),
      trainNo: document.getElementById('trainNo').value,
      journeyDate: document.getElementById('journeyDate').value,
      fromStation: document.getElementById('fromStation').value,
      toStation: document.getElementById('toStation').value,
      quota: document.getElementById('quotaSelect').value,
      classCode: document.getElementById('classSelect').value,
      paxName: document.getElementById('paxName').value,
      paxAge: document.getElementById('paxAge').value
    };

    appendLog(`Dispatching [${action}] to ${base}...`);
    try {
      const res = await fetch(`${base}/api/mobile/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        appendLog(`Action [${action}] acknowledged: ${data.message || 'Running'}`, 'success');
      } else {
        appendLog(`Action error: ${data.error || 'Failed'}`, 'error');
      }
    } catch (err) {
      appendLog(`Network dispatch error: ${err.message}`, 'error');
    }
  }

  btnStartNow.addEventListener('click', () => triggerBookingAction('book-now'));
  btnStop.addEventListener('click', () => {
    disarmScheduler();
    triggerBookingAction('stop');
  });

  // Display QR Code
  function showQr(payload) {
    if (!payload || !payload.dataUrl) return;
    qrImage.src = payload.dataUrl;
    qrAmount.textContent = payload.amount ? `₹${payload.amount}` : '₹--';
    qrCaption.textContent = payload.caption || 'Scan with GPay, PhonePe or Paytm';

    // Build One-Click UPI Intent Link
    if (payload.upiString) {
      btnUpiIntent.href = payload.upiString;
      btnUpiIntent.style.display = 'flex';
    } else if (payload.amount) {
      btnUpiIntent.href = `upi://pay?pn=IRCTC&am=${payload.amount}&cu=INR`;
      btnUpiIntent.style.display = 'flex';
    } else {
      btnUpiIntent.style.display = 'none';
    }

    qrModal.classList.add('active');
    appendLog(`QR Received: ${payload.caption || ''} (${payload.amount || ''})`, 'success');

    // Haptic Vibration & Audio
    try {
      if (navigator.vibrate) navigator.vibrate([200, 100, 300, 100, 400]);
      document.getElementById('qrAudio')?.play().catch(() => {});
    } catch {}
  }

  btnCloseQr.addEventListener('click', () => {
    qrModal.classList.remove('active');
  });

  // Live SSE Connection
  function startStream() {
    const base = getBaseUrl();
    if (eventSource) eventSource.close();

    try {
      eventSource = new EventSource(`${base}/api/mobile/stream`);
      eventSource.onopen = () => {
        setOnlineState(true, 'ENGINE CONNECTED');
        appendLog('Realtime SSE stream connected.', 'success');
      };
      eventSource.onerror = () => {
        setOnlineState(false, 'RECONNECTING');
      };
      eventSource.addEventListener('status', e => {
        try {
          const d = JSON.parse(e.data);
          if (d.status) appendLog(`Status update: ${d.status}`);
        } catch {}
      });
      eventSource.addEventListener('log', e => {
        try {
          const d = JSON.parse(e.data);
          appendLog(d.message || d.text, d.kind || 'info');
        } catch {}
      });
      eventSource.addEventListener('qr', e => {
        try {
          const d = JSON.parse(e.data);
          showQr(d);
        } catch {}
      });
    } catch {
      setOnlineState(false, 'OFFLINE');
    }
  }

  // Polling Fallback
  async function pollStatus() {
    const base = getBaseUrl();
    try {
      const res = await fetch(`${base}/api/mobile/status`, { cache: 'no-store' });
      if (res.ok) {
        setOnlineState(true, 'ENGINE ONLINE');
      } else {
        setOnlineState(false, 'ENGINE OFFLINE');
      }
    } catch {
      setOnlineState(false, 'OFFLINE');
    }
  }

  // Setup default tomorrow date for Tatkal
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  document.getElementById('journeyDate').value = `${yyyy}-${mm}-${dd}`;

  btnClearLogs.addEventListener('click', () => {
    logBox.innerHTML = '';
  });

  // PWA Install Prompt handling
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstallPwa.style.display = 'block';
  });

  btnInstallPwa.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      btnInstallPwa.style.display = 'none';
    }
    deferredPrompt = null;
  });

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/admin/sw.js').catch(() => {});
  }

  // Initialize
  pollStatus();
  startStream();
  pollInterval = setInterval(pollStatus, 15000);
})();
