'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

/**
 * Matrix Mobile Bridge Server
 * Exposes a lightweight local HTTP & SSE server allowing mobile phones
 * on Wi-Fi or local network to remotely control Tatkal booking and receive instant QR popups.
 */
function createMobileBridge(electron, root, log = () => {}) {
  const port = Number(process.env.MATRIX_MOBILE_PORT || 8085);
  const clients = new Set();
  let latestQr = null;
  let server = null;

  function getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  function broadcastSse(eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(message);
      } catch {
        clients.delete(res);
      }
    }
  }

  const CLOUD_URL = process.env.MATRIX_PUBLIC_URL || 'https://matrix.vaidya-gpt.com';

  function pushQrToCloud(payload) {
    try {
      const u = new URL('/api/relay/desktop/push-qr', CLOUD_URL);
      const req = (u.protocol === 'https:' ? require('node:https') : http).request(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 4000
      });
      req.on('error', () => {});
      req.write(JSON.stringify(payload));
      req.end();
    } catch {}
  }

  function syncWithCloudRelay() {
    try {
      const u = new URL('/api/relay/desktop/sync', CLOUD_URL);
      const req = (u.protocol === 'https:' ? require('node:https') : http).request(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 4000
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', async () => {
          try {
            const body = JSON.parse(data || '{}');
            if (Array.isArray(body.pendingActions) && body.pendingActions.length > 0) {
              const controller = getControllerWindow();
              for (const act of body.pendingActions) {
                log('cloud-relay-action-executing', { action: act.action });
                if (act.action === 'book-now' && controller) {
                  await controller.webContents.executeJavaScript("window.api.controllerAction('start')");
                } else if (act.action === 'stop' && controller) {
                  await controller.webContents.executeJavaScript("window.api.controllerAction('stop')");
                }
              }
            }
          } catch {}
        });
      });
      req.on('error', () => {});
      req.write(JSON.stringify({ status: 'Matrix Desktop Active', time: Date.now() }));
      req.end();
    } catch {}
  }

  let cloudInterval = null;
  if (!process.argv.includes('--smoke-test')) {
    cloudInterval = setInterval(syncWithCloudRelay, 1200);
    if (cloudInterval && typeof cloudInterval.unref === 'function') {
      cloudInterval.unref();
    }
  }

  function broadcastQr(payload) {
    latestQr = { ...payload, at: Date.now() };
    broadcastSse('qr', latestQr);
    pushQrToCloud(latestQr);
    log('mobile-bridge-qr-broadcast', { amount: payload?.amount, caption: payload?.caption });
  }

  function broadcastLog(data) {
    broadcastSse('log', data);
  }

  function broadcastStatus(status) {
    broadcastSse('status', { status, time: Date.now() });
  }

  // Get active controller window
  function getControllerWindow() {
    return electron.BrowserWindow.getAllWindows().find(w => {
      try {
        return w.webContents.getURL().includes('controller.html');
      } catch {
        return false;
      }
    });
  }

  server = http.createServer(async (req, res) => {
    // Enable CORS for mobile apps and PWA
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    // Serve Mobile PWA static assets from control-plane/admin
    const adminDir = path.join(root, 'services', 'control-plane', 'admin');
    const assetsDir = path.join(root, 'services', 'control-plane', 'assets');

    if (req.method === 'GET') {
      if (url.pathname === '/' || url.pathname === '/mobile') {
        const file = path.join(adminDir, 'mobile.html');
        if (fs.existsSync(file)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(fs.readFileSync(file));
        }
      }

      if (url.pathname === '/admin/mobile.css') {
        const file = path.join(adminDir, 'mobile.css');
        if (fs.existsSync(file)) {
          res.setHeader('Content-Type', 'text/css');
          return res.end(fs.readFileSync(file));
        }
      }

      if (url.pathname === '/admin/mobile.js') {
        const file = path.join(adminDir, 'mobile.js');
        if (fs.existsSync(file)) {
          res.setHeader('Content-Type', 'application/javascript');
          return res.end(fs.readFileSync(file));
        }
      }

      if (url.pathname === '/admin/manifest.json') {
        const file = path.join(adminDir, 'manifest.json');
        if (fs.existsSync(file)) {
          res.setHeader('Content-Type', 'application/manifest+json');
          return res.end(fs.readFileSync(file));
        }
      }

      if (url.pathname === '/admin/sw.js') {
        const file = path.join(adminDir, 'sw.js');
        if (fs.existsSync(file)) {
          res.setHeader('Content-Type', 'application/javascript');
          return res.end(fs.readFileSync(file));
        }
      }

      if (url.pathname.startsWith('/assets/')) {
        const assetName = path.basename(url.pathname);
        const file = path.join(assetsDir, assetName);
        if (fs.existsSync(file)) {
          const type = assetName.endsWith('.svg') ? 'image/svg+xml' : assetName.endsWith('.png') ? 'image/png' : 'image/jpeg';
          res.setHeader('Content-Type', type);
          return res.end(fs.readFileSync(file));
        }
      }

      // API: Mobile Status
      if (url.pathname === '/api/mobile/status') {
        const controller = getControllerWindow();
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          ok: true,
          engine: 'Matrix',
          version: '1.0.13',
          platform: process.platform,
          controllerConnected: !!controller,
          time: Date.now()
        }));
      }

      // API: Latest QR
      if (url.pathname === '/api/mobile/qr') {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
          ok: true,
          qr: latestQr
        }));
      }

      // API: SSE Live Stream
      if (url.pathname === '/api/mobile/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        res.write('retry: 5000\n\n');
        clients.add(res);

        // Send initial connection packet
        res.write(`event: status\ndata: ${JSON.stringify({ status: 'Connected to Matrix Engine', version: '1.0.13' })}\n\n`);
        if (latestQr) {
          res.write(`event: qr\ndata: ${JSON.stringify(latestQr)}\n\n`);
        }

        req.on('close', () => {
          clients.delete(res);
        });
        return;
      }
    }

    // API: Mobile Action Trigger (POST)
    if (req.method === 'POST' && url.pathname === '/api/mobile/action') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const controller = getControllerWindow();
          if (!controller) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Desktop Controller window not found' }));
          }

          log('mobile-action-received', { action: data.action, browser: data.browser });

          if (data.action === 'book-now') {
            // Trigger start
            await controller.webContents.executeJavaScript("window.api.controllerAction('start')");
            broadcastStatus('Booking Triggered from Mobile');
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ ok: true, message: 'Booking started successfully' }));
          }

          if (data.action === 'stop') {
            await controller.webContents.executeJavaScript("window.api.controllerAction('stop')");
            broadcastStatus('Booking Stopped from Mobile');
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ ok: true, message: 'Stopped successfully' }));
          }

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ ok: true, action: data.action, received: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.on('error', err => {
    log('mobile-bridge-server-error', { error: err.message });
  });

  server.listen(port, '0.0.0.0', () => {
    const ips = getLocalIps();
    log('mobile-bridge-listening', { port, ips });
  });

  const bridge = {
    server,
    broadcastQr,
    broadcastLog,
    broadcastStatus,
    getLocalIps,
    getPort: () => port
  };

  globalThis.__matrixMobileBridge = bridge;
  return bridge;
}

module.exports = { createMobileBridge };
