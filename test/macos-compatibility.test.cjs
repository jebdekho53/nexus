'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('macOS compatibility and release assets suite', async (t) => {
  await t.test('Matrix.icns and icon assets exist', () => {
    assert.ok(fs.existsSync(path.join(root, 'resources/Matrix.icns')), 'Matrix.icns must exist');
    const icnsHeader = fs.readFileSync(path.join(root, 'resources/Matrix.icns')).subarray(0, 4).toString('ascii');
    assert.equal(icnsHeader, 'icns', 'Valid ICNS magic header');
  });

  await t.test('native darwin FFI and TLS binaries are present', () => {
    const arm64Dylib = path.join(root, 'resources/tls-client/tls-client-darwin-arm64-1.14.0.dylib');
    const amd64Dylib = path.join(root, 'resources/tls-client/tls-client-darwin-amd64-1.14.0.dylib');
    assert.ok(fs.existsSync(arm64Dylib), 'tls-client darwin arm64 dylib must exist');
    assert.ok(fs.existsSync(amd64Dylib), 'tls-client darwin amd64 dylib must exist');

    const cycletlsMacArm64 = path.join(root, 'vendor/node_modules/cycletls/dist/index-mac-arm64');
    const cycletlsMac = path.join(root, 'vendor/node_modules/cycletls/dist/index-mac');
    assert.ok(fs.existsSync(cycletlsMacArm64), 'cycletls index-mac-arm64 must exist');
    assert.ok(fs.existsSync(cycletlsMac), 'cycletls index-mac must exist');

    const koffiArm64 = path.join(root, 'vendor/node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node');
    const koffiX64 = path.join(root, 'vendor/node_modules/@koromix/koffi-darwin-x64/darwin_x64/koffi.node');
    assert.ok(fs.existsSync(koffiArm64), 'koffi darwin arm64 node must exist');
    assert.ok(fs.existsSync(koffiX64), 'koffi darwin x64 node must exist');
  });

  await t.test('private browser contains macOS browser discovery fallback', () => {
    const code = fs.readFileSync(path.join(root, 'src/main/runtime/private-browser.cjs'), 'utf8');
    assert.ok(code.includes("process.platform==='darwin'"), 'Must handle darwin platform in private-browser');
    assert.ok(code.includes('/Applications/Google Chrome.app'), 'Must fallback to macOS Google Chrome');
    assert.ok(code.includes('/Applications/Brave Browser.app'), 'Must fallback to macOS Brave');
  });

  await t.test('legacy macOS serving remains compatible while public downloads are Windows-only', () => {
    const serverCode = fs.readFileSync(path.join(root, 'services/control-plane/server.cjs'), 'utf8');
    assert.ok(serverCode.includes('manifest.macArm64'), 'Server must serve manifest.macArm64');
    assert.ok(serverCode.includes('manifest.macX64'), 'Server must serve manifest.macX64');

    const html = fs.readFileSync(path.join(root, 'services/control-plane/admin/downloads.html'), 'utf8');
    assert.ok(!html.includes('macArm64-download'), 'Public downloads must not advertise macOS');
    assert.ok(!html.includes('macX64-download'), 'Public downloads must not advertise macOS');
    assert.ok(html.includes('offlineSetup-download')&&html.includes('updater-download'));

    const publicJs = fs.readFileSync(path.join(root, 'services/control-plane/admin/public.js'), 'utf8');
    assert.ok(publicJs.includes("['offlineSetup','updater']"), 'Public downloads process only Windows setup/updater');
  });
});
