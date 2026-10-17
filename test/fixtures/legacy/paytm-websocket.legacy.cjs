'use strict';

// Page-side helpers are serialized by the browser driver, so they must not
// reference anything outside their own bodies.
function showPaytmWatchProgress() {
  try {
    document.title='Processing payment…';
    document.body.innerHTML='<div style="font:600 16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#1d4ed8;text-align:center;margin-top:34vh">Processing your payment…<br><span style="font-weight:400;color:#64748b;font-size:13px">Keep this tab open · scan the QR in your app</span></div>';
    document.body.style.background='#ffffff';
  } catch {}
}

function paytmSocketRoom({wsUrl,roomId,timeoutMs}) {
  return new Promise(settle=>{
    let joined=false,done=false,socket;
    const note=text=>{
      try {
        let box=document.getElementById('__pwslog');
        if(!box) {
          box=document.createElement('div');box.id='__pwslog';box.style.display='none';document.body.appendChild(box);
        }
        box.textContent=`${box.textContent||''}${text}\u0001`;
      } catch {}
    };
    const finish=value=>{
      if(done)return;
      done=true;
      try {socket?.close();} catch {}
      settle(value);
    };
    const timer=setTimeout(()=>finish(null),timeoutMs);
    try {socket=new WebSocket(wsUrl);} catch {
      clearTimeout(timer);settle(null);return;
    }
    socket.onopen=()=>{
      note('[open]');
      try {socket.send(JSON.stringify({event:'#handshake',data:{authToken:null},cid:1}));} catch {}
    };
    socket.onmessage=message=>{
      const text=typeof message.data=='string'?message.data:'';
      note(`[msg]${text.slice(0,90)}`);
      if(text==='#1') {
        try {socket.send('#2');} catch {}
        return;
      }
      let packet;
      try {packet=JSON.parse(text);} catch {return;}
      if(packet&&packet.rid===1&&!joined) {
        joined=true;note(`[join→${roomId}]`);
        try {socket.send(JSON.stringify({event:'JOIN_ROOMS',data:roomId}));} catch {}
        return;
      }
      if(packet&&packet.event===roomId&&packet.data) {
        note('[room-hit]');clearTimeout(timer);
        finish(typeof packet.data=='string'?packet.data:JSON.stringify(packet.data));
      }
    };
    socket.onerror=()=>{note('[error]');};
  });
}

function readPaytmSocketLog() {
  return document.getElementById('__pwslog')?.textContent||'';
}

// Recovered f1693. Prefers a background page on the PayTM origin, falls back to
// the booking page, and waits for either a room message, timeout or operator stop.
// Diagnostics omit the room identifier, URLs and message payloads; snip still runs.
async function waitForPaytmWs(actor,mid,orderId,timeoutMs=1800000,stopped,{timers=globalThis}={}) {
  const room=mid+'_'+orderId;
  const wsUrl=actor.hosts.paytm.replace(/^http/i,'ws')+'/websocket/?DEVICE=web&ID='+encodeURIComponent(room);
  actor.log('PayTM WS connecting');
  let page=actor.page,background,poll,watchdog;
  try {
    try {
      background=await actor.page.context().newPage();
      await background.goto(actor.hosts.paytm+'/',{waitUntil:'domcontentloaded',timeout:15000}).catch(()=>undefined);
      if(new URL(background.url()).origin===new URL(actor.hosts.paytm).origin) {
        page=background;
        actor.log('PayTM WS: using background page on the PayTM origin (CSP-safe)');
        await background.evaluate(showPaytmWatchProgress).catch(()=>undefined);
      } else {
        background.url();
        actor.log('PayTM WS: background page did not land on the PayTM origin; using booking page');
      }
    } catch(error) {
      actor.log('PayTM WS: could not open background PayTM page ('+error.message+'); using booking page');
    }
    try {
      const socket=page.evaluate(paytmSocketRoom,{wsUrl,roomId:room,timeoutMs}).catch(()=>null);
      const cancelled=new Promise(resolve=>{
        if(stopped)watchdog=timers.setInterval(()=>{if(stopped())resolve(null);},400);
      });
      let seen=0;
      poll=timers.setInterval(()=>{
        page.evaluate(readPaytmSocketLog).then(text=>{
          if(text.length>seen) {
            actor.log('PayTM WS frames: '+(text.length-seen)+' new');
            seen=text.length;
          }
        }).catch(()=>undefined);
      },2000);
      const raw=await Promise.race([socket,cancelled]).finally(()=>timers.clearInterval(poll));
      if(!raw) {
        actor.log(stopped?.()?'PayTM WS: cancelled (QR closed by operator)':'PayTM WS: no success message (timeout/closed)');
        return null;
      }
      actor.snip(raw);
      actor.log('PayTM WS success: [payload omitted]');
      let parsed={};
      try {parsed=JSON.parse(raw);} catch {}
      return{
        merchantId:parsed.merchantId||mid,orderId:parsed.orderId||orderId,
        paymentMode:parsed.paymentMode||'UPI',topicName:parsed.topicName||'DYNAMIC_QR',
        acquirementId:parsed.acquirementId||'',cashierRequestId:parsed.cashierRequestId||'',
        _id:parsed._id||room,status:parsed.status||'SUCCESS',
      };
    } catch(error) {
      actor.log('PayTM WS error: '+error.message);
      return null;
    }
  } finally {
    if(watchdog)timers.clearInterval(watchdog);
    if(background)await background.close().catch(()=>undefined);
  }
}

module.exports={showPaytmWatchProgress,paytmSocketRoom,readPaytmSocketLog,waitForPaytmWs};
