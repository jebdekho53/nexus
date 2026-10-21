'use strict';
// Declarative capabilities only: never distribute scripts, upstream secrets or
// arbitrary replacement URLs through desktop configuration.
function configuration(){return {schema:1,provider:'Matrix',capabilities:{webLogin:true,manualCaptcha:true,automaticCaptcha:false,railOne:false},reasons:{railOne:'Supported official integration is not configured',automaticCaptcha:'Enter the provider CAPTCHA manually'}};}

let latestMobileQr = null;
const mobileClients = new Set();
const pendingActions = [];

function broadcastMobile(eventType, data) {
  if (eventType === 'qr') latestMobileQr = data;
  const msg = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of mobileClients) {
    try { client.write(msg); } catch { mobileClients.delete(client); }
  }
}

function handle(req,res,url){
  if(['/api/desktop/config','/api/desktop/status','/api/desktop/time'].includes(url.pathname)){
    if(req.method!=='GET')return false;
    const serverTime=Date.now();
    const body=url.pathname.endsWith('/time')?{schema:1,provider:'Matrix',serverTime}:url.pathname.endsWith('/status')?{...configuration(),ok:true,serverTime}:configuration();
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));return true;
  }

  // Cloud Relay: Desktop syncs state and fetches pending mobile actions
  if (url.pathname === '/api/relay/desktop/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.qr) {
          latestMobileQr = payload.qr;
          broadcastMobile('qr', latestMobileQr);
        }
        if (payload.log) {
          broadcastMobile('log', payload.log);
        }
        if (payload.status) {
          broadcastMobile('status', { status: payload.status });
        }
        const actionsToRun = pendingActions.splice(0, pendingActions.length);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, pendingActions: actionsToRun }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return true;
  }

  // Cloud Relay: Desktop immediately pushes a fresh QR code
  if (url.pathname === '/api/relay/desktop/push-qr' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const qr = JSON.parse(body || '{}');
        latestMobileQr = qr;
        broadcastMobile('qr', qr);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, broadcasted: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return true;
  }

  if (url.pathname === '/api/mobile/status') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, provider: 'Matrix', mobileReady: true, serverTime: Date.now() }));
    return true;
  }

  if (url.pathname === '/api/mobile/qr') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ ok: true, qr: latestMobileQr }));
    return true;
  }

  if (url.pathname === '/api/mobile/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 5000\n\n');
    mobileClients.add(res);
    res.write(`event: status\ndata: ${JSON.stringify({ status: 'Connected to Cloud Relay', ok: true })}\n\n`);
    if (latestMobileQr) res.write(`event: qr\ndata: ${JSON.stringify(latestMobileQr)}\n\n`);
    req.on('close', () => mobileClients.delete(res));
    return true;
  }

  // Mobile App triggers an action (booked, scheduled, stopped) over 4G/5G
  if (url.pathname === '/api/mobile/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        pendingActions.push({ ...data, id: Date.now() });
        broadcastMobile('status', { status: `Mobile command enqueued: ${data.action}` });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true, action: data.action, queued: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return true;
  }

  return false;
}
module.exports={configuration,handle,broadcastMobile};
