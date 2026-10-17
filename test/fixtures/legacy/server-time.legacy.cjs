'use strict';

// Server-time bookkeeping for a booking run. The offset (server minus local clock, in ms) is kept on the run
// and mirrored into the session tokens so a relaunched browser starts from the same estimate.

// Recovered f2272: the corrected "now".
function serverNow(actor) {
  const captured=actor.session.tokens?.serverTimeOffsetMs;
  const offset=typeof captured=='number'&&Number.isFinite(captured)?captured:actor.timeOffset;
  return actor.now()+offset;
}

// Recovered f2274. Accepts a provider timestamp measured between two local clock readings (t0, t1) and
// refuses offsets of an hour or more (a wrong machine date), keeping the previous estimate.
function applyServerTimeStamp(actor,stamp,t0,t1,label='sync',{parseStamp,formatClock}) {
  const server=parseStamp(stamp);
  if(server==null) {
    actor.log('time','⏱ '+label+': NO/BAD timeStamp ('+(stamp??'none')+') — keeping offset '+Math.round(actor.timeOffset)+'ms (serverNow '+formatClock(actor.serverNow())+')','warn');
    return false;
  }
  const local=(t0+t1)/2;
  const offset=server-local;
  if(Math.abs(offset)>=3600000) {
    actor.log('time','⏱ '+label+': offset '+Math.round(offset)+'ms > 1h — REJECTED (wrong machine date?), keeping '+Math.round(actor.timeOffset)+'ms','warn');
    return false;
  }
  const previous=actor.timeOffset;
  actor.timeOffset=offset;
  if(actor.session.tokens)actor.session.tokens.serverTimeOffsetMs=offset;
  actor.log('time','⏱ '+label+': server='+formatClock(server)+' local='+formatClock(local)+' → offset '+(offset>=0?'+':'')+Math.round(offset)+'ms (rtt '+Math.round(t1-t0)+'ms, Δ vs last '+(offset-previous>=0?'+':'')+Math.round(offset-previous)+'ms) · serverNow='+formatClock(actor.serverNow()));
  return true;
}

// Recovered f2276 (+f2277). Keepalive: refresh the offset from the recent-transactions response.
async function syncServerTime(actor,{basePath}) {
  if(!actor.opts.serverTimeSync)return undefined;
  const t0=actor.now();
  const response=await actor.api.call('GET',basePath()+'/recentTxnsDetails').catch(()=>null);
  const t1=actor.now();
  const body=response?.body;
  const stamp=body?.timeStamp??body?.data?.timeStamp;
  actor.applyServerTimeStamp(stamp,t0,t1,'keepalive sync (recentTxns)');
  return undefined;
}

// Recovered f2278 (+f2279). First estimate: the one captured during login, else fetchJourneyDetails.
async function ensureServerTimeSynced(actor,{basePath,formatClock}) {
  const captured=actor.session.tokens?.serverTimeOffsetMs;
  if(typeof captured=='number'&&Number.isFinite(captured)) {
    actor.log('time','⏱ initial sync: offset '+(captured>=0?'+':'')+Math.round(captured)+'ms (captured from login fetchJourneyDetails) · serverNow='+formatClock(actor.serverNow()));
    return undefined;
  }
  if(!actor.api)return undefined;
  const t0=actor.now();
  const response=await actor.api.call('GET',basePath()+'/fetchJourneyDetails').catch(()=>null);
  const t1=actor.now();
  const stamp=response?.body?.timeStamp;
  if(!actor.applyServerTimeStamp(stamp,t0,t1,'initial sync (fetchJourneyDetails)'))
    actor.log('time','⏱ initial sync unavailable → using LOCAL clock','warn');
  return undefined;
}

module.exports={serverNow,applyServerTimeStamp,syncServerTime,ensureServerTimeSynced};
