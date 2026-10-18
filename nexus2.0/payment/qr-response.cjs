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

function commandStatus(body) {
  const upper=value=>String(value??'').toUpperCase();
  const status=upper(body.txnStatus),transactionCode=upper(body.txnResponseCode),responseCode=upper(body.responseCode);
  const description=upper(body.respDescription)+' '+upper(body.txnRespDescription);
  if (status==='SUC'||status==='SUCCESS'||transactionCode==='0000') return 'paid';
  if (responseCode==='P0030'||/AWAIT|PENDING|PROCESS|INITIAT|IN[_ ]?PROGRESS/.test(status+' '+description)) return 'pending';
  if (/FAIL|DECLIN|CANCEL|REJECT|EXPIR|ABORT|TIMED?[_ ]?OUT|UNSUCCESS/.test(status+' '+description)) return 'declined';
  return 'unknown';
}

module.exports = {appConfig,qrAmount,commandStatus};
