/// <reference lib="dom" />
// Waits for the PayTM payment confirmation over the provider's WebSocket room, using a background page on the PayTM
// origin when possible.
import type { IntervalTimers } from './paytm-watch';
import type { PaytmPageHandle } from './paytm-page';

// Page-side helpers are serialized by the browser driver, so they must not reference anything outside their own bodies.
export function showPaytmWatchProgress(): void {
  try {
    document.title = 'Processing payment…';
    document.body.innerHTML = '<div style="font:600 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d4ed8;text-align:center;margin-top:34vh">Processing your payment…<br><span style="font-weight:400;color:#64748b;font-size:13px">Keep this tab open · scan the QR in your app</span></div>';
    document.body.style.background = '#ffffff';
  } catch { /* the page may already be gone */ }
}

// Page-side: resolves the room message text, or null on timeout/close/error.
export function paytmSocketRoom({ wsUrl, roomId, timeoutMs }: { wsUrl: string; roomId: string; timeoutMs: number }): Promise<string | null> {
  return new Promise<string | null>(settle => {
    let joined = false, done = false, socket: WebSocket | undefined;
    const note = (text: string): void => {
      try {
        let box = document.getElementById('__pwslog');
        if (!box) {
          box = document.createElement('div'); box.id = '__pwslog'; box.style.display = 'none'; document.body.appendChild(box);
        }
        box.textContent = `${box.textContent || ''}${text}\u0001`;
      } catch { /* diagnostics only */ }
    };
    const finish = (value: string | null): void => {
      if (done) return;
      done = true;
      try { socket?.close(); } catch { /* already closed */ }
      settle(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try { socket = new WebSocket(wsUrl); } catch {
      clearTimeout(timer); settle(null); return;
    }
    socket.onopen = () => {
      note('[open]');
      try { socket?.send(JSON.stringify({ event: '#handshake', data: { authToken: null }, cid: 1 })); } catch { /* closed */ }
    };
    socket.onmessage = message => {
      const text = typeof message.data == 'string' ? message.data : '';
      note(`[msg]${text.slice(0, 90)}`);
      if (text === '#1') {
        try { socket?.send('#2'); } catch { /* closed */ }
        return;
      }
      let packet: { rid?: unknown; event?: unknown; data?: unknown } | null;
      try { packet = JSON.parse(text); } catch { return; }
      if (packet && packet.rid === 1 && !joined) {
        joined = true; note(`[join→${roomId}]`);
        try { socket?.send(JSON.stringify({ event: 'JOIN_ROOMS', data: roomId })); } catch { /* closed */ }
        return;
      }
      if (packet && packet.event === roomId && packet.data) {
        note('[room-hit]'); clearTimeout(timer);
        finish(typeof packet.data == 'string' ? packet.data : JSON.stringify(packet.data));
      }
    };
    socket.onerror = () => { note('[error]'); };
  });
}

export function readPaytmSocketLog(): string {
  return document.getElementById('__pwslog')?.textContent || '';
}

export interface WsActor {
  hosts: { paytm: string };
  page: PaytmPageHandle & { context(): { newPage(): Promise<PaytmPageHandle> } };
  log(message: string): void;
  snip(raw: string): unknown;
}

export interface PaytmWsPayment {
  merchantId: string;
  orderId: string;
  paymentMode: string;
  topicName: string;
  acquirementId: string;
  cashierRequestId: string;
  _id: string;
  status: string;
}

// Recovered f1693. Prefers a background page on the PayTM origin, falls back to the booking page, and waits for
// either a room message, timeout or operator stop. Diagnostics omit the room identifier, URLs and message payloads;
// snip still runs.
export async function waitForPaytmWs(
  actor: WsActor,
  mid: string,
  orderId: string,
  timeoutMs = 1800000,
  stopped?: () => unknown,
  { timers = globalThis }: { timers?: IntervalTimers } = {},
): Promise<PaytmWsPayment | null> {
  const room = mid + '_' + orderId;
  const wsUrl = actor.hosts.paytm.replace(/^http/i, 'ws') + '/websocket/?DEVICE=web&ID=' + encodeURIComponent(room);
  actor.log('PayTM WS connecting');
  let page: PaytmPageHandle = actor.page;
  let background: PaytmPageHandle | undefined, poll: unknown, watchdog: unknown;
  try {
    try {
      background = await actor.page.context().newPage();
      await background.goto(actor.hosts.paytm + '/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined);
      if (new URL(background.url()).origin === new URL(actor.hosts.paytm).origin) {
        page = background;
        actor.log('PayTM WS: using background page on the PayTM origin (CSP-safe)');
        await background.evaluate(showPaytmWatchProgress).catch(() => undefined);
      } else {
        background.url();
        actor.log('PayTM WS: background page did not land on the PayTM origin; using booking page');
      }
    } catch (error) {
      actor.log('PayTM WS: could not open background PayTM page (' + (error as { message?: string }).message + '); using booking page');
    }
    try {
      const socket = page.evaluate(paytmSocketRoom, { wsUrl, roomId: room, timeoutMs }).catch(() => null);
      const cancelled = new Promise<null>(resolve => {
        if (stopped) watchdog = timers.setInterval(() => { if (stopped()) resolve(null); }, 400);
      });
      let seen = 0;
      poll = timers.setInterval(() => {
        page.evaluate(readPaytmSocketLog).then(text => {
          if (text.length > seen) {
            actor.log('PayTM WS frames: ' + (text.length - seen) + ' new');
            seen = text.length;
          }
        }).catch(() => undefined);
      }, 2000);
      const raw = await Promise.race([socket, cancelled]).finally(() => timers.clearInterval(poll));
      if (!raw) {
        actor.log(stopped?.() ? 'PayTM WS: cancelled (QR closed by operator)' : 'PayTM WS: no success message (timeout/closed)');
        return null;
      }
      actor.snip(raw);
      actor.log('PayTM WS success: [payload omitted]');
      let parsed: Partial<PaytmWsPayment> = {};
      try { parsed = JSON.parse(raw); } catch { /* keep defaults */ }
      return {
        merchantId: parsed.merchantId || mid, orderId: parsed.orderId || orderId,
        paymentMode: parsed.paymentMode || 'UPI', topicName: parsed.topicName || 'DYNAMIC_QR',
        acquirementId: parsed.acquirementId || '', cashierRequestId: parsed.cashierRequestId || '',
        _id: parsed._id || room, status: parsed.status || 'SUCCESS',
      };
    } catch (error) {
      actor.log('PayTM WS error: ' + (error as { message?: string }).message);
      return null;
    }
  } finally {
    if (watchdog) timers.clearInterval(watchdog);
    if (background) await background.close().catch(() => undefined);
  }
}
