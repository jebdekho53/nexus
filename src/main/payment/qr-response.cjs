'use strict';

function appConfig(html, globals=globalThis) {
  const match = /<textarea[^>]*id=["']app-config-data["'][^>]*>\s*([A-Za-z0-9+/=\r\n\s]+?)\s*<\/textarea>/i.exec(html);
  if (!match) return null;
  try {
    const encoded = match[1].replace(/\s+/g, '');
    const text = typeof globals.atob === 'function' ? globals.atob(encoded) : globals.Buffer.from(encoded, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch { return null; }
}

function qrAmount(payload) {
  if (!payload) return undefined;
  const match = /[?&]am=([0-9]+(?:\.[0-9]+)?)/i.exec(payload);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

module.exports = {appConfig,qrAmount};
