'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createMobileBridge } = require('../src/main/runtime/mobile-bridge.cjs');

test('matrix mobile bridge serves mobile app and handles status/actions', async (t) => {
  const root = path.resolve(__dirname, '..');
  const mockElectron = {
    BrowserWindow: {
      getAllWindows: () => [
        {
          webContents: {
            getURL: () => 'file:///controller.html',
            executeJavaScript: async (code) => {
              if (code.includes('start')) return { ok: true, started: true };
              if (code.includes('stop')) return { ok: true, stopped: true };
              return true;
            }
          }
        }
      ]
    }
  };

  process.env.MATRIX_MOBILE_PORT = 8089;
  const bridge = createMobileBridge(mockElectron, root);
  const port = bridge.getPort();

  t.after(() => {
    bridge.server.close();
  });

  // Test GET /mobile
  const mobileHtml = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/mobile`, res => {
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  assert.ok(mobileHtml.includes('MATRIX Mobile Controller'));

  // Test GET /api/mobile/status
  const statusJson = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/mobile/status`, res => {
      assert.equal(res.statusCode, 200);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  assert.equal(statusJson.ok, true);
  assert.equal(statusJson.engine, 'Matrix');
  assert.equal(statusJson.controllerConnected, true);

  // Test QR Broadcast
  bridge.broadcastQr({
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    amount: '1250.00',
    caption: 'NDLS -> HWH'
  });

  const qrJson = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/mobile/qr`, res => {
      assert.equal(res.statusCode, 200);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
  assert.equal(qrJson.ok, true);
  assert.equal(qrJson.qr.amount, '1250.00');

  // Test POST /api/mobile/action (book-now)
  const actionRes = await new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}/api/mobile/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(JSON.stringify({ action: 'book-now' }));
    req.end();
  });
  assert.equal(actionRes.ok, true);
  assert.equal(actionRes.message, 'Booking started successfully');
});
