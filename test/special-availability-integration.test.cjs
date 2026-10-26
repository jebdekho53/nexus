'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {pollAvailability}=require('../src/main/booking/availability.cjs');
const {calculateShiftedDate,specialTrainSelected,specialGuard,recordSpecialEnquiryOutcome}=require('../src/main/booking/special-train-probe.cjs');
const opening=Date.parse('2026-10-25T02:30:00Z'); // 08:00 IST
function scenario({job:patch={},opts={},offset=0,start=opening+301,responses=[],onCall,waitStep}={}) {
  let now=start,index=0;
  const requests=[],waits=[];
  const job=Object.freeze({origin:'NDLS',destination:'BCT',date:'2026-11-01',quota:'8AM',classCode:'3A',specialTrain:true,specialTrainSelectedAt:opening-1000,...patch});
  const actor={opts:{specialTimings:true,tatkalSpecial:true,...opts},session:{tokens:{serverTimeOffsetMs:offset},page:{isClosed:()=>false,waitForTimeout:async ms=>{waits.push(ms);now+=waitStep??Math.max(1,ms);}}},resolveTarget:()=>({ms:opening,label:'8AM',family:'eightAm'}),serverNow:()=>now,now:()=>now,waitUntilTarget:async target=>{waits.push(target.ms-now);now=target.ms;},safeCall:async(label,method,url,body)=>{requests.push({label,method,url,body});onCall?.(actor,index);const response=responses[Math.min(index++,responses.length-1)]??{status:'AVAILABLE 10',reasonType:'S',totalCollectibleAmount:100};return {status:200,ok:true,body:response};},log(){},onProgress(){},sensorCheckpoint(){}};
  const deps={buildUrl:j=>'https://example.invalid/availability/'+j.date,buildBody:j=>({date:j.date,quota:j.quota}),parseResponse:body=>body,random:()=>0,slotTimeoutWindowMs:600000,env:{WEBLOGIN_AVAIL_MAX_ATTEMPTS:'4'}};
  return {job,actor,deps,requests,waits,run:options=>pollAvailability(actor,job,'12345',null,options,deps),setNow:value=>{now=value;},getNow:()=>now};
}
test('8AM future slot under one second still waits before the first request',async()=>{
  const s=scenario({start:opening-500});await s.run();assert.equal(s.waits[0],500);assert.equal(s.requests.length,1);assert.ok(s.getNow()>=opening);
});
test('special availability sends URL then body, probes dates without mutating original booking or carrying alternate fare',async()=>{
  const s=scenario({responses:[{status:'AVAILABLE 10',reasonType:'W'},{status:'AVAILABLE 10',reasonType:'S',totalCollectibleAmount:999}]});
  const result=await s.run({skipWait:true});assert.equal(s.requests.length,2);assert.equal(s.requests[0].body.date,'2026-11-01');assert.equal(s.requests[1].body.date,'2026-10-22');assert.match(s.requests[1].url,/2026-10-22$/);assert.equal(s.requests[1].body.quota,'8AM');assert.equal(s.job.date,'2026-11-01');assert.equal(result.totalCollectibleAmount,0);assert.equal(s.actor.specialProbeState.completed,true);
});
test('W with positive fare cannot mark a shifted probe successful',()=>{
  const state={completed:false,fallbackToOriginal:false,emptyResponses:0,dateIndex:0};
  assert.equal(recordSpecialEnquiryOutcome({},state,{reasonType:'W',totalCollectibleAmount:100}),false);assert.equal(state.completed,false);
});
test('invalid calendar dates and invalid indexes are rejected',()=>{
  for(const date of ['2026-02-31','not-a-date','2026-13-01'])assert.equal(calculateShiftedDate(date,opening,0),null);
  assert.equal(calculateShiftedDate('2026-11-01',opening,-1),null);
});
test('TS candidate sequence uses minus ten, minus one future day, then IST rotation exclusions',()=>{
  assert.equal(calculateShiftedDate('2026-11-01',opening,0),'2026-10-22');
  assert.equal(calculateShiftedDate('2026-11-01',opening,1),'2026-10-31');
  assert.equal(calculateShiftedDate('2026-11-01',opening,2),'2026-10-30');
  assert.equal(calculateShiftedDate('2026-10-25',opening,1),'2026-10-30');
  assert.equal(calculateShiftedDate('2026-10-25',opening,2),'2026-10-29');
});
test('selection cycle expires at 09:00 IST, rejects future and missing timestamps',()=>{
  const nine=Date.parse('2026-10-25T03:30:00Z');assert.equal(specialTrainSelected(true,opening-1000,opening),true);assert.equal(specialTrainSelected(true,opening-1000,nine),false);assert.equal(specialTrainSelected(true,opening+1,opening),false);assert.equal(specialTrainSelected(true,undefined,opening),false);
});
for(const [name,config] of Object.entries({disabled:{opts:{specialTimings:false}},notSelected:{job:{specialTrain:false}},stale:{job:{specialTrainSelectedAt:opening-2*86400000}},missingTimestamp:{job:{specialTrainSelectedAt:undefined}},unsynced:{offset:undefined},ordinaryGN:{job:{quota:'GN'}},beforeGuard:{start:opening+299}})) {
  test('special guard keeps '+name+' on the original journey',async()=>{
    const s=scenario({...config,responses:[{status:'AVAILABLE 2',reasonType:'W'},{status:'AVAILABLE 2',reasonType:'S'}]});
    if(name==='unsynced')delete s.actor.session.tokens.serverTimeOffsetMs;
    await s.run({skipWait:true});assert.equal(s.requests.length,2);assert.ok(s.requests.every(r=>r.body.date===s.job.date));
  });
}
test('Tatkal special flow requires its own flag and waits for the class-specific opening guard',()=>{
  const s=scenario({job:{quota:'TQ',specialTrainSelectedAt:Date.parse('2026-10-25T04:00:00Z')},start:Date.parse('2026-10-25T04:30:00.301Z')});
  assert.equal(specialGuard(s.actor,s.job,{family:'acTatkal'}),true);s.actor.opts.tatkalSpecial=false;assert.equal(specialGuard(s.actor,s.job,{family:'acTatkal'}),false);
});
test('two unusable shifted replies rotate the date; wrong-date S and cancelled S never advance boarding',async()=>{
  const s=scenario({responses:[{status:'WL/2',reasonType:'W'},{status:'AVAILABLE 2',reasonType:'S',date:'2026-11-08'},{status:'CANCELLED',cancelled:true,reasonType:'S'},{status:'AVAILABLE 2',reasonType:'S'}]});
  const result=await s.run({skipWait:true});assert.deepEqual(s.requests.map(r=>r.body.date),['2026-11-01','2026-10-22','2026-10-22','2026-10-31']);assert.equal(result.reasonType,'S');
});
test('four-minute deadline falls back to original enquiry without extending the deadline',async()=>{
  const s=scenario({waitStep:240001,responses:[{status:'WL/2',reasonType:'W'},{status:'WL/2',reasonType:'W'},{status:'AVAILABLE 2',reasonType:'S'}]});
  await s.run({skipWait:true});assert.deepEqual(s.requests.map(r=>r.body.date),['2026-11-01','2026-10-22','2026-11-01']);assert.equal(s.actor.specialProbeState.fallbackAtMs,opening+301+240000);assert.equal(s.actor.specialProbeState.fallbackToOriginal,true);
});
test('overall deadline bounds shifted and fallback phases together',async()=>{
  const s=scenario({waitStep:600001,responses:[{status:'WL/2',reasonType:'W'},{status:'WL/2',reasonType:'W'}]});assert.equal(await s.run({skipWait:true}),null);assert.equal(s.requests.length,2);
});
test('operator stop cancels shifted enquiries immediately',async()=>{
  const s=scenario({responses:[{status:'WL/2',reasonType:'W'}],onCall:(actor,index)=>{if(index===0)actor.stopped=true;}});assert.equal(await s.run({skipWait:true}),null);assert.equal(s.requests.length,1);
});

test('skipWait cannot override a future opening target',async()=>{const s=scenario({start:opening-500});await s.run({skipWait:true});assert.equal(s.waits[0],500);assert.ok(s.getNow()>=opening);});
test('stop raised during the request prevents even S from advancing boarding',async()=>{const s=scenario({onCall:actor=>{actor.stopped=true;}});assert.equal(await s.run({skipWait:true}),null);});

test('real recovered f505 (URL) and f516 (body) builders work seamlessly with flat f485 output under special train shift', async () => {
  const { createCompiledRuntime } = require('../src/main/runtime/compiled-runtime.cjs');
  const strings = Object.assign({}, ...Object.values(require('./fixtures/payment-strings.json')));
  const runtime = createCompiledRuntime();
  const root = runtime.context(1000, null);
  root[5] = (n, k) => strings[n + '|' + k];
  root[345] = 'https://irctc.co.in/eticketing/protected/mapps1';
  root[346] = d => d;
  root[348] = q => q;
  const buildUrl = runtime.makeFunction('f505', root);
  const buildBody = runtime.makeFunction('f516', root);

  const flatForm = Object.freeze({
    trainNumber: '12952',
    fromStation: 'NDLS',
    toStation: 'BCT',
    coach: '3A',
    quota: '8AM',
    journeyDate: '2026-11-01',
    specialTrain: true,
    specialTrainSelectedAt: opening - 1000,
  });

  let now = opening + 301;
  const requests = [];
  const actor = {
    opts: { specialTimings: true, tatkalSpecial: true },
    session: { tokens: { serverTimeOffsetMs: 0 }, page: { isClosed: () => false, waitForTimeout: async () => {} } },
    resolveTarget: () => ({ ms: opening, label: '8AM', family: 'eightAm' }),
    serverNow: () => now,
    now: () => now,
    safeCall: async (label, method, url, body) => {
      requests.push({ url, body });
      const resp = requests.length === 1
        ? { status: 'AVAILABLE 10', reasonType: 'W' }
        : { status: 'AVAILABLE 10', reasonType: 'S', totalCollectibleAmount: 999 };
      return { status: 200, ok: true, body: resp };
    },
    log() {},
    onProgress() {},
    sensorCheckpoint() {},
  };

  const deps = {
    buildUrl,
    buildBody,
    parseResponse: b => b,
    random: () => 0,
    slotTimeoutWindowMs: 600000,
    env: { WEBLOGIN_AVAIL_MAX_ATTEMPTS: '4' }
  };

  const result = await pollAvailability(actor, flatForm, '12952', '8AM', { skipWait: true }, deps);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://irctc.co.in/eticketing/protected/mapps1/avlFarenquiry/12952/2026-11-01/NDLS/BCT/3A/8AM/N');
  assert.equal(requests[0].body.journeyDate, '2026-11-01');
  assert.equal(requests[0].body.fromStnCode, 'NDLS');
  assert.equal(requests[0].body.toStnCode, 'BCT');
  assert.equal(requests[0].body.classCode, '3A');
  assert.equal(requests[0].body.quotaCode, '8AM');

  assert.equal(requests[1].url, 'https://irctc.co.in/eticketing/protected/mapps1/avlFarenquiry/12952/2026-10-22/NDLS/BCT/3A/8AM/N');
  assert.equal(requests[1].body.journeyDate, '2026-10-22');
  assert.equal(requests[1].body.fromStnCode, 'NDLS');
  assert.equal(requests[1].body.toStnCode, 'BCT');
  assert.equal(requests[1].body.classCode, '3A');
  assert.equal(requests[1].body.quotaCode, '8AM');

  assert.equal(flatForm.journeyDate, '2026-11-01');
  assert.equal(flatForm.fromStation, 'NDLS');
  assert.equal(result.totalCollectibleAmount, 0);
  assert.equal(actor.specialProbeState.completed, true);
});

test('actor.specialProbeState is reset on new runBrowserBooking and preserved across internal availability polls', async () => {
  const { runBrowserBooking } = require('../src/main/booking/browser-booking.cjs');
  let pollCount = 0;
  const actor = {
    opts: { hideBrowser: false },
    session: { tokens: {}, page: { isClosed: () => false, waitForLoadState: async () => {} } },
    api: { resyncCsrf: () => {}, csrfToken: () => 'token123' },
    serverNow: () => opening + 5000,
    now: () => opening + 5000,
    captureLocationEarly() {},
    relaunchIfLoggedOut: async () => false,
    ensureAuthToken: async () => true,
    ensureCsrfEstablished: async () => {},
    ensureServerTimeSynced: async () => {},
    setTokenOwnership: () => {},
    preTargetProbe: async () => 'done',
    resolveTarget: () => ({ ms: opening, label: '8AM' }),
    isChancesFlow: () => false,
    pollAvailability: async function() {
      pollCount++;
      this.specialProbeState = { journeyKey: 'test-key', count: pollCount };
      return null;
    },
    stopWith: msg => ({ stop: msg }),
    stopped: false,
    log() {},
    onProgress() {},
  };

  const deps = {
    humanFor: () => ({ dwell: async () => {} }),
    clearOverlays: async () => {},
    stopped: () => ({ stopped: true }),
    clientTxnId: () => 'tx123',
    slotImminent: () => true,
    windowLimit: () => 60000,
    shouldSearch: () => false,
    spaDecision: () => 'skip',
    duplicateLogin: () => 'duplicate',
  };

  // Pre-seed a probe state from a prior run
  actor.specialProbeState = { journeyKey: 'stale-run' };

  // New runBrowserBooking clears stale probe state on entry
  let clearedStateOnEntry = undefined;
  const origPoll = actor.pollAvailability;
  actor.pollAvailability = async function() {
    clearedStateOnEntry = this.specialProbeState;
    return origPoll.call(this);
  };

  await runBrowserBooking(actor, { trainNumber: '12952', origin: 'NDLS' }, {}, deps);
  assert.equal(clearedStateOnEntry, null);
  assert.equal(actor.specialProbeState.count, 1);
});
